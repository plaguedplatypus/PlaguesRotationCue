import { rotationEntryById } from "../data/abilityData";
import { rotationCategories } from "./storage";
import type { Rotation, RotationCategory } from "../types";

const FILE_TYPE = "rotation-cue-beta.rotation";
const FILE_VERSION = 1;

type RotationTransfer = {
  type: typeof FILE_TYPE;
  version: typeof FILE_VERSION;
  rotation: Rotation;
};

export function serializeRotation(rotation: Rotation): string {
  const transfer: RotationTransfer = {
    type: FILE_TYPE,
    version: FILE_VERSION,
    rotation: {
      ...rotation,
      steps: rotation.steps.map((step) => ({ ...step }))
    }
  };
  return JSON.stringify(transfer, null, 2);
}

export function parseRotationTransfer(raw: string): Rotation {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (!value || typeof value !== "object") throw new Error("The rotation file is empty or malformed.");
  const transfer = value as Partial<RotationTransfer>;
  if (transfer.type !== FILE_TYPE || transfer.version !== FILE_VERSION) {
    throw new Error("This is not a supported Rotation Cue Beta rotation file.");
  }
  const rotation = transfer.rotation as Partial<Rotation> | undefined;
  if (!rotation || typeof rotation.id !== "string" || !rotation.id.trim()) throw new Error("The rotation ID is missing.");
  if (typeof rotation.name !== "string" || !rotation.name.trim()) throw new Error("The rotation name is missing.");
  if (!rotationCategories.includes(rotation.category as RotationCategory)) throw new Error("The rotation category is invalid.");
  if (!Array.isArray(rotation.steps)) throw new Error("The rotation steps are missing.");
  if (rotation.steps.length > 500) throw new Error("The rotation contains too many steps.");
  const steps = rotation.steps.map((step) => {
    if (!step || typeof step !== "object" || typeof step.abilityId !== "string"
      || (step.abilityId !== "" && !rotationEntryById.has(step.abilityId))) {
      throw new Error("The rotation contains an unknown entry.");
    }
    return { abilityId: step.abilityId };
  });
  return {
    id: rotation.id.trim(),
    name: rotation.name.trim().slice(0, 60),
    category: rotation.category as RotationCategory,
    steps
  };
}
