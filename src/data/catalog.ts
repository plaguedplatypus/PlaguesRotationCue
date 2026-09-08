import type { AbilityStyle, RotationCategory } from "../types";

// Add a normal item:
// { id: "item_id", name: "Item Name" }
//
// Add a scannable item:
// { id: "item_id", name: "Item Name", scannable: true }
//
// Add an ability with a cooldown:
// { id: "ability_id", cooldown: 30 }

export type PickerSectionId =
  | "combat"
  | "spell"
  | "aspect"
  | "defensive"
  | "utility"
  | "prayer"
  | "item"
  | "cue";

export type CatalogCategories = "all" | readonly RotationCategory[];

export interface CatalogEntry {
  id: string;
  name?: string;
  cooldown?: number;
  scannable?: boolean;
  icon?: string;
  style?: AbilityStyle;
}

export interface CatalogSection {
  id: string;
  label: string;
  pickerSection: PickerSectionId;
  style?: AbilityStyle;
  assetDirectory: string;
  categories: CatalogCategories;
  defaultScannable?: boolean;
  entries: readonly CatalogEntry[];
}

export interface PickerSectionCatalogEntry {
  id: PickerSectionId;
  label: string;
  icon: string;
  categories: CatalogCategories;
}

export const PICKER_SECTIONS: readonly PickerSectionCatalogEntry[] = [
  { id: "combat", label: "Combat abilities", icon: "./assets/melee.png", categories: "all" },
  { id: "spell", label: "Spells", icon: "./assets/spells/ancient/blood_barrage.png", categories: ["magic", "hybrid"] },
  { id: "aspect", label: "Aspects", icon: "./assets/spells/aspects/vampyrism.png", categories: "all" },
  { id: "defensive", label: "Defensive abilities", icon: "./assets/defensive.png", categories: "all" },
  { id: "utility", label: "Utility abilities", icon: "./assets/const.png", categories: "all" },
  { id: "prayer", label: "Prayers", icon: "./assets/prayer.png", categories: "all" },
  { id: "item", label: "Items", icon: "./assets/items/eof.png", categories: "all" },
  { id: "cue", label: "Cue markers", icon: "./assets/items/marker_phase.png", categories: "all" }
];

export const COMBAT_CATEGORY_PRESENTATION: Readonly<Record<RotationCategory, {
  label: string;
  icon: string;
  style?: AbilityStyle;
}>> = {
  melee: { label: "Melee abilities", icon: "./assets/melee.png", style: "Melee" },
  magic: { label: "Magic abilities", icon: "./assets/magic.png", style: "Magic" },
  ranged: { label: "Ranged abilities", icon: "./assets/ranged.png", style: "Ranged" },
  necro: { label: "Necromancy abilities", icon: "./assets/necromancy.png", style: "Necromancy" },
  hybrid: { label: "Combat abilities", icon: "./assets/hybrid.png" }
};

export const CATALOG_SECTIONS: readonly CatalogSection[] = [
  // COMBAT
  {
    id: "melee",
    label: "Melee abilities",
    pickerSection: "combat",
    style: "Melee",
    assetDirectory: "abilities",
    categories: ["melee", "hybrid"],
    defaultScannable: true,
    entries: [
      { id: "adaptive_strike", cooldown: 5.4 },
      { id: "attack_auto", name: "Melee Auto-Attack" },
      { id: "backhand", cooldown: 15 },
      { id: "barge", cooldown: 20.4 },
      { id: "berserk", cooldown: 60 },
      { id: "bladed_dive", cooldown: 20.4 },
      { id: "chaos_roar", cooldown: 60 },
      { id: "dismember", cooldown: 24 },
      { id: "flurry", cooldown: 20.4 },
      { id: "fury", cooldown: 15 },
      { id: "greater_barge", cooldown: 20.4 },
      { id: "greater_flurry", cooldown: 20.4 },
      { id: "greater_fury", cooldown: 15 },
      { id: "hurricane", cooldown: 20.4 },
      { id: "massacre" },
      { id: "meteor_strike", cooldown: 60 },
      { id: "overpower", cooldown: 30 },
      { id: "pulverise", cooldown: 60 },
      { id: "punish", cooldown: 24 },
      { id: "rend", cooldown: 10.2 },
      { id: "slaughter" },
      { id: "assault", cooldown: 6 }
    ]
  },
  {
    id: "magic",
    label: "Magic abilities",
    pickerSection: "combat",
    style: "Magic",
    assetDirectory: "abilities",
    categories: ["magic", "hybrid"],
    defaultScannable: true,
    entries: [
      { id: "asphyxiate", cooldown: 20.4 },
      { id: "chain", cooldown: 10.2 },
      { id: "combust", cooldown: 18 },
      { id: "concentrated_blast", cooldown: 5.4 },
      { id: "corruption_blast", cooldown: 15 },
      { id: "dragon_breath", cooldown: 7.2 },
      { id: "greater_chain", cooldown: 10.2 },
      { id: "greater_concentrated_blast", cooldown: 5.4 },
      { id: "greater_sonic_wave", cooldown: 15 },
      { id: "greater_sunshine", cooldown: 60 },
      { id: "impact", cooldown: 15 },
      { id: "magic_auto", name: "Magic Auto-Attack" },
      { id: "magma_tempest", cooldown: 21 },
      { id: "omnipower", cooldown: 30 },
      { id: "runic_charge", cooldown: 30 },
      { id: "smoke_tendrils", cooldown: 45 },
      { id: "sonic_wave", cooldown: 15 },
      { id: "sunshine", cooldown: 60 },
      { id: "tsunami", cooldown: 60 },
      { id: "wild_magic", cooldown: 5.4 }
    ]
  },
  {
    id: "ranged",
    label: "Ranged abilities",
    pickerSection: "combat",
    style: "Ranged",
    assetDirectory: "abilities",
    categories: ["ranged", "hybrid"],
    defaultScannable: true,
    entries: [
      { id: "binding_shot", cooldown: 15 },
      { id: "bombardment" },
      { id: "corruption_shot", cooldown: 15 },
      { id: "deadshot", cooldown: 30 },
      { id: "death_swiftness", name: "Death's Swiftness", cooldown: 60 },
      { id: "galeshot", cooldown: 20.4 },
      { id: "greater_death_swiftness", name: "Greater Death's Swiftness", cooldown: 60 },
      { id: "greater_ricochet", cooldown: 10.2 },
      { id: "imbue_shadows", cooldown: 60 },
      { id: "piercing_shot", cooldown: 3 },
      { id: "quiver_ammo_1" },
      { id: "quiver_ammo_2" },
      { id: "ranged_auto", name: "Ranged Auto-Attack" },
      { id: "rapid_fire", cooldown: 20.4 },
      { id: "ricochet", cooldown: 10.2 },
      { id: "shadow_tendrils", cooldown: 45 },
      { id: "snap_shot" },
      { id: "snipe", cooldown: 60 }
    ]
  },
  {
    id: "necromancy",
    label: "Necromancy abilities",
    pickerSection: "combat",
    style: "Necromancy",
    assetDirectory: "abilities",
    categories: ["necro", "hybrid"],
    defaultScannable: true,
    entries: [
      { id: "bloat" },
      { id: "blood_siphon", cooldown: 45 },
      { id: "death_skulls", cooldown: 60 },
      { id: "finger_of_death" },
      { id: "invoke_death", cooldown: 4 },
      { id: "invoke_lob", name: "Invoke Lord of Bones" },
      { id: "life_transfer", cooldown: 45 },
      { id: "living_death", cooldown: 90 },
      { id: "necromancy_auto", name: "Necromancy Auto-Attack" },
      { id: "soul_sap", cooldown: 5.4 },
      { id: "soul_strike" },
      { id: "spectral_scythe", cooldown: 15 },
      { id: "split_soul", cooldown: 60 },
      { id: "threads_of_fate", cooldown: 45 },
      { id: "touch_of_death", cooldown: 14.4 },
      { id: "volley_of_souls" }
    ]
  },
  {
    id: "necromancy_conjures",
    label: "Necromancy conjures",
    pickerSection: "combat",
    style: "Necromancy",
    assetDirectory: "abilities",
    categories: ["necro", "hybrid"],
    defaultScannable: true,
    entries: [
      { id: "command_phantom_guardian", cooldown: 9 },
      { id: "command_putrid_zombie" },
      { id: "command_skeleton_warrior", cooldown: 15 },
      { id: "command_vengeful_ghost" },
      { id: "conjure_phantom_guardian" },
      { id: "conjure_putrid_zombie", cooldown: 30 },
      { id: "conjure_skeleton_warrior" },
      { id: "conjure_undead_army" },
      { id: "conjure_vengeful_ghost" }
    ]
  },

  // SHARED
  {
    id: "defensive",
    label: "Defensive abilities",
    pickerSection: "defensive",
    style: "Defensive",
    assetDirectory: "abilities",
    categories: "all",
    defaultScannable: true,
    entries: [
      { id: "anticipation", cooldown: 24.6 },
      { id: "barricade", cooldown: 60 },
      { id: "bash", cooldown: 15 },
      { id: "cease" },
      { id: "debilitate", cooldown: 30 },
      { id: "devotion", cooldown: 60 },
      { id: "dive", cooldown: 20.4 },
      { id: "divert", cooldown: 30 },
      { id: "escape", cooldown: 20.4 },
      { id: "freedom", cooldown: 30 },
      { id: "immortality", cooldown: 120 },
      { id: "natural_instinct", cooldown: 120 },
      { id: "preparation", cooldown: 20.4 },
      { id: "provoke", cooldown: 10.2 },
      { id: "reflect", cooldown: 30 },
      { id: "rejuvenate", cooldown: 300 },
      { id: "resonance", cooldown: 30 },
      { id: "revenge", cooldown: 45 },
      { id: "surge", cooldown: 20.4 }
    ]
  },
  {
    id: "utility",
    label: "Utility abilities",
    pickerSection: "utility",
    style: "Utility",
    assetDirectory: "abilities",
    categories: "all",
    defaultScannable: true,
    entries: [
      { id: "demon_slayer", cooldown: 60 },
      { id: "dragon_slayer", cooldown: 60 },
      { id: "essence_of_finality", name: "Essence of Finality" },
      { id: "guthixs_blessing", name: "Guthix's Blessing", cooldown: 300 },
      { id: "ice_asylum", cooldown: 300 },
      { id: "ingenuity_of_the_humans", cooldown: 90 },
      { id: "limitless", cooldown: 90 },
      { id: "onslaught", cooldown: 120 },
      { id: "reprisal", cooldown: 60 },
      { id: "sacrifice", cooldown: 30 },
      { id: "shatter", cooldown: 120 },
      { id: "siphon", cooldown: 60 },
      { id: "slayers_insight", name: "Slayer's Insight", cooldown: 120 },
      { id: "storm_shards", cooldown: 30 },
      { id: "transfigure", cooldown: 180 },
      { id: "tuskas_wrath", name: "Tuska's Wrath", cooldown: 15 },
      { id: "undead_slayer", cooldown: 60 },
      { id: "weapon_special_attack" }
    ]
  },

  // MAGIC
  {
    id: "normal_spells",
    label: "Normal spells",
    pickerSection: "spell",
    style: "Magic",
    assetDirectory: "spells/normal",
    categories: ["magic", "hybrid"],
    defaultScannable: true,
    entries: [
      { id: "bind" },
      { id: "confuse" },
      { id: "crumble_undead" },
      { id: "curse" },
      { id: "divine_storm" },
      { id: "enfeeble" },
      { id: "entangle" },
      { id: "snare" },
      { id: "stagger" },
      { id: "vulnerability" },
      { id: "weaken" }
    ]
  },
  {
    id: "ancient_spells",
    label: "Ancient spells",
    pickerSection: "spell",
    style: "Magic",
    assetDirectory: "spells/ancient",
    categories: ["magic", "hybrid"],
    defaultScannable: true,
    entries: [
      { id: "blood_barrage" },
      { id: "blood_blitz" },
      { id: "blood_burst" },
      { id: "blood_rush" },
      { id: "emerald_aurora" },
      { id: "exsanguinate" },
      { id: "ice_barrage" },
      { id: "ice_blitz" },
      { id: "ice_burst" },
      { id: "ice_rush" },
      { id: "incite_fear" },
      { id: "intercept" },
      { id: "opal_aurora" },
      { id: "prism_of_loyalty" },
      { id: "prism_of_restoration" },
      { id: "prism_of_salvation" },
      { id: "ruby_aurora" },
      { id: "sapphire_aurora" },
      { id: "shadow_barrage" },
      { id: "shadow_blitz" },
      { id: "shadow_burst" },
      { id: "shadow_rush" },
      { id: "shield_dome" },
      { id: "smoke_barrage" },
      { id: "smoke_blitz" },
      { id: "smoke_burst" },
      { id: "smoke_cloud" },
      { id: "smoke_rush" }
    ]
  },
  {
    id: "aspects",
    label: "Aspects",
    pickerSection: "aspect",
    style: "Utility",
    assetDirectory: "spells/aspects",
    categories: "all",
    defaultScannable: true,
    entries: [
      { id: "animate_dead" },
      { id: "darkness", style: "Necromancy" },
      { id: "penance" },
      { id: "temporal_anomaly", style: "Magic" },
      { id: "vampyrism" }
    ]
  },

  // OTHER
  {
    id: "prayers",
    label: "Prayers",
    pickerSection: "prayer",
    style: "Utility",
    assetDirectory: "prayers",
    categories: "all",
    defaultScannable: true,
    entries: [
      { id: "deflect_magic" },
      { id: "deflect_ranged" },
      { id: "deflect_melee" },
      { id: "deflect_necro", name: "Deflect Necromancy" },
      { id: "soul_split" },
      { id: "affliction" },
      { id: "anguish" },
      { id: "desolation" },
      { id: "malevolence" },
      { id: "ruination" },
      { id: "sorrow" },
      { id: "torment" },
      { id: "turmoil" },
      { id: "divine_rage" },
      { id: "eclipsed_soul" },
      { id: "protect_magic" },
      { id: "protect_ranged" },
      { id: "protect_melee" },
      { id: "protect_necro", name: "Protect Necromancy"  },
    ]
  },
  {
    id: "items",
    label: "Items",
    pickerSection: "item",
    assetDirectory: "items",
    categories: "all",
    defaultScannable: false,
    entries: [
      { id: "eof", name: "Essence of Finality" },
      { id: "eof_black", name: "Essence of Finality (Black)" },
      { id: "eof_blue", name: "Essence of Finality (Blue)" },
      { id: "eof_green", name: "Essence of Finality (Green)" },
      { id: "eof_pink", name: "Essence of Finality (Pink)" },
      { id: "eof_purp", name: "Essence of Finality (Purple)" },
      { id: "eof_red", name: "Essence of Finality (Red)" },
      { id: "eof_yel", name: "Essence of Finality (Yellow)" },
      { id: "adren", name: "Adrenaline Potion", scannable: true },
      { id: "vitality", name: "Powerburst of Vitality", scannable: true },
      { id: "vuln_bomb", name: "Vulnerability Bomb", scannable: true },
      { id: "bolg", name: "Bow of the Last Guardian" },
      { id: "sgb", name: "Seren God Bow" },
      { id: "ecb", name: "Eldritch Crossbow" },
      { id: "ezk", name: "Ek-ZekKil" },
      { id: "gloomfire", name: "Gloomfire Bow" },
      { id: "emberstaff", name: "Legatus's Emberstaff" },
      { id: "mercy", name: "Varanus's Mercy" },
      { id: "fsoa", name: "Fractured Staff of Armadyl" },
      { id: "roar", name: "Roar of the Awakening" },
      { id: "dark_shard", name: "Dark Shard of Leng" },
      { id: "nox_bow", name: "Noxious Longbow" },
      { id: "nox_scythe", name: "Noxious Scythe" },
      { id: "nox_staff", name: "Noxious Staff" },
    ]
  },
  {
    id: "cue_markers",
    label: "Cue markers",
    pickerSection: "cue",
    assetDirectory: "items",
    categories: "all",
    defaultScannable: false,
    entries: [
      { id: "marker_move", name: "Move" },
      { id: "marker_phase", name: "Phase" },
      { id: "marker_wait", name: "Wait" },
      { id: "weapon_swap", name: "Weapon Swap" }
    ]
  }
];
