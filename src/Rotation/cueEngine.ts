import type {
	ConfiguredRotationStep,
	RotationModel,
	RuntimeSlotState,
	RuntimeSlotStatus,
} from "../types";
import { clamp } from "../utils";
import {
	buildCueUnits,
	cloneGuidanceChain,
	cueUnitForStepIndex,
	movedCueUnitIndex,
	nextCueUnit,
	runtimeStepKey,
	wrappedStepIndex,
	type CueUnit,
	type CueUnitKind,
	type RuntimeGuidanceChain,
} from "./rotationPlanner";

export type ManualGuidanceItem = RuntimeGuidanceChain["manualGuidance"][number];
export type ManualGuidanceChain = RuntimeGuidanceChain;

type RuntimeCue = {
	mode: "none" | "rotation" | "wait" | "cueMarker" | "invalid";
	currentUnitKind?: CueUnitKind;
	cueStep?: ConfiguredRotationStep;
	step?: ConfiguredRotationStep;
	index?: number;
	sequenceLabel?: string;
	anchorStep?: ConfiguredRotationStep;
	anchorIndex?: number;
	anchorSequenceLabel?: string;
	anchorBarId?: string;
	anchorSlot?: number;
	anchorStatus?: RuntimeSlotStatus | "none";
	anchorReadySeen?: boolean;
	anchorWatched?: boolean;
	rawCooldownText?: string;
	parsedCooldownSeconds?: number;
	decision?: string;
	waitingForReady?: boolean;
};

export type RCueState = {
	unitKey: string;
	anchorReadySeen: boolean;
	armedUnitKey: string;
	anchorLastStatus: RuntimeSlotStatus | "none";
	lastCue: RuntimeCue | null;
	guidance: RuntimeGuidanceChain;
	currentUnitKind: CueUnitKind | "";
	decision: string;
};

type RCueDeps = {
	activeRotation: () => RotationModel | null;
	configuredSteps: (rotation: RotationModel) => ConfiguredRotationStep[];
	slotState: (step: ConfiguredRotationStep) => RuntimeSlotState & { evidence?: string };
	getFrameId: () => number;
	abilityCooldown?: (abilityId: string) => number;
	reminderDisplayEnabled?: () => boolean;
	autoAdvanceCue?: () => boolean;
	now?: () => number;
};

function emptyGuidance(): RuntimeGuidanceChain {
	return { manualGuidance: [], trackedGuidance: null };
}

function newRCueState(): RCueState {
	return {
		unitKey: "",
		anchorReadySeen: false,
		armedUnitKey: "",
		anchorLastStatus: "none",
		lastCue: null,
		guidance: emptyGuidance(),
		currentUnitKind: "",
		decision: "",
	};
}

export function normalizeRuntimeSlotState(value: any): RuntimeSlotState {
	const rawStatus = String(value?.status || "");
	const inferredStatus: RuntimeSlotStatus = rawStatus === "ready" || rawStatus === "cooldown" || rawStatus === "unknown"
		? rawStatus
		: value?.ready === true
			? "ready"
			: value?.ready === false && Number(value?.cooldown || 0) > 0
				? "cooldown"
				: "unknown";

	return {
		...value,
		status: inferredStatus,
		ready: inferredStatus === "ready",
		cooldown: inferredStatus === "cooldown" ? Math.max(0, Number(value?.cooldown || 0)) : 0,
		confidence: clamp(Number(value?.confidence || 0), 0, 1),
		globalCooldown: false,
	};
}

export function movedRotationIndex(current: number, stepCount: number, delta: number) {
	if (stepCount <= 0) return 0;
	return wrappedStepIndex((Number(current) || 0) + (Number(delta) || 0), stepCount);
}

export function movedTrackedRotationIndex(current: number, steps: ConfiguredRotationStep[], delta: number) {
	return movedCueUnitIndex(current, steps, delta);
}

export function isReliableUseObservation(value: any) {
	const observation = normalizeRuntimeSlotState(value);
	return observation.status === "cooldown" &&
		String(value?.evidence || "") === "cooldown-text" &&
		observation.cooldown > 0;
}

function isReliableUseObservationForStep(step: ConfiguredRotationStep, value: any) {
	return !!step?.scan && step.tracked === true && isReliableUseObservation(value);
}

function isWatchedObservation(value: any) {
	return value?.watched !== false;
}

export function createRCueApi(deps: RCueDeps, injectedState?: RCueState) {
	const state = injectedState || newRCueState();
	if (!state.guidance) state.guidance = emptyGuidance();
	state.unitKey = state.unitKey || (state as any).segmentKey || "";
	state.armedUnitKey = state.armedUnitKey || "";
	state.currentUnitKind = state.currentUnitKind || "";
	state.decision = state.decision || "";
	state.anchorLastStatus = state.anchorLastStatus || "none";

	let cachedFrameId = -1;
	const observationCache = new Map<string, RuntimeSlotState & { evidence?: string }>();

	function resetAnchorTracking() {
		state.anchorReadySeen = false;
		state.anchorLastStatus = "none";
	}

	function reset() {
		Object.assign(state, newRCueState());
		cachedFrameId = -1;
		observationCache.clear();
	}

	function stepKey(step: ConfiguredRotationStep) {
		return runtimeStepKey(step);
	}

	function slotState(step: ConfiguredRotationStep | null | undefined) {
		if (!step?.scan || !step?.mapped || !step?.slot || step.tracked !== true) {
			return normalizeRuntimeSlotState({ status: "unknown", confidence: 0, evidence: "unknown" });
		}

		const frameId = deps.getFrameId();
		if (frameId !== cachedFrameId) {
			cachedFrameId = frameId;
			observationCache.clear();
		}

		const key = stepKey(step);
		const cached = observationCache.get(key);
		if (cached) return cached;

		const value = normalizeRuntimeSlotState(deps.slotState(step));
		observationCache.set(key, value);
		return value;
	}

	function setUnit(unit: CueUnit | null) {
		if (!unit) {
			state.unitKey = "";
			resetAnchorTracking();
			state.armedUnitKey = "";
			state.guidance = emptyGuidance();
			state.currentUnitKind = "";
			state.decision = "";
			return;
		}

		if (state.unitKey !== unit.key) {
			state.unitKey = unit.key;
			resetAnchorTracking();
		}
		if (state.armedUnitKey === unit.key) {
			state.anchorReadySeen = true;
		}
		state.guidance = cloneGuidanceChain(unit);
		state.currentUnitKind = unit.kind;
		state.decision = unit.decision;
	}

	function unitsForRotation(rotation: RotationModel, steps: ConfiguredRotationStep[]) {
		if (!steps.length) return [];
		rotation.rotationIndex = wrappedStepIndex(Number(rotation.rotationIndex) || 0, steps.length);
		return buildCueUnits(steps);
	}

	function currentUnit(rotation: RotationModel, steps: ConfiguredRotationStep[]) {
		const units = unitsForRotation(rotation, steps);
		const unit = cueUnitForStepIndex(units, rotation.rotationIndex);
		setUnit(unit);
		return { unit, units };
	}

	function cueForUnit(unit: CueUnit, mode: RuntimeCue["mode"], observation?: RuntimeSlotState): RuntimeCue {
		const rawObservation: any = observation || {};
		const normalizedObservation = normalizeRuntimeSlotState(observation);
		const anchorStatus = unit.anchorStep ? normalizedObservation.status : "none";
		const anchorReadySeen = state.anchorReadySeen || state.armedUnitKey === unit.key;
		return {
			mode,
			currentUnitKind: unit.kind,
			cueStep: { ...unit.cueStep },
			step: { ...unit.cueStep },
			index: unit.cueIndex,
			sequenceLabel: unit.steps[0]?.label || "",
			anchorStep: unit.anchorStep ? { ...unit.anchorStep } : undefined,
			anchorIndex: unit.anchorIndex >= 0 ? unit.anchorIndex : undefined,
			anchorSequenceLabel: unit.trackedGuidance?.label || (unit.kind === "tracked" ? unit.steps[0]?.label || "" : ""),
			anchorBarId: unit.anchorStep?.barId || "",
			anchorSlot: Number(unit.anchorStep?.slot) || 0,
			anchorStatus,
			anchorReadySeen,
			anchorWatched: isWatchedObservation(rawObservation),
			rawCooldownText: String(rawObservation.textRaw || rawObservation.text || rawObservation.textNormalized || ""),
			parsedCooldownSeconds: anchorStatus === "cooldown" ? Math.max(0, Number(normalizedObservation.cooldown || 0)) : 0,
			decision: state.decision || unit.decision,
			waitingForReady: mode === "wait" && anchorStatus === "cooldown" && !state.anchorReadySeen,
		};
	}

	function advanceToUnit(rotation: RotationModel, unit: CueUnit | null) {
		if (!unit) return;
		rotation.rotationIndex = unit.startIndex;
		state.unitKey = "";
		state.armedUnitKey = "";
		resetAnchorTracking();
	}

	function advancePastUnit(rotation: RotationModel, units: CueUnit[], unit: CueUnit) {
		advanceToUnit(rotation, nextCueUnit(units, unit.startIndex, 1));
	}

	function autoAdvanceEnabled() {
		return deps.autoAdvanceCue?.() !== false;
	}

	function chooseCue(configuredSteps?: ConfiguredRotationStep[]): RuntimeCue {
		const rotation = deps.activeRotation();
		if (!rotation) {
			state.lastCue = { mode: "none" };
			setUnit(null);
			return state.lastCue;
		}

		const steps = configuredSteps || deps.configuredSteps(rotation);
		if (!steps.length) {
			state.lastCue = { mode: "none" };
			setUnit(null);
			return state.lastCue;
		}

		const { unit, units } = currentUnit(rotation, steps);
		if (!unit) {
			state.lastCue = { mode: "none" };
			return state.lastCue;
		}

		if (unit.kind === "cueMarker") {
			state.lastCue = cueForUnit(unit, "cueMarker");
			return state.lastCue;
		}

		if (unit.kind === "invalid") {
			if (deps.reminderDisplayEnabled?.() === false) {
				advancePastUnit(rotation, units, unit);
				return chooseCue(steps);
			}
			state.lastCue = cueForUnit(unit, "invalid");
			return state.lastCue;
		}

		if (!unit.anchorStep) {
			state.lastCue = cueForUnit(unit, "invalid");
			return state.lastCue;
		}

		const observation = slotState(unit.anchorStep);
		const normalizedObservation = normalizeRuntimeSlotState(observation);
		const reliableUse = isReliableUseObservationForStep(unit.anchorStep, observation);

		if (autoAdvanceEnabled() && unit.kind === "tracked" && reliableUse) {
			advancePastUnit(rotation, units, unit);
			return chooseCue(steps);
		}

		if (normalizedObservation.status === "ready" && isWatchedObservation(observation)) {
			state.anchorReadySeen = true;
			state.armedUnitKey = unit.key;
		}

		if (autoAdvanceEnabled() && unit.kind === "stepsChain" && (state.anchorReadySeen || state.armedUnitKey === unit.key) && reliableUse) {
			advancePastUnit(rotation, units, unit);
			return chooseCue(steps);
		}

		const mode = normalizedObservation.status === "cooldown" ? "wait" : "rotation";
		state.anchorLastStatus = normalizedObservation.status;
		state.lastCue = cueForUnit(unit, mode, normalizedObservation);
		return state.lastCue;
	}

	function activeUnits(configuredSteps?: ConfiguredRotationStep[]) {
		const rotation = deps.activeRotation();
		if (!rotation) return [];
		const steps = configuredSteps || deps.configuredSteps(rotation);
		return buildCueUnits(steps);
	}

	function buildRotationState(configuredSteps?: ConfiguredRotationStep[]) {
		const rotation = deps.activeRotation();
		if (!rotation) return [];
		const steps = configuredSteps || deps.configuredSteps(rotation);
		if (!steps.length) return [];

		const unit = cueUnitForStepIndex(activeUnits(steps), Number(rotation.rotationIndex) || 0);
		const cueIndex = unit?.cueIndex ?? -1;
		const anchorIndex = unit?.anchorIndex ?? -1;
		const guidanceIndexes = new Set(unit?.manualGuidance.map(item => item.index) || []);

		return steps.map((step, index) => {
			const mapped = !!step?.mapped;

			if (step.cueMarker || step.reminder || step.displayOnly || step.scan === false) {
				return {
					step,
					index,
					state: "manual-idle",
					stepKind: step.cueMarker ? "cueMarker" : "reminder",
					scan: false,
					mapped: false,
					mappedRequired: false,
					displayOnly: true,
					markerLabel: String(Number(step.order) + 1),
					planned: index === cueIndex,
					visualCurrent: index === cueIndex,
				};
			}

			if (step.tracked !== true) {
				return {
					step,
					index,
					state: mapped ? "manual-idle" : "unmapped",
					stepKind: "untracked",
					markerLabel: guidanceIndexes.has(index)
						? String(unit?.manualGuidance.find(item => item.index === index)?.label || "")
						: String(Number(step.order) + 1),
					ready: false,
					cooldown: 0,
					planned: index === cueIndex,
					visualCurrent: index === cueIndex,
				};
			}

			const observation: any = mapped
				? slotState(step)
				: normalizeRuntimeSlotState({ status: "unknown", evidence: "unknown" });
			const verifiedCooldown = isReliableUseObservationForStep(step, observation);
			let itemState = "ready-idle";
			if (!mapped) itemState = "unmapped";
			else if (verifiedCooldown) itemState = "cooldown";
			else if (index === anchorIndex) itemState = "current";

			return {
				step,
				index,
				state: itemState,
				stepKind: "tracked",
				ready: observation.status === "ready" && !verifiedCooldown,
				cooldown: verifiedCooldown ? Math.max(0, Number(observation.cooldown || 0)) : 0,
				planned: index === anchorIndex,
				verifiedCooldown,
				redSource: itemState === "cooldown" ? "live-cooldown-text" : "",
				observation: {
					status: observation.status,
					evidence: String(observation.evidence || ""),
					cooldown: Math.max(0, Number(observation.cooldown || 0)),
					globalCooldown: false,
				},
			};
		});
	}

	function buildManualGuidance() {
		return state.guidance.manualGuidance.map(item => ({ ...item, step: { ...item.step } }));
	}

	function buildManualGuidanceChain(): ManualGuidanceChain {
		return {
			manualGuidance: buildManualGuidance(),
			trackedGuidance: state.guidance.trackedGuidance
				? { ...state.guidance.trackedGuidance, step: { ...state.guidance.trackedGuidance.step } }
				: null,
		};
	}

	function cueKey(cue: any) {
		if (!cue || (!cue.step && !cue.anchorStep)) return "";
		const display = cue.step || {};
		const anchor = cue.anchorStep || cue.step || {};
		return [
			cue.mode,
			cue.currentUnitKind || "",
			cue.decision || "",
			"display",
			display.rotationId,
			display.barId,
			Number(display.slot) || 0,
			Number(display.order) || 0,
			Number(display.authoredIndex) || 0,
			cue.sequenceLabel || "",
			"anchor",
			anchor.rotationId,
			anchor.barId,
			Number(anchor.slot) || 0,
			Number(anchor.order) || 0,
			Number(anchor.authoredIndex) || 0,
			cue.anchorSequenceLabel || "",
			state.anchorReadySeen ? "ready" : "not-ready",
		].join(":");
	}

	function moveUnitIndex(current: number, steps: ConfiguredRotationStep[], delta: number) {
		return movedCueUnitIndex(current, steps, delta);
	}

	return {
		chooseCue,
		buildRotationState,
		buildManualGuidance,
		buildManualGuidanceChain,
		cueKey,
		moveUnitIndex,
		reset,
	};
}
