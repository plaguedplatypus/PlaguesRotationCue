import {
	abilityBehavior,
	abilityLabel,
	cleanAbilityId,
	getAbilityMeta,
	normalizeCombatStyle,
	styles,
} from "../Abilities/abilityData";
import { cleanLearnedIconTemplates } from "../IconTraining/icons";
import { dateStamp, saveFile, slug } from "../utils";
import {
	STEP_SEPARATOR_TYPE,
	cleanStepSeparatorLabel,
	isRotationStepSeparator,
	rotationStepAbilityId,
} from "../Rotation/rotationSteps";
import type { AppState, RotationModel, TrackedBar } from "../types";

type ProfileDeps = {
	app: AppState;
	blankState: () => AppState;
	cleanBar: (bar: any) => TrackedBar;
	cleanBars: (bars: any) => TrackedBar[];
	cleanRotation: (rotation: any) => RotationModel;
	cleanHighlightColors: (value: any) => Record<string, string>;
	cleanHighlightBorderThickness: (value: any) => number;
	cleanLargeCurrentCuePosition: (value: any) => AppState["largeCurrentCuePosition"];
	cleanLargeCueKeybinds: (value: any) => AppState["largeCueKeybinds"];
	getRotation: (id: string) => RotationModel | null;
	findAbilitySlot: (rotation: any, abilityId: string) => any;
	slotCount: (bar: any) => number;
	makeId: (prefix: string) => string;
	deactivateRotationsForEdit: () => void;
	resetCueLock: () => void;
	saveIconTemplates: () => void;
	save: () => void;
	render: () => void;
	setCooldownBaselineStatus: (value: string) => void;
	getPendingImport: () => string | null;
	setPendingImport: (value: string | null) => void;
	getRotationImportInput: () => HTMLInputElement | null;
};

type ImportedRotationStep = {
	order: number;
	type?: string;
	label?: string;
	ability: string;
	abilityId: string;
	sourceSlot: number;
	scan?: boolean;
	cueMarker?: boolean;
	reminder?: boolean;
};

type ImportedRotation = {
	title: string;
	combatStyle: string;
	steps: ImportedRotationStep[];
};

function isImportedStepSeparator(step: ImportedRotationStep) {
	return step.type === STEP_SEPARATOR_TYPE;
}

export function createProfileApi(deps: ProfileDeps) {
	function exportProfile() {
		saveFile(`RCue-profile-${dateStamp()}.json`, {
			type: "RCue-profile",
			version: 2,
			exportedAt: new Date().toISOString(),
			state: {
				activeTab: deps.app.activeTab,
				activeCombatStyle: deps.app.activeCombatStyle,
				overlayEnabled: deps.app.overlayEnabled,
				autoAdvanceCue: deps.app.autoAdvanceCue !== false,
				showLargeCurrentCue: deps.app.showLargeCurrentCue === true,
				largeCurrentCuePosition: deps.cleanLargeCurrentCuePosition(deps.app.largeCurrentCuePosition),
				largeCueKeybinds: deps.cleanLargeCueKeybinds(deps.app.largeCueKeybinds),
				highlightColors: deps.cleanHighlightColors(deps.app.highlightColors),
				highlightBorderThickness: deps.cleanHighlightBorderThickness(deps.app.highlightBorderThickness),
				activeRotationId: deps.app.activeRotationId,
				configuredBars: deps.cleanBars(deps.app.configuredBars || deps.app.configuredBar),
				rotations: deps.app.rotations,
				abilityTemplates: deps.app.abilityTemplates,
			}
		});
	}

	function importProfile(data: any) {
		if (!data || data.type !== "RCue-profile" || data.version !== 2 || !data.state) {
			alert("This does not look like a Rotation Cue profile export.");
			return;
		}

		const imported = data.state;
		const configuredBars = deps.cleanBars(imported.configuredBars || imported.configuredBar);
		const importedRotations: any[] = (imported.rotations || []).map(deps.cleanRotation);
		const activeCombatStyle = normalizeCombatStyle(imported.activeCombatStyle);

		const nextApp = {
			...deps.blankState(),
			...imported,
			activeTab: imported.activeTab === "rotation" ? "rotation" : "bars",
			activeCombatStyle: styles.includes(activeCombatStyle) ? activeCombatStyle : "Melee",
			autoAdvanceCue: imported.autoAdvanceCue !== false,
			showLargeCurrentCue: imported.showLargeCurrentCue === true,
			largeCurrentCuePosition: deps.cleanLargeCurrentCuePosition(imported.largeCurrentCuePosition),
			largeCueKeybinds: deps.cleanLargeCueKeybinds(imported.largeCueKeybinds),
			highlightColors: deps.cleanHighlightColors(imported.highlightColors),
			highlightBorderThickness: deps.cleanHighlightBorderThickness(imported.highlightBorderThickness),
			configuredBars,
			configuredBar: configuredBars[0] || null,
			rotations: importedRotations,
			abilityTemplates: cleanLearnedIconTemplates(imported.abilityTemplates),
		};

		Object.keys(deps.app).forEach(key => delete (deps.app as any)[key]);
		Object.assign(deps.app, nextApp);

		deps.app.activeRotationId = "";
		deps.setCooldownBaselineStatus("Activate a rotation");
		deps.saveIconTemplates();
		deps.save();
		deps.render();
	}

	function portableRotation(rot: any) {
		const bars = deps.app.configuredBars?.length
			? deps.app.configuredBars
			: deps.app.configuredBar
				? [deps.app.configuredBar]
				: [];
		const steps = (rot.abilitySteps || []).map((entry: any, i: number) => {
			if (isRotationStepSeparator(entry)) {
				return {
					order: i + 1,
					type: STEP_SEPARATOR_TYPE,
					label: cleanStepSeparatorLabel(entry.label),
					ability: "",
					abilityId: "",
					sourceSlot: 0
				};
			}

			const abilityIdValue = rotationStepAbilityId(entry);
			if (!abilityIdValue) return null;
			const meta = getAbilityMeta(abilityIdValue);
			const behavior = abilityBehavior(abilityIdValue);
			const mapped = behavior.mappedRequired ? deps.findAbilitySlot(rot, abilityIdValue) : null;
			return {
				order: i + 1,
				ability: abilityLabel(abilityIdValue),
				abilityId: abilityIdValue,
				sourceSlot: behavior.mappedRequired ? mapped?.slot || 0 : 0,
				scan: meta?.scan === true,
				picker: meta?.picker || "abilities",
				sectionId: meta?.sectionId || "",
				cueMarker: behavior.cueMarker,
				reminder: behavior.reminder,
			};
		}).filter(Boolean);

		return {
			type: "RCue-rotation",
			version: 2,
			exportedAt: new Date().toISOString(),
			title: rot.title,
			combatStyle: rot.combatStyle,
			steps,
			sourceLayout: {
				bars: bars.map(bar => ({
					id: bar.id,
					name: bar.name,
					layout: bar.layout,
					slotCount: deps.slotCount(bar),
				})),
				slots: steps.map((step: any) => step.sourceSlot)
			}
		};
	}

	function exportRotation(id: string) {
		const rot = deps.getRotation(id);
		if (!rot) return;
		saveFile(`${slug(rot.title)}.RCue.json`, portableRotation(rot));
	}

	function parseRotation(data: any): ImportedRotation | null {
		if (!data || data.type !== "RCue-rotation" || data.version !== 2) return null;
		const normalizedStyle = normalizeCombatStyle(data.combatStyle);
		const style = styles.includes(normalizedStyle) ? normalizedStyle : "Hybrid";
		const steps: ImportedRotationStep[] = Array.isArray(data.steps) ? data.steps.map((step: any, i: number) => {
			const type = String(step.type || "").trim();
			const abilityIdValue = cleanAbilityId(step.abilityId) || cleanAbilityId(step.ability);
			const behavior = abilityBehavior(abilityIdValue);
			return {
				order: Number(step.order) || i + 1,
				type,
				label: String(step.label || "").trim(),
				ability: abilityIdValue ? abilityLabel(abilityIdValue) : String(step.ability || "").trim(),
				abilityId: abilityIdValue,
				sourceSlot: behavior.mappedRequired ? Number(step.sourceSlot || step.slot || 0) : 0,
				scan: getAbilityMeta(abilityIdValue)?.scan === true,
				cueMarker: behavior.cueMarker,
				reminder: behavior.reminder,
			};
		}).filter((step: ImportedRotationStep) => isImportedStepSeparator(step) || !!step.abilityId) : [];

		if (!steps.length) return null;
		steps.sort((a: ImportedRotationStep, b: ImportedRotationStep) => a.order - b.order);
		return { title: String(data.title || "Imported rotation"), combatStyle: style, steps };
	}

	function requestImport(rotationId: string) {
		if (!(deps.app.configuredBars?.length || deps.app.configuredBar) || !rotationId || !deps.getRotation(rotationId)) return;
		const input = deps.getRotationImportInput();
		if (!input) return;

		deps.setPendingImport(rotationId);
		input.value = "";
		input.click();
	}

	function applyImported(imported: ImportedRotation, finalStyle: string, replaceId: string) {
		let rot = replaceId ? deps.getRotation(replaceId) : null;
		if (!rot) {
			rot = deps.cleanRotation({ id: deps.makeId("rot"), combatStyle: finalStyle, collapsed: false });
			deps.app.rotations.push(rot);
		}

		rot.title = imported.title;
		rot.combatStyle = finalStyle;
		rot.abilitySteps = imported.steps
			.map((step: ImportedRotationStep) => isImportedStepSeparator(step)
				? { type: STEP_SEPARATOR_TYPE, label: cleanStepSeparatorLabel(step.label) } as const
				: cleanAbilityId(step.abilityId))
			.filter(Boolean);
		rot.rotationIndex = 0;
		rot.collapsed = false;
		deps.app.activeCombatStyle = finalStyle;
		deps.deactivateRotationsForEdit();
		deps.resetCueLock();
	}

	function importRotation(data: any) {
		const imported = parseRotation(data);
		if (!imported) {
			alert("This does not look like a Rotation Cue rotation export.");
			return;
		}

		const targetId = deps.getPendingImport();
		deps.setPendingImport(null);
		if (!targetId) return;

		if (!(deps.app.configuredBars?.length || deps.app.configuredBar)) return;

		const targetRot = deps.getRotation(targetId);
		if (!targetRot) return;
		const targetStyle = targetRot.combatStyle;
		let finalStyle = imported.combatStyle;
		let replaceId = targetRot.id;

		if (targetStyle === "Hybrid") {
			finalStyle = "Hybrid";
		} else if (targetStyle === imported.combatStyle) {
			finalStyle = targetStyle;
		} else if (imported.combatStyle === "Hybrid") {
			finalStyle = "Hybrid";
			replaceId = "";
		} else {
			finalStyle = imported.combatStyle;
			replaceId = "";
		}

		applyImported(imported, finalStyle, replaceId);
		deps.save();
		deps.render();
	}

	return {
		exportProfile,
		importProfile,
		exportRotation,
		requestImport,
		importRotation,
	};
}
