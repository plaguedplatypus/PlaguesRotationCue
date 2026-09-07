import {
  loadActiveRotationId,
  loadRotations,
  loadSelectedCategory,
  saveActiveRotationId,
  saveRotations,
  saveSelectedCategory
} from "./rotation/storage";
import type { Rotation, RotationCategory } from "./types";

type Listener = () => void;

export class AppState {
  private listeners = new Set<Listener>();
  rotations: Rotation[] = loadRotations();
  activeRotationId = loadActiveRotationId(this.rotations);
  selectedCategory: RotationCategory = loadSelectedCategory();

  get activeRotation(): Rotation | null {
    return this.rotations.find((rotation) => rotation.id === this.activeRotationId) ?? null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toggleRotation(rotationId: string): void {
    if (!this.rotations.some((rotation) => rotation.id === rotationId)) return;
    this.activeRotationId = this.activeRotationId === rotationId ? "" : rotationId;
    saveActiveRotationId(this.activeRotationId);
    this.emit();
  }

  selectCategory(category: RotationCategory): void {
    this.selectedCategory = category;
    saveSelectedCategory(category);
    this.emit();
  }

  createRotation(name = "New rotation", category = this.selectedCategory): void {
    const id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `rotation-${Date.now()}`;
    this.rotations = [...this.rotations, { id, name, category, steps: [] }];
    this.persist();
  }

  renameRotation(rotationId: string, name: string): void {
    const nextName = name.trim();
    if (!nextName) return;
    this.updateRotation(rotationId, (rotation) => ({ ...rotation, name: nextName }));
  }

  deleteRotation(rotationId: string): void {
    if (!this.rotations.some((rotation) => rotation.id === rotationId)) return;
    this.rotations = this.rotations.filter((rotation) => rotation.id !== rotationId);
    if (this.activeRotationId === rotationId) this.activeRotationId = "";
    this.persist();
  }

  addStep(rotationId: string, abilityId: string): void {
    this.updateRotation(rotationId, (rotation) => ({
      ...rotation,
      steps: [...rotation.steps, { abilityId }]
    }));
  }

  replaceStep(rotationId: string, index: number, abilityId: string): void {
    this.updateRotation(rotationId, (rotation) => ({
      ...rotation,
      steps: rotation.steps.map((step, stepIndex) => stepIndex === index ? { abilityId } : step)
    }));
  }

  removeStep(rotationId: string, index: number): void {
    this.updateRotation(rotationId, (rotation) => ({
      ...rotation,
      steps: rotation.steps.filter((_, stepIndex) => stepIndex !== index)
    }));
  }

  moveStep(rotationId: string, fromIndex: number, toIndex: number): void {
    const rotation = this.rotations.find((candidate) => candidate.id === rotationId);
    if (!rotation) return;
    const destination = Math.max(0, Math.min(toIndex, rotation.steps.length - 1));
    if (fromIndex < 0 || fromIndex >= rotation.steps.length || fromIndex === destination) return;
    const steps = [...rotation.steps];
    const [moved] = steps.splice(fromIndex, 1);
    if (!moved) return;
    steps.splice(destination, 0, moved);
    this.updateRotation(rotationId, (current) => ({ ...current, steps }));
  }

  moveRotation(rotationId: string, direction: -1 | 1): void {
    const categoryRotations = this.rotations.filter((rotation) => rotation.category === this.selectedCategory);
    const position = categoryRotations.findIndex((rotation) => rotation.id === rotationId);
    const neighbor = categoryRotations[position + direction];
    if (position < 0 || !neighbor) return;
    const from = this.rotations.findIndex((rotation) => rotation.id === rotationId);
    const to = this.rotations.findIndex((rotation) => rotation.id === neighbor.id);
    const next = [...this.rotations];
    [next[from], next[to]] = [next[to], next[from]];
    this.rotations = next;
    this.persist();
  }

  importRotation(rotation: Rotation): void {
    const existingIndex = this.rotations.findIndex((candidate) => candidate.id === rotation.id);
    if (existingIndex >= 0) {
      this.rotations = this.rotations.map((candidate) => candidate.id === rotation.id ? rotation : candidate);
    } else {
      this.rotations = [...this.rotations, rotation];
    }
    this.selectedCategory = rotation.category;
    this.persist();
    saveSelectedCategory(rotation.category);
  }

  private updateRotation(rotationId: string, update: (rotation: Rotation) => Rotation): void {
    if (!this.rotations.some((rotation) => rotation.id === rotationId)) return;
    this.rotations = this.rotations.map((rotation) =>
      rotation.id === rotationId ? update(rotation) : rotation
    );
    this.persist();
  }

  private persist(): void {
    saveRotations(this.rotations);
    saveActiveRotationId(this.activeRotationId);
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}
