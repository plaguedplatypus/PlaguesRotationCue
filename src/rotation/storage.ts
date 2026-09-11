import { abilityById } from "../data/abilityData";
import type { Rotation, Category } from "../types";

const rotationsTag = "rotation-cue.rotations.v1";
const activeTag = "rotation-cue.active-rotation.v1";
const categoryTag = "rotation-cue.category.v1";
const collapsedTag = "rotation-cue.collapsed-rotations.v1";

export const categories: Category[] = ["melee", "magic", "ranged", "necro", "hybrid"];

export const sampleRotation: Rotation = {
  id: "sample-necro",
  name: "Sample Necromancy Rotation",
  category: "necro",
  steps: [
    { abilityId: "death_skulls" },
    { abilityId: "touch_of_death" },
    { abilityId: "soul_sap" },
    { abilityId: "finger_of_death" },
    { abilityId: "volley_of_souls" },
    { abilityId: "living_death" },
    { abilityId: "threads_of_fate" },
    { abilityId: "split_soul" }
  ]
};

function freshSample(): Rotation {
  return {
    ...sampleRotation,
    steps: sampleRotation.steps.map((step) => ({ ...step }))
  };
}

type StoredRotations = {
  version: 1 | 2;
  rotations: Rotation[];
};

type LegacyRotation = Omit<Rotation, "category"> & { category?: unknown };

function isRotation(value: unknown): value is LegacyRotation {
  if (!value || typeof value !== "object") return false;
  const rotation = value as Partial<LegacyRotation>;
  return typeof rotation.id === "string" &&
    typeof rotation.name === "string" &&
    Array.isArray(rotation.steps) &&
    rotation.steps.every((step) =>
      !!step && typeof step === "object" && typeof step.abilityId === "string"
    );
}

function isCategory(value: unknown): value is Category {
  return categories.includes(value as Category);
}

function inferCategory(rotation: LegacyRotation): Category {
  if (isCategory(rotation.category)) return rotation.category;
  // Version 1 saves had no category; a single-style rotation can recover it.
  const styles = new Set(rotation.steps.map((step) => abilityById.get(step.abilityId)?.style).filter(Boolean));
  if (styles.size !== 1) return "hybrid";
  const [style] = styles;
  if (style === "Melee") return "melee";
  if (style === "Magic") return "magic";
  if (style === "Ranged") return "ranged";
  if (style === "Necromancy") return "necro";
  return "hybrid";
}

function normalize(rotation: LegacyRotation): Rotation {
  return {
    id: rotation.id,
    name: rotation.name,
    category: inferCategory(rotation),
    steps: rotation.steps.map((step) => ({ abilityId: step.abilityId }))
  };
}

export function loadRotations(): Rotation[] {
  try {
    const raw = localStorage.getItem(rotationsTag);
    if (!raw) return [freshSample()];
    const stored = JSON.parse(raw) as Partial<StoredRotations>;
    const rotations = Array.isArray(stored.rotations)
      ? stored.rotations.filter(isRotation).map(normalize)
      : [];
    return rotations;
  } catch {
    return [freshSample()];
  }
}

export function saveRotations(rotations: Rotation[]): void {
  const stored: StoredRotations = { version: 2, rotations };
  localStorage.setItem(rotationsTag, JSON.stringify(stored));
}

export function loadActiveId(rotations: Rotation[]): string {
  const savedId = localStorage.getItem(activeTag);
  return rotations.some((rotation) => rotation.id === savedId)
    ? savedId as string
    : "";
}

export function saveActiveId(rotationId: string): void {
  localStorage.setItem(activeTag, rotationId);
}

export function loadCategory(): Category {
  const saved = localStorage.getItem(categoryTag);
  return isCategory(saved) ? saved : "necro";
}

export function saveCategory(category: Category): void {
  localStorage.setItem(categoryTag, category);
}

export function loadCollapsedIds(): string[] {
  try {
    const raw = localStorage.getItem(collapsedTag);
    if (!raw) return [];
    const saved = JSON.parse(raw) as unknown;
    return Array.isArray(saved)
      ? [...new Set(saved.filter((value): value is string => typeof value === "string"))]
      : [];
  } catch {
    return [];
  }
}

export function saveCollapsedIds(rotationIds: Iterable<string>): void {
  localStorage.setItem(
    collapsedTag,
    JSON.stringify([...new Set(rotationIds)])
  );
}
