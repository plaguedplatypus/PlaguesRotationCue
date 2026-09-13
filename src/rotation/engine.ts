import { isAbility, isCueNote, type AbilityStep, type Cue, type Section, type Step } from "./steps";
import type { Rotation } from "../types";

export class Engine {
  private rotation: Rotation | null = null;
  private cues: Cue[] = [];
  private index = 0;
  private repeatStart = 0;
  private onceDone = true;
  private finished = false;

  setRotation(rotation: Rotation | null): void {
    this.rotation = rotation;
    this.rebuild();
    this.index = 0;
    this.onceDone = !rotation?.once || !this.cues.some((cue) => cue.section === "once");
    this.finished = false;
  }

  syncRotation(rotation: Rotation | null): void {
    this.rotation = rotation;
    this.rebuild();
    if (!rotation?.once || !this.cues.some((cue) => cue.section === "once")) {
      this.onceDone = true;
    }
    if (this.onceDone && this.index < this.repeatStart) this.index = this.repeatStart;
    this.index = this.clampIndex(this.index);
    if (this.finished && this.repeatStart < this.cues.length) {
      this.index = this.repeatStart;
      this.finished = false;
    }
  }

  next(loopAtEnd = false): boolean {
    const current = this.currentCue();
    if (!current) return false;

    const next = this.cues[this.index + 1];
    if (current.section === "once" && next?.section === "repeat") {
      this.onceDone = true;
      this.index += 1;
      return true;
    }
    if (next) {
      this.index += 1;
      return true;
    }
    if (current.section === "once") {
      this.onceDone = true;
      this.finished = true;
      this.index = this.cues.length;
      return true;
    }
    if (!loopAtEnd || this.repeatStart >= this.cues.length) return false;
    this.index = this.repeatStart;
    return true;
  }

  previous(): void {
    if (!this.currentCue()) return;
    const first = this.onceDone ? this.repeatStart : 0;
    this.index = Math.max(this.index - 1, first);
  }

  reset(): void {
    this.index = this.onceDone ? this.repeatStart : 0;
    this.finished = this.index >= this.cues.length;
  }

  currentStep(): AbilityStep | null {
    return this.currentCue()?.step ?? null;
  }

  currentIndex(): number {
    return this.index;
  }

  upcomingSteps(count = 4, loopAtEnd = false): Cue[] {
    if (!this.currentCue() || count <= 0) return [];
    const repeatCount = this.cues.length - this.repeatStart;
    const available = loopAtEnd
      ? this.onceDone ? repeatCount : this.cues.length - this.index
      : this.cues.length - this.index;
    const visibleCount = Math.min(count, available);
    const upcoming: Cue[] = [];
    let index = this.index;

    for (let offset = 0; offset < visibleCount; offset += 1) {
      upcoming.push({ ...this.cues[index], offset });
      index += 1;
      if (index >= this.cues.length && loopAtEnd && repeatCount) index = this.repeatStart;
    }
    return upcoming;
  }

  stepCount(): number {
    return this.cues.length;
  }

  private currentCue(): Cue | null {
    return this.finished ? null : this.cues[this.index] ?? null;
  }

  private clampIndex(index: number): number {
    if (!this.cues.length) return 0;
    const first = this.onceDone ? this.repeatStart : 0;
    return Math.max(first, Math.min(index, this.cues.length - 1));
  }

  private rebuild(): void {
    const pending: string[] = [];
    this.cues = [];
    this.addCues(this.rotation?.once ?? [], "once", pending);
    this.repeatStart = this.cues.length;
    this.addCues(this.rotation?.steps ?? [], "repeat", pending);
  }

  private addCues(content: Step[], section: Section, pending: string[]): void {
    content.forEach((step, contentIndex) => {
      if (isCueNote(step)) {
        if (step.text.trim()) pending.push(step.text.trim());
        return;
      }
      if (!isAbility(step) || !step.abilityId) return;
      this.cues.push({
        step,
        stepIndex: this.cues.length,
        contentIndex,
        section,
        notes: pending.splice(0),
        offset: 0
      });
    });
  }
}
