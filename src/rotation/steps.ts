export interface AbilityStep {
  abilityId: string;
}

export interface CueNote {
  type: "cue-note";
  text: string;
}

export interface Note {
  type: "note";
  text: string;
}

export type Step = AbilityStep | CueNote | Note;
export type Section = "once" | "repeat";

export const cueNoteMaxChars = 64;

export interface Cue {
  step: AbilityStep;
  stepIndex: number;
  contentIndex: number;
  section: Section;
  notes: string[];
  offset: number;
}

export function isAbility(step: Step): step is AbilityStep {
  return "abilityId" in step;
}

export function isCueNote(step: Step): step is CueNote {
  return "type" in step && step.type === "cue-note";
}

export function isNote(step: Step): step is Note {
  return "type" in step && step.type === "note";
}
