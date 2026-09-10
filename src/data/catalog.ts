import type { Style, Category } from "../types";

// Add a normal item:
// { id: "item_id", name: "Item Name" }
//
// Add a scannable item:
// { id: "item_id", name: "Item Name", scannable: true }
//
// Add an ability with a cooldown:
// { id: "ability_id", cooldownSeconds: 30 }

export type PickerId =
  | "combat"
  | "spell"
  | "aspect"
  | "defensive"
  | "utility"
  | "prayer"
  | "item"
  | "cue";

export type CategoryScope = "all" | readonly Category[];

export interface Entry {
  id: string;
  name?: string;
  cooldownSeconds?: number;
  scannable?: boolean;
  icon?: string;
  style?: Style;
}

export interface Section {
  id: string;
  label: string;
  pickerSection: PickerId;
  style?: Style;
  assetDir: string;
  categories: CategoryScope;
  scanByDefault?: boolean;
  entries: readonly Entry[];
}

export interface Picker {
  id: PickerId;
  label: string;
  icon: string;
  categories: CategoryScope;
}

export interface Sequence {
  abilityIds: readonly string[];
  useTransitions: readonly (readonly [fromAbilityId: string, toAbilityId: string])[];
  /*
  Timer is started by the first cast, hidden while later casts occupy the same slot,
  then exposed on the first-stage icon after the final cast or a timeout.
  */
  cooldownSeconds?: number;
}

/*
These are icons that occupy one physical action-bar slot and keybind.
Only transitions caused by an activation belong in useTransitions; timeout resets should not advance cues.
*/
export const sequences: readonly Sequence[] = [
  {
    abilityIds: ["dismember", "slaughter", "massacre"],
    cooldownSeconds: 24,
    useTransitions: [
      ["dismember", "slaughter"],
      ["slaughter", "massacre"]
    ]
  },
  {
    abilityIds: ["spectral_scythe", "spectral_scythe_2", "spectral_scythe_3"],
    cooldownSeconds: 15,
    useTransitions: [
      ["spectral_scythe", "spectral_scythe_2"],
      ["spectral_scythe_2", "spectral_scythe_3"]
    ]
  },
  {
    abilityIds: ["conjure_skeleton_warrior", "command_skeleton_warrior"],
    useTransitions: [["conjure_skeleton_warrior", "command_skeleton_warrior"]]
  },
  {
    abilityIds: ["conjure_putrid_zombie", "command_putrid_zombie"],
    useTransitions: [["conjure_putrid_zombie", "command_putrid_zombie"]]
  },
  {
    abilityIds: ["conjure_vengeful_ghost", "command_vengeful_ghost"],
    useTransitions: [["conjure_vengeful_ghost", "command_vengeful_ghost"]]
  },
  {
    abilityIds: ["conjure_phantom_guardian", "command_phantom_guardian"],
    useTransitions: [["conjure_phantom_guardian", "command_phantom_guardian"]]
  }
];

export const pickers: readonly Picker[] = [
  { id: "combat", label: "Combat abilities", icon: "./assets/melee.png", categories: "all" },
  { id: "spell", label: "Spells", icon: "./assets/spells/ancient/blood_barrage.png", categories: ["magic", "hybrid"] },
  { id: "aspect", label: "Aspects", icon: "./assets/spells/aspects/vampyrism.png", categories: "all" },
  { id: "defensive", label: "Defensive abilities", icon: "./assets/defensive.png", categories: "all" },
  { id: "utility", label: "Utility abilities", icon: "./assets/const.png", categories: "all" },
  { id: "prayer", label: "Prayers", icon: "./assets/prayer.png", categories: "all" },
  { id: "item", label: "Items", icon: "./assets/items/eof.png", categories: "all" },
  { id: "cue", label: "Cue markers", icon: "./assets/items/marker_phase.png", categories: "all" }
];

export const categoryUi: Readonly<Record<Category, {
  label: string;
  icon: string;
  style?: Style;
}>> = {
  melee: { label: "Melee abilities", icon: "./assets/melee.png", style: "Melee" },
  magic: { label: "Magic abilities", icon: "./assets/magic.png", style: "Magic" },
  ranged: { label: "Ranged abilities", icon: "./assets/ranged.png", style: "Ranged" },
  necro: { label: "Necromancy abilities", icon: "./assets/necromancy.png", style: "Necromancy" },
  hybrid: { label: "Combat abilities", icon: "./assets/hybrid.png" }
};

export const sections: readonly Section[] = [
  // COMBAT
  {
    id: "melee",
    label: "Melee abilities",
    pickerSection: "combat",
    style: "Melee",
    assetDir: "abilities",
    categories: ["melee", "hybrid"],
    scanByDefault: true,
    entries: [
      { id: "adaptive_strike", cooldownSeconds: 5.4 },
      { id: "attack_auto", name: "Melee Auto-Attack" },
      { id: "backhand", cooldownSeconds: 15 },
      { id: "barge", cooldownSeconds: 20.4 },
      { id: "berserk", cooldownSeconds: 60 },
      { id: "bladed_dive", cooldownSeconds: 20.4 },
      { id: "chaos_roar", cooldownSeconds: 60 },
      { id: "dismember", cooldownSeconds: 24 },
      { id: "flurry", cooldownSeconds: 20.4 },
      { id: "fury", cooldownSeconds: 15 },
      { id: "greater_barge", cooldownSeconds: 20.4 },
      { id: "greater_flurry", cooldownSeconds: 20.4 },
      { id: "greater_fury", cooldownSeconds: 15 },
      { id: "hurricane", cooldownSeconds: 20.4 },
      { id: "massacre" },
      { id: "meteor_strike", cooldownSeconds: 60 },
      { id: "overpower", cooldownSeconds: 30 },
      { id: "pulverise", cooldownSeconds: 60 },
      { id: "punish", cooldownSeconds: 24 },
      { id: "rend", cooldownSeconds: 10.2 },
      { id: "slaughter" },
      { id: "assault", cooldownSeconds: 6 }
    ]
  },
  {
    id: "magic",
    label: "Magic abilities",
    pickerSection: "combat",
    style: "Magic",
    assetDir: "abilities",
    categories: ["magic", "hybrid"],
    scanByDefault: true,
    entries: [
      { id: "asphyxiate", cooldownSeconds: 20.4 },
      { id: "chain", cooldownSeconds: 10.2 },
      { id: "combust", cooldownSeconds: 18 },
      { id: "concentrated_blast", cooldownSeconds: 5.4 },
      { id: "corruption_blast", cooldownSeconds: 15 },
      { id: "dragon_breath", cooldownSeconds: 7.2 },
      { id: "greater_chain", cooldownSeconds: 10.2 },
      { id: "greater_concentrated_blast", cooldownSeconds: 5.4 },
      { id: "greater_sonic_wave", cooldownSeconds: 15 },
      { id: "greater_sunshine", cooldownSeconds: 60 },
      { id: "impact", cooldownSeconds: 15 },
      { id: "magic_auto", name: "Magic Auto-Attack" },
      { id: "magma_tempest", cooldownSeconds: 21 },
      { id: "omnipower", cooldownSeconds: 30 },
      { id: "runic_charge", cooldownSeconds: 30 },
      { id: "smoke_tendrils", cooldownSeconds: 45 },
      { id: "sonic_wave", cooldownSeconds: 15 },
      { id: "sunshine", cooldownSeconds: 60 },
      { id: "tsunami", cooldownSeconds: 60 },
      { id: "wild_magic", cooldownSeconds: 5.4 }
    ]
  },
  {
    id: "ranged",
    label: "Ranged abilities",
    pickerSection: "combat",
    style: "Ranged",
    assetDir: "abilities",
    categories: ["ranged", "hybrid"],
    scanByDefault: true,
    entries: [
      { id: "binding_shot", cooldownSeconds: 15 },
      { id: "bombardment" },
      { id: "corruption_shot", cooldownSeconds: 15 },
      { id: "deadshot", cooldownSeconds: 30 },
      { id: "death_swiftness", name: "Death's Swiftness", cooldownSeconds: 60 },
      { id: "galeshot", cooldownSeconds: 20.4 },
      { id: "greater_death_swiftness", name: "Greater Death's Swiftness", cooldownSeconds: 60 },
      { id: "greater_ricochet", cooldownSeconds: 10.2 },
      { id: "imbue_shadows", cooldownSeconds: 60 },
      { id: "piercing_shot", cooldownSeconds: 3 },
      { id: "quiver_ammo_1" },
      { id: "quiver_ammo_2" },
      { id: "ranged_auto", name: "Ranged Auto-Attack" },
      { id: "rapid_fire", cooldownSeconds: 20.4 },
      { id: "ricochet", cooldownSeconds: 10.2 },
      { id: "shadow_tendrils", cooldownSeconds: 45 },
      { id: "snap_shot" },
      { id: "snipe", cooldownSeconds: 60 }
    ]
  },
  {
    id: "necromancy",
    label: "Necromancy abilities",
    pickerSection: "combat",
    style: "Necromancy",
    assetDir: "abilities",
    categories: ["necro", "hybrid"],
    scanByDefault: true,
    entries: [
      { id: "bloat" },
      { id: "blood_siphon", cooldownSeconds: 45 },
      { id: "death_skulls", cooldownSeconds: 60 },
      { id: "finger_of_death" },
      { id: "invoke_death", cooldownSeconds: 4 },
      { id: "invoke_lob", name: "Invoke Lord of Bones" },
      { id: "life_transfer", cooldownSeconds: 45 },
      { id: "living_death", cooldownSeconds: 90 },
      { id: "necromancy_auto", name: "Necromancy Auto-Attack" },
      { id: "soul_sap", cooldownSeconds: 5.4 },
      { id: "soul_strike" },
      { id: "spectral_scythe", cooldownSeconds: 15 },
      { id: "spectral_scythe_2" },
      { id: "spectral_scythe_3" },
      { id: "split_soul", cooldownSeconds: 60 },
      { id: "threads_of_fate", cooldownSeconds: 45 },
      { id: "touch_of_death", cooldownSeconds: 14.4 },
      { id: "volley_of_souls" }
    ]
  },
  {
    id: "necromancy_conjures",
    label: "Necromancy conjures",
    pickerSection: "combat",
    style: "Necromancy",
    assetDir: "abilities",
    categories: ["necro", "hybrid"],
    scanByDefault: true,
    entries: [
      { id: "command_phantom_guardian", cooldownSeconds: 9 },
      { id: "command_putrid_zombie" },
      { id: "command_skeleton_warrior", cooldownSeconds: 15 },
      { id: "command_vengeful_ghost" },
      { id: "conjure_phantom_guardian" },
      { id: "conjure_putrid_zombie", cooldownSeconds: 30 },
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
    assetDir: "abilities",
    categories: "all",
    scanByDefault: true,
    entries: [
      { id: "anticipation", cooldownSeconds: 24.6 },
      { id: "barricade", cooldownSeconds: 60 },
      { id: "bash", cooldownSeconds: 15 },
      { id: "cease" },
      { id: "debilitate", cooldownSeconds: 30 },
      { id: "devotion", cooldownSeconds: 60 },
      { id: "dive", cooldownSeconds: 20.4 },
      { id: "divert", cooldownSeconds: 30 },
      { id: "escape", cooldownSeconds: 20.4 },
      { id: "freedom", cooldownSeconds: 30 },
      { id: "immortality", cooldownSeconds: 120 },
      { id: "natural_instinct", cooldownSeconds: 120 },
      { id: "preparation", cooldownSeconds: 20.4 },
      { id: "provoke", cooldownSeconds: 10.2 },
      { id: "reflect", cooldownSeconds: 30 },
      { id: "rejuvenate", cooldownSeconds: 300 },
      { id: "resonance", cooldownSeconds: 30 },
      { id: "revenge", cooldownSeconds: 45 },
      { id: "surge", cooldownSeconds: 20.4 }
    ]
  },
  {
    id: "utility",
    label: "Utility abilities",
    pickerSection: "utility",
    style: "Utility",
    assetDir: "abilities",
    categories: "all",
    scanByDefault: true,
    entries: [
      { id: "demon_slayer", cooldownSeconds: 60 },
      { id: "dragon_slayer", cooldownSeconds: 60 },
      { id: "essence_of_finality", name: "Essence of Finality" },
      { id: "guthixs_blessing", name: "Guthix's Blessing", cooldownSeconds: 300 },
      { id: "ice_asylum", cooldownSeconds: 300 },
      { id: "ingenuity_of_the_humans", cooldownSeconds: 90 },
      { id: "limitless", cooldownSeconds: 90 },
      { id: "onslaught", cooldownSeconds: 120 },
      { id: "reprisal", cooldownSeconds: 60 },
      { id: "sacrifice", cooldownSeconds: 30 },
      { id: "shatter", cooldownSeconds: 120 },
      { id: "siphon", cooldownSeconds: 60 },
      { id: "slayers_insight", name: "Slayer's Insight", cooldownSeconds: 120 },
      { id: "storm_shards", cooldownSeconds: 30 },
      { id: "transfigure", cooldownSeconds: 180 },
      { id: "tuskas_wrath", name: "Tuska's Wrath", cooldownSeconds: 15 },
      { id: "undead_slayer", cooldownSeconds: 60 },
      { id: "weapon_special_attack" }
    ]
  },

  // MAGIC
  {
    id: "normal_spells",
    label: "Normal spells",
    pickerSection: "spell",
    style: "Magic",
    assetDir: "spells/normal",
    categories: "all",
    scanByDefault: true,
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
    assetDir: "spells/ancient",
    categories: "all",
    scanByDefault: true,
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
    assetDir: "spells/aspects",
    categories: "all",
    scanByDefault: true,
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
    assetDir: "prayers",
    categories: "all",
    scanByDefault: true,
    entries: [
      { id: "deflect_magic" },
      { id: "deflect_melee" },
      { id: "deflect_necro", name: "Deflect Necromancy" },
      { id: "deflect_ranged" },
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
    assetDir: "items",
    categories: "all",
    scanByDefault: false,
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
    assetDir: "items",
    categories: "all",
    scanByDefault: false,
    entries: [
      { id: "marker_move", name: "Move" },
      { id: "marker_phase", name: "Phase" },
      { id: "marker_wait", name: "Wait" },
      { id: "weapon_swap", name: "Weapon Swap" }
    ]
  }
];
