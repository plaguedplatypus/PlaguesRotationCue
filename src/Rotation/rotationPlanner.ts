import type { ConfiguredRotationStep } from "../types";

export type CueStepKind = "tracked" | "untracked" | "reminder" | "cueMarker" | "invalid";

export type RuntimeGuidanceItem = {
	step: ConfiguredRotationStep;
	index: number;
	label: string;
	stepKind?: CueStepKind;
};

export type RuntimeGuidanceChain = {
	manualGuidance: RuntimeGuidanceItem[];
	trackedGuidance: RuntimeGuidanceItem | null;
};

export type CueUnitKind = "tracked" | "stepsChain" | "cueMarker" | "invalid";

export type CueUnit = RuntimeGuidanceChain & {
	kind: CueUnitKind;
	startIndex: number;
	endIndex: number;
	cueStep: ConfiguredRotationStep;
	cueIndex: number;
	anchorStep: ConfiguredRotationStep | null;
	anchorIndex: number;
	steps: RuntimeGuidanceItem[];
	key: string;
	decision: string;
};

export type RuntimeSegment = CueUnit;

export function wrappedStepIndex(startIndex: number, stepCount: number) {
	if (stepCount <= 0) return 0;
	const raw = Number(startIndex);
	if (!Number.isFinite(raw)) return 0;
	const integer = raw < 0 ? Math.ceil(raw) : Math.floor(raw);
	return ((integer % stepCount) + stepCount) % stepCount;
}

export function runtimeStepKey(step: ConfiguredRotationStep | null | undefined) {
	if (!step) return "";
	return [
		step.rotationId,
		step.barId,
		Number(step.slot) || 0,
		String(step.abilityId || ""),
		Number(step.order) || 0,
		Number(step.authoredIndex) || 0,
	].join(":");
}

function cueUnitKey(kind: CueUnitKind, startIndex: number, endIndex: number, anchorStep: ConfiguredRotationStep | null) {
	return [
		kind,
		`start=${Number(startIndex) || 0}`,
		`end=${Number(endIndex) || 0}`,
		runtimeStepKey(anchorStep),
	].join("|");
}

export function stepKind(step: ConfiguredRotationStep | null | undefined): CueStepKind {
	if (!step) return "invalid";
	if (step.cueMarker) return "cueMarker";
	if (step.scan === false || step.displayOnly || step.reminder) return "reminder";
	if (step.scan && step.mapped && step.tracked === true) return "tracked";
	if (step.scan) return "untracked";
	return "invalid";
}

function guidanceItem(step: ConfiguredRotationStep, index: number, label: number): RuntimeGuidanceItem {
	return {
		step: { ...step },
		index,
		label: String(label),
		stepKind: stepKind(step),
	};
}

function makeTrackedUnit(step: ConfiguredRotationStep, index: number): CueUnit {
	const item = guidanceItem(step, index, 1);
	return {
		kind: "tracked",
		startIndex: index,
		endIndex: index,
		cueStep: { ...step },
		cueIndex: index,
		anchorStep: { ...step },
		anchorIndex: index,
		steps: [item],
		manualGuidance: [],
		trackedGuidance: null,
		key: cueUnitKey("tracked", index, index, step),
		decision: "watch-anchor",
	};
}

function makeCueMarkerUnit(step: ConfiguredRotationStep, index: number): CueUnit {
	const item = guidanceItem(step, index, 1);
	return {
		kind: "cueMarker",
		startIndex: index,
		endIndex: index,
		cueStep: { ...step },
		cueIndex: index,
		anchorStep: null,
		anchorIndex: -1,
		steps: [item],
		manualGuidance: [],
		trackedGuidance: null,
		key: cueUnitKey("cueMarker", index, index, null),
		decision: "manual-skip-required",
	};
}

function makeChainUnit(items: RuntimeGuidanceItem[], anchor: RuntimeGuidanceItem): CueUnit {
	const guidance = items.map(item => ({ ...item, step: { ...item.step } }));
	const trackedGuidance = {
		...anchor,
		step: { ...anchor.step },
		label: String(guidance.length + 1),
	};
	return {
		kind: "stepsChain",
		startIndex: guidance[0]?.index ?? anchor.index,
		endIndex: anchor.index,
		cueStep: { ...(guidance[0]?.step || anchor.step) },
		cueIndex: guidance[0]?.index ?? anchor.index,
		anchorStep: { ...anchor.step },
		anchorIndex: anchor.index,
		steps: [...guidance, trackedGuidance],
		manualGuidance: guidance,
		trackedGuidance,
		key: cueUnitKey("stepsChain", guidance[0]?.index ?? anchor.index, anchor.index, anchor.step),
		decision: "watch-anchor-after-guidance",
	};
}

function makeInvalidUnit(items: RuntimeGuidanceItem[]): CueUnit {
	const first = items[0];
	const last = items[items.length - 1] || first;
	return {
		kind: "invalid",
		startIndex: first?.index ?? 0,
		endIndex: last?.index ?? first?.index ?? 0,
		cueStep: { ...first.step },
		cueIndex: first.index,
		anchorStep: null,
		anchorIndex: -1,
		steps: items.map(item => ({ ...item, step: { ...item.step } })),
		manualGuidance: items.map(item => ({ ...item, step: { ...item.step } })),
		trackedGuidance: null,
		key: cueUnitKey("invalid", first.index, last.index, null),
		decision: "unanchored",
	};
}

function withLeadingGuidance(unit: CueUnit, leadingItems: RuntimeGuidanceItem[]): CueUnit {
	if (!leadingItems.length || !unit.anchorStep) return unit;
	const sourceGuidance = [
		...leadingItems,
		...unit.manualGuidance,
	];
	const guidance = sourceGuidance.map((item, index) => ({
		...item,
		label: String(index + 1),
		step: { ...item.step },
	}));
	const trackedGuidance = {
		step: { ...unit.anchorStep },
		index: unit.anchorIndex,
		label: String(guidance.length + 1),
		stepKind: "tracked" as CueStepKind,
	};

	return {
		...unit,
		kind: "stepsChain",
		startIndex: guidance[0]?.index ?? unit.startIndex,
		cueStep: { ...(guidance[0]?.step || unit.cueStep) },
		cueIndex: guidance[0]?.index ?? unit.cueIndex,
		steps: [...guidance, trackedGuidance],
		manualGuidance: guidance,
		trackedGuidance,
		key: cueUnitKey("stepsChain", guidance[0]?.index ?? unit.startIndex, unit.anchorIndex, unit.anchorStep),
		decision: "watch-anchor-after-guidance",
	};
}

export function buildCueUnits(rotationSteps: ConfiguredRotationStep[]): CueUnit[] {
	const steps = Array.isArray(rotationSteps) ? rotationSteps : [];
	const units: CueUnit[] = [];
	let trailingGuidance: RuntimeGuidanceItem[] = [];
	let index = 0;

	while (index < steps.length) {
		const step = steps[index];
		const kind = stepKind(step);

		if (kind === "cueMarker") {
			units.push(makeCueMarkerUnit(step, index));
			index++;
			continue;
		}

		if (kind === "tracked") {
			units.push(makeTrackedUnit(step, index));
			index++;
			continue;
		}

		const pending: RuntimeGuidanceItem[] = [];
		let anchored = false;
		let label = 1;
		while (index < steps.length) {
			const chainStep = steps[index];
			const chainKind = stepKind(chainStep);

			if (chainKind === "cueMarker") break;
			if (chainKind === "tracked") {
				const anchor = guidanceItem(chainStep, index, label);
				units.push(pending.length ? makeChainUnit(pending, anchor) : makeTrackedUnit(chainStep, index));
				anchored = true;
				trailingGuidance = [];
				index++;
				break;
			}

			pending.push(guidanceItem(chainStep, index, label++));
			index++;
		}

		if (!anchored) trailingGuidance = pending;
	}

	if (trailingGuidance.length && units[0]?.kind !== "cueMarker") {
		units[0] = withLeadingGuidance(units[0], trailingGuidance);
	}

	return units;
}

export function cueUnitForStepIndex(units: CueUnit[], currentIndex: number) {
	if (!units.length) return null;
	const index = Number(currentIndex) || 0;
	return units.find(unit => index >= unit.startIndex && index <= unit.endIndex) ||
		units.find(unit => unit.startIndex >= index) ||
		units[0];
}

export function nextCueUnit(units: CueUnit[], currentIndex: number, delta: number) {
	if (!units.length) return null;
	const current = cueUnitForStepIndex(units, currentIndex) || units[0];
	const currentUnitIndex = Math.max(0, units.indexOf(current));
	const target = wrappedStepIndex(currentUnitIndex + (Number(delta) || 0), units.length);
	return units[target] || units[0];
}

export function movedAuthoredStepIndex(current: number, steps: ConfiguredRotationStep[], delta: number) {
	const units = buildCueUnits(steps);
	const unit = nextCueUnit(units, current, delta);
	return unit ? unit.startIndex : wrappedStepIndex((Number(current) || 0) + (Number(delta) || 0), steps.length);
}

export function movedCueUnitIndex(current: number, steps: ConfiguredRotationStep[], delta: number) {
	return movedAuthoredStepIndex(current, steps, delta);
}

export function nextTrackedIndex(steps: ConfiguredRotationStep[], startIndex: number) {
	const unit = cueUnitForStepIndex(buildCueUnits(steps), startIndex);
	return unit?.anchorIndex ?? -1;
}

export function buildRuntimeSegment(steps: ConfiguredRotationStep[], startIndex: number): RuntimeSegment | null {
	return cueUnitForStepIndex(buildCueUnits(steps), startIndex);
}

export function cloneGuidanceChain(segment: RuntimeSegment | null): RuntimeGuidanceChain {
	return {
		manualGuidance: Array.isArray(segment?.manualGuidance)
			? segment.manualGuidance.map(item => ({ ...item, step: { ...item.step } }))
			: [],
		trackedGuidance: segment?.trackedGuidance
			? { ...segment.trackedGuidance, step: { ...segment.trackedGuidance.step } }
			: null,
	};
}
