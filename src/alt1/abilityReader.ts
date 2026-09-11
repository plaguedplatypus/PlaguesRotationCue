import * as a1lib from "alt1/base";
import type {
  ScanResult,
  DetectedSlot,
  Observation,
  TrackingState
} from "../types";
import {
  abilityById,
  nextSequenceId,
  sequenceCooldown,
  sequenceFor
} from "../data/abilityData";
import { Matcher, type IconMatch } from "./iconMatcher";
import {
  clearGeometry,
  Locator,
  showGeometry,
  type SlotLocation,
  type Slot
} from "./actionBar";
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
  private useCount = 0;

  async scan({ showGeometry: showBars = true }: ScanOptions = {}): Promise<ScanResult> {
    const startedAt = performance.now();
    if (!window.alt1) {
      return emptyResult(
        "unavailable",
        "Open Rotation Cue inside Alt1 to scan the action bars.",
        startedAt
      );
    }

    try {
      await this.matcher.prepare();
      this.slotById.clear();
      this.resetTracking();
      clearGeometry();
      const screen = a1lib.captureHoldFullRs();
      if (!screen) {
        return emptyResult("error", "Game could not be captured.", startedAt);
      }

      const bars = await this.locator.find(screen);
      if (!bars.length) {
        return emptyResult(
          "available",
          "No visible action bars were found.",
          startedAt
        );
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
              accepted: false,
              confidence: 0,
              margin: 0,
              rejectionReason: "Bar capture failed"
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
          let best: { match: IconMatch; capture: ImageData } | null = null;
          for (const capture of samples) {
            const match = await this.matcher.match(capture, rect);
            if (!best || matchScore(match) > matchScore(best.match)) {
              best = { match, capture };
            }
          }
          const { match, capture } = best!;
          const slotResult: DetectedSlot = {
            barIndex: barIndex + 1,
            slotIndex: slot.index + 1,
            accepted: match.accepted,
            abilityId: match.abilityId || undefined,
            confidence: match.score,
            margin: match.margin,
            empty: match.empty,
            emptyScore: match.emptyScore,
            rejectionReason: match.rejectionReason,
              previewDataUrl: previewUrl(capture, rect)
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

      const durationMs = Math.round(performance.now() - startedAt);
      const emptySlots = slots.filter((slot) => slot.empty).length;
      return {
        availability: "available",
        message: recognized
          ? `Recognized ${recognized} of ${slots.length} visible slots.`
          : `Found ${bars.length} action bar${bars.length === 1 ? "" : "s"}, but no icons met the acceptance threshold. Retry with the global cooldown clear; the slot previews below show exactly what was captured.`,
        barsFound: bars.length,
        slotsFound: slots.length,
        recognized,
        empty: emptySlots,
        unknown: slots.length - recognized - emptySlots,
        durationMs,
        slots
      };
    } catch (error) {
      console.warn("Action-bar scan failed", error);
      return emptyResult("error", "Action-bar scanning failed. Try again with the bars unobstructed.", startedAt);
    }
  }

  async observeExpected(abilityId: string): Promise<Observation> {
    const startedAt = performance.now();
    if (!window.alt1) {
      return this.observation(abilityId, "unavailable", false, 0, 0, startedAt,
        "Expected-ability tracking requires Alt1.");
    }

    const location = this.slotById.get(abilityId);
    if (!location) {
      return this.observation(abilityId, "unavailable", false, 0, 0, startedAt,
        "Expected ability was not found. Run a full discovery scan.");
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
      return this.observation(abilityId, "unavailable", true, 0, 0, startedAt,
        "Expected slot capture failed.");
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
      return this.observation(abilityId, "unavailable", true, 0, 0, startedAt,
        "Expected ability template is unavailable.");
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
        if (this.tracking.rolloverFrames === 0) {
          this.tracking.cooldownAt = performance.now();
        }
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
      return this.observation(abilityId, "identity-lost", false, measurement.similarity,
        measurement.brightness, startedAt, "Slot identity was lost. Run a full discovery scan.");
    }

    let state: TrackingState = "acquiring-baseline";
    let message = "Waiting for a clear ready baseline.";
    let used = false;
    let gcdTransient = false;
    let latencyMs: number | undefined;

    if (useSignal) {
      this.tracking.gcdFrames = 0;
      this.tracking.readyFrames = 0;
      if (this.tracking.cooldownFrames === 0) this.tracking.cooldownAt = performance.now();
      this.tracking.cooldownFrames++;
      state = "cooldown-like";

      if ((this.tracking.armed
        && (this.tracking.cooldownFrames >= 2 || sequenceConfirmed))
        || rolloverUse) {
        used = true;
        this.useCount++;
        latencyMs = Math.round(performance.now() - this.tracking.cooldownAt);
        this.tracking.lastLatency = latencyMs;
        this.tracking.armed = false;
        this.tracking.emitted = true;
        this.tracking.nearClearFrames = 0;
        this.tracking.rolloverPrimed = false;
        this.tracking.rolloverFrames = 0;
        this.tracking.sequenceFrames = 0;
        message = sequenceConfirmed && nextAbilityId
          ? `Use detected from action-bar sequence advancing to ${abilityById.get(nextAbilityId)!.name}.`
          : rolloverUse
          ? "Use detected from a confirmed cooldown reset."
          : visualConfirmed
            ? "Use detected from persistent slot cooldown visuals."
            : "Use detected from persistent cooldown text.";
      } else if (this.tracking.emitted) {
        message = "Cooldown remains visible; detector is disarmed.";
      } else if (!this.tracking.armed) {
        message = "Existing cooldown detected; waiting for the slot to become ready.";
      } else {
        message = "Confirming cooldown on the next observation.";
      }
    } else {
      this.tracking.cooldownFrames = 0;
      this.tracking.cooldownAt = 0;
      if (gcdDarkening) {
        this.tracking.gcdFrames++;
        this.tracking.readyFrames = 0;
        gcdTransient = this.tracking.gcdFrames <= gcdMaxFrames;
        state = "transient";
        message = gcdTransient
          ? `GCD-like darkening at ${Math.round(brightnessRatio * 100)}% of ready brightness; ignored.`
          : "Brightness has remained low too long to classify as a GCD; waiting for cooldown text or recovery.";
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
          state = "armed";
          message = this.tracking.baseline
            ? "Ready state confirmed; waiting for use."
            : "Ready state confirmed; brightness baseline is still calibrating.";
        } else if (!brightnessReady) {
          state = "transient";
          message = "The icon has not returned to its ready brightness; no event can fire.";
        } else if (this.tracking.emitted) {
          state = "transient";
          message = `Confirming cooldown recovery (${this.tracking.readyFrames}/${framesNeeded}).`;
        } else if (this.tracking.armed) {
          state = "transient";
          message = `Confirming GCD recovery (${this.tracking.readyFrames}/${framesNeeded}).`;
        }
        if (!this.tracking.baseline && !this.tracking.armed) {
          state = "acquiring-baseline";
          message = `Confirming ready state (${this.tracking.readyFrames}/${framesNeeded}); brightness calibration ${this.tracking.readySamples.length}/${baselineSamples}.`;
        } else if (!this.tracking.emitted && brightnessReady && !gcdDarkening
          && measurement.brightness <= this.tracking.baseline * 1.25) {
          addBrightness(this.tracking, measurement.brightness, 7);
          const midpoint = median(this.tracking.readySamples);
          this.tracking.baseline = this.tracking.baseline * 0.85 + midpoint * 0.15;
        }
      } else {
        this.tracking.readyFrames = 0;
        state = "transient";
        message = "Icon changed without cooldown evidence; ignoring transient state.";
      }
    }

    return {
      abilityId,
      slotFound: true,
      state,
      armed: this.tracking.armed,
      similarity: measurement.similarity,
      brightness: measurement.brightness,
      brightnessRatio,
      gcdTransient,
      cooldownText: cooldown.rawText || undefined,
      cooldown: cooldownValue,
      cooldownFrames: this.tracking.cooldownFrames,
      sampleMs: Math.round((performance.now() - startedAt) * 10) / 10,
      used,
      useCount: this.useCount,
      latencyMs: latencyMs ?? this.tracking.lastLatency,
      message
    };
  }

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
    state: TrackingState,
    slotFound: boolean,
    similarity: number,
    brightness: number,
    startedAt: number,
    message: string
  ): Observation {
    return {
      abilityId,
      slotFound,
      state,
      armed: this.tracking.armed,
      similarity,
      brightness,
      brightnessRatio: undefined,
      gcdTransient: false,
      cooldownFrames: 0,
      sampleMs: Math.round((performance.now() - startedAt) * 10) / 10,
      used: false,
      useCount: this.useCount,
      message
    };
  }
}

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
  cooldownAt: number;
  lowIdentity: number;
  baseline: number;
  readySamples: number[];
  lastLatency?: number;
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
    cooldownAt: 0,
    lowIdentity: 0,
    baseline: 0,
    readySamples: [],
    lastLatency: undefined
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

function captureArea(slots: Slot[]): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.floor(Math.min(...slots.map((slot) => slot.x)) - 2));
  const y = Math.max(0, Math.floor(Math.min(...slots.map((slot) => slot.y)) - 2));
  const right = Math.ceil(Math.max(...slots.map((slot) => slot.x + slot.width)) + 2);
  const bottom = Math.ceil(Math.max(...slots.map((slot) => slot.y + slot.height)) + 2);
  return { x, y, width: right - x, height: bottom - y };
}

function emptyResult(
  availability: ScanResult["availability"],
  message: string,
  startedAt: number
): ScanResult {
  return {
    availability,
    message,
    barsFound: 0,
    slotsFound: 0,
    recognized: 0,
    empty: 0,
    unknown: 0,
    durationMs: Math.round(performance.now() - startedAt),
    slots: []
  };
}

function matchScore(match: IconMatch): number {
  return (match.accepted ? 2 : 0) + match.score + match.margin * 0.5;
}

function previewUrl(image: ImageData, rect: { x: number; y: number; width: number; height: number }): string | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.putImageData(image, -rect.x, -rect.y);
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
