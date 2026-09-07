import * as OCR from "alt1/ocr";
import modernCooldownFont from "../assets/fonts/modern_cooldown_digits.json";
import modernFallbackFont from "alt1/fonts/aa_8px_mono";

export interface CooldownSlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CooldownOcrResult {
  rawText: string;
  seconds?: number;
  reliable?: boolean;
}

export interface CooldownOcrOptions {
  maximumSeconds?: number;
}

type CooldownOcrSource =
  | "modern-digits"
  | "modern-line"
  | "modern-backwards";

type CooldownNormalization = {
  text: string;
  valid: boolean;
  hasRealDigit: boolean;
  substitutionCount: number;
  weakSubstitutionCount: number;
  specialSubstitutionCount: number;
};

type CooldownCandidate = {
  rawText: string;
  seconds: number;
  reliable: boolean;
  score: number;
};

const MODERN_COOLDOWN_COLORS: OCR.ColortTriplet[] = [
  [255, 255, 255],
  [248, 248, 248],
  [235, 235, 235]
];

const BASELINE_OFFSETS = [9, 10, 8, 11, 12];
const RIGHT_EDGE_DELTAS = [0, -1, -2, -3, -4, -5, -6, -7, -8, -9];
const MAX_COOLDOWN_SECONDS = 600;
const MODERN_FONT = modernCooldownFont as unknown as OCR.FontDefinition;
const MODERN_FALLBACK_FONT = modernFallbackFont as unknown as OCR.FontDefinition;

const STRONG_LOOKALIKES: Record<string, string> = {
  o: "0", O: "0", Q: "0",
  l: "1", L: "1", "|": "1",
  z: "2", Z: "2",
  s: "5", S: "5",
  b: "6",
  B: "8",
  g: "9", q: "9"
};

const WEAK_LOOKALIKES: Record<string, string> = {
  D: "0",
  e: "3", E: "3",
  a: "4", A: "4",
  G: "6",
  t: "7", T: "7"
};

export function readCooldown(
  capture: ImageData,
  rect: CooldownSlotRect,
  options: CooldownOcrOptions = {}
): CooldownOcrResult {
  const candidates: CooldownCandidate[] = [];
  let bestRejectedRawText = "";

  const consider = (
    rawText: string,
    source: CooldownOcrSource,
    preference: number
  ): void => {
    const raw = String(rawText || "").trim();
    if (raw.length > bestRejectedRawText.length) bestRejectedRawText = raw;

    const normalized = normalizeCandidate(raw);
    const seconds = normalized.valid ? parseCooldownText(normalized.text) : undefined;
    const maximumSeconds = options.maximumSeconds !== undefined
      ? Math.ceil(options.maximumSeconds)
      : MAX_COOLDOWN_SECONDS;
    if (seconds !== undefined && seconds <= maximumSeconds) {
      candidates.push({
        rawText: raw,
        seconds,
        reliable: source === "modern-digits"
          || (normalized.hasRealDigit && normalized.substitutionCount === 0),
        score: scoreCandidate(normalized, preference)
      });
    }
  };

  const modernRightEdge = rect.x + rect.width + 1;
  for (const baselineOffset of BASELINE_OFFSETS) {
    for (const rightDelta of RIGHT_EDGE_DELTAS) {
      consider(
        readLineSafe(
          capture,
          MODERN_FONT,
          MODERN_COOLDOWN_COLORS,
          modernRightEdge + rightDelta,
          rect.y + baselineOffset
        ),
        "modern-digits",
        45
      );
      consider(
        readLineSafe(
          capture,
          MODERN_FALLBACK_FONT,
          MODERN_COOLDOWN_COLORS,
          modernRightEdge + rightDelta,
          rect.y + baselineOffset
        ),
        "modern-line",
        30
      );
    }
  }

  const fieldX = Math.max(0, rect.x - 1);
  const fieldY = Math.max(0, rect.y);
  const fieldWidth = Math.max(0, Math.min(capture.width - fieldX, rect.width + 3));
  const fieldHeight = Math.max(0, Math.min(capture.height - fieldY, 14));
  if (fieldWidth > 0 && fieldHeight > 0) {
    consider(
      readSmallCapsSafe(
        capture,
        MODERN_FALLBACK_FONT,
        MODERN_COOLDOWN_COLORS,
        fieldX,
        fieldY,
        fieldWidth,
        fieldHeight
      ),
      "modern-backwards",
      25
    );
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  return best
    ? { rawText: best.rawText, seconds: best.seconds, reliable: best.reliable }
    : { rawText: bestRejectedRawText };
}

export function parseCooldownText(text: string): number | undefined {
  const clock = text.match(/^(\d{1,2}):(\d{2})$/);
  let seconds: number;
  if (clock) {
    const trailingSeconds = Number(clock[2]);
    if (trailingSeconds >= 60) return undefined;
    seconds = Number(clock[1]) * 60 + trailingSeconds;
  } else {
    const minutes = text.match(/^(\d{1,2})m$/);
    if (minutes) {
      seconds = Number(minutes[1]) * 60;
    } else if (/^\d{1,3}$/.test(text)) {
      seconds = Number(text);
    } else {
      return undefined;
    }
  }

  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_COOLDOWN_SECONDS
    ? seconds
    : undefined;
}

function normalizeCandidate(rawText: string): CooldownNormalization {
  const raw = String(rawText || "");
  let text = "";
  let hasRealDigit = false;
  let substitutionCount = 0;
  let weakSubstitutionCount = 0;
  let specialSubstitutionCount = 0;

  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];

    if (char === "." && raw[index + 1] === ".") {
      text += "2";
      substitutionCount++;
      specialSubstitutionCount++;
      index++;
      continue;
    }

    if (/[\s.'"_~\-–—,]/.test(char)) continue;
    if (/\d/.test(char)) {
      text += char;
      hasRealDigit = true;
      continue;
    }
    if (char === ":") {
      text += char;
      continue;
    }
    if (char === "m" || char === "M") {
      text += "m";
      continue;
    }

    if (char === "i" || char === "I") {
      text += "4";
      substitutionCount++;
      specialSubstitutionCount++;
      continue;
    }

    if (char === "!") {
      if (!/\d/.test(raw)) return invalidNormalization(text);
      text += "1";
      substitutionCount++;
      specialSubstitutionCount++;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(STRONG_LOOKALIKES, char)) {
      text += STRONG_LOOKALIKES[char];
      substitutionCount++;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(WEAK_LOOKALIKES, char)) {
      text += WEAK_LOOKALIKES[char];
      substitutionCount++;
      weakSubstitutionCount++;
      continue;
    }

    return invalidNormalization();
  }

  const validShape = /^\d{1,3}$/.test(text)
    || /^\d{1,2}:\d{2}$/.test(text)
    || /^\d{1,2}m$/.test(text);
  if (!validShape) return invalidNormalization(text);

  if (!hasRealDigit && weakSubstitutionCount > 0) return invalidNormalization(text);

  if (!hasRealDigit && substitutionCount > 0 && text.replace(/[:m]/g, "").length > 3) {
    return invalidNormalization(text);
  }

  return {
    text,
    valid: true,
    hasRealDigit,
    substitutionCount,
    weakSubstitutionCount,
    specialSubstitutionCount
  };
}

function invalidNormalization(text = ""): CooldownNormalization {
  return {
    text,
    valid: false,
    hasRealDigit: false,
    substitutionCount: 0,
    weakSubstitutionCount: 0,
    specialSubstitutionCount: 0
  };
}

function scoreCandidate(
  normalized: CooldownNormalization,
  preference: number
): number {
  const timerGlyphs = normalized.text.replace(/[:m]/g, "").length;
  let score = 100 + preference + timerGlyphs * 3;
  if (normalized.hasRealDigit) score += 10;
  if (/^\d{1,2}:\d{2}$/.test(normalized.text)) score += 8;
  if (/^\d{1,2}m$/.test(normalized.text)) score += 4;
  score -= normalized.substitutionCount * 3;
  score -= normalized.weakSubstitutionCount * 5;
  score -= normalized.specialSubstitutionCount * 3;
  return score;
}

function readLineSafe(
  capture: ImageData,
  font: OCR.FontDefinition,
  colors: OCR.ColortTriplet[],
  x: number,
  y: number
): string {
  try {
    return String(OCR.readLine(capture, font, colors, x, y, false, true)?.text || "");
  } catch {
    return "";
  }
}

function readSmallCapsSafe(
  capture: ImageData,
  font: OCR.FontDefinition,
  colors: OCR.ColortTriplet[],
  x: number,
  y: number,
  width: number,
  height: number
): string {
  try {
    return String(OCR.readSmallCapsBackwards(capture, font, colors, x, y, width, height)?.text || "");
  } catch {
    return "";
  }
}
