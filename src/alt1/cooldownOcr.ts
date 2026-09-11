import * as OCR from "alt1/ocr";
import cooldownDigits from "../assets/fonts/cooldown_digits.json";
import fallbackDigits from "alt1/fonts/aa_8px_mono";

export interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  rawText: string;
  seconds?: number;
  reliable?: boolean;
}

export interface OcrOptions {
  max?: number;
}

type OcrSource =
  | "digits"
  | "line"
  | "backwards";

type ParsedText = {
  text: string;
  valid: boolean;
  hasRealDigit: boolean;
  substitutions: number;
  weakSubs: number;
  specialSubs: number;
};

type Option = {
  rawText: string;
  seconds: number;
  reliable: boolean;
  score: number;
};

// Action-bar cooldown text is bright white and nearby shades. The alt1 reader used a color from the old interface style.
const cooldownColors: OCR.ColortTriplet[] = [
  [255, 255, 255],
  [248, 248, 248],
  [235, 235, 235]
];

// Interface scaling can move the baseline and right edge by a few pixels.
const baselineOffsets = [9, 10, 8, 11, 12];
const probeOffsets = [0, -1, -2, -3, -4, -5, -6, -7, -8, -9];
const maxSeconds = 600;
const cooldownFont = cooldownDigits as unknown as OCR.FontDefinition;
const fallbackFont = fallbackDigits as unknown as OCR.FontDefinition;

const strongLookalikes: Record<string, string> = {
  o: "0", O: "0", Q: "0",
  l: "1", L: "1", "|": "1",
  z: "2", Z: "2",
  s: "5", S: "5",
  b: "6",
  B: "8",
  g: "9", q: "9"
};

const weakLookalikes: Record<string, string> = {
  D: "0",
  e: "3", E: "3",
  a: "4", A: "4",
  G: "6",
  t: "7", T: "7"
};

export function readCooldown(
  capture: ImageData,
  rect: SlotRect,
  options: OcrOptions = {}
): OcrResult {
  const matches: Option[] = [];
  let rejected = "";

  const consider = (
    rawText: string,
    source: OcrSource,
    preference: number
  ): void => {
    const raw = String(rawText || "").trim();
    if (raw.length > rejected.length) rejected = raw;

    const normalized = normalize(raw);
    const seconds = normalized.valid ? parseText(normalized.text) : undefined;
    const limit = options.max !== undefined
      ? Math.ceil(options.max)
      : maxSeconds;
    if (seconds !== undefined && seconds <= limit) {
      matches.push({
        rawText: raw,
        seconds,
        reliable: source === "digits"
          || (normalized.hasRealDigit && normalized.substitutions === 0),
        score: score(normalized, preference)
      });
    }
  };

  const rightEdge = rect.x + rect.width + 1;
  for (const baseline of baselineOffsets) {
    for (const shift of probeOffsets) {
      consider(
        readLine(
          capture,
          cooldownFont,
          cooldownColors,
          rightEdge + shift,
          rect.y + baseline
        ),
        "digits",
        45
      );
      consider(
        readLine(
          capture,
          fallbackFont,
          cooldownColors,
          rightEdge + shift,
          rect.y + baseline
        ),
        "line",
        30
      );
    }
  }

  // Scan the whole top strip backwards when the right-edge probes miss.
  const fieldX = Math.max(0, rect.x - 1);
  const fieldY = Math.max(0, rect.y);
  const fieldWidth = Math.max(0, Math.min(capture.width - fieldX, rect.width + 3));
  const fieldHeight = Math.max(0, Math.min(capture.height - fieldY, 14));
  if (fieldWidth > 0 && fieldHeight > 0) {
    consider(
      readBackwards(
        capture,
        fallbackFont,
        cooldownColors,
        fieldX,
        fieldY,
        fieldWidth,
        fieldHeight
      ),
      "backwards",
      25
    );
  }

  matches.sort((left, right) => right.score - left.score);
  const best = matches[0];
  return best
    ? { rawText: best.rawText, seconds: best.seconds, reliable: best.reliable }
    : { rawText: rejected };
}

export function parseText(text: string): number | undefined {
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

  return Number.isFinite(seconds) && seconds > 0 && seconds <= maxSeconds
    ? seconds
    : undefined;
}

function normalize(rawText: string): ParsedText {
  const raw = String(rawText || "");
  let text = "";
  let hasRealDigit = false;
  let substitutions = 0;
  let weakSubs = 0;
  let specialSubs = 0;

  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];

    if (char === "." && raw[index + 1] === ".") {
      // The cooldown font can make 2 read as two isolated dots.
      text += "2";
      substitutions++;
      specialSubs++;
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
      substitutions++;
      specialSubs++;
      continue;
    }

    if (char === "!") {
      if (!/\d/.test(raw)) return invalid(text);
      text += "1";
      substitutions++;
      specialSubs++;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(strongLookalikes, char)) {
      text += strongLookalikes[char];
      substitutions++;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(weakLookalikes, char)) {
      text += weakLookalikes[char];
      substitutions++;
      weakSubs++;
      continue;
    }

    return invalid();
  }

  const validShape = /^\d{1,3}$/.test(text)
    || /^\d{1,2}:\d{2}$/.test(text)
    || /^\d{1,2}m$/.test(text);
  if (!validShape) return invalid(text);

  if (!hasRealDigit && weakSubs > 0) return invalid(text);

  if (!hasRealDigit && substitutions > 0 && text.replace(/[:m]/g, "").length > 3) {
    return invalid(text);
  }

  return {
    text,
    valid: true,
    hasRealDigit,
    substitutions,
    weakSubs,
    specialSubs
  };
}

function invalid(text = ""): ParsedText {
  return {
    text,
    valid: false,
    hasRealDigit: false,
    substitutions: 0,
    weakSubs: 0,
    specialSubs: 0
  };
}

function score(
  normalized: ParsedText,
  preference: number
): number {
  const glyphCount = normalized.text.replace(/[:m]/g, "").length;
  let score = 100 + preference + glyphCount * 3;
  if (normalized.hasRealDigit) score += 10;
  if (/^\d{1,2}:\d{2}$/.test(normalized.text)) score += 8;
  if (/^\d{1,2}m$/.test(normalized.text)) score += 4;
  score -= normalized.substitutions * 3;
  score -= normalized.weakSubs * 5;
  score -= normalized.specialSubs * 3;
  return score;
}

function readLine(
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

function readBackwards(
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
