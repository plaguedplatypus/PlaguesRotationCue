import {
	abilityIconFile,
	allAbilityLibrary,
	normalizeCombatStyle,
} from "../Abilities/abilityData";
import type { AbilityOption } from "../types";
import { html } from "../utils";

let resolvedAbilityIconBase = "";
let abilityIconBaseChecked = false;

export function abilityIconRenderSrc(id: string) {
	const file = abilityIconFile(id);
	if (!file || !resolvedAbilityIconBase) return "";
	return `${resolvedAbilityIconBase}${file}`;
}

function firstGeneratedAbilityIconFile() {
	for (const ability of allAbilityLibrary) {
		const file = abilityIconFile(ability.id);
		if (file) return file;
	}
	return "";
}

function testImageSrc(src: string) {
	return new Promise<boolean>(resolve => {
		const img = new Image();
		const done = (ok: boolean) => {
			img.onload = null;
			img.onerror = null;
			resolve(ok);
		};
		img.onload = () => done(true);
		img.onerror = () => done(false);
		img.src = src;
	});
}

export async function resolveAbilityIconBase(onResolved?: () => void) {
	if (abilityIconBaseChecked) return;
	abilityIconBaseChecked = true;

	const file = firstGeneratedAbilityIconFile();
	if (!file) return;

	const bases = [
		"./assets/abilities/",
		"assets/abilities/",
		"./dist/assets/abilities/",
		"dist/assets/abilities/",
	];

	for (const base of bases) {
		if (await testImageSrc(`${base}${file}`)) {
			resolvedAbilityIconBase = base;
			onResolved?.();
			return;
		}
	}

	console.warn(`Rotation Cue: could not resolve ability icon path for ${file}`);
	onResolved?.();
}

export function installAbilityIconFallbacks(onResolved?: () => void) {
	if ((window as any).__RCueAbilityIconFallbacksInstalled) return;
	(window as any).__RCueAbilityIconFallbacksInstalled = true;

	resolveAbilityIconBase(onResolved);

	document.addEventListener("error", event => {
		const img = event.target as HTMLImageElement | null;
		if (!img || !img.classList || !img.classList.contains("rotation-ability-icon")) return;

		const file = img.getAttribute("data-icon-file") || "";
		if (!file) return;

		img.classList.add("icon-load-failed");
		img.title = `Icon not found: ${file}`;
	}, true);
}

export type AbilityPickerAbility = AbilityOption;

type AbilityPickerSection = {
	title: string;
	abilities: AbilityPickerAbility[];
};

function abilityPickerStyleName(style: string) {
	return normalizeCombatStyle(style || "Melee");
}

function abilitySectionTitle(ability: AbilityPickerAbility) {
	const label = String(ability.sectionLabel || ability.sectionId || ability.style || "Other");
	return label.replace(/_/g, " ");
}

function abilityVisibleInStyle(ability: AbilityPickerAbility, activeStyle: string) {
	const visibility = ability.showInStyles;
	if (!visibility || visibility === "all") return true;
	const active = abilityPickerStyleName(activeStyle);
	return Array.isArray(visibility) && visibility.some(style => abilityPickerStyleName(String(style)) === active);
}

function abilityPickerSections(style: string, abilities: AbilityPickerAbility[]): AbilityPickerSection[] {
	const active = abilityPickerStyleName(style);
	const sections = new Map<string, AbilityPickerSection>();

	for (const ability of abilities || []) {
		if (!abilityVisibleInStyle(ability, active)) continue;

		const key = String(ability.sectionId || ability.style || "Other");
		let section = sections.get(key);
		if (!section) {
			section = {
				title: abilitySectionTitle(ability),
				abilities: [],
			};
			sections.set(key, section);
		}
		section.abilities.push(ability);
	}

	return Array.from(sections.values());
}

export function renderAbilityPickerIcon(iconSrc: string, iconClass: string, emptyClass: string) {
	if (!iconSrc) return `<span class="${html(`${iconClass} ${emptyClass}`)}"></span>`;
	return `<img class="${html(iconClass)}" src="${html(iconSrc)}" alt="">`;
}

export function renderAbilityPickerOptions(input: {
	style: string;
	abilities: AbilityPickerAbility[];
	selectedAbilityId?: string;
	clearHtml?: string;
	separatorHtml?: string;
	sectionTitleClass?: string;
	renderOption: (ability: AbilityPickerAbility, selectedAbilityId: string) => string;
}) {
	const separator = input.separatorHtml ?? `<div class="ability-menu-separator"></div>`;
	const sectionTitleClass = input.sectionTitleClass || "ability-menu-section-title";
	const selectedAbilityId = String(input.selectedAbilityId || "");

	const sections = abilityPickerSections(input.style, input.abilities)
		.map(section => {
			if (!section.abilities.length) return "";
			return `
				<div class="${html(sectionTitleClass)}">${html(section.title)}</div>
				${section.abilities.map(ability => input.renderOption(ability, selectedAbilityId)).join("")}`;
		})
		.filter(Boolean)
		.join(separator);

	return `${input.clearHtml ? `${input.clearHtml}${separator}` : ""}${sections}`;
}

export function popupAbilityPickerScript() {
	return `
function abilityPickerStyleName(style) {
	const lower = String(style || "").toLowerCase();
	if (lower === "hybrid" || lower === "utility") return "Hybrid";
	const known = ["Melee", "Magic", "Ranged", "Necromancy", "Hybrid"];
	return known.find(candidate => candidate.toLowerCase() === lower) || String(style || "Melee");
}

function abilitySectionTitle(ability) {
	return String(ability && (ability.sectionLabel || ability.sectionId || ability.style) || "Other").replace(/_/g, " ");
}

function abilityVisibleInStyle(ability, activeStyle) {
	const visibility = ability && ability.showInStyles;
	if (!visibility || visibility === "all") return true;
	const active = abilityPickerStyleName(activeStyle);
	return Array.isArray(visibility) && visibility.some(style => abilityPickerStyleName(String(style)) === active);
}

function abilityPickerSections(style, abilities) {
	const active = abilityPickerStyleName(style);
	const sections = new Map();
	for (const ability of abilities || []) {
		if (!abilityVisibleInStyle(ability, active)) continue;
		const key = String(ability && (ability.sectionId || ability.style) || "Other");
		let section = sections.get(key);
		if (!section) {
			section = [abilitySectionTitle(ability), []];
			sections.set(key, section);
		}
		section[1].push(ability);
	}
	return Array.from(sections.values());
}

function abilityPickerById(abilities, id) {
	return (abilities || []).find(a => a.id === id) || null;
}

function abilityPickerIconHtml(ability) {
	if (!ability || !ability.icon) return '<span class="ability-menu-icon ability-menu-icon-empty"></span>';
	return '<img class="ability-menu-icon" src="' + esc(ability.icon) + '" alt="">';
}

function renderAbilityPickerOptions(config) {
	const selected = String(config.selectedAbilityId || "");
	const sections = abilityPickerSections(config.style, config.abilities)
		.map(([title, abilities]) => {
			if (!abilities.length) return "";
			return '<div class="' + esc(config.sectionTitleClass || "section-title") + '">' + esc(title) + '</div>' +
				abilities.map(ability => config.renderOption(ability, selected)).join("");
		})
		.filter(Boolean)
		.join(config.separatorHtml || '<div class="separator"></div>');

	return (config.clearHtml ? config.clearHtml + (config.separatorHtml || '<div class="separator"></div>') : "") + sections;
}
`;
}
