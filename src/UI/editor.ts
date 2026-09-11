import {
  entriesForSection,
  pickerDef,
  pickerSectionsFor,
  entryById
} from "../data/abilityData";
import type { PickerId, CatalogItem } from "../data/abilityData";
import {
  loadCollapsedIds,
  saveCollapsedIds
} from "../rotation/storage";
import { parse, serialize } from "../rotation/transfer";
import type { State } from "../state";
import type { Rotation, Category } from "../types";

const labels: Record<Category, string> = {
  melee: "Melee",
  magic: "Magic",
  ranged: "Ranged",
  necro: "Necro",
  hybrid: "Hybrid"
};

const collapsed = new Set(loadCollapsedIds());
let picker: { rotationId: string; replaceIndex: number | null } | null = null;
let deleteId: string | null = null;

export type EditorContext = {
  currentIndex: number;
  canScan: boolean;
  scanning: boolean;
  onScan: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
  onMessage: (message: string) => void;
};

export function renderEditor(
  container: HTMLElement,
  state: State,
  context: EditorContext
): void {
  container.replaceChildren();

  const library = document.createElement("section");
  library.className = "rotation-toolbar";

  const tabs = document.createElement("nav");
  tabs.className = "combat-tabs";
  tabs.setAttribute("aria-label", "Rotation category");
  (Object.keys(labels) as Category[]).forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = category === state.category ? "is-selected" : "";
    button.textContent = labels[category];
    button.addEventListener("click", () => state.selectCategory(category));
    tabs.append(button);
  });

  const header = document.createElement("div");
  header.className = "rotation-library-header";
  const title = document.createElement("div");
  title.innerHTML = `<strong>Rotation library</strong><small>${labels[state.category]}</small>`;
  const addRotation = document.createElement("button");
  addRotation.type = "button";
  addRotation.className = "compact-button";
  addRotation.textContent = "Add New Rotation";
  addRotation.addEventListener("click", () => state.create());
  header.append(title, addRotation);

  library.append(tabs, header);

  const list = document.createElement("div");
  list.className = "rotation-list";
  container.append(library, list);

  const rotations = state.rotations.filter((rotation) => rotation.category === state.category);
  if (!rotations.length) {
    const empty = document.createElement("div");
    empty.className = "rotation-library-empty";
    empty.textContent = `No ${labels[state.category]} rotations yet.`;
    list.append(empty);
  }

  rotations.forEach((rotation, index) => {
    list.append(rotationCard(rotation, index, rotations.length, state, context));
  });

  if (deleteId) {
    const rotation = state.rotations.find((rotation) => rotation.id === deleteId);
    if (rotation) container.append(deletePrompt(rotation, state, context));
    else deleteId = null;
  }
}

function rotationCard(
  rotation: Rotation,
  cardIndex: number,
  cardCount: number,
  state: State,
  context: EditorContext
): HTMLElement {
  const active = rotation.id === state.activeId;
  const isCollapsed = collapsed.has(rotation.id);
  const card = document.createElement("article");
  card.className = `rotation-card${active ? " is-active" : ""}`;

  const header = document.createElement("div");
  header.className = "rotation-card-header";
  const collapse = iconBtn(isCollapsed ? "▸" : "▾", isCollapsed ? "Expand rotation" : "Collapse rotation", () => {
    if (isCollapsed) collapsed.delete(rotation.id);
    else collapsed.add(rotation.id);
    saveCollapsedIds(collapsed);
    renderEditor(card.closest(".rotation-editor") as HTMLElement, state, context);
  });
  const up = iconBtn("↑", "Move rotation up", () => state.moveRotation(rotation.id, -1));
  const down = iconBtn("↓", "Move rotation down", () => state.moveRotation(rotation.id, 1));
  up.disabled = cardIndex === 0;
  down.disabled = cardIndex === cardCount - 1;

  const name = document.createElement("input");
  name.className = "rotation-name-input";
  name.value = rotation.name;
  name.maxLength = 60;
  name.setAttribute("aria-label", "Rotation name");
  name.addEventListener("change", () => state.rename(rotation.id, name.value));

  const activate = document.createElement("button");
  activate.type = "button";
  activate.className = `compact-button${active ? " is-active" : ""}`;
  activate.textContent = active ? "Deactivate" : "Activate";
  activate.title = `${active ? "Deactivate" : "Activate"} ${rotation.name}`;
  activate.setAttribute("aria-label", activate.title);
  activate.addEventListener("click", () => state.toggle(rotation.id));

  const remove = iconBtn("×", `Delete ${rotation.name}`, () => {
    deleteId = rotation.id;
    renderEditor(card.closest(".rotation-editor") as HTMLElement, state, context);
  });
  remove.classList.add("is-danger");
  header.append(collapse, up, down, name, activate, remove);
  card.append(header);
  if (isCollapsed) {
    if (active) {
      const controls = document.createElement("div");
      controls.className = "rotation-collapsed-controls";
      const previous = textBtn("← Previous", context.onPrevious);
      previous.title = "Previous cue";
      const reset = iconBtn("↺", "Reset cue", context.onReset);
      const next = textBtn("Next →", context.onNext);
      next.title = "Next cue";
      controls.append(previous, reset, next);
      card.append(controls);
    }
    return card;
  }

  const meta = document.createElement("div");
  meta.className = "rotation-meta";
  const count = document.createElement("span");
  count.textContent = `${rotation.steps.length} ${rotation.steps.length === 1 ? "ability" : "abilities"}`;
  const actions = document.createElement("div");
  actions.className = "rotation-tools";
  const scan = textBtn(context.scanning ? "Scanning…" : "Scan", context.onScan);
  scan.classList.add("rotation-scan-button");
  scan.disabled = !context.canScan || context.scanning;
  actions.append(
    scan,
    textBtn("Export", () => exportRotation(rotation, context.onMessage)),
    textBtn("Import", () => importRotation(state, context.onMessage))
  );
  if (active) {
    const recovery = document.createElement("div");
    recovery.className = "rotation-recovery-controls";
    recovery.append(
      iconBtn("←", "Previous cue", context.onPrevious),
      iconBtn("↺", "Reset cue", context.onReset),
      iconBtn("→", "Next cue", context.onNext)
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
    sequence.append(stepView(rotation, index, playableIndex, current, state, context));
    if (step.abilityId) playableIndex++;
  });
  card.append(sequence);

  const footer = document.createElement("div");
  footer.className = "rotation-footer";
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
  addStep.title = "Additional steps are not available yet.";
  footer.append(addAbility, addStep);
  card.append(footer);

  if (picker?.rotationId === rotation.id) card.append(pickerView(rotation, state, context));
  return card;
}

function deletePrompt(
  rotation: Rotation,
  state: State,
  context: EditorContext
): HTMLElement {
  const backdrop = document.createElement("div");
  backdrop.className = "settings-backdrop";

  const modal = document.createElement("section");
  modal.className = "settings-modal rotation-delete-modal";
  modal.setAttribute("role", "alertdialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "rotation-delete-title");
  modal.setAttribute("aria-describedby", "rotation-delete-message");

  const heading = document.createElement("header");
  heading.className = "settings-modal-header";
  const title = document.createElement("h2");
  title.id = "rotation-delete-title";
  title.textContent = "Delete rotation?";

  const close = iconBtn("×", "Cancel deletion", cancel);
  close.className = "settings-modal-close";
  heading.append(title, close);

  const body = document.createElement("div");
  body.className = "settings-modal-body rotation-delete-body";
  const message = document.createElement("p");
  message.className = "rotation-delete-message";
  message.id = "rotation-delete-message";
  message.textContent = `Delete “${rotation.name}”?`;

  const actions = document.createElement("div");
  actions.className = "rotation-delete-actions";
  const cancelButton = textBtn("Cancel", cancel);
  const confirmButton = textBtn("Delete", () => {
    deleteId = null;
    collapsed.delete(rotation.id);
    saveCollapsedIds(collapsed);
    if (picker?.rotationId === rotation.id) picker = null;
    state.remove(rotation.id);
  });
  confirmButton.classList.add("rotation-delete-confirm");
  actions.append(cancelButton, confirmButton);
  body.append(message, actions);
  modal.append(heading, body);
  backdrop.append(modal);

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) cancel();
  });
  backdrop.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancel();
  });
  window.setTimeout(() => cancelButton.focus(), 0);
  return backdrop;

  function cancel(): void {
    deleteId = null;
    const editor = backdrop.closest(".rotation-editor") as HTMLElement | null;
    if (editor) renderEditor(editor, state, context);
  }
}

function stepView(
  rotation: Rotation,
  index: number,
  playableIndex: number,
  current: boolean,
  state: State,
  context: EditorContext
): HTMLElement {
  const step = rotation.steps[index];
  const entry = entryById.get(step.abilityId);
  const label = entry?.name ?? (step.abilityId || "Empty ability");
  const element = document.createElement("div");
  element.className = `sequence-step${current ? " is-current" : ""}`;
  element.dataset.rotationId = rotation.id;
  if (step.abilityId) element.dataset.playableIndex = String(playableIndex);
  element.draggable = true;
  element.title = `${index + 1}. ${label}`;

  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "sequence-step-main";
  choose.setAttribute("aria-label", step.abilityId
    ? `Edit step ${index + 1}: ${label}`
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
    renderEditor(element.closest(".rotation-editor") as HTMLElement, state, context);
  });

  const remove = iconBtn("×", `Remove ${label}`, () => state.removeStep(rotation.id, index));
  remove.classList.add("sequence-remove");
  element.append(choose, remove);

  element.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", `${rotation.id}:${index}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    element.classList.add("is-dragging");
  });
  element.addEventListener("dragend", () => element.classList.remove("is-dragging"));
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    const [sourceId, sourceIndex] = (event.dataTransfer?.getData("text/plain") ?? "").split(":");
    if (sourceId === rotation.id) state.moveStep(rotation.id, Number(sourceIndex), index);
  });
  choose.addEventListener("keydown", (event) => {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    state.moveStep(rotation.id, index, index + (event.key === "ArrowLeft" ? -1 : 1));
  });
  return element;
}

function pickerView(rotation: Rotation, state: State, context: EditorContext): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "ability-picker";
  const header = document.createElement("div");
  header.className = "ability-picker-header";
  const title = document.createElement("strong");
  title.textContent = `Edit Step ${(picker?.replaceIndex ?? 0) + 1}`;
  const close = iconBtn("×", "Close ability picker", () => {
    picker = null;
    renderEditor(panel.closest(".rotation-editor") as HTMLElement, state, context);
  });
  header.append(title, close);

  let selectedFilter: PickerId = "combat";
  const filters = document.createElement("div");
  filters.className = "ability-picker-filters";
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Ability type filter");
  const filterButtons = new Map<PickerId, HTMLButtonElement>();

  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = `Search ${pickerDef(selectedFilter, rotation.category).label}`;
  search.setAttribute("aria-label", "Search abilities");
  const results = document.createElement("div");
  results.className = "ability-results";

  const updateResults = (): void => {
    const query = search.value.trim().toLowerCase();
    const matches = entriesForSection(selectedFilter, rotation.category)
      .filter((entry) => !query || `${entry.name} ${entry.style ?? ""}`.toLowerCase().includes(query));
    results.replaceChildren(...matches.map((entry) => abilityButton(entry, () => {
      const replaceIndex = picker?.rotationId === rotation.id ? picker.replaceIndex : null;
      picker = null;
      if (replaceIndex === null) state.addStep(rotation.id, entry.id);
      else state.replaceStep(rotation.id, replaceIndex, entry.id);
    })));
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "ability-picker-empty";
      empty.textContent = `No matching ${pickerDef(selectedFilter, rotation.category).label}.`;
      results.append(empty);
    }
  };

  const selectFilter = (filter: PickerId): void => {
    selectedFilter = filter;
    filterButtons.forEach((button, id) => {
      const selected = id === filter;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    search.placeholder = `Search ${pickerDef(filter, rotation.category).label}`;
    updateResults();
  };

  pickerSectionsFor(rotation.category).forEach((filter) => {
    const definition = pickerDef(filter, rotation.category);
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

  search.addEventListener("input", updateResults);
  updateResults();
  panel.append(header, filters, search, results);
  window.setTimeout(() => search.focus(), 0);
  return panel;
}

function abilityButton(entry: CatalogItem, action: () => void): HTMLButtonElement {
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

function exportRotation(rotation: Rotation, showMessage: (message: string) => void): void {
  const blob = new Blob([serialize(rotation)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName(rotation.name)}.rotation.json`;
  link.click();
  URL.revokeObjectURL(url);
  showMessage(`Exported “${rotation.name}”.`);
}

function importRotation(state: State, showMessage: (message: string) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const rotation = parse(await file.text());
      const existing = state.rotations.some((stored) => stored.id === rotation.id);
      showMessage(existing
        ? `Updated “${rotation.name}” from its matching ID.`
        : `Imported “${rotation.name}”.`);
      state.import(rotation);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The rotation could not be imported.";
      showMessage(message);
    }
  });
  input.click();
}

function safeName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-") || "rotation";
}

function iconBtn(text: string, label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}

function textBtn(text: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}
