import { ABILITIES, CUE_MARKER_SECTION_ID, OTHER } from "./catalog";

export const styles = ["Melee", "Magic", "Ranged", "Necromancy", "Hybrid"];

export type AbilityMeta = {
	id: string;
	name: string;
	style: string;
	cooldown: number;
	scan: boolean;
	picker: "abilities" | "other";
	sectionId: string;
	sectionLabel: string;
	showInStyles: "all" | readonly string[];
	icon?: string;
};

export const CUE_MARKER_STYLE = CUE_MARKER_SECTION_ID;
function abilityIconPath(id: string) {
	return `./assets/abilities/${id}.png`;
}

export function normalizeCombatStyle(style: string) {
	const value = String(style || "").trim();
	if (value.toLowerCase() === "utility") return "Hybrid";
	return styles.find(candidate => candidate.toLowerCase() === value.toLowerCase()) || value;
}

function catalogToAbilityMeta(entries: readonly {
	id: string;
	name: string;
	style: string;
	cooldown: number;
	scan: boolean;
	picker: "abilities" | "other";
	sectionId: string;
	sectionLabel: string;
	showInStyles: "all" | readonly string[];
}[]) {
	return entries.map(ability => ({
		id: ability.id,
		name: ability.name,
		style: ability.style,
		cooldown: Number(ability.cooldown) || 0,
		scan: ability.scan === true,
		picker: ability.picker,
		sectionId: ability.sectionId,
		sectionLabel: ability.sectionLabel,
		showInStyles: ability.showInStyles,
		icon: abilityIconPath(ability.id),
	}));
}

export const abilityLibrary: AbilityMeta[] = catalogToAbilityMeta(ABILITIES);
export const otherAbilityLibrary: AbilityMeta[] = catalogToAbilityMeta(OTHER);
export const allAbilityLibrary: AbilityMeta[] = [...abilityLibrary, ...otherAbilityLibrary];

export const abilityById: Record<string, AbilityMeta> = Object.fromEntries(allAbilityLibrary.map(ability => [ability.id, ability]));
const cueMarkerAbilityIds = new Set(
	allAbilityLibrary
		.filter(ability => ability.sectionId === CUE_MARKER_SECTION_ID)
		.map(ability => ability.id)
);

export type AbilityBehavior = {
	id: string;
	exists: boolean;
	scan: boolean;
	cueMarker: boolean;
	reminder: boolean;
	mappedRequired: boolean;
	canTrainIcon: boolean;
	canBeTrackedAnchor: boolean;
};

const abilityFamilyById: Record<string, string[]> = {};
for (const ability of allAbilityLibrary) {
	if (!ability.id.startsWith("conjure_")) continue;
	const commandId = `command_${ability.id.slice("conjure_".length)}`;
	if (!abilityById[commandId]) continue;

	const family = [ability.id, commandId];
	for (const id of family) abilityFamilyById[id] = family;
}

export function getAbilityMeta(value: any): AbilityMeta | null {
	const id = String(value || "").trim();
	return id ? abilityById[id] || null : null;
}

export function cleanAbilityId(value: any) {
	return getAbilityMeta(value)?.id || "";
}

export function abilityFamilyIds(value: any) {
	const id = cleanAbilityId(value);
	return id ? abilityFamilyById[id] || [id] : [];
}

export function abilityFamilyKey(value: any) {
	return abilityFamilyIds(value)[0] || "";
}

export function isCueMarkerAbilityId(value: any) {
	const id = cleanAbilityId(value);
	return !!id && cueMarkerAbilityIds.has(id);
}

export function isCatalogScanEnabled(value: any) {
	const ability = getAbilityMeta(value);
	return ability?.scan === true;
}

export function isScannableAbilityId(value: any) {
	const ability = getAbilityMeta(value);
	return !!ability && ability.scan === true && !isCueMarkerAbilityId(ability.id);
}

export function isReminderAbilityId(value: any) {
	const ability = getAbilityMeta(value);
	return !!ability && ability.scan !== true && !isCueMarkerAbilityId(ability.id);
}

export function abilityRequiresMapping(value: any) {
	return isScannableAbilityId(value);
}

export function abilityCanTrainIcon(value: any) {
	return isScannableAbilityId(value);
}

export function abilityCanMapToSlot(value: any) {
	const ability = getAbilityMeta(value);
	if (!ability) return false;
	if (isCueMarkerAbilityId(ability.id)) return false;
	if (ability.id === "weapon_swap") return false;
	return ability.scan === true || ability.picker === "other";
}

export function isRotationTrackableAbility(value: any) {
	const ability = getAbilityMeta(value);
	return !!ability &&
		isScannableAbilityId(ability.id) &&
		Number(ability.cooldown || 0) > 2;
}

export function abilityBehavior(value: any): AbilityBehavior {
	const ability = getAbilityMeta(value);
	const id = ability?.id || "";
	const cueMarker = !!id && isCueMarkerAbilityId(id);
	const scan = !!id && ability?.scan === true;
	const scannable = !!id && scan && !cueMarker;
	const reminder = !!id && !scan && !cueMarker;
	return {
		id,
		exists: !!ability,
		scan,
		cueMarker,
		reminder,
		mappedRequired: scannable,
		canTrainIcon: scannable,
		canBeTrackedAnchor: scannable && Number(ability?.cooldown || 0) > 2,
	};
}

export function abilityShownInCombatStyle(ability: AbilityMeta | null | undefined, style: string) {
	if (!ability) return false;
	const visibility = ability.showInStyles;
	if (visibility === "all") return true;
	const active = normalizeCombatStyle(style || "Melee");
	return Array.isArray(visibility) && visibility.some(candidate => normalizeCombatStyle(candidate) === active);
}

export type RotationCooldownGuideEntry = {
	abilityId: string;
	name: string;
	cooldown: number;
	gapSteps: number;
	occurrences: number;
	estimatedRepeatSeconds: number;
	earlyBySeconds: number;
	status: "ok" | "warn" | "early";
};

const AUTHORED_STEP_SECONDS = 1.8;
const COOLDOWN_WARN_SECONDS = 3;

export function rotationCooldownGuide(abilitySteps: any[]): RotationCooldownGuideEntry[] {
	const steps = Array.isArray(abilitySteps)
		? abilitySteps
			.map(cleanAbilityId)
			.filter((id): id is string => !!id && isScannableAbilityId(id))
		: [];
	if (!steps.length) return [];

	const positionsByAbility = new Map<string, number[]>();
	steps.forEach((abilityIdValue: string, index: number) => {
		const positions = positionsByAbility.get(abilityIdValue) || [];
		positions.push(index);
		positionsByAbility.set(abilityIdValue, positions);
	});

	return Array.from(positionsByAbility.entries())
		.map(([abilityIdValue, positions]) => {
			const ability = abilityById[abilityIdValue];
			const cooldown = Number(ability?.cooldown || 0);
			if (!ability || cooldown <= 2 || positions.length < 2) return null;

			const gaps = positions.slice(0, -1).map((position, index) => positions[index + 1] - position);
			const gapSteps = Math.min(...gaps);
			const estimatedRepeatSeconds = Math.round(gapSteps * AUTHORED_STEP_SECONDS * 10) / 10;
			const earlyBySeconds = Math.round(Math.max(0, cooldown - estimatedRepeatSeconds) * 10) / 10;
			const status: RotationCooldownGuideEntry["status"] = earlyBySeconds <= 0.25
				? "ok"
				: earlyBySeconds <= COOLDOWN_WARN_SECONDS
					? "warn"
					: "early";

			return {
				abilityId: abilityIdValue,
				name: ability.name,
				cooldown,
				gapSteps,
				occurrences: positions.length,
				estimatedRepeatSeconds,
				earlyBySeconds,
				status,
				firstPosition: positions[0],
			};
		})
		.filter((entry): entry is RotationCooldownGuideEntry & { firstPosition: number } => !!entry)
		.sort((a, b) => a.firstPosition - b.firstPosition)
		.map(({ firstPosition: _firstPosition, ...entry }) => entry);
}

export function cleanSlotAbilityMap(raw: any, maxSlots = 14) {
	const out: Record<string, string> = {};
	for (const [slotText, value] of Object.entries(raw || {})) {
		const slot = Number(slotText);
		const abilityIdValue = cleanAbilityId(value);
		if (
			!Number.isInteger(slot) ||
			slot < 1 ||
			slot > maxSlots ||
			!abilityIdValue ||
			!abilityCanMapToSlot(abilityIdValue)
		) continue;
		out[String(slot)] = abilityIdValue;
	}
	return out;
}

export function abilityLabel(id: string) {
	return abilityById[id]?.name || String(id || "");
}

export function abilityIconSrc(id: string) {
	return abilityById[id]?.icon || "";
}

export function abilityIconFile(id: string) {
	const src = abilityIconSrc(id);
	const clean = String(src || "").split("?")[0].split("#")[0];
	return clean.split("/").pop() || "";
}
