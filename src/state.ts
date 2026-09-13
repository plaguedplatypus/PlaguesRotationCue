import { loadActiveId, loadRotations, loadCategory, saveActiveId, saveRotations, saveCategory } from "./rotation/storage";
import type { Section, Step } from "./rotation/steps";
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

  addOnce(rotationId: string): void {
    this.update(rotationId, (rotation) => rotation.once
      ? rotation
      : { ...rotation, once: [] });
  }

  removeOnce(rotationId: string): void {
    this.update(rotationId, (rotation) => {
      if (!rotation.once) return rotation;
      const { once, ...rest } = rotation;
      return { ...rest, steps: [...once, ...rotation.steps] };
    });
  }

  addMore(rotationId: string, step: Step, section: Section = "repeat"): void {
    this.update(rotationId, (rotation) => ({
      ...rotation,
      [section === "once" ? "once" : "steps"]: [
        ...this.content(rotation, section),
        step
      ]
    }));
  }

  replaceStep(rotationId: string, section: Section, index: number, step: Step): void {
    this.update(rotationId, (rotation) => ({
      ...rotation,
      [section === "once" ? "once" : "steps"]: this.content(rotation, section)
        .map((current, stepIndex) => stepIndex === index ? step : current)
    }));
  }

  removeStep(rotationId: string, section: Section, index: number): void {
    this.update(rotationId, (rotation) => ({
      ...rotation,
      [section === "once" ? "once" : "steps"]: this.content(rotation, section)
        .filter((_, stepIndex) => stepIndex !== index)
    }));
  }

  moveStep(
    rotationId: string,
    fromSection: Section,
    fromIndex: number,
    toSection: Section,
    toIndex: number
  ): void {
    const rotation = this.rotations.find((rotation) => rotation.id === rotationId);
    if (!rotation) return;
    const source = [...this.content(rotation, fromSection)];
    const target = fromSection === toSection ? source : [...this.content(rotation, toSection)];
    if (fromIndex < 0 || fromIndex >= source.length) return;
    const [moved] = source.splice(fromIndex, 1);
    const destination = Math.max(0, Math.min(toIndex, target.length));
    if (fromSection === toSection && fromIndex === destination) return;
    target.splice(destination, 0, moved!);
    this.update(rotationId, (current) => ({
      ...current,
      [fromSection === "once" ? "once" : "steps"]: source,
      [toSection === "once" ? "once" : "steps"]: target
    }));
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

  private content(rotation: Rotation, section: Section): Step[] {
    return section === "once" ? rotation.once ?? [] : rotation.steps;
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
