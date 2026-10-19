import { entryById } from "../data/abilityData";
import type { Rotation } from "../types";
import { isAbility, type Section, type Step } from "./steps";

const gcdSeconds = 1.8;
const cautionSeconds = 3;

export interface Check {
  abilityId: string;
  section: Section;
  index: number;
  number: number;
  time: number;
  cooldown: number;
  gap?: number;
  earlyBy: number;
  status: "ok" | "warn" | "early";
}

export function checkCooldowns(rotation: Rotation, loopAtEnd: boolean) {
  const checks: Check[] = [];
  let slots = 0;
  let number = 0;
  let unknown = 0;

  function add(content: Step[], section: Section): void {
    content.forEach((step, index) => {
      if (!isAbility(step) || !step.abilityId) return;
      number += 1;
      const entry = entryById.get(step.abilityId);
      if (entry && ["item", "cue", "prayer", "aspect"].includes(entry.pickerSection)) return;
      if (entry?.cooldownSeconds === undefined) {
        unknown += 1;
      } else {
        checks.push({
          abilityId: step.abilityId,
          section,
          index,
          number,
          time: slots * gcdSeconds,
          cooldown: entry.cooldownSeconds,
          earlyBy: 0,
          status: "ok"
        });
      }
      slots += 1;
    });
  }

  add(rotation.once ?? [], "once");
  const repeatStart = slots;
  add(rotation.steps, "repeat");
  const repeatSeconds = (slots - repeatStart) * gcdSeconds;
  const last = new Map<string, number>();

  function record(check: Check, time: number): void {
    const previous = last.get(check.abilityId);
    if (previous !== undefined) {
      const gap = Math.round((time - previous) * 10) / 10;
      check.gap = Math.min(check.gap ?? gap, gap);
    }
    last.set(check.abilityId, time);
  }

  checks.forEach((check) => record(check, check.time));
  if (loopAtEnd) {
    // The second pass covers loop reuse without replaying Run-Once.
    checks.filter((check) => check.section === "repeat")
      .forEach((check) => record(check, check.time + repeatSeconds));
  }

  checks.forEach((check) => {
    if (check.gap === undefined) return;
    check.earlyBy = Math.round(Math.max(0, check.cooldown - check.gap) * 10) / 10;
    check.status = check.earlyBy === 0 ? "ok"
      : check.earlyBy <= cautionSeconds ? "warn" : "early";
  });
  return { checks, unknown, onceSeconds: repeatStart * gcdSeconds, repeatSeconds };
}
