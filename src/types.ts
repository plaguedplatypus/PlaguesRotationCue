export interface DetectedSlot {
  barIndex: number;
  slotIndex: number;
  accepted: boolean;
  abilityId?: string;
  confidence: number;
  margin: number;
  empty?: boolean;
  emptyScore?: number;
  rejectionReason?: string;
  previewDataUrl?: string;
}

export type AbilityScanAvailability = "available" | "unavailable" | "error";

export interface AbilityScanResult {
  availability: AbilityScanAvailability;
  message: string;
  barsFound: number;
  slotsFound: number;
  recognized: number;
  empty: number;
  unknown: number;
  durationMs: number;
  slots: DetectedSlot[];
}

export type ExpectedTrackingState =
  | "unavailable"
  | "acquiring-baseline"
  | "armed"
  | "transient"
  | "cooldown-like"
  | "identity-lost";

export interface ExpectedAbilityObservation {
  abilityId: string;
  slotFound: boolean;
  state: ExpectedTrackingState;
  armed: boolean;
  identitySimilarity: number;
  brightness: number;
  brightnessRatio?: number;
  gcdTransient: boolean;
  cooldownRawText?: string;
  cooldownSeconds?: number;
  cooldownFrames: number;
  observationMs: number;
  useEvent: boolean;
  useEventCount: number;
  detectionLatencyMs?: number;
  message: string;
}

export type AbilityStyle = "Melee" | "Magic" | "Ranged" | "Necromancy" | "Defensive" | "Utility";

export interface AbilityDefinition {
  id: string;
  name: string;
  style: AbilityStyle;
  icon: string;
  cooldownSeconds?: number;
}

export interface RotationStep {
  abilityId: string;
}

export type RotationCategory = "melee" | "magic" | "ranged" | "necro" | "hybrid";

export interface Rotation {
  id: string;
  name: string;
  category: RotationCategory;
  steps: RotationStep[];
}

export interface CueItem {
  step: RotationStep;
  stepIndex: number;
  offset: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}
