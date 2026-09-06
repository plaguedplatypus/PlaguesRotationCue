import type { AbilityDefinition, AbilityStyle, RotationCategory } from "../types";

export type PickerSectionId =
  | "combat"
  | "spell"
  | "aspect"
  | "defensive"
  | "utility"
  | "prayer"
  | "item"
  | "cue";

export interface RotationCatalogEntry {
  id: string;
  name: string;
  icon: string;
  pickerSection: PickerSectionId;
  style?: AbilityStyle;
  cooldownSeconds?: number;
  scannable: boolean;
}

export interface PickerSectionDefinition {
  id: PickerSectionId;
  label: string;
  icon: string;
}

type CatalogGroup = {
  style: AbilityStyle;
  ids: string;
  pickerSection?: PickerSectionId;
  assetDirectory?: string;
};

const groups: CatalogGroup[] = [
  {
    style: "Melee",
    ids: `adaptive_strike attack_auto backhand barge berserk bladed_dive chaos_roar dismember flurry fury greater_barge greater_flurry greater_fury hurricane massacre meteor_strike overpower pulverise punish rend slaughter assault`
  },
  {
    style: "Magic",
    ids: `asphyxiate chain combust concentrated_blast corruption_blast dragon_breath greater_chain greater_concentrated_blast greater_sonic_wave greater_sunshine impact magic_auto magma_tempest omnipower runic_charge smoke_tendrils sonic_wave sunshine tsunami wild_magic`
  },
  {
    style: "Ranged",
    ids: `binding_shot bombardment corruption_shot deadshot death_swiftness galeshot greater_death_swiftness greater_ricochet imbue_shadows piercing_shot quiver_ammo_1 quiver_ammo_2 ranged_auto rapid_fire ricochet shadow_tendrils snap_shot snipe`
  },
  {
    style: "Necromancy",
    ids: `bloat blood_siphon command_phantom_guardian command_putrid_zombie command_skeleton_warrior command_vengeful_ghost conjure_phantom_guardian conjure_putrid_zombie conjure_skeleton_warrior conjure_undead_army conjure_vengeful_ghost darkness death_skulls finger_of_death invoke_death invoke_lob life_transfer living_death necromancy_auto soul_sap soul_strike spectral_scythe split_soul threads_of_fate touch_of_death volley_of_souls`
  },
  {
    style: "Defensive",
    ids: `anticipation barricade bash cease debilitate devotion divert escape freedom immortality natural_instinct preparation provoke reflect rejuvenate resonance revenge sacrifice siphon surge dive`
  },
  {
    style: "Utility",
    ids: `demon_slayer dragon_slayer essence_of_finality ingenuity_of_the_humans limitless onslaught pray_magic pray_melee pray_necro pray_ranged reprisal shatter slayers_insight soul_split storm_shards transfigure tuskas_wrath undead_slayer weapon_special_attack`
  },
  {
    style: "Magic",
    pickerSection: "spell",
    assetDirectory: "spells/normal",
    ids: `bind confuse crumble_undead curse divine_storm enfeeble entangle snare stagger temporal_anomaly vulnerability weaken`
  },
  {
    style: "Magic",
    pickerSection: "spell",
    assetDirectory: "spells/ancient",
    ids: `blood_barrage blood_blitz blood_burst blood_rush emerald_aurora exsanguinate ice_barrage ice_blitz ice_burst ice_rush incite_fear intercept opal_aurora prism_of_loyalty prism_of_restoration prism_of_salvation ruby_aurora sapphire_aurora shadow_barrage shadow_blitz shadow_burst shadow_rush shield_dome smoke_barrage smoke_blitz smoke_burst smoke_cloud smoke_rush`
  },
  {
    style: "Utility",
    pickerSection: "aspect",
    assetDirectory: "spells/aspects",
    ids: `animate_dead penance vampyrism`
  }
];

const nameOverrides: Record<string, string> = {
  attack_auto: "Melee Auto-Attack",
  magic_auto: "Magic Auto-Attack",
  ranged_auto: "Ranged Auto-Attack",
  necromancy_auto: "Necromancy Auto-Attack",
  death_swiftness: "Death's Swiftness",
  greater_death_swiftness: "Greater Death's Swiftness",
  essence_of_finality: "Essence of Finality",
  invoke_lob: "Invoke Lord of Bones",
  pray_necro: "Pray Necromancy",
  slayers_insight: "Slayer's Insight",
  tuskas_wrath: "Tuska's Wrath"
};

const cooldowns: Record<string, number> = {
  death_skulls: 60,
  touch_of_death: 14.4,
  soul_sap: 5.4,
  living_death: 90,
  threads_of_fate: 45,
  split_soul: 60,
  sunshine: 60,
  greater_sunshine: 60,
  death_swiftness: 60,
  greater_death_swiftness: 60,
  berserk: 60,
  transfigure: 180,
  devotion: 60,
  resonance: 30,
  freedom: 30,
  surge: 20.4,
  dive: 20.4
};

const prayerIds = new Set([
  "pray_magic",
  "pray_melee",
  "pray_necro",
  "pray_ranged",
  "soul_split"
]);

const manualEntries: RotationCatalogEntry[] = [
  { id: "weapon_swap", name: "Weapon Swap", icon: "./assets/items/weapon_swap.png", pickerSection: "cue", scannable: false },
  { id: "eof", name: "Essence of Finality", icon: "./assets/items/eof.png", pickerSection: "item", scannable: false },
  { id: "eof_red", name: "Essence of Finality (Red)", icon: "./assets/items/eof_red.png", pickerSection: "item", scannable: false },
  { id: "eof_yel", name: "Essence of Finality (Yellow)", icon: "./assets/items/eof_yel.png", pickerSection: "item", scannable: false },
  { id: "eof_blue", name: "Essence of Finality (Blue)", icon: "./assets/items/eof_blue.png", pickerSection: "item", scannable: false },
  { id: "eof_green", name: "Essence of Finality (Green)", icon: "./assets/items/eof_green.png", pickerSection: "item", scannable: false },
  { id: "eof_purp", name: "Essence of Finality (Purple)", icon: "./assets/items/eof_purp.png", pickerSection: "item", scannable: false },
  { id: "eof_black", name: "Essence of Finality (Black)", icon: "./assets/items/eof_black.png", pickerSection: "item", scannable: false },
  { id: "eof_pink", name: "Essence of Finality (Pink)", icon: "./assets/items/eof_pink.png", pickerSection: "item", scannable: false },
  { id: "vuln_bomb", name: "Vulnerability Bomb", icon: "./assets/items/vuln_bomb.png", pickerSection: "item", scannable: true },
  { id: "adren", name: "Adrenaline Potion", icon: "./assets/items/adren.png", pickerSection: "item", scannable: true },
  { id: "vitality", name: "Powerburst of Vitality", icon: "./assets/items/vitality.png", pickerSection: "item", scannable: true },
  { id: "marker_phase", name: "Phase", icon: "./assets/items/marker_phase.png", pickerSection: "cue", scannable: false },
  { id: "marker_wait", name: "Wait", icon: "./assets/items/marker_wait.png", pickerSection: "cue", scannable: false },
  { id: "marker_move", name: "Move", icon: "./assets/items/marker_move.png", pickerSection: "cue", scannable: false }
];

const categoryStyles: Record<Exclude<RotationCategory, "hybrid">, AbilityStyle> = {
  melee: "Melee",
  magic: "Magic",
  ranged: "Ranged",
  necro: "Necromancy"
};

const combatSectionIcons: Record<RotationCategory, string> = {
  melee: "./assets/melee.png",
  magic: "./assets/magic.png",
  ranged: "./assets/ranged.png",
  necro: "./assets/necromancy.png",
  hybrid: "./assets/abilities/weapon_special_attack.png"
};

function titleFromId(id: string): string {
  return id
    .split("_")
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
    .join(" ");
}

function pickerSectionForAbility(style: AbilityStyle, id: string): PickerSectionId {
  if (id === "darkness") return "aspect";
  if (style === "Defensive") return "defensive";
  if (style === "Utility") return prayerIds.has(id) ? "prayer" : "utility";
  return "combat";
}

const scannableCatalog: Array<AbilityDefinition & RotationCatalogEntry> = groups.flatMap(({
  style,
  ids,
  pickerSection,
  assetDirectory = "abilities"
}) =>
  ids.trim().split(/\s+/).map((id) => ({
    id,
    name: nameOverrides[id] ?? titleFromId(id),
    style,
    icon: `./assets/${assetDirectory}/${id}.png`,
    cooldownSeconds: cooldowns[id],
    pickerSection: pickerSection ?? pickerSectionForAbility(style, id),
    scannable: true
  }))
).sort((left, right) => left.name.localeCompare(right.name));

export const abilities: AbilityDefinition[] = scannableCatalog;
export const abilityById = new Map(abilities.map((ability) => [ability.id, ability]));

export const rotationCatalog: RotationCatalogEntry[] = [...scannableCatalog, ...manualEntries]
  .sort((left, right) => left.name.localeCompare(right.name));
export const rotationEntryById = new Map(rotationCatalog.map((entry) => [entry.id, entry]));

export const pickerSectionIds: PickerSectionId[] = [
  "combat",
  "spell",
  "aspect",
  "defensive",
  "utility",
  "prayer",
  "item",
  "cue"
];

export function pickerSectionDefinition(
  section: PickerSectionId,
  category: RotationCategory
): PickerSectionDefinition {
  if (section === "combat") {
    const label = category === "hybrid"
      ? "Combat abilities"
      : `${categoryStyles[category]} abilities`;
    return { id: section, label, icon: combatSectionIcons[category] };
  }
  const definitions: Record<Exclude<PickerSectionId, "combat">, Omit<PickerSectionDefinition, "id">> = {
    spell: { label: "Spells", icon: "./assets/spells/ancient/blood_barrage.png" },
    aspect: { label: "Aspects", icon: "./assets/spells/aspects/vampyrism.png" },
    defensive: { label: "Defensive abilities", icon: "./assets/defensive.png" },
    utility: { label: "Utility abilities", icon: "./assets/const.png" },
    prayer: { label: "Prayers", icon: "./assets/prayer.png" },
    item: { label: "Items", icon: "./assets/items/eof.png" },
    cue: { label: "Cue markers", icon: "./assets/items/marker_phase.png" }
  };
  return { id: section, ...definitions[section] };
}

export function pickerSectionsForCategory(category: RotationCategory): PickerSectionId[] {
  return pickerSectionIds.filter((section) =>
    section !== "spell" || category === "magic" || category === "hybrid"
  );
}

export function catalogEntriesForSection(
  section: PickerSectionId,
  category: RotationCategory
): RotationCatalogEntry[] {
  return rotationCatalog.filter((entry) => {
    if (entry.pickerSection !== section) return false;
    if (section === "spell") return category === "magic" || category === "hybrid";
    if (section !== "combat" || category === "hybrid") return true;
    return entry.style === categoryStyles[category];
  });
}
