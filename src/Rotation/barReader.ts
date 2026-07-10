import type { RuntimeSlotState, SlotBox, TrackedBar } from "../types";
import { captureForTrackedBar } from "./barConfig";
import {
	bestCooldownCandidate,
	hasRejectedCooldownSignal,
	readCooldownCandidates,
	type CooldownTextCandidate,
	type CooldownTextResult,
} from "./cooldownTextReader";
import { getSlotCooldownOcrRect } from "./slotGeometry";
import {
	detectTooltipBounds,
	rectanglesIntersect,
	type ScreenRect,
} from "./tooltipGuard";

export type SlotObservationEvidence = "cooldown-text" | "no-cooldown-text" | "unreadable" | "occluded" | "unknown";

export type SlotObservation = RuntimeSlotState & {
	evidence: SlotObservationEvidence;
	watched?: boolean;
	text?: string;
	textRaw?: string;
	textNormalized?: string;
	textFont?: string;
	textAnchor?: string;
	textScore?: number;
	textAccepted?: boolean;
	textRequiresConfirmation?: boolean;
	textConfirmationFrames?: number;
	textWaitingForConfirmation?: boolean;
	textRejected?: string[];
};

export type BarFrame = {
	id: number;
	capturedAt: number;
	barId: string;
	blockedReason: "" | "capture" | "occluded" | "unreadable";
	globalCooldown: false;
	slots: SlotObservation[];
};

type BarReaderDeps = {
	getConfiguredBars: () => TrackedBar[];
	hasAlt1: () => boolean;
	setStatus: (value: string) => void;
	updateFooter: () => void;
	getTooltipBounds?: () => ScreenRect | null;
};

function readyObservation(evidence: SlotObservationEvidence = "no-cooldown-text"): SlotObservation {
	return {
		status: "ready",
		ready: true,
		cooldown: 0,
		confidence: 0.72,
		evidence,
		globalCooldown: false,
	};
}

function unknownObservation(evidence: SlotObservationEvidence = "unknown"): SlotObservation {
	return {
		status: "unknown",
		ready: false,
		cooldown: 0,
		confidence: 0,
		evidence,
		globalCooldown: false,
	};
}

function cooldownObservation(text: CooldownTextResult, confirmationFrames = 1): SlotObservation {
	return {
		status: "cooldown",
		ready: false,
		cooldown: Math.max(0, Number(text.seconds || 0)),
		confidence: 0.96,
		evidence: "cooldown-text",
		text: text.text,
		textRaw: text.raw,
		textNormalized: text.normalized,
		textFont: text.font,
		textAnchor: text.anchor,
		textScore: text.score,
		textAccepted: true,
		textRequiresConfirmation: !!text.requiresConfirmation,
		textConfirmationFrames: confirmationFrames,
		textWaitingForConfirmation: false,
		textRejected: [],
		globalCooldown: false,
	};
}

export function classifyCooldownTextObservation(input: {
	text: CooldownTextResult | null;
	waitingForConfirmation?: boolean;
	confirmationFrames?: number;
	rejectedSignal?: boolean;
}): SlotObservation {
	if (input.text) return cooldownObservation(input.text, input.confirmationFrames || 1);
	if (input.waitingForConfirmation || input.rejectedSignal) return unknownObservation("unreadable");
	return readyObservation("no-cooldown-text");
}

type TextStreak = { signature: string; frames: number; at: number };

export function createBarReaderApi(deps: BarReaderDeps) {
	let frameId = 0;
	let latestFrames: Record<string, BarFrame> = {};
	const diagnostics: any[] = [];
	const textStreaks: Record<string, TextStreak> = {};

	function addDiagnostic(value: any) {
		diagnostics.push(value);
		if (diagnostics.length > 120) diagnostics.shift();
	}

	function slotKey(bar: TrackedBar, slot: SlotBox) {
		return `${bar.id}:${slot.index}`;
	}

	function resetTextStreak(key: string) {
		delete textStreaks[key];
	}

	function confirmedTextCandidate(key: string, candidate: CooldownTextResult | null, now: number) {
		if (!candidate) {
			resetTextStreak(key);
			return { text: null, frames: 0, waiting: false };
		}

		const signature = String(candidate.seconds);
		const previous = textStreaks[key];
		const frames = previous && previous.signature === signature && now - previous.at <= 1200
			? previous.frames + 1
			: 1;
		textStreaks[key] = { signature, frames, at: now };

		if (candidate.requiresConfirmation && frames < 2) {
			return { text: null, frames, waiting: true };
		}
		return { text: candidate, frames, waiting: false };
	}

	function makeFrame(
		bar: TrackedBar,
		blockedReason: BarFrame["blockedReason"],
		slots: SlotObservation[],
		watchedSlots: number[],
		extraDiagnostic: Record<string, any> = {}
	) {
		const latestFrame: BarFrame = {
			id: ++frameId,
			capturedAt: Date.now(),
			barId: bar.id,
			blockedReason,
			globalCooldown: false,
			slots,
		};
		latestFrames[bar.id] = latestFrame;
		addDiagnostic({
			id: latestFrame.id,
			at: latestFrame.capturedAt,
			blockedReason,
			globalCooldown: false,
			watchedSlots: [...watchedSlots],
			...extraDiagnostic,
			slots: slots.map((slot, index) => ({
				slot: index + 1,
				watched: watchedSlots.includes(index + 1),
				status: slot.status,
				confidence: slot.confidence,
				evidence: slot.evidence,
				cooldown: slot.cooldown,
				text: slot.text || "",
				textRaw: slot.textRaw || "",
				textNormalized: slot.textNormalized || "",
				textFont: slot.textFont || "",
				textAnchor: slot.textAnchor || "",
				textScore: slot.textScore || 0,
				textRequiresConfirmation: !!slot.textRequiresConfirmation,
				textAccepted: !!slot.textAccepted,
				textConfirmationFrames: slot.textConfirmationFrames || 0,
				textWaitingForConfirmation: !!slot.textWaitingForConfirmation,
				textRejected: slot.textRejected || [],
				globalCooldown: false,
			})),
		});
		return latestFrame;
	}

	function makeBlockedFrame(
		bar: TrackedBar,
		reason: BarFrame["blockedReason"],
		evidence: SlotObservationEvidence,
		watchedSlotNumbers: number[] = [],
		blockDetails: Record<string, any> = {}
	) {
		for (const key of Object.keys(textStreaks)) delete textStreaks[key];
		return makeFrame(
			bar,
			reason,
			bar.slots.map(() => unknownObservation(evidence)),
			watchedSlotNumbers,
			{
				tooltipBlocked: !!blockDetails.tooltipBlocked,
				tooltipBounds: blockDetails.tooltipBounds || null,
				ocrFieldBounds: blockDetails.ocrFieldBounds || null,
				ocrAttempts: watchedSlotNumbers.map(slot => ({
					frameId: frameId + 1,
					slot,
					candidateCount: 0,
					accepted: false,
					rejectionReason: `reader blocked: ${reason}`,
					finalObservation: { status: "unknown", evidence, cooldown: 0, confidence: 0 },
				})),
			}
		);
	}

	function calibrate(updateUi = true) {
		const ready = !!deps.getConfiguredBars().length && deps.hasAlt1();
		deps.setStatus(ready ? "Cooldown tracking ready" : "Cooldown tracking unavailable");
		for (const key of Object.keys(textStreaks)) delete textStreaks[key];
		latestFrames = {};
		if (updateUi) deps.updateFooter();
		return ready;
	}

	function readBarFrame(bar: TrackedBar, watchedSlotNumbers: number[] = []) {
		if (!bar || !deps.hasAlt1()) return null;

		const captured = captureForTrackedBar(bar);
		if (!captured) return makeBlockedFrame(bar, "capture", "unreadable", watchedSlotNumbers);

		const watchedSet = new Set(watchedSlotNumbers.map(Number));
		const watchedRows = captured.probeBar.slots.filter((slot: SlotBox) => watchedSet.has(Number(slot.index)));
		const tooltipBounds = deps.getTooltipBounds ? deps.getTooltipBounds() : detectTooltipBounds();
		const tooltipBlockedRow = tooltipBounds
			? watchedRows.find((slot: SlotBox) => {
				const rect = getSlotCooldownOcrRect(captured.img, captured.caparea, slot);
				return rectanglesIntersect(tooltipBounds, {
					x: rect.screenX,
					y: rect.screenY,
					width: rect.screenWidth,
					height: rect.screenHeight,
				});
			})
			: undefined;
		if (tooltipBounds && tooltipBlockedRow) {
			const rect = getSlotCooldownOcrRect(captured.img, captured.caparea, tooltipBlockedRow);
			return makeBlockedFrame(bar, "occluded", "occluded", watchedSlotNumbers, {
				tooltipBlocked: true,
				tooltipBounds,
				ocrFieldBounds: {
					x: rect.screenX,
					y: rect.screenY,
					width: rect.screenWidth,
					height: rect.screenHeight,
				},
			});
		}

		const now = Date.now();
		const ocrAttempts: any[] = [];
		const slots = captured.probeBar.slots.map((slot: SlotBox) => {
			const key = slotKey(bar, slot);
			if (!watchedSet.has(Number(slot.index))) {
				resetTextStreak(key);
				return { ...readyObservation("no-cooldown-text"), watched: false };
			}

			const rect = getSlotCooldownOcrRect(captured.img, captured.caparea, slot);
			const started = Date.now();
			const candidates = readCooldownCandidates(captured.img, captured.caparea, slot);
			const ocrDurationMs = Date.now() - started;
			const bestText = bestCooldownCandidate(candidates);
			const confirmation = confirmedTextCandidate(key, bestText, now);
			const rejectedSignal = hasRejectedCooldownSignal(candidates);
			const observation = classifyCooldownTextObservation({
				text: confirmation.text,
				waitingForConfirmation: confirmation.waiting,
				confirmationFrames: confirmation.frames,
				rejectedSignal,
			});
			observation.watched = true;
			observation.textConfirmationFrames = confirmation.frames;
			observation.textWaitingForConfirmation = confirmation.waiting;
			observation.textRejected = candidates
				.filter(candidate => !candidate.accepted && !!candidate.rejection)
				.map(candidate => String(candidate.rejection));
			if (!confirmation.text && bestText) {
				observation.textRaw = bestText.raw;
				observation.textNormalized = bestText.normalized;
				observation.textFont = bestText.font;
				observation.textAnchor = bestText.anchor;
				observation.textScore = bestText.score;
				observation.textRequiresConfirmation = !!bestText.requiresConfirmation;
			}

			ocrAttempts.push({
				frameId: frameId + 1,
				slot: Number(slot.index),
				rect,
				ocrDurationMs,
				candidateCount: candidates.length,
				bestRaw: bestText?.raw || "",
				bestNormalized: bestText?.normalized || "",
				bestSeconds: bestText?.seconds || 0,
				bestFont: bestText?.font || "",
				bestAnchor: bestText?.anchor || "",
				candidateAccepted: !!bestText,
				accepted: observation.evidence === "cooldown-text",
				rejectionReason: observation.evidence === "cooldown-text"
					? ""
					: confirmation.waiting
						? "waiting for cooldown text confirmation"
						: rejectedSignal
							? "cooldown-like text was unreadable"
							: "no cooldown text candidate",
				requiresConfirmation: !!bestText?.requiresConfirmation,
				confirmationFrames: confirmation.frames,
				suppressed: false,
				suppressionReason: "",
				finalObservation: {
					status: observation.status,
					evidence: observation.evidence,
					cooldown: observation.cooldown,
					confidence: observation.confidence,
				},
			});
			return observation;
		});

		return makeFrame(bar, "", slots, watchedSlotNumbers, {
			tooltipBlocked: false,
			tooltipBounds: tooltipBounds || null,
			ocrAttempts,
		});
	}

	function readFrame(watchedRefs: Array<number | { barId: string; slot: number }> = []) {
		const bars = deps.getConfiguredBars();
		if (!bars.length || !deps.hasAlt1()) return null;

		const watchedByBar = new Map<string, number[]>();
		for (const ref of watchedRefs) {
			if (typeof ref === "number") {
				const firstBar = bars[0];
				if (!firstBar) continue;
				watchedByBar.set(firstBar.id, [...(watchedByBar.get(firstBar.id) || []), Number(ref)]);
				continue;
			}
			const barId = String(ref?.barId || "");
			const slot = Number(ref?.slot || 0);
			if (!barId || !slot) continue;
			watchedByBar.set(barId, [...(watchedByBar.get(barId) || []), slot]);
		}

		let latest: BarFrame | null = null;
		for (const bar of bars) {
			const watchedSlotNumbers = watchedByBar.get(bar.id);
			if (!watchedSlotNumbers?.length) continue;
			latest = readBarFrame(bar, watchedSlotNumbers) || latest;
		}
		return latest;
	}

	function slotState(ref: { barId: string; slot: number }): SlotObservation {
		const slotIndex = Number(ref.slot) - 1;
		return latestFrames[String(ref.barId || "")]?.slots?.[slotIndex] || unknownObservation("unknown");
	}

	return {
		calibrate,
		readFrame,
		slotState,
		getFrameId: () => Math.max(0, ...Object.values(latestFrames).map(frame => frame.id || 0)),
		getDiagnostics: () => [...diagnostics],
	};
}
