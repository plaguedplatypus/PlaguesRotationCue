// Hand-maintained list of rotation-relevant abilities and picker sections.
// The final scan flag in each row is the source of truth for whether the entry is scanned/mapped.

export type PickerKind = "abilities" | "other";
export type CombatStyleName = "Melee" | "Magic" | "Ranged" | "Necromancy" | "Hybrid";
export type SectionVisibility = "all" | readonly CombatStyleName[];

export type AbilityCatalogEntry = {
	id: string;
	name: string;
	style: string;
	cooldown: number;
	scan: boolean;
	picker: PickerKind;
	sectionId: string;
	sectionLabel: string;
	showInStyles: SectionVisibility;
};

type AbilityScanFlag = 0 | 1 | boolean;
type AbilityRow =
	| readonly [id: string, cooldown: number, scan: AbilityScanFlag]
	| readonly [id: string, cooldown: number, nameOverride: string, scan: AbilityScanFlag];

export type AbilityCatalogSection = {
	id: string;
	label: string;
	picker: PickerKind;
	showInStyles: SectionVisibility;
	style?: string;
	entries: readonly AbilityRow[];
};

export const CUE_MARKER_SECTION_ID = "CueMarker";

export const CATALOG_SECTIONS: readonly AbilityCatalogSection[] = [
	{
		id: "Melee",
		label: "Melee abilities",
		picker: "abilities",
		showInStyles: ["Melee", "Hybrid"],
		entries: [
			["attack_auto", 0, "Melee Auto-Attack", 1],
			["adaptive_strike", 5.4, 1],
			["rend", 10.2, 1],
			["fury", 15, 1],
			["greater_fury", 15, 1],
			["backhand", 15, 1],
			["punish", 24, 1],
			["barge", 20.4, 1],
			["greater_barge", 20.4, 1],
			["chaos_roar", 60, 1],
			["bladed_dive", 20.4, 1],
			["assault", 6, 1],
			["hurricane", 20.4, 1],
			["flurry", 20.4, 1],
			["greater_flurry", 20.4, 1],
			["dismember", 24, 1],
			["slaughter", 0, 1],
			["massacre", 0, 1],
			["overpower", 30, 1],
			["pulverise", 60, 1],
			["berserk", 60, 1],
			["meteor_strike", 60, 1],
		],
	},
	{
		id: "Magic",
		label: "Magic abilities",
		picker: "abilities",
		showInStyles: ["Magic", "Hybrid"],
		entries: [
			["magic_auto", 0, "Magic Auto-Attack", 1],
			["runic_charge", 30, 1],
			["sonic_wave", 15, 1],
			["greater_sonic_wave", 15, 1],
			["dragon_breath", 7.2, 1],
			["impact", 15, 1],
			["combust", 18, 1],
			["chain", 10.2, 1],
			["greater_chain", 10.2, 1],
			["concentrated_blast", 5.4, 1],
			["greater_concentrated_blast", 5.4, 1],
			["wild_magic", 5.4, 1],
			["asphyxiate", 20.4, 1],
			["smoke_tendrils", 45, 1],
			["magma_tempest", 21, 1],
			["corruption_blast", 15, 1],
			["omnipower", 30, 1],
			["sunshine", 60, 1],
			["greater_sunshine", 60, 1],
			["tsunami", 60, 1],
		],
	},
	{
		id: "Ranged",
		label: "Ranged abilities",
		picker: "abilities",
		showInStyles: ["Ranged", "Hybrid"],
		entries: [
			["ranged_auto", 0, "Ranged Auto-Attack", 1],
			["imbue_shadows", 60, "Imbue: Shadows", 1],
			["galeshot", 20.4, 1],
			["piercing_shot", 3, 1],
			["binding_shot", 15, 1],
			["ricochet", 10.2, 1],
			["greater_ricochet", 10.2, 1],
			["snap_shot", 0, 1],
			["snipe", 60, 1],
			["bombardment", 0, 1],
			["rapid_fire", 20.4, 1],
			["shadow_tendrils", 45, 1],
			["corruption_shot", 15, 1],
			["deadshot", 30, 1],
			["death_swiftness", 60, "Death's Swiftness", 1],
			["greater_death_swiftness", 60, "Greater Death's Swiftness", 1],
			["quiver_ammo_1", 0, 1],
			["quiver_ammo_2", 0, 1],
		],
	},
	{
		id: "Necromancy",
		label: "Necromancy abilities",
		picker: "abilities",
		showInStyles: ["Necromancy", "Hybrid"],
		entries: [
			["necromancy_auto", 0, "Necromancy Auto-Attack", 1],
			["touch_of_death", 14.4, "Touch of Death", 1],
			["soul_sap", 5.4, 1],
			["finger_of_death", 0, "Finger of Death", 1],
			["blood_siphon", 45, 1],
			["bloat", 0, 1],
			["soul_strike", 0, 1],
			["spectral_scythe", 15, 1],
			["volley_of_souls", 0, "Volley of Souls", 1],
			["death_skulls", 60, 1],
			["living_death", 90, 1],
			["threads_of_fate", 45, "Threads of Fate", 1],
			["life_transfer", 45, 1],
			["split_soul", 60, 1],
			["darkness", 0, 1],
			["invoke_death", 4, 1],
			["invoke_lob", 0, "Invoke Lord of Bones", 1],
		],
	},
	{
		id: "NecromancyConjures",
		label: "Conjures",
		picker: "abilities",
		showInStyles: ["Necromancy", "Hybrid"],
		style: "Necromancy",
		entries: [
			["conjure_undead_army", 0, 1],
			["conjure_phantom_guardian", 0, 1],
			["conjure_putrid_zombie", 30, 1],
			["conjure_skeleton_warrior", 0, 1],
			["conjure_vengeful_ghost", 0, 1],
			["command_phantom_guardian", 9, 1],
			["command_putrid_zombie", 0, 1],
			["command_skeleton_warrior", 15, 1],
			["command_vengeful_ghost", 0, 1],
		],
	},
	{
		id: "Utility",
		label: "Utility",
		picker: "abilities",
		showInStyles: "all",
		entries: [
			["weapon_special_attack", 0, 1],
			["essence_of_finality", 0, "Essence of Finality", 1],
			["cease", 0, 1],
			["dive", 20.4, 1],
			["escape", 20.4, 1],
			["surge", 20.4, 1],
			["anticipation", 24.6, 1],
			["bash", 15, 1],
			["provoke", 10.2, 1],
			["freedom", 30, 1],
			["resonance", 30, 1],
			["divert", 30, 1],
			["preparation", 20.4, 1],
			["devotion", 60, 1],
			["revenge", 45, 1],
			["reflect", 30, 1],
			["debilitate", 30, 1],
			["immortality", 120, 1],
			["rejuvenate", 300, 1],
			["barricade", 60, 1],
			["natural_instinct", 120, 1],
			["sacrifice", 30, 1],
			["siphon", 60, 1],
			["tuskas_wrath", 15, "Tuska's Wrath", 1],
			["storm_shards", 30, 1],
			["shatter", 120, 1],
			["reprisal", 60, 1],
			["onslaught", 120, 1],
			["limitless", 90, 1],
			["slayers_insight", 120, "Slayer's Insight", 1],
			["ingenuity_of_the_humans", 90, "Ingenuity of the Humans", 1],
			["demon_slayer", 60, 1],
			["dragon_slayer", 60, 1],
			["undead_slayer", 60, 1],
		],
	},
	{
		id: "Items",
		label: "Items",
		picker: "other",
		showInStyles: "all",
		entries: [
			["weapon_swap", 0, "Weapon Swap", 0],
			["eof", 0, "EOF (OG)", 0],
			["eof_red", 0, "EOF (Red)", 0],
			["eof_yel", 0, "EOF (Yellow)", 0],
			["eof_blue", 0, "EOF (Blue)", 0],
			["eof_green", 0, "EOF (Green)", 0],
			["eof_purp", 0, "EOF (Purple)", 0],
			["eof_black", 0, "EOF (Black)", 0],
			["eof_pink", 0, "EOF (Pink)", 0],
			["vuln_bomb", 0, "Vulnerability Bomb", 1],
			["adren", 0, "Adrenaline Renewal", 0],
			["vitality", 0, "Powerburst of Vitality", 0],
		],
	},
	{
		id: "Prayers",
		label: "Prayers",
		picker: "other",
		showInStyles: "all",
		entries: [
			["soul_split", 0, "Soul Split", 0],
			["pray_ranged", 0, "Pray Ranged", 0],
			["pray_melee", 0, "Pray Melee", 0],
			["pray_magic", 0, "Pray Magic", 0],
			["pray_necro", 0, "Pray Necromancy", 0],
		],
	},
	{
		id: CUE_MARKER_SECTION_ID,
		label: "Cue markers",
		picker: "other",
		showInStyles: "all",
		entries: [
			["marker_phase", 0, "Phase", 0],
			["marker_wait", 0, "Wait", 0],
			["marker_move", 0, "Move", 0],
		],
	},
];

function abilityNameFromId(id: string) {
	return id
		.split("_")
		.map(word => word ? word[0].toUpperCase() + word.slice(1) : word)
		.join(" ");
}

function abilityScanValue(value: AbilityScanFlag) {
	return Number(value) !== 0;
}

function catalogEntriesFromSections(sections: readonly AbilityCatalogSection[]): readonly AbilityCatalogEntry[] {
	return sections.flatMap(section =>
		section.entries.map(row => {
			const [id, cooldown] = row;
			const nameOverride = typeof row[2] === "string" ? row[2] : undefined;
			const scanFlag = (typeof row[2] === "string" ? row[3] : row[2]) as AbilityScanFlag;

			return {
				id,
				name: nameOverride || abilityNameFromId(id),
				style: section.style || section.id,
				cooldown,
				scan: abilityScanValue(scanFlag),
				picker: section.picker,
				sectionId: section.id,
				sectionLabel: section.label,
				showInStyles: section.showInStyles,
			};
		})
	);
}

export const ALL_CATALOG_ENTRIES: readonly AbilityCatalogEntry[] = catalogEntriesFromSections(CATALOG_SECTIONS);
export const ABILITIES: readonly AbilityCatalogEntry[] = ALL_CATALOG_ENTRIES.filter(entry => entry.picker === "abilities");
export const OTHER: readonly AbilityCatalogEntry[] = ALL_CATALOG_ENTRIES.filter(entry => entry.picker === "other");
