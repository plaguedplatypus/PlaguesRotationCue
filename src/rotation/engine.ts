import type { Cue, Rotation, Step } from "../types";

export class Engine {
  private rotation: Rotation | null = null;
  private index = 0;

  setRotation(rotation: Rotation | null): void {
    this.rotation = rotation;
    this.index = 0;
  }

  syncRotation(rotation: Rotation | null): void {
    this.rotation = rotation;
    this.index = this.clampIndex(this.index);
  }

  next(loopAtEnd = false): boolean {
    const steps = this.playable();
    if (!steps.length) return false;
    if (this.index >= steps.length - 1) {
      if (!loopAtEnd) return false;
      this.index = 0;
      return true;
    }
    this.index += 1;
    return true;
  }

  previous(): void {
    if (!this.playable().length) return;
    this.index = Math.max(this.index - 1, 0);
  }

  reset(): void {
    this.index = 0;
  }

  currentStep(): Step | null {
    return this.playable()[this.index] ?? null;
  }

  currentIndex(): number {
    return this.index;
  }

  upcomingSteps(count = 4, loopAtEnd = false): Cue[] {
    const steps = this.playable();
    if (!steps.length || count <= 0) return [];

    const visibleCount = Math.min(count, loopAtEnd ? steps.length : steps.length - this.index);
    return Array.from({ length: visibleCount }, (_, offset) => {
      const stepIndex = loopAtEnd
        ? (this.index + offset) % steps.length
        : this.index + offset;
      return { step: steps[stepIndex], stepIndex, offset };
    });
  }

  stepCount(): number {
    return this.playable().length;
  }

  private clampIndex(index: number): number {
    const length = this.playable().length;
    if (!length) return 0;
    return Math.max(0, Math.min(index, length - 1));
  }

  private playable(): Step[] {
    return (this.rotation?.steps ?? []).filter((step) => !!step.abilityId);
  }
}
