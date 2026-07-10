import type {
	AppState,
	ConfiguredRotationStep,
	RotationModel,
} from "../types";
import {
	abilityBehavior,
	abilityFamilyIds,
	isRotationTrackableAbility,
} from "../Abilities/abilityData";
import {
	movedTrackedRotationIndex,
	movedRotationIndex,
	normalizeRuntimeSlotState,
} from "./cueEngine";
import {
	STEP_SEPARATOR_TYPE,
	cleanStepSeparatorLabel,
	createStepSeparator,
	isRotationStepSeparator,
	rotationStepAbilityId,
} from "./rotationSteps";

export {
	createRCueApi,
	isReliableUseObservation,
	movedTrackedRotationIndex,
	movedRotationIndex,
	normalizeRuntimeSlotState,
} from "./cueEngine";
type RCueMappingDeps = {
	app: AppState;
};

export function createRCueMappingApi(deps: RCueMappingDeps) {
	function slotCount(bar: any) {
		return bar && Array.isArray(bar.slots) ? bar.slots.length : 0;
	}

	function gridText(bar: any) {
		return String(bar?.layout || "1x14").replace(/x/g, "x");
	}

	function configuredBars() {
		const bars = Array.isArray(deps.app.configuredBars) ? deps.app.configuredBars : [];
		return bars.length ? bars : (deps.app.configuredBar ? [deps.app.configuredBar] : []);
	}

	function abilitySlotMapForBar(bar: any, combatStyle = "") {
		const out: Record<string, any> = {};
		const styleMap = combatStyle && bar?.slotAbilitiesByStyle?.[combatStyle];
		const slotAbilities = styleMap || {};

		for (let slot = 1; slot <= slotCount(bar); slot++) {
			const abilityIdValue = String(slotAbilities[String(slot)] || "");
			if (!abilityIdValue) continue;
			const mappedSlot = { barId: bar.id, slot };
			for (const familyId of abilityFamilyIds(abilityIdValue)) {
				out[familyId] = mappedSlot;
			}
		}

		return out;
	}

	function abilitySlotMapForBars(bars: any[], combatStyle = "") {
		const out: Record<string, any> = {};
		for (const bar of bars) {
			const barMap = abilitySlotMapForBar(bar, combatStyle);
			for (const [familyId, mappedSlot] of Object.entries(barMap)) {
				if (!out[familyId]) out[familyId] = mappedSlot;
			}
		}
		return out;
	}

	function findAbilitySlot(rotation: any, abilityIdValue: string) {
		return abilitySlotMapForBars(configuredBars(), rotation?.combatStyle)[abilityIdValue] || null;
	}

	function configuredSteps(rotation: RotationModel): ConfiguredRotationStep[] {
		if (!rotation) return [];
		const abilitySteps = Array.isArray(rotation.abilitySteps) ? rotation.abilitySteps : [];
		const abilitySlots = abilitySlotMapForBars(configuredBars(), rotation.combatStyle);
		const steps: ConfiguredRotationStep[] = [];

		for (const [authoredIndex, entry] of abilitySteps.entries()) {
			const abilityIdValue = rotationStepAbilityId(entry);
			if (!abilityIdValue) continue;
			const behavior = abilityBehavior(abilityIdValue);
			const mapped = behavior.mappedRequired ? abilitySlots[abilityIdValue] : null;
			steps.push({
				rotationId: rotation.id,
				barId: behavior.mappedRequired ? mapped?.barId || "" : "",
				slot: behavior.mappedRequired ? mapped?.slot || 0 : 0,
				abilityId: abilityIdValue,
				tracked: behavior.canBeTrackedAnchor && isRotationTrackableAbility(abilityIdValue),
				scan: behavior.scan,
				cueMarker: behavior.cueMarker,
				reminder: behavior.reminder,
				mappedRequired: behavior.mappedRequired,
				displayOnly: behavior.reminder,
				mapped: !behavior.mappedRequired || !!mapped,
				order: steps.length,
				authoredIndex,
			});
		}

		return steps;
	}

	return {
		slotCount,
		gridText,
		findAbilitySlot,
		configuredSteps,
	};
}
type RCueRuntimeDeps = {
	app: AppState;
	getSlotState: (ref: { barId: string; slot: number }) => any;
	clearCueGroup: () => void;
	setLastCue: (value: any) => void;
	setLastKey: (value: string) => void;
	resetCueEngine: () => void;
	setCooldownBaselineStatus: (value: string) => void;
};

export function createRCueRuntimeApi(deps: RCueRuntimeDeps) {
	function slotState(ref: any) {
		return normalizeRuntimeSlotState(deps.getSlotState(ref));
	}

	function resetCueLock() {
		deps.setLastCue(null);
		deps.setLastKey("");
		deps.resetCueEngine();
	}

	function deactivateRotationsForEdit() {
		if (!deps.app.activeRotationId) return;
		deps.app.activeRotationId = "";
		deps.setCooldownBaselineStatus("Activate a rotation");
		resetCueLock();
		deps.clearCueGroup();
	}

	return {
		slotState,
		resetCueLock,
		deactivateRotationsForEdit,
	};
}
type RotationActionsDeps = {
	app: AppState;
	styles: string[];
	getRotation: (id: string) => RotationModel | null;
	configuredSteps: (rotation: RotationModel) => ConfiguredRotationStep[];
	cleanRotation: (rotation: any) => RotationModel;
	makeId: (prefix: string) => string;
	deactivateRotationsForEdit: () => void;
	resetCueLock: () => void;
	save: () => void;
	render: () => void;
	clearCueGroup: () => void;
	scanBarForRotationAbilities: (rotationId: string) => boolean | Promise<boolean>;
	calibrateCooldownBaseline: (updateUi?: boolean) => boolean;
	setOpenAbilityMenuKey: (value: string) => void;
	setCooldownBaselineStatus: (value: string) => void;
};

export function createRotationActionsApi(deps: RotationActionsDeps) {
	let titleSaveTimer: ReturnType<typeof setTimeout> | null = null;

	function addRotationStep(rotId: string) {
		const rot = deps.getRotation(rotId);
		if (!rot) return;

		if (!Array.isArray(rot.abilitySteps)) rot.abilitySteps = [];
		rot.abilitySteps.push("");
		deps.setOpenAbilityMenuKey("");
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function addStepSeparator(rotId: string) {
		const rot = deps.getRotation(rotId);
		if (!rot) return;

		if (!Array.isArray(rot.abilitySteps)) rot.abilitySteps = [];
		rot.abilitySteps.push(createStepSeparator(rot.abilitySteps));
		deps.setOpenAbilityMenuKey("");
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function setRotationStep(rotId: string, index: number, abilityIdValue: string) {
		const rot = deps.getRotation(rotId);
		if (!rot || !Array.isArray(rot.abilitySteps)) return;

		rot.abilitySteps[Number(index)] = String(abilityIdValue || "");
		deps.setOpenAbilityMenuKey("");
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function clearRotationStep(rotId: string, index: number) {
		const rot = deps.getRotation(rotId);
		if (!rot || !Array.isArray(rot.abilitySteps)) return;

		rot.abilitySteps[Number(index)] = "";
		deps.setOpenAbilityMenuKey("");
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function clearEmptyRotationSteps(rotId: string) {
		const rot = deps.getRotation(rotId);
		if (!rot || !Array.isArray(rot.abilitySteps)) return;

		const populatedSteps = rot.abilitySteps.filter(step => isRotationStepSeparator(step) || !!rotationStepAbilityId(step));
		if (populatedSteps.length === rot.abilitySteps.length) return;

		rot.abilitySteps = populatedSteps;
		deps.setOpenAbilityMenuKey("");
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function setStepSeparatorLabel(rotId: string, index: number, label: string) {
		const rot = deps.getRotation(rotId);
		if (!rot || !Array.isArray(rot.abilitySteps)) return;

		const stepIndex = Number(index);
		if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= rot.abilitySteps.length) return;
		if (!isRotationStepSeparator(rot.abilitySteps[stepIndex])) return;

		rot.abilitySteps[stepIndex] = {
			type: STEP_SEPARATOR_TYPE,
			label: cleanStepSeparatorLabel(label),
		};
		deps.save();
	}

	function deleteRotationStep(rotId: string, index: number) {
		const rot = deps.getRotation(rotId);
		if (!rot || !Array.isArray(rot.abilitySteps)) return;

		rot.abilitySteps.splice(Number(index), 1);
		deps.setOpenAbilityMenuKey("");
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function moveRotationStep(rotId: string, fromIndex: number, toIndex: number) {
		const rot = deps.getRotation(rotId);
		if (!rot || !Array.isArray(rot.abilitySteps)) return;

		const from = Number(fromIndex);
		const to = Number(toIndex);
		if (
			!Number.isInteger(from) ||
			!Number.isInteger(to) ||
			from < 0 ||
			to < 0 ||
			from >= rot.abilitySteps.length ||
			to >= rot.abilitySteps.length ||
			from === to
		) return;

		const [step] = rot.abilitySteps.splice(from, 1);
		rot.abilitySteps.splice(to, 0, step);
		rot.rotationIndex = 0;
		deps.setOpenAbilityMenuKey("");
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function createRotation(style: string) {
		const hasConfiguredBar = Array.isArray(deps.app.configuredBars)
			? deps.app.configuredBars.length > 0
			: !!deps.app.configuredBar;
		if (!hasConfiguredBar || !deps.styles.includes(style)) return;
		const count = deps.app.rotations.filter((rot: any) => rot.combatStyle === style).length + 1;
		const rot = deps.cleanRotation({
			id: deps.makeId("rot"),
			title: `${style} rotation ${count}`,
			combatStyle: style,
			abilitySteps: [],
			collapsed: false
		});
		deps.app.rotations.push(rot);
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function reorderRotation(style: string, rotationId: string, direction: "up" | "down") {
		const rotation = deps.getRotation(rotationId);
		if (!rotation || rotation.combatStyle !== style || (direction !== "up" && direction !== "down")) return;

		const styleIndexes = deps.app.rotations
			.map((item, index) => item.combatStyle === style ? index : -1)
			.filter(index => index >= 0);
		const styleIndex = styleIndexes.indexOf(deps.app.rotations.indexOf(rotation));
		const targetStyleIndex = styleIndex + (direction === "up" ? -1 : direction === "down" ? 1 : 0);
		if (styleIndex < 0 || targetStyleIndex < 0 || targetStyleIndex >= styleIndexes.length) return;

		const currentIndex = styleIndexes[styleIndex];
		const targetIndex = styleIndexes[targetStyleIndex];
		[deps.app.rotations[currentIndex], deps.app.rotations[targetIndex]] =
			[deps.app.rotations[targetIndex], deps.app.rotations[currentIndex]];
		deps.save();
		deps.render();
	}

	function deleteRotation(id: string) {
		const rot = deps.getRotation(id);
		if (!rot) return;
		deps.app.rotations = deps.app.rotations.filter((item: any) => item.id !== id);

		if (deps.app.activeRotationId === id) {
			deps.app.activeRotationId = "";
		}
		deps.setCooldownBaselineStatus("Activate a rotation");
		deps.resetCueLock();
		deps.save();
		deps.render();
		deps.clearCueGroup();
	}

	function setTitle(id: string, title: string) {
		const rot = deps.getRotation(id);
		if (!rot) return;
		rot.title = title || "Untitled rotation";
		if (titleSaveTimer) clearTimeout(titleSaveTimer);
		titleSaveTimer = setTimeout(() => {
			titleSaveTimer = null;
			deps.save();
		}, 250);
	}

	function setActive(id: string) {
		const rot = deps.getRotation(id);
		if (!rot) return;

		if (deps.app.activeRotationId === id) {
			deps.app.activeRotationId = "";
			deps.setCooldownBaselineStatus("Activate a rotation");
			deps.resetCueLock();
			deps.clearCueGroup();
			deps.save();
			deps.render();
			return;
		}

		const steps = deps.configuredSteps(rot);
		const unmapped = steps.filter((step: any) => !step.mapped);
		const cueMarkers = steps.filter((step: any) => step.cueMarker);
		const trackedSteps = steps.filter((step: any) => step.tracked === true);
		if (!steps.length || !trackedSteps.length || unmapped.length) {
			if (steps.length && cueMarkers.length && !unmapped.length) {
				rot.rotationIndex = 0;
				deps.app.activeRotationId = id;
				deps.resetCueLock();
				deps.calibrateCooldownBaseline(false);
				deps.save();
				deps.render();
				return;
			}
			deps.setCooldownBaselineStatus(!steps.length
				? "Add an ability"
				: !trackedSteps.length
					? "Add at least one cooldown ability or cue marker"
					: `Mapping required: ${unmapped.length} step${unmapped.length === 1 ? "" : "s"}`);
			deps.render();
			return;
		}

		rot.rotationIndex = 0;
		deps.app.activeRotationId = id;
		deps.resetCueLock();
		deps.calibrateCooldownBaseline(false);

		deps.save();
		deps.render();
	}

	function scanRotation(id: string) {
		deps.deactivateRotationsForEdit();
		deps.scanBarForRotationAbilities(id);
	}

	function moveActiveRotation(id: string, delta: number, reason: string) {
		const rot = deps.getRotation(id);
		if (!rot || deps.app.activeRotationId !== id) return;
		const steps = deps.configuredSteps(rot);
		if (!steps.length) return;

		rot.rotationIndex = movedTrackedRotationIndex(rot.rotationIndex, steps, delta);
		deps.resetCueLock();
		deps.clearCueGroup();
		deps.setCooldownBaselineStatus(reason);
		deps.save();
		deps.render();
	}

	function resetActiveRotation(id: string) {
		const rot = deps.getRotation(id);
		if (!rot || deps.app.activeRotationId !== id) return;
		rot.rotationIndex = 0;
		deps.resetCueLock();
		deps.clearCueGroup();
		deps.setCooldownBaselineStatus("Rotation reset");
		deps.save();
		deps.render();
	}

	function backActiveRotation(id: string) {
		moveActiveRotation(id, -1, "Moved back one step");
	}

	function skipActiveRotation(id: string) {
		moveActiveRotation(id, 1, "Step skipped");
	}

	function toggleRotation(id: string) {
		const rot = deps.getRotation(id);
		if (!rot) return;
		rot.collapsed = !rot.collapsed;
		deps.save();
		deps.render();
	}

	return {
		addRotationStep,
		addStepSeparator,
		setRotationStep,
		setStepSeparatorLabel,
		clearRotationStep,
		clearEmptyRotationSteps,
		deleteRotationStep,
		moveRotationStep,
		createRotation,
		reorderRotation,
		deleteRotation,
		setTitle,
		setActive,
		scanRotation,
		resetActiveRotation,
		backActiveRotation,
		skipActiveRotation,
		toggleRotation,
	};
}
