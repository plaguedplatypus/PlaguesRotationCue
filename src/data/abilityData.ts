import type { AbilityDefinition, AbilityStyle, RotationCategory } from "../types";
import {
  CATALOG_SECTIONS,
  COMBAT_CATEGORY_PRESENTATION,
  PICKER_SECTIONS,
  type CatalogCategories,
  type PickerSectionId
} from "./catalog";

export type { PickerSectionId } from "./catalog";

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

interface CatalogEntryMetadata {
  catalogSectionId: string;
  categories: CatalogCategories;
}

const VALID_CATEGORIES = new Set<RotationCategory>([
  "melee",
  "magic",
  "ranged",
  "necro",
  "hybrid"
]);

validateCatalog();

const derivedCatalog = CATALOG_SECTIONS.flatMap((section) => section.entries.map((entry) => ({
  id: entry.id,
  name: entry.name ?? titleFromId(entry.id),
  icon: entry.icon ?? `./assets/${section.assetDirectory}/${entry.id}.png`,
  pickerSection: section.pickerSection,
  style: entry.style ?? section.style,
  cooldownSeconds: entry.cooldownSeconds,
  scannable: entry.scannable ?? section.defaultScannable ?? false,
  catalogSectionId: section.id,
  categories: section.categories
})));

const metadataById = new Map<string, CatalogEntryMetadata>(derivedCatalog.map((entry) => [
  entry.id,
  { catalogSectionId: entry.catalogSectionId, categories: entry.categories }
]));

function runtimeEntry(entry: typeof derivedCatalog[number]): RotationCatalogEntry {
  return {
    id: entry.id,
    name: entry.name,
    icon: entry.icon,
    pickerSection: entry.pickerSection,
    style: entry.style,
    cooldownSeconds: entry.cooldownSeconds,
    scannable: entry.scannable
  };
}

// Scannable catalog metadata is the single source of truth for scanner templates.
const abilityCatalog = derivedCatalog
  .filter((entry) => entry.scannable)
  .sort(compareNames);

export const abilities: AbilityDefinition[] = abilityCatalog.map((entry) => ({
  id: entry.id,
  name: entry.name,
  style: entry.style ?? "Utility",
  icon: entry.icon,
  cooldownSeconds: entry.cooldownSeconds
}));

export const abilityById = new Map(abilities.map((ability) => [ability.id, ability]));

export const rotationCatalog: RotationCatalogEntry[] = derivedCatalog
  .map(runtimeEntry)
  .sort(compareNames);

export const rotationEntryById = new Map(rotationCatalog.map((entry) => [entry.id, entry]));

export const pickerSectionIds: PickerSectionId[] = PICKER_SECTIONS.map((section) => section.id);

const pickerSectionById = new Map(PICKER_SECTIONS.map((section) => [section.id, section]));

export function pickerSectionDefinition(
  section: PickerSectionId,
  category: RotationCategory
): PickerSectionDefinition {
  if (section === "combat") {
    const presentation = COMBAT_CATEGORY_PRESENTATION[category];
    return { id: section, label: presentation.label, icon: presentation.icon };
  }

  const definition = pickerSectionById.get(section)!;
  return { id: section, label: definition.label, icon: definition.icon };
}

export function pickerSectionsForCategory(category: RotationCategory): PickerSectionId[] {
  return PICKER_SECTIONS
    .filter((section) => shownInCategory(section.categories, category))
    .map((section) => section.id);
}

export function catalogEntriesForSection(
  section: PickerSectionId,
  category: RotationCategory
): RotationCatalogEntry[] {
  return rotationCatalog.filter((entry) => entry.pickerSection === section
    && shownInCategory(metadataById.get(entry.id)!.categories, category));
}

function shownInCategory(categories: CatalogCategories, category: RotationCategory): boolean {
  return categories === "all" || categories.includes(category);
}

function compareNames(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function titleFromId(id: string): string {
  return id
    .split("_")
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
    .join(" ");
}

function validateCatalog(): void {
  const pickerIds = new Set<PickerSectionId>();
  for (const picker of PICKER_SECTIONS) {
    if (pickerIds.has(picker.id)) throw new Error(`Duplicate picker section ID: ${picker.id}`);
    pickerIds.add(picker.id);
    validateCategories(`Picker section ${picker.id}`, picker.categories);
  }

  const sectionIds = new Set<string>();
  const entryIds = new Set<string>();
  for (const section of CATALOG_SECTIONS) {
    if (!section.id.trim()) throw new Error("Catalog section IDs cannot be empty.");
    if (sectionIds.has(section.id)) throw new Error(`Duplicate catalog section ID: ${section.id}`);
    if (!pickerIds.has(section.pickerSection)) {
      throw new Error(`Catalog section ${section.id} uses unknown picker section ${section.pickerSection}.`);
    }
    if (!section.assetDirectory.trim()) {
      throw new Error(`Catalog section ${section.id} must define an asset directory.`);
    }
    if (section.pickerSection !== "item" && section.pickerSection !== "cue" && !section.style) {
      throw new Error(`Catalog section ${section.id} must define an ability style.`);
    }
    sectionIds.add(section.id);
    validateCategories(`Catalog section ${section.id}`, section.categories);

    for (const entry of section.entries) {
      if (!entry.id.trim()) throw new Error(`Catalog section ${section.id} contains an empty entry ID.`);
      if (entryIds.has(entry.id)) throw new Error(`Duplicate catalog entry ID: ${entry.id}`);
      entryIds.add(entry.id);
    }
  }
}

function validateCategories(owner: string, categories: CatalogCategories): void {
  if (categories === "all") return;
  if (!categories.length) throw new Error(`${owner} must include at least one category.`);
  for (const category of categories) {
    if (!VALID_CATEGORIES.has(category)) throw new Error(`${owner} uses unknown category ${category}.`);
  }
}
