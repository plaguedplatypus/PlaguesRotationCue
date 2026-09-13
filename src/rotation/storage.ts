import { abilityById } from "../data/abilityData";
import { cueNoteMaxChars, isAbility, isCueNote, type Step } from "./steps";
import type { Rotation, Category } from "../types";

const rotationsTag = "rotation-cue.rotations.v1";
const activeTag = "rotation-cue.active-rotation.v1";
const categoryTag = "rotation-cue.category.v1";
const collapsedTag = "rotation-cue.collapsed-rotations.v1";

export const categories: Category[] = ["melee", "magic", "ranged", "necro", "hybrid"];

export const sampleRotation: Rotation = {
  "id": "sample-necro",
  "name": "Sample Necromancy Rotation",
  "category": "necro",
  "once": [
    { "type": "cue-note", "text": "Pre-Build at War's Retreat" },
    { "abilityId": "invoke_death" },
    { "abilityId": "conjure_undead_army" },
    { "abilityId": "life_transfer" },
    { "abilityId": "command_vengeful_ghost" },
    { "abilityId": "split_soul" },
    { "abilityId": "command_skeleton_warrior" },
    { "type": "note", "text": "Pre-Build Rotation" }
  ],
  "steps": [
    { "abilityId": "death_skulls" },
    { "abilityId": "touch_of_death" },
    { "abilityId": "soul_sap" },
    { "abilityId": "finger_of_death" },
    { "abilityId": "volley_of_souls" },
    { "abilityId": "living_death" },
    { "abilityId": "threads_of_fate" },
    { "abilityId": "split_soul" },
    { "abilityId": "bloat" },
    { "type": "cue-note", "text": "Move to -A Spot-" },
    { "abilityId": "marker_move" }
  ]
};

function freshSample(): Rotation {
  return {
    ...sampleRotation,
    steps: sampleRotation.steps.map((step) => ({ ...step }))
  };
}

type StoredRotations = {
  version: 1 | 2 | 3;
  rotations: Rotation[];
};

type LegacyRotation = Omit<Rotation, "category" | "once"> & {
  category?: unknown;
  once?: Step[];
};

function isStep(value: unknown): value is Step {
  if (!value || typeof value !== "object") return false;
  const step = value as { abilityId?: unknown; type?: unknown; text?: unknown };
  return typeof step.abilityId === "string"
    || ((step.type === "cue-note" || step.type === "note") && typeof step.text === "string");
}

function isRotation(value: unknown): value is LegacyRotation {
  if (!value || typeof value !== "object") return false;
  const rotation = value as Partial<LegacyRotation>;
  return typeof rotation.id === "string" &&
    typeof rotation.name === "string" &&
    Array.isArray(rotation.steps) &&
    rotation.steps.every(isStep) &&
    (rotation.once === undefined || (Array.isArray(rotation.once) && rotation.once.every(isStep)));
}

function isCategory(value: unknown): value is Category {
  return categories.includes(value as Category);
}

function inferCategory(rotation: LegacyRotation): Category {
  if (isCategory(rotation.category)) return rotation.category;
  // Version 1 saves had no category; a single-style rotation can recover it.
  const content = [...(rotation.once ?? []), ...rotation.steps];
  const styles = new Set(content
    .filter(isAbility)
    .map((step) => abilityById.get(step.abilityId)?.style)
    .filter(Boolean));
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
    ...(rotation.once === undefined ? {} : { once: rotation.once.map(normalizeStep) }),
    steps: rotation.steps.map(normalizeStep)
  };
}

function normalizeStep(step: Step): Step {
  if (isAbility(step)) return { abilityId: step.abilityId };
  return {
    type: isCueNote(step) ? "cue-note" : "note",
    text: step.text.slice(0, isCueNote(step) ? cueNoteMaxChars : 500)
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
  const stored: StoredRotations = { version: 3, rotations };
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
