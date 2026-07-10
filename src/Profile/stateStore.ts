import {
	ACTION_SLOT_ICON_HEIGHT,
	ACTION_SLOT_ICON_WIDTH,
	cleanSlotNumber,
} from "../Rotation/slotGeometry";
import {
	cleanSlotAbilityMap,
	normalizeCombatStyle,
	styles,
} from "../Abilities/abilityData";
import { cleanLearnedIconTemplates } from "../IconTraining/icons";
import { cleanRotationSteps } from "../Rotation/rotationSteps";
import { clampInt } from "../utils";
import type {
	AppState,
	HighlightColorKey,
	HighlightColors,
	RotationModel,
	ScreenPoint,
	TrackedBar,
} from "../types";

const STORE = "RCue-v2";
const ICON_STORE = "RCue-icons-v2";

export const DEFAULT_HIGHLIGHT_COLORS: HighlightColors = {
	current: "#ffd45d",
	rotation: "#44c7ff",
	cooldown: "#ff4c4c",
};

export function cleanHighlightColors(value: any): HighlightColors {
	const clean = (key: HighlightColorKey) => {
		const color = String(value?.[key] || "").toLowerCase();
		return /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT_HIGHLIGHT_COLORS[key];
	};
	return {
		current: clean("current"),
		rotation: clean("rotation"),
		cooldown: clean("cooldown"),
	};
}

export function cleanHighlightBorderThickness(value: any) {
	return clampInt(value, 1, 2, 1);
}

export function cleanLargeCurrentCuePosition(value: any): ScreenPoint | null {
	const x = Number(value?.x);
	const y = Number(value?.y);
	return Number.isFinite(x) && Number.isFinite(y)
		? { x: Math.round(x), y: Math.round(y) }
		: null;
}
export function cleanLargeCueKeybinds(value: any): Record<string, Record<string, string>> {
	const cleaned: Record<string, Record<string, string>> = {};
	if (!value || typeof value !== "object") return cleaned;

	for (const [barId, rawSlots] of Object.entries(value)) {
		const cleanBarId = String(barId || "").trim();
		if (!cleanBarId || !rawSlots || typeof rawSlots !== "object") continue;

		const slotMap: Record<string, string> = {};
		for (const [slot, rawLabel] of Object.entries(rawSlots as Record<string, any>)) {
			const slotNumber = cleanSlotNumber(slot);
			if (!slotNumber) continue;
			const label = String(rawLabel ?? "").trim().slice(0, 16);
			if (label) slotMap[String(slotNumber)] = label;
		}

		if (Object.keys(slotMap).length) cleaned[cleanBarId] = slotMap;
	}

	return cleaned;
}


type StateStoreDeps = {
	makeId: (prefix: string) => string;
	storage?: Storage;
};

export function createStateStore(deps: StateStoreDeps) {
	const storage = deps.storage || localStorage;

	function blankState(): AppState {
		return {
			activeTab: "bars",
			activeCombatStyle: "Melee",
			overlayEnabled: true,
			autoAdvanceCue: true,
			showLargeCurrentCue: false,
			largeCurrentCuePosition: null,
			largeCueKeybinds: {},
			highlightColors: cleanHighlightColors(null),
			highlightBorderThickness: 1,
			activeRotationId: "",
			configuredBars: [],
			configuredBar: null,
			rotations: [],
			abilityTemplates: {},
		};
	}

	function layoutBarName(layout: string, duplicateIndex = 1) {
		const label = String(layout || "1x14").replace(/x/g, " x ");
		return `${label} Bar${duplicateIndex > 1 ? ` - ${duplicateIndex}` : ""}`;
	}

	function cleanBar(bar: any): TrackedBar {
		const slots = Array.isArray(bar.slots) ? bar.slots.map((slot: any, i: number) => ({
			index: Number(slot.index) || i + 1,
			x: Number(slot.x) || 0,
			y: Number(slot.y) || 0,
			width: Number(slot.width) || ACTION_SLOT_ICON_WIDTH,
			height: Number(slot.height) || ACTION_SLOT_ICON_HEIGHT
		})) : [];
		const slotCount = slots.length || 14;
		const slotAbilitiesByStyle: Record<string, Record<string, string>> = {};
		for (const sourceStyle of ["Utility", ...styles]) {
			const rawMap = bar.slotAbilitiesByStyle?.[sourceStyle];
			const style = normalizeCombatStyle(sourceStyle);
			if (!rawMap || !styles.includes(style)) continue;
			slotAbilitiesByStyle[style] = {
				...(slotAbilitiesByStyle[style] || {}),
				...cleanSlotAbilityMap(rawMap, slotCount),
			};
		}

		return {
			id: bar.id || deps.makeId("bar"),
			name: bar.name || "Action bar",
			layout: String(bar.layout || "14 slots").replace(/x/g, "x"),
			slotAbilitiesByStyle,
			slots,
			offsetX: Number(bar.offsetX) || 0,
			offsetY: Number(bar.offsetY) || 0,
		};
	}

	function cleanBars(value: any): TrackedBar[] {
		const rawBars = Array.isArray(value)
			? value
			: value
				? [value]
				: [];
		const layoutCounts: Record<string, number> = {};
		return rawBars
			.filter(Boolean)
			.map((raw: any) => {
				const bar = cleanBar(raw);
				const layoutKey = String(bar.layout || "1x14");
				layoutCounts[layoutKey] = (layoutCounts[layoutKey] || 0) + 1;
				bar.name = layoutBarName(layoutKey, layoutCounts[layoutKey]);
				return bar;
			});
	}

	function cleanRotation(rot: any): RotationModel {
		const normalizedCombatStyle = normalizeCombatStyle(rot.combatStyle);
		const style = styles.includes(normalizedCombatStyle) ? normalizedCombatStyle : "Magic";
		const abilitySteps = cleanRotationSteps(rot.abilitySteps);

		return {
			id: rot.id || deps.makeId("rot"),
			title: rot.title || "Untitled rotation",
			combatStyle: style,
			abilitySteps,
			rotationIndex: Number(rot.rotationIndex) || 0,
			collapsed: rot.collapsed !== false
		};
	}

	function load(): AppState {
		try {
			const raw = storage.getItem(STORE);
			if (!raw) return blankState();
			const saved = JSON.parse(raw);
			let savedTemplates = saved.abilityTemplates || {};
			const iconRaw = storage.getItem(ICON_STORE);
			if (iconRaw) savedTemplates = JSON.parse(iconRaw);
			const configuredBars = cleanBars(saved.configuredBars || saved.configuredBar);
			const rotations = (saved.rotations || []).map(cleanRotation);

			return {
				...blankState(),
				...saved,
				activeTab: saved.activeTab === "rotation" ? "rotation" : "bars",
				activeCombatStyle: styles.includes(normalizeCombatStyle(saved.activeCombatStyle)) ? normalizeCombatStyle(saved.activeCombatStyle) : "Melee",
				autoAdvanceCue: saved.autoAdvanceCue !== false,
				showLargeCurrentCue: saved.showLargeCurrentCue === true,
				largeCurrentCuePosition: cleanLargeCurrentCuePosition(saved.largeCurrentCuePosition),
				largeCueKeybinds: cleanLargeCueKeybinds(saved.largeCueKeybinds),
				highlightColors: cleanHighlightColors(saved.highlightColors),
				highlightBorderThickness: cleanHighlightBorderThickness(saved.highlightBorderThickness),
				abilityTemplates: cleanLearnedIconTemplates(savedTemplates),
				configuredBars,
				configuredBar: configuredBars[0] || null,
				rotations,
				activeRotationId: ""
			};
		} catch (e) {
			return blankState();
		}
	}

	function save(app: AppState) {
		const { abilityTemplates, configuredBar, ...state } = app;
		storage.setItem(STORE, JSON.stringify({
			...state,
			configuredBars: cleanBars(app.configuredBars || configuredBar),
		}));
	}

	function saveIconTemplates(app: AppState) {
		storage.setItem(ICON_STORE, JSON.stringify(app.abilityTemplates || {}));
	}

	return {
		blankState,
		cleanBar,
		cleanBars,
		cleanRotation,
		load,
		save,
		saveIconTemplates,
	};
}
