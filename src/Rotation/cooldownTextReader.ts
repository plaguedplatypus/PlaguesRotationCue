import * as OCR from "alt1/ocr";
import type { SlotBox } from "../types";
import { getSlotCooldownOcrRect, type SlotCooldownOcrRect } from "./slotGeometry";

declare const require: any;

const aa8CooldownFontRaw = require("../assets/fonts/aa_8px_mono.fontmeta.json");
const pixelCooldownFontRaw = require("../assets/fonts/pixel_8px_digits.fontmeta.json");

export type CooldownTextCandidate = {
	text: string;
	seconds: number;
	raw: string;
	normalized: string;
	font: string;
	anchor: string;
	accepted: boolean;
	rejection?: string;
	score: number;
	requiresConfirmation: boolean;
	hasRealDigit: boolean;
	confusableCount: number;
	weakConfusableCount: number;
	rect: SlotCooldownOcrRect;
};

export type CooldownTextResult = CooldownTextCandidate & {
	accepted: true;
};

type CooldownFontDef = {
	name: string;
	font: any;
	color: OCR.ColortTriplet;
};

const MAX_REASONABLE_COOLDOWN_SECONDS = 600;

function unwrapWebpackDefault(value: any) {
	return value && value.default ? value.default : value;
}

function validFont(value: any) {
	const font = unwrapWebpackDefault(value);
	return font && Array.isArray(font.chars) && font.chars.length && Number.isFinite(font.width) && Number.isFinite(font.height)
		? font
		: null;
}

const COOLDOWN_FONTS: CooldownFontDef[] = [
	{
		name: "aa-8px-mono",
		font: validFont(aa8CooldownFontRaw),
		color: [255, 255, 255] as OCR.ColortTriplet,
	},
	{
		name: "pixel-8px-digits",
		font: validFont(pixelCooldownFontRaw),
		color: [206, 213, 135] as OCR.ColortTriplet,
	},
].filter(item => !!item.font);

const COOLDOWN_COLORS: OCR.ColortTriplet[] = [
	[206, 213, 135],
	[255, 255, 255],
];

const strongLookalikes: Record<string, string> = {
	o: "0",
	O: "0",
	Q: "0",
	i: "1",
	I: "1",
	l: "1",
	L: "1",
	"!": "1",
	"|": "1",
	z: "2",
	Z: "2",
	s: "5",
	S: "5",
	b: "6",
	B: "8",
	g: "9",
	q: "9",
};

const weakLookalikes: Record<string, string> = {
	D: "0",
	e: "3",
	E: "3",
	a: "4",
	A: "4",
	G: "6",
	t: "7",
	T: "7",
};

const separatorPattern = /[\s.'"_~\-–—,]/;

export type CooldownNormalization = {
	raw: string;
	compact: string;
	text: string;
	confusableCount: number;
	weakConfusableCount: number;
	hasRealDigit: boolean;
	validShape: boolean;
	rejection?: string;
};

export function normalizeCooldownText(raw: string): CooldownNormalization {
	const rawText = String(raw || "");
	let compact = "";
	let text = "";
	let confusableCount = 0;
	let weakConfusableCount = 0;
	let hasRealDigit = false;

	for (const char of Array.from(rawText)) {
		if (separatorPattern.test(char)) continue;

		if (/\d/.test(char)) {
			compact += char;
			text += char;
			hasRealDigit = true;
			continue;
		}

		if (char === ":") {
			compact += char;
			text += char;
			continue;
		}

		if (char === "m" || char === "M") {
			compact += char;
			text += "m";
			continue;
		}

		if (Object.prototype.hasOwnProperty.call(strongLookalikes, char)) {
			compact += char;
			text += strongLookalikes[char];
			confusableCount++;
			continue;
		}

		if (Object.prototype.hasOwnProperty.call(weakLookalikes, char)) {
			compact += char;
			text += weakLookalikes[char];
			confusableCount++;
			weakConfusableCount++;
			continue;
		}

		return {
			raw: rawText,
			compact,
			text,
			confusableCount,
			weakConfusableCount,
			hasRealDigit,
			validShape: false,
			rejection: `unexpected character ${JSON.stringify(char)}`,
		};
	}

	if (!text) {
		return {
			raw: rawText,
			compact,
			text,
			confusableCount,
			weakConfusableCount,
			hasRealDigit,
			validShape: false,
			rejection: "empty",
		};
	}

	const validShape = /^\d{1,3}$/.test(text) || /^\d{1,2}:\d{2}$/.test(text) || /^\d{1,2}m$/.test(text);
	if (!validShape) {
		return {
			raw: rawText,
			compact,
			text,
			confusableCount,
			weakConfusableCount,
			hasRealDigit,
			validShape,
			rejection: "invalid timer shape",
		};
	}

	// Weak letter mappings can help after a real digit is present, but should not
	// turn pure icon noise like "Et" into a believable cooldown.
	if (!hasRealDigit && weakConfusableCount > 0) {
		return {
			raw: rawText,
			compact,
			text,
			confusableCount,
			weakConfusableCount,
			hasRealDigit,
			validShape,
			rejection: "weak lookalike without real digit",
		};
	}

	return {
		raw: rawText,
		compact,
		text,
		confusableCount,
		weakConfusableCount,
		hasRealDigit,
		validShape,
	};
}


export function cooldownTextToSeconds(text: string) {
	const clock = text.match(/^(\d{1,2}):(\d{2})$/);
	if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
	if (/^\d{1,3}$/.test(text)) return Number(text);
	const minutes = text.match(/^(\d{1,2})m$/);
	return minutes ? Number(minutes[1]) * 60 : 0;
}

function scoreCandidate(input: {
	fontIndex: number;
	normalized: CooldownNormalization;
	seconds: number;
}) {
	let score = 100;
	score -= input.fontIndex * 8;
	if (input.normalized.confusableCount) score -= input.normalized.confusableCount * 2;
	if (input.normalized.weakConfusableCount) score -= input.normalized.weakConfusableCount * 4;
	if (input.normalized.hasRealDigit) score += 6;
	if (input.seconds <= 2) score -= 8;
	if (input.seconds >= 10) score += 3;
	return score;
}

function makeCandidate(
	raw: string,
	fontName: string,
	fontIndex: number,
	rect: SlotCooldownOcrRect
): CooldownTextCandidate | null {
	if (!String(raw || "").trim()) return null;

	const normalized = normalizeCooldownText(raw);
	const seconds = normalized.rejection ? 0 : cooldownTextToSeconds(normalized.text);
	const strongOnlyLookalikeTimer = normalized.validShape &&
		!normalized.hasRealDigit &&
		normalized.confusableCount > 0 &&
		normalized.weakConfusableCount === 0 &&
		normalized.compact.length <= 3;
	const accepted = seconds > 0 &&
		seconds <= MAX_REASONABLE_COOLDOWN_SECONDS &&
		(normalized.hasRealDigit || strongOnlyLookalikeTimer);
	// Real digits are strong enough to use immediately, including one-digit
	// cooldowns. Only all-lookalike reads need a second matching frame.
	const requiresConfirmation = accepted && !normalized.hasRealDigit;
	const rejection = accepted
		? undefined
		: normalized.rejection ||
			(!normalized.hasRealDigit
				? "no real digit or strong timer lookalike in OCR text"
				: (seconds <= 0 ? "zero or unparsable cooldown" : "cooldown above sane max"));

	return {
		text: accepted ? normalized.text : "",
		seconds: accepted ? seconds : 0,
		raw: String(raw || ""),
		normalized: normalized.text,
		font: fontName,
		anchor: "fixed-field",
		accepted,
		rejection,
		score: accepted
			? scoreCandidate({ fontIndex, normalized, seconds })
			: 0,
		requiresConfirmation,
		hasRealDigit: normalized.hasRealDigit,
		confusableCount: normalized.confusableCount,
		weakConfusableCount: normalized.weakConfusableCount,
		rect,
	};
}

function readFixedLineSafe(
	capture: ImageData,
	font: any,
	color: OCR.ColortTriplet,
	x: number,
	y: number
) {
	try {
		return OCR.readLine(capture, font, color, x, y, false, true)?.text || "";
	} catch (_error) {
		return "";
	}
}

function readFixedFieldLineSafe(
	capture: ImageData,
	font: any,
	rect: SlotCooldownOcrRect
) {
	try {
		const width = Math.max(1, rect.width - Number(font.width || 1));
		const height = Math.max(1, rect.height - Number(font.height || 1) + 1);
		return OCR.findReadLine(
			capture,
			font,
			COOLDOWN_COLORS,
			rect.x,
			rect.y + Number(font.basey || 0),
			width,
			height
		)?.text || "";
	} catch (_error) {
		return "";
	}
}

function readFixedFieldSafe(
	capture: ImageData,
	font: any,
	color: OCR.ColortTriplet,
	rect: SlotCooldownOcrRect
) {
	try {
		return OCR.readSmallCapsBackwards(capture, font, [color], rect.x, rect.y, rect.width, rect.height)?.text || "";
	} catch (_error) {
		return "";
	}
}

export function bestCooldownCandidate(candidates: CooldownTextCandidate[]): CooldownTextResult | null {
	const accepted = candidates
		.filter((candidate): candidate is CooldownTextResult => candidate.accepted)
		.sort((a, b) => b.score - a.score);
	return accepted[0] || null;
}

function hasStrongTimerGlyph(raw: string) {
	return Array.from(String(raw || "")).some(char =>
		/\d/.test(char) ||
		Object.prototype.hasOwnProperty.call(strongLookalikes, char)
	);
}

export function hasRejectedCooldownSignal(candidates: CooldownTextCandidate[]) {
	return candidates.some(candidate =>
		!candidate.accepted &&
		candidate.rejection !== "empty" &&
		String(candidate.raw || "").trim().length >= 2 &&
		hasStrongTimerGlyph(candidate.raw)
	);
}

export function readCooldownCandidates(capture: ImageData, caparea: any, slot: SlotBox): CooldownTextCandidate[] {
	if (!COOLDOWN_FONTS.length) return [];

	const rect = getSlotCooldownOcrRect(capture, caparea, slot);
	const candidates: CooldownTextCandidate[] = [];

	COOLDOWN_FONTS.forEach((fontDef, fontIndex) => {
		const rightEdge = rect.x + rect.width - 1;
		const baselineY = rect.y + (fontDef.name === "pixel-8px-digits"
			? 8
			: Number(fontDef.font.basey || 10));
		const rawLine = readFixedLineSafe(capture, fontDef.font, fontDef.color, rightEdge, baselineY);
		const lineCandidate = makeCandidate(rawLine, fontDef.name, fontIndex, rect);
		if (lineCandidate) {
			lineCandidate.anchor = `fixed-line:${rightEdge},${baselineY}`;
			lineCandidate.score += 12;
			candidates.push(lineCandidate);
		}

		const rawFound = readFixedFieldLineSafe(capture, fontDef.font, rect);
		const foundCandidate = makeCandidate(rawFound, `${fontDef.name}-find`, fontIndex, rect);
		if (foundCandidate) {
			foundCandidate.anchor = "fixed-field-find";
			foundCandidate.score += 10;
			candidates.push(foundCandidate);
		}

		const rawArea = readFixedFieldSafe(capture, fontDef.font, fontDef.color, rect);
		const areaCandidate = makeCandidate(rawArea, `${fontDef.name}-field`, fontIndex + 1, rect);
		if (areaCandidate) {
			areaCandidate.anchor = "fixed-field-area";
			areaCandidate.score += areaCandidate.seconds < 10 ? 8 : 4;
			candidates.push(areaCandidate);
		}
	});

	return candidates;
}
