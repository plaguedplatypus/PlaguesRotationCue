import { loadActiveId, loadRotations, loadCategory, saveActiveId, saveRotations, saveCategory } from "./rotation/storage";
import type { Rotation, Category } from "./types";

type Listener = () => void;

export class State {
  private listeners = new Set<Listener>();
  rotations: Rotation[] = loadRotations();
  activeId = loadActiveId(this.rotations);
  category: Category = loadCategory();

  get active(): Rotation | null {
    return this.rotations.find((rotation) => rotation.id === this.activeId) ?? null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toggle(rotationId: string): void {
    if (!this.rotations.some((rotation) => rotation.id === rotationId)) return;
    this.activeId = this.activeId === rotationId ? "" : rotationId;
    saveActiveId(this.activeId);
    this.emit();
  }

  selectCategory(category: Category): void {
    this.category = category;
    saveCategory(category);
    this.emit();
  }

  create(name = "New rotation", category = this.category): void {
    const id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `rotation-${Date.now()}`;
    this.rotations = [...this.rotations, { id, name, category, steps: [] }];
    this.persist();
  }

  rename(rotationId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.update(rotationId, (rotation) => ({ ...rotation, name: trimmed }));
  }

  remove(rotationId: string): void {
    if (!this.rotations.some((rotation) => rotation.id === rotationId)) return;
    this.rotations = this.rotations.filter((rotation) => rotation.id !== rotationId);
    if (this.activeId === rotationId) this.activeId = "";
    this.persist();
  }

  addStep(rotationId: string, abilityId: string): void {
    this.update(rotationId, (rotation) => ({
      ...rotation,
      steps: [...rotation.steps, { abilityId }]
    }));
  }

  replaceStep(rotationId: string, index: number, abilityId: string): void {
    this.update(rotationId, (rotation) => ({
      ...rotation,
      steps: rotation.steps.map((step, stepIndex) => stepIndex === index ? { abilityId } : step)
    }));
  }

  removeStep(rotationId: string, index: number): void {
    this.update(rotationId, (rotation) => ({
      ...rotation,
      steps: rotation.steps.filter((_, stepIndex) => stepIndex !== index)
    }));
  }

  moveStep(rotationId: string, fromIndex: number, toIndex: number): void {
    const rotation = this.rotations.find((rotation) => rotation.id === rotationId);
    if (!rotation) return;
    const destination = Math.max(0, Math.min(toIndex, rotation.steps.length - 1));
    if (fromIndex < 0 || fromIndex >= rotation.steps.length || fromIndex === destination) return;
    const steps = [...rotation.steps];
    const [moved] = steps.splice(fromIndex, 1);
    steps.splice(destination, 0, moved!);
    this.update(rotationId, (current) => ({ ...current, steps }));
  }

  moveRotation(rotationId: string, direction: -1 | 1): void {
    const group = this.rotations.filter((rotation) => rotation.category === this.category);
    const position = group.findIndex((rotation) => rotation.id === rotationId);
    const neighbor = group[position + direction];
    if (position < 0 || !neighbor) return;
    const from = this.rotations.findIndex((rotation) => rotation.id === rotationId);
    const to = this.rotations.findIndex((rotation) => rotation.id === neighbor.id);
    const next = [...this.rotations];
    [next[from], next[to]] = [next[to], next[from]];
    this.rotations = next;
    this.persist();
  }

  import(rotation: Rotation): void {
    const existingIndex = this.rotations.findIndex((stored) => stored.id === rotation.id);
    if (existingIndex >= 0) {
      this.rotations = this.rotations.map((stored) => stored.id === rotation.id ? rotation : stored);
    } else {
      this.rotations = [...this.rotations, rotation];
    }
    this.category = rotation.category;
    this.persist();
    saveCategory(rotation.category);
  }

  private update(rotationId: string, update: (rotation: Rotation) => Rotation): void {
    if (!this.rotations.some((rotation) => rotation.id === rotationId)) return;
    this.rotations = this.rotations.map((rotation) =>
      rotation.id === rotationId ? update(rotation) : rotation
    );
    this.persist();
  }

  private persist(): void {
    saveRotations(this.rotations);
    saveActiveId(this.activeId);
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}
