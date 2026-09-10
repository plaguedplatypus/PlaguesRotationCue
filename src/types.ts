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

export type ScanAvailability = "available" | "unavailable" | "error";

export interface ScanResult {
  availability: ScanAvailability;
  message: string;
  barsFound: number;
  slotsFound: number;
  recognized: number;
  empty: number;
  unknown: number;
  durationMs: number;
  slots: DetectedSlot[];
}

export type TrackingState =
  | "unavailable"
  | "acquiring-baseline"
  | "armed"
  | "transient"
  | "cooldown-like"
  | "identity-lost";

export interface Observation {
  abilityId: string;
  slotFound: boolean;
  state: TrackingState;
  armed: boolean;
  similarity: number;
  brightness: number;
  brightnessRatio?: number;
  gcdTransient: boolean;
  cooldownText?: string;
  cooldown?: number;
  cooldownFrames: number;
  sampleMs: number;
  used: boolean;
  useCount: number;
  latencyMs?: number;
  message: string;
}

export type Style = "Melee" | "Magic" | "Ranged" | "Necromancy" | "Defensive" | "Utility";

export interface Ability {
  id: string;
  name: string;
  style: Style;
  icon: string;
  cooldownSeconds?: number;
}

export interface Step {
  abilityId: string;
}

export type Category = "melee" | "magic" | "ranged" | "necro" | "hybrid";

export interface Rotation {
  id: string;
  name: string;
  category: Category;
  steps: Step[];
}

export interface Cue {
  step: Step;
  stepIndex: number;
  offset: number;
}

export interface Point {
  x: number;
  y: number;
}
