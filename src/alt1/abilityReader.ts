import * as a1lib from "alt1/base";
import type { ScanResult, DetectedSlot, Observation } from "../types";
import { abilityById, nextSequenceId, sequenceCooldown, sequenceFor } from "../data/abilityData";
import { Matcher, type IconMatch } from "./iconMatcher";
import { clearGeometry, Locator, showGeometry, type SlotLocation, type Slot } from "./actionBar";
import { readCooldown } from "./cooldownOcr";

const discoverySamples = 3;
const sampleGapMs = 950;
const gcdBrightness = 0.80;
const gcdMaxFrames = 8;
const visualConfirmFrames = gcdMaxFrames + 2;
const baselineSamples = 5;
const readyFrames = 2;
const clearFrames = 3;
const rearmFrames = 8;
const rolloverPrime = 3;
const transitionScore = 0.68;
const transitionMargin = 0.08;
const transitionFrames = 2;
const hurricaneOcrSeconds = 3;
const artifactSimilarity = 0.90;
const artifactBrightness = 0.90;

interface ReaderApi {
  scan(options?: ScanOptions): Promise<ScanResult>;
  observeExpected(abilityId: string): Promise<Observation>;
  getLocation(abilityId: string): SlotLocation | null;
  resetTracking(): void;
}

export interface ScanOptions {
  showGeometry?: boolean;
}

export class Reader implements ReaderApi {
  private readonly matcher = new Matcher();
  private readonly locator = new Locator();
  private readonly slotById = new Map<string, SavedSlot>();
  private tracking: Tracking = freshTracking();

  // *** Action bar scan

  async scan({ showGeometry: showBars = true }: ScanOptions = {}): Promise<ScanResult> {
    if (!window.alt1) {
      return emptyResult();
    }

    try {
      await this.matcher.prepare();
      this.slotById.clear();
      this.resetTracking();
      clearGeometry();
      const screen = a1lib.captureHoldFullRs();
      if (!screen) {
        return emptyResult();
      }

      const bars = await this.locator.find(screen);
      if (!bars.length) {
        return emptyResult();
      }
      if (showBars) showGeometry(bars);

      const slots: DetectedSlot[] = [];
      let recognized = 0;
      const areas = bars.map((bar) => captureArea(bar.slots));
      const captures = bars.map(() => [] as ImageData[]);
      // Multiple samples keep a passing GCD or queue animation from owning discovery.
      for (let sample = 0; sample < discoverySamples; sample++) {
        areas.forEach((area, barIndex) => {
          const capture = a1lib.capture(area.x, area.y, area.width, area.height);
          if (capture) captures[barIndex].push(capture);
        });
        if (sample < discoverySamples - 1) await pause(sampleGapMs);
      }
      for (let barIndex = 0; barIndex < bars.length; barIndex++) {
        const bar = bars[barIndex];
        const area = areas[barIndex];
        const samples = captures[barIndex];
        if (!samples.length) {
          for (const slot of bar.slots) {
            slots.push({
              barIndex: barIndex + 1,
              slotIndex: slot.index + 1,
              accepted: false
            });
          }
          continue;
        }

        for (const slot of bar.slots) {
          const rect = {
            x: slot.x - area.x,
            y: slot.y - area.y,
            width: slot.width,
            height: slot.height
          };
          let best: IconMatch | null = null;
          for (const capture of samples) {
            const match = await this.matcher.match(capture, rect);
            if (!best || matchScore(match) > matchScore(best)) {
              best = match;
            }
          }
          const match = best!;
          const slotResult: DetectedSlot = {
            barIndex: barIndex + 1,
            slotIndex: slot.index + 1,
            accepted: match.accepted,
            abilityId: match.abilityId || undefined
          };
          slots.push(slotResult);
          if (match.accepted) {
            // Every stage replaces the same physical slot; Dismember, Scythe, and the summons.
            const sequenceIds = sequenceFor(match.abilityId)
              ?? [match.abilityId];
            for (const sequenceId of sequenceIds) {
              const remembered = this.slotById.get(sequenceId);
              if (remembered && match.score <= remembered.confidence) continue;
              this.slotById.set(sequenceId, {
                x: slot.x,
                y: slot.y,
                width: slot.width,
                height: slot.height,
                confidence: match.score
              });
            }
            recognized++;
          }
        }
      }

      return {
        barsFound: bars.length,
        recognized,
        slots
      };
    } catch (error) {
      console.warn("Action-bar scan failed", error);
      return emptyResult();
    }
  }

  // *** Ability tracking

  async observeExpected(abilityId: string): Promise<Observation> {
    if (!window.alt1) {
      return this.observation(abilityId, false);
    }

    const location = this.slotById.get(abilityId);
    if (!location) {
      return this.observation(abilityId, false);
    }

    if (this.tracking.abilityId !== abilityId) {
      this.tracking = freshTracking(abilityId);
    }

    const padding = 2;
    const area = {
      x: Math.max(0, location.x - padding),
      y: Math.max(0, location.y - padding),
      width: location.width + padding * 2,
      height: location.height + padding * 2
    };
    const capture = a1lib.capture(area.x, area.y, area.width, area.height);
    if (!capture) {
      return this.observation(abilityId, true);
    }

    const rect = { x: padding, y: padding, width: location.width, height: location.height };
    const nextAbilityId = nextSequenceId(abilityId);
    const measurements = await this.matcher.measureKnown(
      capture,
      rect,
      nextAbilityId ? [abilityId, nextAbilityId] : [abilityId]
    );
    const measurement = measurements.find((measurement) => measurement.abilityId === abilityId);
    if (!measurement) {
      return this.observation(abilityId, true);
    }
    const nextMeasurement = nextAbilityId
      ? measurements.find((measurement) => measurement.abilityId === nextAbilityId)
      : undefined;

    const maxCooldown = abilityById.get(abilityId)?.cooldownSeconds
      ?? sequenceCooldown(abilityId);
    const cooldown = readCooldown(capture, rect, {
      max: maxCooldown
    });
    const matched = measurement.similarity >= 0.55;
    // Hurricane's white center consistently OCRs as 3 or 7 while the icon is ready.
    const hurricaneArtifact = abilityId === "hurricane"
      && cooldown.seconds === hurricaneOcrSeconds
      && measurement.similarity >= artifactSimilarity
      && (!this.tracking.baseline
        || measurement.brightness >= this.tracking.baseline
          * artifactBrightness);
    const cooldownValue = hurricaneArtifact
      ? undefined
      : cooldown.seconds;
    const hasCooldown = cooldownValue !== undefined
      && cooldownValue > 0
      && (cooldown.reliable !== false || !matched);
    let useSignal = hasCooldown;
    // Sequence abilities swap artwork in place.
    const stageChanged = this.tracking.armed
      && nextMeasurement !== undefined
      && nextMeasurement.similarity >= transitionScore
      && nextMeasurement.similarity >= measurement.similarity + transitionMargin;
    this.tracking.sequenceFrames = stageChanged
      ? this.tracking.sequenceFrames + 1
      : 0;
    const sequenceConfirmed = this.tracking.sequenceFrames
      >= transitionFrames;
    if (sequenceConfirmed) useSignal = true;
    // A short timer can clear between polls; prime near zero, then accept its jump back to full.
    const primeAt = maxCooldown !== undefined
      ? Math.min(rolloverPrime, Math.max(2, Math.ceil(maxCooldown / 2)))
      : 2;
    const rolloverThreshold = maxCooldown !== undefined
      ? Math.max(2, Math.ceil(maxCooldown * 0.88))
      : undefined;
    let rolloverUse = false;

    if (hasCooldown) {
      const seconds = cooldownValue!;
      if (seconds <= primeAt) {
        this.tracking.nearClearFrames++;
        this.tracking.rolloverPrimed = this.tracking.nearClearFrames >= 2;
        this.tracking.rolloverFrames = 0;
      } else if (!this.tracking.armed
        && !this.tracking.emitted
        && this.tracking.rolloverPrimed
        && cooldown.reliable !== false
        && rolloverThreshold !== undefined
        && seconds >= rolloverThreshold) {
        this.tracking.rolloverFrames++;
        const framesNeeded = maxCooldown! <= 6 ? 1 : 2;
        rolloverUse = this.tracking.rolloverFrames >= framesNeeded;
      } else {
        this.tracking.nearClearFrames = 0;
        this.tracking.rolloverPrimed = false;
        this.tracking.rolloverFrames = 0;
      }
      this.tracking.lastCooldown = seconds;
    } else {
      this.tracking.rolloverFrames = 0;
      if (this.tracking.lastCooldown !== undefined
        && this.tracking.lastCooldown <= primeAt
        && this.tracking.nearClearFrames > 0) {
        this.tracking.rolloverPrimed = true;
      }
    }
    if (hasCooldown && !this.tracking.armed && !this.tracking.emitted) {
      this.tracking.cooldownFloor = this.tracking.cooldownFloor
        ? Math.min(this.tracking.cooldownFloor, cooldownValue!)
        : cooldownValue!;
    }
    if (!hasCooldown && matched && !this.tracking.baseline) {
      addBrightness(this.tracking, measurement.brightness, baselineSamples);
      if (this.tracking.readySamples.length >= baselineSamples) {
        const sorted = [...this.tracking.readySamples].sort((a, b) => a - b);
        this.tracking.baseline = sorted[sorted.length - 2];
      }
    }
    const brightnessRatio = this.tracking.baseline
      ? measurement.brightness / this.tracking.baseline
      : undefined;
    // GCD darkening is rejection-only. Brightness alone should never fire immediately.
    const gcdDarkening = !hasCooldown
      && brightnessRatio !== undefined
      && brightnessRatio < gcdBrightness;
    const visualCooldown = !hasCooldown
      && maxCooldown !== undefined
      && this.tracking.armed
      && this.tracking.baseline > 0
      && (gcdDarkening || measurement.similarity < 0.38);
    if (visualCooldown) this.tracking.visualFrames++;
    else if (!this.tracking.emitted) this.tracking.visualFrames = 0;
    const visualConfirmed = this.tracking.visualFrames >= visualConfirmFrames;
    if (visualConfirmed) useSignal = true;
    const identityLost = this.tracking.baseline > 0
      && !this.tracking.armed
      && !this.tracking.emitted
      && measurement.similarity < 0.38
      && !hasCooldown
      && !gcdDarkening
      && !stageChanged;

    if (identityLost) this.tracking.lowIdentity++;
    else this.tracking.lowIdentity = 0;

    if (this.tracking.lowIdentity >= 4) {
      // Moving abilities while a rotation active can cause a rotation to fail and stop completely.
      this.slotById.delete(abilityId);
      this.tracking = freshTracking();
      return this.observation(abilityId, false, true);
    }

    let used = false;

    if (useSignal) {
      this.tracking.gcdFrames = 0;
      this.tracking.readyFrames = 0;
      this.tracking.cooldownFrames++;

      if ((this.tracking.armed
        && (this.tracking.cooldownFrames >= 2 || sequenceConfirmed))
        || rolloverUse) {
        used = true;
        this.tracking.armed = false;
        this.tracking.emitted = true;
        this.tracking.nearClearFrames = 0;
        this.tracking.rolloverPrimed = false;
        this.tracking.rolloverFrames = 0;
        this.tracking.sequenceFrames = 0;
      }
    } else {
      this.tracking.cooldownFrames = 0;
      if (gcdDarkening) {
        this.tracking.gcdFrames++;
        this.tracking.readyFrames = 0;
      } else if (matched) {
        this.tracking.gcdFrames = 0;
        const brightnessReady = !this.tracking.baseline
          || measurement.brightness >= this.tracking.baseline * 0.82;
        this.tracking.readyFrames = brightnessReady ? this.tracking.readyFrames + 1 : 0;
        const framesNeeded = this.tracking.emitted
          ? rearmFrames
          : this.tracking.cooldownFloor > 2
            ? clearFrames
            : readyFrames;
        if (this.tracking.readyFrames >= framesNeeded) {
          this.tracking.armed = true;
          this.tracking.emitted = false;
        }
        if ((this.tracking.baseline > 0 || this.tracking.armed)
          && !this.tracking.emitted && brightnessReady && !gcdDarkening
          && measurement.brightness <= this.tracking.baseline * 1.25) {
          addBrightness(this.tracking, measurement.brightness, 7);
          const midpoint = median(this.tracking.readySamples);
          this.tracking.baseline = this.tracking.baseline * 0.85 + midpoint * 0.15;
        }
      } else {
        this.tracking.readyFrames = 0;
      }
    }

    return {
      abilityId,
      slotFound: true,
      identityLost: false,
      cooldown: cooldownValue,
      used
    };
  }

  // *** Reader state

  resetTracking(): void {
    this.tracking = freshTracking();
  }

  getLocation(abilityId: string): SlotLocation | null {
    const location = this.slotById.get(abilityId);
    return location ? {
      x: location.x,
      y: location.y,
      width: location.width,
      height: location.height
    } : null;
  }

  private observation(
    abilityId: string,
    slotFound: boolean,
    identityLost = false
  ): Observation {
    return {
      abilityId,
      slotFound,
      identityLost,
      used: false
    };
  }
}

// *** Tracking state

type SavedSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type Tracking = {
  abilityId: string;
  armed: boolean;
  emitted: boolean;
  readyFrames: number;
  cooldownFrames: number;
  gcdFrames: number;
  nearClearFrames: number;
  rolloverPrimed: boolean;
  rolloverFrames: number;
  visualFrames: number;
  sequenceFrames: number;
  lastCooldown?: number;
  cooldownFloor: number;
  lowIdentity: number;
  baseline: number;
  readySamples: number[];
};

function freshTracking(abilityId = ""): Tracking {
  return {
    abilityId,
    armed: false,
    emitted: false,
    readyFrames: 0,
    cooldownFrames: 0,
    gcdFrames: 0,
    nearClearFrames: 0,
    rolloverPrimed: false,
    rolloverFrames: 0,
    visualFrames: 0,
    sequenceFrames: 0,
    lastCooldown: undefined,
    cooldownFloor: 0,
    lowIdentity: 0,
    baseline: 0,
    readySamples: []
  };
}

function addBrightness(tracking: Tracking, brightness: number, max: number): void {
  tracking.readySamples.push(brightness);
  if (tracking.readySamples.length > max) tracking.readySamples.shift();
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// *** Scan helpers

function captureArea(slots: Slot[]): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.floor(Math.min(...slots.map((slot) => slot.x)) - 2));
  const y = Math.max(0, Math.floor(Math.min(...slots.map((slot) => slot.y)) - 2));
  const right = Math.ceil(Math.max(...slots.map((slot) => slot.x + slot.width)) + 2);
  const bottom = Math.ceil(Math.max(...slots.map((slot) => slot.y + slot.height)) + 2);
  return { x, y, width: right - x, height: bottom - y };
}

function emptyResult(): ScanResult {
  return {
    barsFound: 0,
    recognized: 0,
    slots: []
  };
}

function matchScore(match: IconMatch): number {
  return (match.accepted ? 2 : 0) + match.score + match.margin * 0.5;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
