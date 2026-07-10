import type { IconTrainingProfiles, TrackedBar } from "../types";
import { openSlotAbilityWindow } from "./slotAbilityWindow";
import {
	abilityCanMapToSlot,
	abilityCanTrainIcon,
	abilityFamilyKey,
	abilityLabel,
	abilityLibrary,
	abilityShownInCombatStyle,
	allAbilityLibrary,
	otherAbilityLibrary,
	normalizeCombatStyle,
	styles,
} from "../Abilities/abilityData";
import { sampleAlignedIconVectors } from "./iconVectors";
import {
	abilityFamilyTemplate,
	iconTemplateVectors,
	storeLearnedIconTemplate,
} from "./templates";

export * from "./iconVectors";
export {
	abilityFamilyTemplate,
	cleanLearnedIconTemplates,
	createBundledIconTemplateApi,
	iconTemplateVectors,
	storeLearnedIconTemplate,
} from "./templates";

export const LEARNED_ICON_MATCH_THRESHOLD = 0.88;
export const LEARNED_ICON_MATCH_MARGIN = 0.05;

type AutoDetectionCandidate = {
	slot: number;
	abilityId: string;
	score: number;
	margin: number;
};

export function selectUniqueIconCandidates<T extends {
	slot: number;
	abilityId: string;
	score: number;
}>(
	candidates: T[],
	existingSlotAbilities: Record<string, string> = {}
) {
	const chosen: T[] = [];
	const usedSlots = new Set(Object.keys(existingSlotAbilities).map(Number));
	const usedAbilities = new Set(
		Object.values(existingSlotAbilities)
			.map(value => abilityFamilyKey(value) || String(value))
	);

	for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
		const abilityKey = abilityFamilyKey(candidate.abilityId) || candidate.abilityId;
		if (usedSlots.has(candidate.slot) || usedAbilities.has(abilityKey)) continue;
		chosen.push(candidate);
		usedSlots.add(candidate.slot);
		usedAbilities.add(abilityKey);
	}

	return chosen;
}

export function selectUniqueIconDetections(
	candidates: AutoDetectionCandidate[],
	existingSlotAbilities: Record<string, string> = {}
) {
	const detected: Record<string, string> = {};
	for (const candidate of selectUniqueIconCandidates(candidates, existingSlotAbilities)) {
		detected[String(candidate.slot)] = candidate.abilityId;
	}

	return detected;
}

export function removeDuplicateIconMappings(
	slotAbilities: Record<string, string>,
	candidates: AutoDetectionCandidate[]
) {
	const slotsByAbility: Record<string, number[]> = {};
	for (const [slot, abilityIdValue] of Object.entries(slotAbilities)) {
		const id = String(abilityIdValue || "");
		if (!id) continue;
		const familyKey = abilityFamilyKey(id) || id;
		if (!slotsByAbility[familyKey]) slotsByAbility[familyKey] = [];
		slotsByAbility[familyKey].push(Number(slot));
	}

	let removed = 0;
	for (const [familyKey, slots] of Object.entries(slotsByAbility)) {
		if (slots.length < 2) continue;
		const ranked = slots
			.map(slot => ({
				slot,
				score: candidates.find(candidate =>
					candidate.slot === slot &&
					(abilityFamilyKey(candidate.abilityId) || candidate.abilityId) === familyKey
				)?.score ?? -1,
			}))
			.sort((a, b) => b.score - a.score || a.slot - b.slot);
		if (ranked[0].score < 0) continue;

		for (const duplicate of ranked.slice(1)) {
			delete slotAbilities[String(duplicate.slot)];
			removed++;
		}
	}

	return removed;
}

type IconMatchingDeps = {
	app: any;
	iconSimilarity: (a: number[], b: number[]) => number;
};

export function createIconMatchingApi(deps: IconMatchingDeps) {
	const templateVectorCache = new WeakMap<object, number[][]>();

	function vectorsForTemplate(template: any) {
		if (!template || typeof template !== "object") return [];
		const cached = templateVectorCache.get(template);
		if (cached) return cached;
		const vectors = iconTemplateVectors(template);
		templateVectorCache.set(template, vectors);
		return vectors;
	}

	function learnedTemplateCount() {
		return Object.keys(deps.app.abilityTemplates || {}).length;
	}

	function availableIconTemplates() {
		return deps.app.abilityTemplates || {};
	}

	function learnIconTemplate(abilityIdValue: string, vector: number[], metadata: Record<string, any> = {}) {
		if (!deps.app.abilityTemplates) deps.app.abilityTemplates = {};
		return storeLearnedIconTemplate(deps.app.abilityTemplates, abilityIdValue, vector, metadata);
	}

	function bestAbilityTemplateMatchFromSet(vector: number[], allowedAbilityIds: Set<string>) {
		let bestId = "";
		let bestScore = -1;
		let secondScore = -1;
		const templates = availableIconTemplates();
		const familyRepresentatives = new Map<string, string>();

		for (const id of allowedAbilityIds) {
			const key = abilityFamilyKey(id);
			if (key && !familyRepresentatives.has(key)) familyRepresentatives.set(key, id);
		}

		for (const [familyKey, allowedId] of familyRepresentatives) {
			const abilityIdValue = allowedAbilityIds.has(familyKey) ? familyKey : allowedId;
			const template = abilityFamilyTemplate(templates, abilityIdValue);
			const vectors = vectorsForTemplate(template);
			if (!vectors.length) continue;

			const score = Math.max(...vectors.map(candidate => deps.iconSimilarity(vector, candidate)));
			if (score > bestScore) {
				secondScore = bestScore;
				bestScore = score;
				bestId = abilityIdValue;
			} else if (score > secondScore) {
				secondScore = score;
			}
		}

		const margin = bestScore - secondScore;
		return {
			abilityId: bestId,
			score: bestScore,
			secondScore,
			margin,
		};
	}

	return {
		learnedTemplateCount,
		availableIconTemplates,
		bestAbilityTemplateMatchFromSet,
		learnIconTemplate,
	};
}
type AppLike = {
	activeCombatStyle: string;
	abilityTemplates: Record<string, any>;
	configuredBars?: TrackedBar[];
	configuredBar?: TrackedBar | null;
};

type IconTrainingApiDeps = {
	getApp: () => AppLike;
	trainingCaptureBar: () => TrackedBar | null;
	hasAlt1: () => boolean;
	captureForTrackedBar: (bar: TrackedBar) => any;
	sampleIconVector: (capture: ImageData, caparea: any, slot: any, size?: number) => number[];
	availableIconTemplates: () => Record<string, any>;
	bestAbilityTemplateMatchFromSet: (vector: number[], allowedAbilityIds: Set<string>) => { abilityId: string; score: number; secondScore?: number; margin?: number };
	abilityIconRenderSrc: (id: string) => string;
	learnedTemplateCount: () => number;
	setIconStatus: (status: string) => void;
	getIconStatus: () => string;
	deactivateRotationsForEdit: () => void;
	saveIconTemplates: () => void;
	save: () => void;
	render: () => void;
	updateFooter: () => void;
};

export function emptyIconTrainingProfiles() {
	const out: IconTrainingProfiles = {};
	for (const style of styles) out[style] = { slotAbilities: {} };
	return out;
}

export function createIconTrainingApi(deps: IconTrainingApiDeps) {
	function app() {
		return deps.getApp();
	}

	function trainingBars() {
		const state = app();
		const bars = Array.isArray(state.configuredBars) ? state.configuredBars : [];
		return bars.length ? bars : (state.configuredBar ? [state.configuredBar] : []);
	}

	function barById(barId: string) {
		return trainingBars().find(bar => bar.id === barId) || null;
	}

	function barStyleMap(style: string, create = false, targetBar?: TrackedBar | null) {
		const bar: any = targetBar || deps.trainingCaptureBar();
		if (!bar) return null;
		const normalizedStyle = normalizeCombatStyle(style);

		if (!bar.slotAbilitiesByStyle && create) bar.slotAbilitiesByStyle = {};
		if (!bar.slotAbilitiesByStyle) return null;

		if (!bar.slotAbilitiesByStyle[normalizedStyle] && create) {
			bar.slotAbilitiesByStyle[normalizedStyle] = {};
		}

		return bar.slotAbilitiesByStyle[normalizedStyle] || null;
	}

	function getIconTrainingProfile(style: string) {
		const normalizedStyle = normalizeCombatStyle(style);
		const mappedSlots = barStyleMap(normalizedStyle, true);
		return { slotAbilities: mappedSlots || {} };
	}

	function setIconTrainingSlot(style: string, barId: string, slot: number, abilityIdValue: string) {
		const key = String(Number(slot) || 0);
		if (!key || key === "0") return;
		const mappedSlots = barStyleMap(style, true, barById(barId));
		if (!mappedSlots) return;

		if (abilityIdValue) {
			if (!abilityCanMapToSlot(abilityIdValue)) return;
			mappedSlots[key] = String(abilityIdValue);
		} else {
			delete mappedSlots[key];
		}

		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
	}

	function clearIconTrainingProfile(style: string) {
		let cleared = false;
		for (const bar of trainingBars()) {
			const mappedSlots = barStyleMap(style, true, bar);
			if (!mappedSlots) continue;
			Object.keys(mappedSlots).forEach(slot => delete mappedSlots[slot]);
			cleared = true;
		}
		if (cleared) deps.deactivateRotationsForEdit();
		deps.setIconStatus(`${normalizeCombatStyle(style)} mapped abilities cleared`);
		deps.save();
		deps.render();
		deps.updateFooter();
	}

	function abilityIdsForTrainingStyle(style: string) {
		const normalizedStyle = normalizeCombatStyle(style);
		const allowed = new Set<string>();

		for (const ability of allAbilityLibrary) {
			if (!abilityCanTrainIcon(ability.id)) continue;
			if (abilityShownInCombatStyle(ability, normalizedStyle)) {
				allowed.add(ability.id);
			}
		}

		return allowed;
	}

	function autoDetectTrainingProfile(style: string, barId: string) {
		const normalizedStyle = normalizeCombatStyle(style);
		const bar = barById(barId) || deps.trainingCaptureBar();

		if (!bar) {
			deps.setIconStatus("Fill Learned needs an action bar");
			deps.updateFooter();
			return;
		}

		if (!deps.hasAlt1()) {
			deps.setIconStatus("Fill Learned requires Alt1");
			deps.updateFooter();
			return;
		}

		const templates = deps.availableIconTemplates();
		if (!Object.keys(templates).length) {
			deps.setIconStatus("Fill Learned needs learned icons");
			deps.updateFooter();
			return;
		}

		const captured = deps.captureForTrackedBar(bar);
		if (!captured) {
			deps.setIconStatus("Fill Learned could not read the action bar");
			deps.updateFooter();
			return;
		}

		const allowedAbilityIds = abilityIdsForTrainingStyle(normalizedStyle);
		const candidates: AutoDetectionCandidate[] = [];

		for (const slot of captured.probeBar.slots) {
			const alignedMatches = sampleAlignedIconVectors(
				deps.sampleIconVector,
				captured.img,
				captured.caparea,
				slot,
				16,
				2
			).map(vector => deps.bestAbilityTemplateMatchFromSet(vector, allowedAbilityIds));
			alignedMatches.sort((a, b) => b.score - a.score);
			const best = alignedMatches[0] || {
				abilityId: "",
				score: -1,
				margin: 0,
			};
			const gap = Number(best.margin) || 0;

			const strongEnough = best.abilityId && best.score >= LEARNED_ICON_MATCH_THRESHOLD;
			const notAmbiguous = gap >= LEARNED_ICON_MATCH_MARGIN || best.score >= 0.90;

			if (strongEnough && notAmbiguous) {
				candidates.push({
					slot: Number(slot.index),
					abilityId: best.abilityId,
					score: best.score,
					margin: gap,
				});
			}
		}

		const mappedSlots = barStyleMap(normalizedStyle, true, bar);
		const removedDuplicates = mappedSlots
			? removeDuplicateIconMappings(mappedSlots, candidates)
			: 0;
		const detected = selectUniqueIconDetections(candidates, mappedSlots || {});
		const matched = Object.keys(detected).length;
		if (mappedSlots) Object.assign(mappedSlots, detected);
		if (matched || removedDuplicates) deps.deactivateRotationsForEdit();

		deps.setIconStatus(matched || removedDuplicates
			? `Filled ${matched} ${normalizedStyle} abilit${matched === 1 ? "y" : "ies"} from learned icons${removedDuplicates ? `; removed ${removedDuplicates} duplicate${removedDuplicates === 1 ? "" : "s"}` : ""}`
			: `No new ${normalizedStyle} learned-icon matches`);

		deps.save();
		deps.render();
		deps.updateFooter();
	}

	function learnIconsFromTrainingProfile(style: string) {
		const normalizedStyle = normalizeCombatStyle(style);
		const bars = trainingBars();

		if (!bars.length) {
			deps.setIconStatus("Learning needs an action bar");
			deps.updateFooter();
			return;
		}

		if (!deps.hasAlt1()) {
			deps.setIconStatus("Learning requires Alt1");
			deps.updateFooter();
			return;
		}

		if (!app().abilityTemplates) app().abilityTemplates = {};

		let learned = 0;
		for (const bar of bars) {
			const profile = { slotAbilities: barStyleMap(normalizedStyle, true, bar) || {} };
			const captured = deps.captureForTrackedBar(bar);
			if (!captured) continue;

			for (const slot of captured.probeBar.slots) {
				const abilityIdValue = String(profile.slotAbilities?.[String(slot.index)] || "");
				if (!abilityIdValue || !abilityCanTrainIcon(abilityIdValue)) continue;

				const vector = deps.sampleIconVector(captured.img, captured.caparea, slot, 16);
				if (!vector.length) continue;

				storeLearnedIconTemplate(app().abilityTemplates, abilityIdValue, vector, {
					name: abilityLabel(abilityIdValue),
					style: normalizedStyle,
					capture: {
						barId: bar.id,
						slot: slot.index,
						x: slot.x,
						y: slot.y,
						width: slot.width,
						height: slot.height,
					},
					source: "learned-training-profile",
				});
				learned++;
			}
		}

		deps.setIconStatus(learned
			? `Learned ${learned} ${normalizedStyle} icon${learned === 1 ? "" : "s"} (${deps.learnedTemplateCount()} total)`
			: `Map at least one ${normalizedStyle} ability first`);

		deps.saveIconTemplates();
		deps.save();
		deps.render();
		deps.updateFooter();
	}


	function slotAbilityWindowData() {
		const bars = trainingBars();
		const windowBars = bars.map(bar => {
			const profiles = emptyIconTrainingProfiles();
			for (const style of styles) {
				const mappedSlots = barStyleMap(style, true, bar);
				profiles[style].slotAbilities = { ...(mappedSlots || {}) };
			}
			return {
				id: bar.id,
				name: bar.name,
				layout: String(bar.layout || "1x14"),
				slotCount: Array.isArray(bar.slots) ? bar.slots.length : 0,
				profiles,
			};
		});

		return {
			activeCombatStyle: app().activeCombatStyle,
			barName: bars.length ? `${bars.length} action bar${bars.length === 1 ? "" : "s"}` : "No action bars",
			barLayout: String(bars[0]?.layout || "1x14"),
			slotCount: bars.reduce((max, bar) => Math.max(max, Array.isArray(bar.slots) ? bar.slots.length : 0), 0),
			bars: windowBars,
			styles: [...styles],
			profiles: windowBars[0]?.profiles || emptyIconTrainingProfiles(),
			abilities: abilityLibrary
				.filter(ability => abilityCanMapToSlot(ability.id))
				.map(ability => ({
					id: ability.id,
					name: ability.name,
					style: ability.style,
					scan: ability.scan,
					picker: ability.picker,
					sectionId: ability.sectionId,
					sectionLabel: ability.sectionLabel,
					showInStyles: ability.showInStyles,
					icon: deps.abilityIconRenderSrc(ability.id),
				})),
			otherAbilities: otherAbilityLibrary
				.filter(ability => abilityCanMapToSlot(ability.id))
				.map(ability => ({
					id: ability.id,
					name: ability.name,
					style: ability.style,
					scan: ability.scan,
					picker: ability.picker,
					sectionId: ability.sectionId,
					sectionLabel: ability.sectionLabel,
					showInStyles: ability.showInStyles,
					icon: deps.abilityIconRenderSrc(ability.id),
				})),
			status: `${deps.learnedTemplateCount()} learned icon${deps.learnedTemplateCount() === 1 ? "" : "s"} · ${deps.getIconStatus()}`,
		};
	}

	function openBarSlotAbilityWindow() {
		deps.deactivateRotationsForEdit();
		deps.save();
		deps.render();
		const data = slotAbilityWindowData();

		openSlotAbilityWindow({
			...data,
			onSetTrainingSlot: (style, barId, slot, abilityIdValue) => {
				setIconTrainingSlot(style, barId, slot, abilityIdValue);
				return slotAbilityWindowData();
			},
			onLearnIcons: style => {
				learnIconsFromTrainingProfile(style);
				return slotAbilityWindowData();
			},
			onAutoDetect: (style, barId) => {
				autoDetectTrainingProfile(style, barId);
				return slotAbilityWindowData();
			},
			onClearTrainingProfile: style => {
				clearIconTrainingProfile(style);
				return slotAbilityWindowData();
			},
			onClearLearned: () => {
				app().abilityTemplates = {};
				deps.setIconStatus("Learned icons cleared");
				deps.saveIconTemplates();
				deps.save();
				deps.render();
				deps.updateFooter();
				return slotAbilityWindowData();
			},
			onSelectStyle: style => {
				app().activeCombatStyle = normalizeCombatStyle(style);
				deps.save();
				deps.render();
				return slotAbilityWindowData();
			},
		});
	}

	return {
		openBarSlotAbilityWindow,
	};
}
