import type { Ability, Style, Category } from "../types";
import { sequences as catalogSequences, sections, categoryUi, pickers, type CategoryScope, type PickerId } from "./catalog";

export type { PickerId } from "./catalog";

export interface CatalogItem {
  id: string;
  name: string;
  icon: string;
  pickerSection: PickerId;
  style?: Style;
  cooldownSeconds?: number;
  scannable: boolean;
}

export interface PickerDef {
  id: PickerId;
  label: string;
  icon: string;
}

interface EntryContext {
  sectionId: string;
  categories: CategoryScope;
}

validate();

const entries = sections.flatMap((section) => section.entries.map((entry) => ({
  id: entry.id,
  name: entry.name ?? titleFromId(entry.id),
  icon: entry.icon ?? `./assets/${section.assetDir}/${entry.id}.png`,
  pickerSection: section.pickerSection,
  style: entry.style ?? section.style,
  cooldownSeconds: entry.cooldownSeconds,
  scannable: entry.scannable ?? section.scanByDefault ?? false,
  sectionId: section.id,
  categories: section.categories
})));

const contextById = new Map<string, EntryContext>(entries.map((entry) => [
  entry.id,
  { sectionId: entry.sectionId, categories: entry.categories }
]));

function toItem(entry: typeof entries[number]): CatalogItem {
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

// Scannable catalog is the source for scanner templates. Can change if something is scanned by adding "scannable: false" to entries.
const scannable = entries
  .filter((entry) => entry.scannable)
  .sort(byName);

export const abilities: Ability[] = scannable.map((entry) => ({
  id: entry.id,
  name: entry.name,
  style: entry.style ?? "Utility",
  icon: entry.icon,
  cooldownSeconds: entry.cooldownSeconds
}));

export const abilityById = new Map(abilities.map((ability) => [ability.id, ability]));

const sequenceById = new Map<string, readonly string[]>();
const nextById = new Map<string, string>();
const cooldownById = new Map<string, number>();
for (const sequence of catalogSequences) {
  if (sequence.abilityIds.length < 2) {
    throw new Error("Action-bar sequences must contain at least two abilities.");
  }
  if (sequence.cooldownSeconds !== undefined && sequence.cooldownSeconds <= 0) {
    throw new Error("Action-bar sequence cooldowns must be greater than zero.");
  }
  for (const abilityId of sequence.abilityIds) {
    if (!abilityById.has(abilityId)) {
      throw new Error(`Action-bar sequence uses unknown or unscannable ability ${abilityId}.`);
    }
    if (sequenceById.has(abilityId)) {
      throw new Error(`Ability ${abilityId} belongs to more than one action-bar sequence.`);
    }
    sequenceById.set(abilityId, sequence.abilityIds);
    if (sequence.cooldownSeconds !== undefined) {
      cooldownById.set(abilityId, sequence.cooldownSeconds);
    }
  }
  for (const [fromAbilityId, toAbilityId] of sequence.useTransitions) {
    if (!sequence.abilityIds.includes(fromAbilityId)
      || !sequence.abilityIds.includes(toAbilityId)) {
      throw new Error(`Action-bar sequence contains invalid transition ${fromAbilityId} -> ${toAbilityId}.`);
    }
    if (nextById.has(fromAbilityId)) {
      throw new Error(`Ability ${fromAbilityId} has more than one action-bar use transition.`);
    }
    nextById.set(fromAbilityId, toAbilityId);
  }
}

export function sequenceFor(abilityId: string): readonly string[] | undefined {
  return sequenceById.get(abilityId);
}

export function bindingId(abilityId: string): string {
  return sequenceFor(abilityId)?.[0] ?? abilityId;
}

export function nextSequenceId(abilityId: string): string | undefined {
  return nextById.get(abilityId);
}

export function sequenceCooldown(abilityId: string): number | undefined {
  return cooldownById.get(abilityId);
}

export const catalog: CatalogItem[] = entries
  .map(toItem)
  .sort(byName);

export const entryById = new Map(catalog.map((entry) => [entry.id, entry]));

export const pickerIds: PickerId[] = pickers.map((section) => section.id);

const pickerById = new Map(pickers.map((section) => [section.id, section]));

export function pickerDef(
  section: PickerId,
  category: Category
): PickerDef {
  if (section === "combat") {
    const presentation = categoryUi[category];
    return { id: section, label: presentation.label, icon: presentation.icon };
  }

  const definition = pickerById.get(section)!;
  return { id: section, label: definition.label, icon: definition.icon };
}

export function pickerSectionsFor(category: Category): PickerId[] {
  return pickers
    .filter((section) => shownIn(section.categories, category))
    .map((section) => section.id);
}

export function entriesForSection(
  section: PickerId,
  category: Category
): CatalogItem[] {
  return catalog.filter((entry) => entry.pickerSection === section
    && shownIn(contextById.get(entry.id)!.categories, category));
}

function shownIn(categories: CategoryScope, category: Category): boolean {
  return categories === "all" || categories.includes(category);
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function titleFromId(id: string): string {
  return id
    .split("_")
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
    .join(" ");
}

function validate(): void {
  const pickerIds = new Set<PickerId>();
  for (const picker of pickers) {
    if (pickerIds.has(picker.id)) throw new Error(`Duplicate picker section ID: ${picker.id}`);
    pickerIds.add(picker.id);
    validateScope(`Picker section ${picker.id}`, picker.categories);
  }

  const sectionIds = new Set<string>();
  const entryIds = new Set<string>();
  for (const section of sections) {
    if (!section.id.trim()) throw new Error("Catalog section IDs cannot be empty.");
    if (sectionIds.has(section.id)) throw new Error(`Duplicate catalog section ID: ${section.id}`);
    if (!pickerIds.has(section.pickerSection)) {
      throw new Error(`Catalog section ${section.id} uses unknown picker section ${section.pickerSection}.`);
    }
    if (!section.assetDir.trim()) {
      throw new Error(`Catalog section ${section.id} must define an asset directory.`);
    }
    if (section.pickerSection !== "item" && section.pickerSection !== "cue" && !section.style) {
      throw new Error(`Catalog section ${section.id} must define an ability style.`);
    }
    sectionIds.add(section.id);
    validateScope(`Catalog section ${section.id}`, section.categories);

    for (const entry of section.entries) {
      if (!entry.id.trim()) throw new Error(`Catalog section ${section.id} contains an empty entry ID.`);
      if (entryIds.has(entry.id)) throw new Error(`Duplicate catalog entry ID: ${entry.id}`);
      entryIds.add(entry.id);
    }
  }
}

function validateScope(owner: string, categories: CategoryScope): void {
  if (categories === "all") return;
  if (!categories.length) throw new Error(`${owner} must include at least one category.`);
}
