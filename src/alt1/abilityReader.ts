import * as a1lib from "alt1/base";
import type {
  AbilityScanResult,
  DetectedAbility,
  DetectedSlot,
  ExpectedAbilityObservation,
  ExpectedTrackingState
} from "../types";
import { abilityById } from "../data/abilities";
import { IconMatcher, type IconMatch } from "./iconMatcher";
import {
  ModernActionBarLocator,
  showActionBarGeometry,
  type ActionBarSlotLocation,
  type ModernActionBarSlot
} from "./actionBar";
import { readCooldown } from "./cooldownOcr";

const DISCOVERY_SAMPLES = 3;
const DISCOVERY_SAMPLE_GAP_MS = 950;
const GCD_BRIGHTNESS_RATIO = 0.80;
const GCD_MAX_FRAMES = 8;
const VISUAL_COOLDOWN_CONFIRM_FRAMES = GCD_MAX_FRAMES + 2;
const BASELINE_SAMPLES = 5;
const READY_CONFIRM_FRAMES = 2;
const UNCERTAIN_COOLDOWN_CLEAR_FRAMES = 3;
const REARM_CONFIRM_FRAMES = 8;
const COOLDOWN_ROLLOVER_PRIME_SECONDS = 3;

export interface AbilityReader {
  scan(options?: AbilityScanOptions): Promise<AbilityScanResult>;
  observeExpectedAbility(abilityId: string): Promise<ExpectedAbilityObservation>;
  getAbilityLocation(abilityId: string): ActionBarSlotLocation | null;
  resetExpectedTracking(): void;
}

export interface AbilityScanOptions {
  showGeometry?: boolean;
}

export class DiagnosticAbilityReader implements AbilityReader {
  private readonly matcher = new IconMatcher();
  private readonly locator = new ModernActionBarLocator();
  private readonly locationsByAbility = new Map<string, RememberedSlot>();
  private tracking: TrackingMemory = freshTrackingMemory();
  private useEventCount = 0;

  async scan({ showGeometry = true }: AbilityScanOptions = {}): Promise<AbilityScanResult> {
    const startedAt = performance.now();
    if (!window.alt1) {
      return emptyResult(
        "unavailable",
        "Open Rotation Cue inside Alt1 to scan the RuneScape action bars.",
        startedAt
      );
    }

    try {
      await this.matcher.prepare();
      this.locationsByAbility.clear();
      this.resetExpectedTracking();
      const fullCapture = a1lib.captureHoldFullRs();
      if (!fullCapture) {
        return emptyResult("error", "RuneScape could not be captured.", startedAt);
      }

      const bars = await this.locator.find(fullCapture);
      if (!bars.length) {
        return emptyResult(
          "available",
          "No visible RuneScape action bars were found.",
          startedAt
        );
      }
      if (showGeometry) showActionBarGeometry(bars);

      const slots: DetectedSlot[] = [];
      const detectedAbilities: DetectedAbility[] = [];
      const areas = bars.map((bar) => captureAreaForSlots(bar.slots));
      const capturesByBar = bars.map(() => [] as ImageData[]);
      for (let sample = 0; sample < DISCOVERY_SAMPLES; sample++) {
        areas.forEach((area, barIndex) => {
          const capture = a1lib.capture(area.x, area.y, area.width, area.height);
          if (capture) capturesByBar[barIndex].push(capture);
        });
        if (sample < DISCOVERY_SAMPLES - 1) await pause(DISCOVERY_SAMPLE_GAP_MS);
      }
      for (let barIndex = 0; barIndex < bars.length; barIndex++) {
        const bar = bars[barIndex];
        const area = areas[barIndex];
        const captures = capturesByBar[barIndex];
        if (!captures.length) {
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
          let chosen: { match: IconMatch; capture: ImageData } | null = null;
          for (const capture of captures) {
            const match = await this.matcher.match(capture, rect);
            if (!chosen || discoveryMatchQuality(match) > discoveryMatchQuality(chosen.match)) {
              chosen = { match, capture };
            }
          }
          if (!chosen) continue;
          const { match, capture } = chosen;
          const diagnostic: DetectedSlot = {
            barIndex: barIndex + 1,
            slotIndex: slot.index + 1,
            accepted: match.accepted,
            abilityId: match.abilityId || undefined,
            confidence: match.score,
            margin: match.margin,
            empty: match.empty,
            emptyScore: match.emptyScore,
            runnerUpAbilityId: match.runnerUpAbilityId,
            rejectionReason: match.rejectionReason,
            previewDataUrl: slotPreviewDataUrl(capture, rect)
          };
          slots.push(diagnostic);
          if (match.accepted) {
            const remembered = this.locationsByAbility.get(match.abilityId);
            if (!remembered || match.score > remembered.confidence) {
              this.locationsByAbility.set(match.abilityId, {
                x: slot.x,
                y: slot.y,
                width: slot.width,
                height: slot.height,
                confidence: match.score
              });
            }
            detectedAbilities.push({
              abilityId: match.abilityId,
              visible: true,
              status: "unknown",
              confidence: match.score
            });
          }
        }
      }

      const durationMs = Math.round(performance.now() - startedAt);
      const emptySlots = slots.filter((slot) => slot.empty).length;
      return {
        availability: "available",
        message: detectedAbilities.length
          ? `Recognized ${detectedAbilities.length} of ${slots.length} visible slots.`
          : `Found ${bars.length} action bar${bars.length === 1 ? "" : "s"}, but no icons met the acceptance threshold. Retry with the global cooldown clear; the slot previews below show exactly what was captured.`,
        barsFound: bars.length,
        slotsFound: slots.length,
        recognized: detectedAbilities.length,
        empty: emptySlots,
        unknown: slots.length - detectedAbilities.length - emptySlots,
        durationMs,
        capturedAt: Date.now(),
        abilities: detectedAbilities,
        slots
      };
    } catch (error) {
      console.warn("Action-bar scan failed", error);
      return emptyResult("error", "Action-bar scanning failed. Try again with the bars unobstructed.", startedAt);
    }
  }

  async observeExpectedAbility(abilityId: string): Promise<ExpectedAbilityObservation> {
    const startedAt = performance.now();
    if (!window.alt1) {
      return this.observation(abilityId, "unavailable", false, 0, 0, startedAt,
        "Expected-ability tracking requires Alt1.");
    }

    const location = this.locationsByAbility.get(abilityId);
    if (!location) {
      return this.observation(abilityId, "unavailable", false, 0, 0, startedAt,
        "Expected ability was not found. Run a full discovery scan.");
    }

    if (this.tracking.abilityId !== abilityId) {
      this.tracking = freshTrackingMemory(abilityId);
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
    const measurement = await this.matcher.measureKnown(capture, rect, abilityId);
    if (!measurement) {
      return this.observation(abilityId, "unavailable", true, 0, 0, startedAt,
        "Expected ability template is unavailable.");
    }

    const cooldown = readCooldown(capture, rect);
    const cooldownTextPresent = cooldown.seconds !== undefined && cooldown.seconds > 0;
    let hasOwnCooldownSignal = cooldownTextPresent;
    const identityStrong = measurement.similarity >= 0.55;
    const configuredCooldownSeconds = abilityById.get(abilityId)?.cooldownSeconds;
    const rolloverPrimeSeconds = configuredCooldownSeconds !== undefined
      ? Math.min(COOLDOWN_ROLLOVER_PRIME_SECONDS, Math.max(2, Math.ceil(configuredCooldownSeconds / 2)))
      : 2;
    const rolloverThreshold = configuredCooldownSeconds !== undefined
      ? Math.max(2, Math.ceil(configuredCooldownSeconds * 0.88))
      : undefined;
    let cooldownRolloverUse = false;

    if (cooldownTextPresent) {
      const observedSeconds = cooldown.seconds!;
      if (observedSeconds <= rolloverPrimeSeconds) {
        this.tracking.nearClearCooldownFrames++;
        this.tracking.cooldownRolloverPrimed = this.tracking.nearClearCooldownFrames >= 2;
        this.tracking.cooldownRolloverFrames = 0;
      } else if (!this.tracking.armed
        && !this.tracking.eventEmitted
        && this.tracking.cooldownRolloverPrimed
        && rolloverThreshold !== undefined
        && observedSeconds >= rolloverThreshold) {
        if (this.tracking.cooldownRolloverFrames === 0) {
          this.tracking.cooldownStartedAt = performance.now();
        }
        this.tracking.cooldownRolloverFrames++;
        const rolloverFramesNeeded = configuredCooldownSeconds! <= 6 ? 1 : 2;
        cooldownRolloverUse = this.tracking.cooldownRolloverFrames >= rolloverFramesNeeded;
      } else {
        this.tracking.nearClearCooldownFrames = 0;
        this.tracking.cooldownRolloverPrimed = false;
        this.tracking.cooldownRolloverFrames = 0;
      }
      this.tracking.lastCooldownSeconds = observedSeconds;
    } else {
      this.tracking.cooldownRolloverFrames = 0;
      if (this.tracking.lastCooldownSeconds !== undefined
        && this.tracking.lastCooldownSeconds <= rolloverPrimeSeconds
        && this.tracking.nearClearCooldownFrames > 0) {
        this.tracking.cooldownRolloverPrimed = true;
      }
    }
    if (cooldownTextPresent && !this.tracking.armed && !this.tracking.eventEmitted) {
      this.tracking.cooldownFloorSeconds = this.tracking.cooldownFloorSeconds
        ? Math.min(this.tracking.cooldownFloorSeconds, cooldown.seconds!)
        : cooldown.seconds!;
    }
    if (!cooldownTextPresent && identityStrong && !this.tracking.baselineBrightness) {
      rememberBrightness(this.tracking, measurement.brightness, BASELINE_SAMPLES);
      if (this.tracking.readyBrightnessSamples.length >= BASELINE_SAMPLES) {
        const sorted = [...this.tracking.readyBrightnessSamples].sort((a, b) => a - b);
        this.tracking.baselineBrightness = sorted[sorted.length - 2];
      }
    }
    const brightnessRatio = this.tracking.baselineBrightness
      ? measurement.brightness / this.tracking.baselineBrightness
      : undefined;
    const gcdDarkening = !cooldownTextPresent
      && brightnessRatio !== undefined
      && brightnessRatio < GCD_BRIGHTNESS_RATIO;
    const visualCooldownCandidate = !cooldownTextPresent
      && configuredCooldownSeconds !== undefined
      && this.tracking.armed
      && this.tracking.baselineBrightness > 0
      && (gcdDarkening || measurement.similarity < 0.38);
    if (visualCooldownCandidate) this.tracking.visualCooldownFrames++;
    else if (!this.tracking.eventEmitted) this.tracking.visualCooldownFrames = 0;
    const visualCooldownConfirmed = this.tracking.visualCooldownFrames >= VISUAL_COOLDOWN_CONFIRM_FRAMES;
    if (visualCooldownConfirmed) hasOwnCooldownSignal = true;
    const identityLost = this.tracking.baselineBrightness > 0
      && !this.tracking.armed
      && !this.tracking.eventEmitted
      && measurement.similarity < 0.38
      && !cooldownTextPresent
      && !gcdDarkening;

    if (identityLost) this.tracking.lowIdentityFrames++;
    else this.tracking.lowIdentityFrames = 0;

    if (this.tracking.lowIdentityFrames >= 4) {
      this.locationsByAbility.delete(abilityId);
      this.tracking = freshTrackingMemory();
      return this.observation(abilityId, "identity-lost", false, measurement.similarity,
        measurement.brightness, startedAt, "Slot identity was lost. Run a full discovery scan.");
    }

    let state: ExpectedTrackingState = "acquiring-baseline";
    let message = "Waiting for a clear ready baseline.";
    let useEvent = false;
    let gcdTransient = false;
    let detectionLatencyMs: number | undefined;

    if (hasOwnCooldownSignal) {
      this.tracking.gcdFrames = 0;
      this.tracking.readyFrames = 0;
      if (this.tracking.cooldownFrames === 0) this.tracking.cooldownStartedAt = performance.now();
      this.tracking.cooldownFrames++;
      state = "cooldown-like";

      if ((this.tracking.armed && this.tracking.cooldownFrames >= 2) || cooldownRolloverUse) {
        useEvent = true;
        this.useEventCount++;
        detectionLatencyMs = Math.round(performance.now() - this.tracking.cooldownStartedAt);
        this.tracking.lastDetectionLatencyMs = detectionLatencyMs;
        this.tracking.armed = false;
        this.tracking.eventEmitted = true;
        this.tracking.nearClearCooldownFrames = 0;
        this.tracking.cooldownRolloverPrimed = false;
        this.tracking.cooldownRolloverFrames = 0;
        message = cooldownRolloverUse
          ? "Use detected from a confirmed cooldown reset."
          : visualCooldownConfirmed
            ? "Use detected from persistent slot cooldown visuals."
            : "Use detected from persistent cooldown text.";
      } else if (this.tracking.eventEmitted) {
        message = "Cooldown remains visible; detector is disarmed.";
      } else if (!this.tracking.armed) {
        message = "Existing cooldown detected; waiting for the slot to become ready.";
      } else {
        message = "Confirming cooldown on the next observation.";
      }
    } else {
      this.tracking.cooldownFrames = 0;
      this.tracking.cooldownStartedAt = 0;
      if (gcdDarkening) {
        this.tracking.gcdFrames++;
        this.tracking.readyFrames = 0;
        gcdTransient = this.tracking.gcdFrames <= GCD_MAX_FRAMES;
        state = "transient";
        message = gcdTransient
          ? `GCD-like darkening at ${Math.round(brightnessRatio * 100)}% of ready brightness; ignored.`
          : "Brightness has remained low too long to classify as a GCD; waiting for cooldown text or recovery.";
      } else if (identityStrong) {
        this.tracking.gcdFrames = 0;
        const recoveredBrightness = !this.tracking.baselineBrightness
          || measurement.brightness >= this.tracking.baselineBrightness * 0.82;
        this.tracking.readyFrames = recoveredBrightness ? this.tracking.readyFrames + 1 : 0;
        const readyFramesNeeded = this.tracking.eventEmitted
          ? REARM_CONFIRM_FRAMES
          : this.tracking.cooldownFloorSeconds > 2
            ? UNCERTAIN_COOLDOWN_CLEAR_FRAMES
            : READY_CONFIRM_FRAMES;
        if (this.tracking.readyFrames >= readyFramesNeeded) {
          this.tracking.armed = true;
          this.tracking.eventEmitted = false;
          state = "armed";
          message = this.tracking.baselineBrightness
            ? "Ready state confirmed; waiting for use."
            : "Ready state confirmed; brightness baseline is still calibrating.";
        } else if (!recoveredBrightness) {
          state = "transient";
          message = "The icon has not returned to its ready brightness; no event can fire.";
        } else if (this.tracking.eventEmitted) {
          state = "transient";
          message = `Confirming cooldown recovery (${this.tracking.readyFrames}/${readyFramesNeeded}).`;
        } else if (this.tracking.armed) {
          state = "transient";
          message = `Confirming GCD recovery (${this.tracking.readyFrames}/${readyFramesNeeded}).`;
        }
        if (!this.tracking.baselineBrightness && !this.tracking.armed) {
          state = "acquiring-baseline";
          message = `Confirming ready state (${this.tracking.readyFrames}/${readyFramesNeeded}); brightness calibration ${this.tracking.readyBrightnessSamples.length}/${BASELINE_SAMPLES}.`;
        } else if (!this.tracking.eventEmitted && recoveredBrightness && !gcdDarkening
          && measurement.brightness <= this.tracking.baselineBrightness * 1.25) {
          rememberBrightness(this.tracking, measurement.brightness, 7);
          const median = medianOf(this.tracking.readyBrightnessSamples);
          this.tracking.baselineBrightness = this.tracking.baselineBrightness * 0.85 + median * 0.15;
        }
      } else {
        this.tracking.readyFrames = 0;
        state = "transient";
        message = "Icon changed without persistent cooldown evidence; ignoring transient state.";
      }
    }

    return {
      abilityId,
      slotFound: true,
      state,
      armed: this.tracking.armed,
      identitySimilarity: measurement.similarity,
      brightness: measurement.brightness,
      brightnessRatio,
      gcdTransient,
      cooldownRawText: cooldown.rawText || undefined,
      cooldownText: cooldown.normalizedText || undefined,
      cooldownSeconds: cooldown.seconds,
      cooldownFrames: this.tracking.cooldownFrames,
      observationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      useEvent,
      useEventCount: this.useEventCount,
      detectionLatencyMs: detectionLatencyMs ?? this.tracking.lastDetectionLatencyMs,
      message
    };
  }

  resetExpectedTracking(): void {
    this.tracking = freshTrackingMemory();
  }

  getAbilityLocation(abilityId: string): ActionBarSlotLocation | null {
    const location = this.locationsByAbility.get(abilityId);
    return location ? {
      x: location.x,
      y: location.y,
      width: location.width,
      height: location.height
    } : null;
  }

  private observation(
    abilityId: string,
    state: ExpectedTrackingState,
    slotFound: boolean,
    identitySimilarity: number,
    brightness: number,
    startedAt: number,
    message: string
  ): ExpectedAbilityObservation {
    return {
      abilityId,
      slotFound,
      state,
      armed: this.tracking.armed,
      identitySimilarity,
      brightness,
      brightnessRatio: undefined,
      gcdTransient: false,
      cooldownFrames: 0,
      observationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      useEvent: false,
      useEventCount: this.useEventCount,
      message
    };
  }
}

type RememberedSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type TrackingMemory = {
  abilityId: string;
  armed: boolean;
  eventEmitted: boolean;
  readyFrames: number;
  cooldownFrames: number;
  gcdFrames: number;
  nearClearCooldownFrames: number;
  cooldownRolloverPrimed: boolean;
  cooldownRolloverFrames: number;
  visualCooldownFrames: number;
  lastCooldownSeconds?: number;
  cooldownFloorSeconds: number;
  cooldownStartedAt: number;
  lowIdentityFrames: number;
  baselineBrightness: number;
  readyBrightnessSamples: number[];
  lastDetectionLatencyMs?: number;
};

function freshTrackingMemory(abilityId = ""): TrackingMemory {
  return {
    abilityId,
    armed: false,
    eventEmitted: false,
    readyFrames: 0,
    cooldownFrames: 0,
    gcdFrames: 0,
    nearClearCooldownFrames: 0,
    cooldownRolloverPrimed: false,
    cooldownRolloverFrames: 0,
    visualCooldownFrames: 0,
    lastCooldownSeconds: undefined,
    cooldownFloorSeconds: 0,
    cooldownStartedAt: 0,
    lowIdentityFrames: 0,
    baselineBrightness: 0,
    readyBrightnessSamples: [],
    lastDetectionLatencyMs: undefined
  };
}

function rememberBrightness(tracking: TrackingMemory, brightness: number, maximum: number): void {
  tracking.readyBrightnessSamples.push(brightness);
  if (tracking.readyBrightnessSamples.length > maximum) tracking.readyBrightnessSamples.shift();
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function captureAreaForSlots(slots: ModernActionBarSlot[]): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.floor(Math.min(...slots.map((slot) => slot.x)) - 2));
  const y = Math.max(0, Math.floor(Math.min(...slots.map((slot) => slot.y)) - 2));
  const right = Math.ceil(Math.max(...slots.map((slot) => slot.x + slot.width)) + 2);
  const bottom = Math.ceil(Math.max(...slots.map((slot) => slot.y + slot.height)) + 2);
  return { x, y, width: right - x, height: bottom - y };
}

function emptyResult(
  availability: AbilityScanResult["availability"],
  message: string,
  startedAt: number
): AbilityScanResult {
  return {
    availability,
    message,
    barsFound: 0,
    slotsFound: 0,
    recognized: 0,
    empty: 0,
    unknown: 0,
    durationMs: Math.round(performance.now() - startedAt),
    abilities: [],
    slots: []
  };
}

function discoveryMatchQuality(match: IconMatch): number {
  return (match.accepted ? 2 : 0) + match.score + match.margin * 0.5;
}

function slotPreviewDataUrl(image: ImageData, rect: { x: number; y: number; width: number; height: number }): string | undefined {
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

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
