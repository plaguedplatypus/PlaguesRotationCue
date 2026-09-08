import { abilityById } from "../data/abilityData";
import type { Rotation, RotationCategory } from "../types";

const STORAGE_KEY = "rotation-cue.rotations.v1";
const ACTIVE_KEY = "rotation-cue.active-rotation.v1";
const CATEGORY_KEY = "rotation-cue.category.v1";
const COLLAPSED_ROTATIONS_KEY = "rotation-cue.collapsed-rotations.v1";

export const rotationCategories: RotationCategory[] = ["melee", "magic", "ranged", "necro", "hybrid"];

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

function freshSampleRotation(): Rotation {
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

function isRotationShape(value: unknown): value is LegacyRotation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LegacyRotation>;
  return typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.steps) &&
    candidate.steps.every((step) =>
      !!step && typeof step === "object" && typeof step.abilityId === "string"
    );
}

function isCategory(value: unknown): value is RotationCategory {
  return rotationCategories.includes(value as RotationCategory);
}

function inferCategory(rotation: LegacyRotation): RotationCategory {
  if (isCategory(rotation.category)) return rotation.category;
  const styles = new Set(rotation.steps.map((step) => abilityById.get(step.abilityId)?.style).filter(Boolean));
  if (styles.size !== 1) return "hybrid";
  const [style] = styles;
  if (style === "Melee") return "melee";
  if (style === "Magic") return "magic";
  if (style === "Ranged") return "ranged";
  if (style === "Necromancy") return "necro";
  return "hybrid";
}

function normalizeRotation(rotation: LegacyRotation): Rotation {
  return {
    id: rotation.id,
    name: rotation.name,
    category: inferCategory(rotation),
    steps: rotation.steps.map((step) => ({ abilityId: step.abilityId }))
  };
}

export function loadRotations(): Rotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [freshSampleRotation()];
    const stored = JSON.parse(raw) as Partial<StoredRotations>;
    const rotations = Array.isArray(stored.rotations)
      ? stored.rotations.filter(isRotationShape).map(normalizeRotation)
      : [];
    return rotations;
  } catch {
    return [freshSampleRotation()];
  }
}

export function saveRotations(rotations: Rotation[]): void {
  const stored: StoredRotations = { version: 2, rotations };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function loadActiveRotationId(rotations: Rotation[]): string {
  const savedId = localStorage.getItem(ACTIVE_KEY);
  return rotations.some((rotation) => rotation.id === savedId)
    ? savedId as string
    : "";
}

export function saveActiveRotationId(rotationId: string): void {
  localStorage.setItem(ACTIVE_KEY, rotationId);
}

export function loadSelectedCategory(): RotationCategory {
  const saved = localStorage.getItem(CATEGORY_KEY);
  return isCategory(saved) ? saved : "necro";
}

export function saveSelectedCategory(category: RotationCategory): void {
  localStorage.setItem(CATEGORY_KEY, category);
}

export function loadCollapsedRotationIds(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_ROTATIONS_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as unknown;
    return Array.isArray(saved)
      ? [...new Set(saved.filter((value): value is string => typeof value === "string"))]
      : [];
  } catch {
    return [];
  }
}

export function saveCollapsedRotationIds(rotationIds: Iterable<string>): void {
  localStorage.setItem(
    COLLAPSED_ROTATIONS_KEY,
    JSON.stringify([...new Set(rotationIds)])
  );
}
