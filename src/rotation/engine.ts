import type { CueItem, Rotation, RotationStep } from "../types";

export class RotationEngine {
  private rotation: Rotation | null = null;
  private currentIndex = 0;

  setRotation(rotation: Rotation | null): void {
    this.rotation = rotation;
    this.currentIndex = 0;
  }

  syncRotation(rotation: Rotation | null): void {
    this.rotation = rotation;
    this.currentIndex = this.normalizeIndex(this.currentIndex);
  }

  next(loopAtEnd = false): boolean {
    const steps = this.playableSteps();
    if (!steps.length) return false;
    if (this.currentIndex >= steps.length - 1) {
      if (!loopAtEnd) return false;
      this.currentIndex = 0;
      return true;
    }
    this.currentIndex += 1;
    return true;
  }

  previous(): void {
    if (!this.playableSteps().length) return;
    this.currentIndex = Math.max(this.currentIndex - 1, 0);
  }

  reset(): void {
    this.currentIndex = 0;
  }

  getCurrentStep(): RotationStep | null {
    return this.playableSteps()[this.currentIndex] ?? null;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getUpcomingSteps(count = 4, loopAtEnd = false): CueItem[] {
    const steps = this.playableSteps();
    if (!steps.length || count <= 0) return [];

    const visibleCount = Math.min(count, loopAtEnd ? steps.length : steps.length - this.currentIndex);
    return Array.from({ length: visibleCount }, (_, offset) => {
      const stepIndex = loopAtEnd
        ? (this.currentIndex + offset) % steps.length
        : this.currentIndex + offset;
      return { step: steps[stepIndex], stepIndex, offset };
    });
  }

  getStepCount(): number {
    return this.playableSteps().length;
  }

  private normalizeIndex(index: number): number {
    const length = this.playableSteps().length;
    if (!length) return 0;
    return Math.max(0, Math.min(index, length - 1));
  }

  private playableSteps(): RotationStep[] {
    return (this.rotation?.steps ?? []).filter((step) => !!step.abilityId);
  }
}
