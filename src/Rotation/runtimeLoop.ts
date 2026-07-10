import type { AppState, ConfiguredRotationStep, RotationModel } from "../types";
import { clamp } from "../utils";
import type { ManualGuidanceChain } from "./cueEngine";

const BAR_READ_INTERVAL_MS = 300;
type WatchedCooldownRef = { barId: string; slot: number };

type RuntimeLoopDeps = {
	app: AppState;
	activeRotation: () => RotationModel | null;
	getPauseUntil: () => number;
	configuredSteps: (rotation: RotationModel) => ConfiguredRotationStep[];
	barReaderApi: {
		readFrame: (watchedSlots: WatchedCooldownRef[]) => void;
	};
	RCueApi: {
		chooseCue: (steps: ConfiguredRotationStep[]) => any;
		buildRotationState: (steps: ConfiguredRotationStep[]) => any[];
		buildManualGuidance: () => any[];
		buildManualGuidanceChain: () => ManualGuidanceChain;
	};
	cueOverlayApi: {
		drawRotationState: (state: any[]) => void;
		drawManualGuidance: (guidance: any[]) => void;
		drawCue: (cue: any) => void;
		drawLargeCue: (cue: any, guidance: ManualGuidanceChain | null) => void;
		clearLargeCue: () => void;
	};
	updateSlotClasses: (cue: any) => void;
	updateFooter: () => void;
};

export function createRuntimeLoop(deps: RuntimeLoopDeps) {
	let tickId: ReturnType<typeof setInterval> | null = null;
	let lastCue: any = null;
	let lastRotationState: any[] = [];
	let lastBarReadAt = 0;

	function nextTrackedSlot(steps: ConfiguredRotationStep[], startIndex: number) {
		if (!steps.length) return null;
		const start = clamp(Number(startIndex) || 0, 0, steps.length - 1);
		for (let offset = 0; offset < steps.length; offset++) {
			const index = (start + offset) % steps.length;
			const step = steps[index];
			if (step?.mapped && step?.barId && step?.slot && step.tracked === true && step.scan !== false) {
				return { barId: String(step.barId), slot: Number(step.slot) };
			}
		}
		return null;
	}

	function watchedCooldownSlots(rotation: RotationModel, steps: ConfiguredRotationStep[]) {
		const anchorStep = lastCue?.anchorStep || lastCue?.step;
		if (
			anchorStep?.rotationId === rotation.id &&
			anchorStep.mapped &&
			anchorStep.barId &&
			anchorStep.tracked === true &&
			anchorStep.scan !== false &&
			anchorStep.slot
		) {
			return [{ barId: String(anchorStep.barId), slot: Number(anchorStep.slot) }];
		}

		const plannedSlot = nextTrackedSlot(steps, Number(rotation.rotationIndex) || 0);
		return plannedSlot ? [plannedSlot] : [];
	}

	function tick() {
		const now = Date.now();
		const rotation = deps.activeRotation();
		if (!rotation || now < deps.getPauseUntil()) {
			if (!rotation) {
				lastRotationState = [];
				deps.cueOverlayApi.clearLargeCue();
			}
			deps.updateFooter();
			return;
		}

		const configuredSteps = deps.configuredSteps(rotation);
		if (now - lastBarReadAt >= BAR_READ_INTERVAL_MS) {
			lastBarReadAt = now;
			deps.barReaderApi.readFrame(watchedCooldownSlots(rotation, configuredSteps));
		}

		const cue = deps.RCueApi.chooseCue(configuredSteps);
		const rotationState = deps.RCueApi.buildRotationState(configuredSteps);
		const manualGuidanceChain = deps.RCueApi.buildManualGuidanceChain();
		lastCue = cue;
		lastRotationState = rotationState;
		deps.cueOverlayApi.drawRotationState(rotationState);
		deps.cueOverlayApi.drawManualGuidance(manualGuidanceChain.manualGuidance);
		deps.cueOverlayApi.drawCue(cue);
		deps.cueOverlayApi.drawLargeCue(cue, manualGuidanceChain);
		deps.updateSlotClasses(cue);
		deps.updateFooter();
	}

	function start() {
		if (tickId) return;
		tickId = setInterval(tick, BAR_READ_INTERVAL_MS);
		tick();
	}

	return {
		start,
		getLastCue: () => lastCue,
		getLastRotationState: () => lastRotationState,
		setLastCue: (value: any) => { lastCue = value; },
	};
}
