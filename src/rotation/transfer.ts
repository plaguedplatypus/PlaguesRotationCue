import { entryById } from "../data/abilityData";
import { categories } from "./storage";
import { cueNoteMaxChars, isAbility, isCueNote, type Step } from "./steps";
import type { Rotation, Category } from "../types";

const fileType = "rotation-cue-beta.rotation";
const fileVersion = 2;

type RotationTransfer = {
  type: typeof fileType;
  version: typeof fileVersion;
  rotation: Rotation;
};

export function serialize(rotation: Rotation): string {
  const transfer: RotationTransfer = {
    type: fileType,
    version: fileVersion,
    rotation: {
      ...rotation,
      ...(rotation.once === undefined ? {} : { once: rotation.once.map(cloneStep) }),
      steps: rotation.steps.map(cloneStep)
    }
  };
  return JSON.stringify(transfer, null, 2);
}

export function parse(raw: string): Rotation {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (!value || typeof value !== "object") throw new Error("The rotation file is empty or malformed.");
  const transfer = value as { type?: unknown; version?: unknown; rotation?: unknown };
  if (transfer.type !== fileType || (transfer.version !== 1 && transfer.version !== fileVersion)) {
    throw new Error("This is not a supported Rotation Cue Beta rotation file.");
  }
  const version = transfer.version;
  const rotation = transfer.rotation as Partial<Rotation> | undefined;
  if (!rotation || typeof rotation.id !== "string" || !rotation.id.trim()) throw new Error("The rotation ID is missing.");
  if (typeof rotation.name !== "string" || !rotation.name.trim()) throw new Error("The rotation name is missing.");
  if (!categories.includes(rotation.category as Category)) throw new Error("The rotation category is invalid.");
  if (!Array.isArray(rotation.steps)) throw new Error("The rotation steps are missing.");
  // Imported files are untrusted, and a novel-length rotation would make the editor miserable.
  const onceValue = (rotation as { once?: unknown }).once;
  if (version === 1 && onceValue !== undefined) {
    throw new Error("Version 1 rotations cannot contain a Once section.");
  }
  if (onceValue !== undefined && !Array.isArray(onceValue)) {
    throw new Error("The Once section is invalid.");
  }
  const once = onceValue as unknown[] | undefined;
  if (rotation.steps.length + (once?.length ?? 0) > 500) {
    throw new Error("The rotation contains too many steps.");
  }
  const steps = parseSteps(rotation.steps, version === fileVersion);
  const onceSteps = once ? parseSteps(once, true) : undefined;
  return {
    id: rotation.id.trim(),
    name: rotation.name.trim().slice(0, 60),
    category: rotation.category as Category,
    ...(onceSteps === undefined ? {} : { once: onceSteps }),
    steps
  };
}

function parseSteps(values: unknown[], allowText: boolean): Step[] {
  return values.map((value) => {
    if (!value || typeof value !== "object") throw new Error("The rotation contains an unknown entry.");
    const step = value as { abilityId?: unknown; type?: unknown; text?: unknown };
    if (typeof step.abilityId === "string"
      && (step.abilityId === "" || entryById.has(step.abilityId))) {
      return { abilityId: step.abilityId };
    }
    if (allowText && (step.type === "cue-note" || step.type === "note")
      && typeof step.text === "string") {
      const maxChars = step.type === "cue-note" ? cueNoteMaxChars : 500;
      return { type: step.type, text: step.text.slice(0, maxChars) };
    }
    throw new Error("The rotation contains an unknown entry.");
  });
}

function cloneStep(step: Step): Step {
  if (isAbility(step)) return { abilityId: step.abilityId };
  return { type: isCueNote(step) ? "cue-note" : "note", text: step.text };
}
