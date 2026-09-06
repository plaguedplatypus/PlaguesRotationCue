import {
  catalogEntriesForSection,
  pickerSectionDefinition,
  pickerSectionsForCategory,
  rotationEntryById
} from "../data/abilities";
import type { PickerSectionId, RotationCatalogEntry } from "../data/abilities";
import {
  loadCollapsedRotationIds,
  saveCollapsedRotationIds
} from "../rotation/storage";
import { parseRotationTransfer, serializeRotation } from "../rotation/transfer";
import type { AppState } from "../state";
import type { Rotation, RotationCategory } from "../types";

const categoryLabels: Record<RotationCategory, string> = {
  melee: "Melee",
  magic: "Magic",
  ranged: "Ranged",
  necro: "Necro",
  hybrid: "Hybrid"
};

const collapsedRotations = new Set(loadCollapsedRotationIds());
let picker: { rotationId: string; replaceIndex: number | null } | null = null;
let transferMessage = "";

export type RotationEditorContext = {
  currentIndex: number;
  canScan: boolean;
  scanInProgress: boolean;
  onScan: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
};

export function renderEditor(
  container: HTMLElement,
  state: AppState,
  context: RotationEditorContext
): void {
  container.replaceChildren();

  const tabs = document.createElement("nav");
  tabs.className = "combat-tabs";
  tabs.setAttribute("aria-label", "Rotation category");
  (Object.keys(categoryLabels) as RotationCategory[]).forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = category === state.selectedCategory ? "is-selected" : "";
    button.textContent = categoryLabels[category];
    button.addEventListener("click", () => state.selectCategory(category));
    tabs.append(button);
  });

  const libraryHeader = document.createElement("div");
  libraryHeader.className = "rotation-library-heading";
  const title = document.createElement("div");
  title.innerHTML = `<strong>Rotation library</strong><small>${categoryLabels[state.selectedCategory]}</small>`;
  const addRotation = document.createElement("button");
  addRotation.type = "button";
  addRotation.className = "compact-button is-primary";
  addRotation.textContent = "Add New Rotation";
  addRotation.addEventListener("click", () => state.createRotation());
  libraryHeader.append(title, addRotation);

  container.append(tabs, libraryHeader);

  if (transferMessage) {
    const message = document.createElement("p");
    message.className = "transfer-message";
    message.textContent = transferMessage;
    container.append(message);
  }

  const categoryRotations = state.rotations.filter((rotation) => rotation.category === state.selectedCategory);
  if (!categoryRotations.length) {
    const empty = document.createElement("div");
    empty.className = "rotation-library-empty";
    empty.textContent = `No ${categoryLabels[state.selectedCategory]} rotations yet.`;
    container.append(empty);
  }

  categoryRotations.forEach((rotation, index) => {
    container.append(renderRotationCard(rotation, index, categoryRotations.length, state, context));
  });
}

function renderRotationCard(
  rotation: Rotation,
  cardIndex: number,
  cardCount: number,
  state: AppState,
  context: RotationEditorContext
): HTMLElement {
  const active = rotation.id === state.activeRotationId;
  const collapsed = collapsedRotations.has(rotation.id);
  const card = document.createElement("article");
  card.className = `rotation-card${active ? " is-active" : ""}`;

  const header = document.createElement("div");
  header.className = "rotation-card-heading";
  const collapse = iconButton(collapsed ? "▸" : "▾", collapsed ? "Expand rotation" : "Collapse rotation", () => {
    if (collapsed) collapsedRotations.delete(rotation.id);
    else collapsedRotations.add(rotation.id);
    saveCollapsedRotationIds(collapsedRotations);
    renderEditor(card.parentElement as HTMLElement, state, context);
  });
  const up = iconButton("↑", "Move rotation up", () => state.moveRotation(rotation.id, -1));
  const down = iconButton("↓", "Move rotation down", () => state.moveRotation(rotation.id, 1));
  up.disabled = cardIndex === 0;
  down.disabled = cardIndex === cardCount - 1;

  const name = document.createElement("input");
  name.className = "rotation-name-input";
  name.value = rotation.name;
  name.maxLength = 60;
  name.setAttribute("aria-label", "Rotation name");
  name.addEventListener("change", () => state.renameRotation(rotation.id, name.value));

  const activate = document.createElement("button");
  activate.type = "button";
  activate.className = `compact-button${active ? " is-active" : ""}`;
  activate.textContent = active ? "Deactivate" : "Activate";
  activate.title = `${active ? "Deactivate" : "Activate"} ${rotation.name}`;
  activate.setAttribute("aria-label", activate.title);
  activate.addEventListener("click", () => state.toggleRotation(rotation.id));

  const remove = iconButton("×", `Delete ${rotation.name}`, () => {
    collapsedRotations.delete(rotation.id);
    saveCollapsedRotationIds(collapsedRotations);
    if (picker?.rotationId === rotation.id) picker = null;
    state.deleteRotation(rotation.id);
  });
  remove.classList.add("is-danger");
  header.append(collapse, up, down, name, activate, remove);
  card.append(header);
  if (collapsed) return card;

  const meta = document.createElement("div");
  meta.className = "rotation-meta";
  const count = document.createElement("span");
  count.textContent = `${rotation.steps.length} ${rotation.steps.length === 1 ? "ability" : "abilities"}`;
  const actions = document.createElement("div");
  actions.className = "rotation-file-actions";
  const scan = smallTextButton(context.scanInProgress ? "Scanning…" : "Scan", context.onScan);
  scan.classList.add("rotation-scan-button");
  scan.disabled = !context.canScan || context.scanInProgress;
  actions.append(scan, smallTextButton("Export", () => exportRotation(rotation)), smallTextButton("Import", () => importRotation(state)));
  if (active) {
    const recovery = document.createElement("div");
    recovery.className = "rotation-recovery-controls";
    recovery.append(
      iconButton("←", "Previous cue", context.onPrevious),
      iconButton("↺", "Reset cue", context.onReset),
      iconButton("→", "Next cue", context.onNext)
    );
    meta.append(count, recovery, actions);
  } else {
    meta.append(count, actions);
  }
  card.append(meta);

  const hint = document.createElement("p");
  hint.className = "rotation-hint";
  hint.textContent = "Click a square for abilities. Hold and drag to reorder entries.";
  card.append(hint);

  const sequence = document.createElement("div");
  sequence.className = "rotation-sequence";
  let playableIndex = 0;
  rotation.steps.forEach((step, index) => {
    const current = active && !!step.abilityId && playableIndex === context.currentIndex;
    sequence.append(renderStep(rotation, index, playableIndex, current, state, context));
    if (step.abilityId) playableIndex++;
  });
  card.append(sequence);

  const footer = document.createElement("div");
  footer.className = "rotation-card-footer";
  const addAbility = document.createElement("button");
  addAbility.type = "button";
  addAbility.className = "compact-button is-primary";
  addAbility.textContent = "+ Add Ability";
  addAbility.addEventListener("click", () => state.addStep(rotation.id, ""));
  const addStep = document.createElement("button");
  addStep.type = "button";
  addStep.className = "compact-button";
  addStep.textContent = "+ Add Step";
  addStep.disabled = true;
  addStep.title = "Additional step types are not part of Rotation Cue Beta yet.";
  footer.append(addAbility, addStep);
  card.append(footer);

  if (picker?.rotationId === rotation.id) card.append(renderAbilityPicker(rotation, state, context));
  return card;
}

function renderStep(
  rotation: Rotation,
  index: number,
  playableIndex: number,
  current: boolean,
  state: AppState,
  context: RotationEditorContext
): HTMLElement {
  const step = rotation.steps[index];
  const entry = rotationEntryById.get(step.abilityId);
  const stepLabel = entry?.name ?? (step.abilityId || "Empty ability");
  const wrapper = document.createElement("div");
  wrapper.className = `sequence-step${current ? " is-current" : ""}`;
  wrapper.dataset.rotationId = rotation.id;
  if (step.abilityId) wrapper.dataset.playableIndex = String(playableIndex);
  wrapper.draggable = true;
  wrapper.title = `${index + 1}. ${stepLabel}`;

  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "sequence-step-main";
  choose.setAttribute("aria-label", step.abilityId
    ? `Edit step ${index + 1}: ${stepLabel}`
    : `Choose ability for step ${index + 1}`);
  const icon = document.createElement("img");
  icon.src = entry?.icon ?? "./assets/empty.png";
  icon.alt = "";
  const number = document.createElement("span");
  number.className = "sequence-number";
  number.textContent = String(index + 1);
  choose.append(icon, number);
  choose.addEventListener("click", () => {
    picker = { rotationId: rotation.id, replaceIndex: index };
    renderEditor(wrapper.closest(".rotation-editor") as HTMLElement, state, context);
  });

  const remove = iconButton("×", `Remove ${stepLabel}`, () => state.removeStep(rotation.id, index));
  remove.classList.add("sequence-remove");
  wrapper.append(choose, remove);

  wrapper.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", `${rotation.id}:${index}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    wrapper.classList.add("is-dragging");
  });
  wrapper.addEventListener("dragend", () => wrapper.classList.remove("is-dragging"));
  wrapper.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  wrapper.addEventListener("drop", (event) => {
    event.preventDefault();
    const [sourceRotationId, sourceIndex] = (event.dataTransfer?.getData("text/plain") ?? "").split(":");
    if (sourceRotationId === rotation.id) state.moveStep(rotation.id, Number(sourceIndex), index);
  });
  choose.addEventListener("keydown", (event) => {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    state.moveStep(rotation.id, index, index + (event.key === "ArrowLeft" ? -1 : 1));
  });
  return wrapper;
}

function renderAbilityPicker(rotation: Rotation, state: AppState, context: RotationEditorContext): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "ability-picker";
  const header = document.createElement("div");
  header.className = "ability-picker-heading";
  const title = document.createElement("strong");
  title.textContent = `Edit Step ${(picker?.replaceIndex ?? 0) + 1}`;
  const close = iconButton("×", "Close ability picker", () => {
    picker = null;
    renderEditor(panel.closest(".rotation-editor") as HTMLElement, state, context);
  });
  header.append(title, close);

  let selectedFilter: PickerSectionId = "combat";
  const filters = document.createElement("div");
  filters.className = "ability-picker-filters";
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Ability type filter");
  const filterButtons = new Map<PickerSectionId, HTMLButtonElement>();

  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = `Search ${pickerSectionDefinition(selectedFilter, rotation.category).label}`;
  search.setAttribute("aria-label", "Search abilities");
  const results = document.createElement("div");
  results.className = "ability-results";

  const drawResults = (): void => {
    const query = search.value.trim().toLowerCase();
    const matches = catalogEntriesForSection(selectedFilter, rotation.category)
      .filter((entry) => !query || `${entry.name} ${entry.style ?? ""}`.toLowerCase().includes(query));
    results.replaceChildren(...matches.map((entry) => abilityOption(entry, () => {
      const replaceIndex = picker?.rotationId === rotation.id ? picker.replaceIndex : null;
      picker = null;
      if (replaceIndex === null) state.addStep(rotation.id, entry.id);
      else state.replaceStep(rotation.id, replaceIndex, entry.id);
    })));
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "picker-empty";
      empty.textContent = `No matching ${pickerSectionDefinition(selectedFilter, rotation.category).label}.`;
      results.append(empty);
    }
  };

  const selectFilter = (filter: PickerSectionId): void => {
    selectedFilter = filter;
    filterButtons.forEach((button, id) => {
      const selected = id === filter;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    search.placeholder = `Search ${pickerSectionDefinition(filter, rotation.category).label}`;
    drawResults();
  };

  pickerSectionsForCategory(rotation.category).forEach((filter) => {
    const definition = pickerSectionDefinition(filter, rotation.category);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ability-picker-filter${filter === selectedFilter ? " is-selected" : ""}`;
    button.title = definition.label;
    button.setAttribute("aria-label", definition.label);
    button.setAttribute("aria-pressed", String(filter === selectedFilter));
    const icon = document.createElement("img");
    icon.src = definition.icon;
    icon.alt = "";
    button.append(icon);
    button.addEventListener("click", () => selectFilter(filter));
    filterButtons.set(filter, button);
    filters.append(button);
  });

  search.addEventListener("input", drawResults);
  drawResults();
  panel.append(header, filters, search, results);
  window.setTimeout(() => search.focus(), 0);
  return panel;
}

function abilityOption(entry: RotationCatalogEntry, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ability-option";
  const image = document.createElement("img");
  image.src = entry.icon;
  image.alt = "";
  const text = document.createElement("span");
  text.textContent = entry.name;
  const plus = document.createElement("b");
  plus.textContent = "+";
  button.append(image, text, plus);
  button.addEventListener("click", action);
  return button;
}

function exportRotation(rotation: Rotation): void {
  const blob = new Blob([serializeRotation(rotation)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(rotation.name)}.rotation.json`;
  link.click();
  URL.revokeObjectURL(url);
  transferMessage = `Exported “${rotation.name}”.`;
}

function importRotation(state: AppState): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const rotation = parseRotationTransfer(await file.text());
      const existing = state.rotations.some((candidate) => candidate.id === rotation.id);
      transferMessage = existing
        ? `Updated “${rotation.name}” from its matching ID.`
        : `Imported “${rotation.name}”.`;
      state.importRotation(rotation);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The rotation could not be imported.";
      transferMessage = message;
      window.alert(message);
    }
  });
  input.click();
}

function safeFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-") || "rotation";
}

function iconButton(text: string, label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}

function smallTextButton(text: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}
