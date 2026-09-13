export interface DetectedSlot {
  barIndex: number;
  slotIndex: number;
  accepted: boolean;
  abilityId?: string;
}

export interface ScanResult {
  barsFound: number;
  recognized: number;
  slots: DetectedSlot[];
}

export interface Observation {
  abilityId: string;
  slotFound: boolean;
  identityLost: boolean;
  cooldown?: number;
  used: boolean;
}

export type Style = "Melee" | "Magic" | "Ranged" | "Necromancy" | "Defensive" | "Utility";

export interface Ability {
  id: string;
  name: string;
  style: Style;
  icon: string;
  cooldownSeconds?: number;
}

import type { Step } from "./rotation/steps";
export type { AbilityStep, Cue, CueNote, Note, Section, Step } from "./rotation/steps";

export type Category = "melee" | "magic" | "ranged" | "necro" | "hybrid";

export interface Rotation {
  id: string;
  name: string;
  category: Category;
  once?: Step[];
  steps: Step[];
}

export interface Point {
  x: number;
  y: number;
}
