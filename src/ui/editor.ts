import { entriesForSection, pickerDef, pickerSectionsFor, entryById } from "../data/abilityData";
import type { PickerId, CatalogItem } from "../data/abilityData";
import { loadCollapsedIds, saveCollapsedIds } from "../rotation/storage";
import { cueNoteMaxChars, isAbility, isCueNote, type Section, type Step } from "../rotation/steps";
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
let picker: { rotationId: string; section: Section; replaceIndex: number | null } | null = null;
let stepMenu: { rotationId: string; section: Section } | null = null;
let textEditor: { rotationId: string; section: Section; index: number } | null = null;
let focusTextEditor = false;
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

// *** Editor rendering

export function renderEditor(
  container: HTMLElement,
  state: State,
  context: EditorContext
): void {
  const scrollTop = container.querySelector<HTMLElement>(".rotation-list")?.scrollTop;
  let foundExpanded = false;
  let collapsedChanged = false;
  state.rotations.forEach((rotation) => {
    if (collapsed.has(rotation.id)) return;
    if (!foundExpanded) {
      foundExpanded = true;
      return;
    }
    collapsed.add(rotation.id);
    collapsedChanged = true;
  });
  if (collapsedChanged) saveCollapsedIds(collapsed);
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
  title.innerHTML = "<strong>Rotation library</strong>";
  const addRotation = document.createElement("button");
  addRotation.type = "button";
  addRotation.className = "compact-button";
  addRotation.textContent = "Add New Rotation";
  addRotation.addEventListener("click", () => {
    state.rotations.forEach((rotation) => collapsed.add(rotation.id));
    if (textEditor) textEditor = null;
    saveCollapsedIds(collapsed);
    state.create();
  });
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

  if (scrollTop !== undefined) list.scrollTop = scrollTop;
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
  card.className = `rotation-card ${isCollapsed ? "is-collapsed" : "is-expanded"}${active ? " is-active" : ""}`;

  const header = document.createElement("div");
  header.className = "rotation-card-header";
  const collapse = iconBtn(isCollapsed ? "▸" : "▾", isCollapsed ? "Expand rotation" : "Collapse rotation", () => {
    if (isCollapsed) {
      state.rotations.forEach((item) => {
        if (item.id === rotation.id) collapsed.delete(item.id);
        else collapsed.add(item.id);
      });
      if (textEditor?.rotationId !== rotation.id) textEditor = null;
    } else {
      collapsed.add(rotation.id);
      if (textEditor?.rotationId === rotation.id) textEditor = null;
    }
    saveCollapsedIds(collapsed);
    renderEditor(card.closest(".rotation-editor") as HTMLElement, state, context);
  });
  collapse.setAttribute("aria-expanded", String(!isCollapsed));
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
  if (deleteId === rotation.id) {
    card.classList.add("has-delete-prompt");
    card.append(deletePrompt(rotation, state, context, remove));
  }
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
  const abilityCount = [...(rotation.once ?? []), ...rotation.steps]
    .filter((step) => isAbility(step) && !!step.abilityId).length;
  count.textContent = `${abilityCount} ${abilityCount === 1 ? "ability" : "abilities"}`;
  const countGroup = document.createElement("div");
  countGroup.className = "rotation-count";
  const help = document.createElement("span");
  const helpText = "Click a square for abilities. Hold and drag to reorder entries.";
  help.className = "rotation-help-icon";
  help.setAttribute("role", "img");
  help.setAttribute("aria-label", helpText);
  help.title = helpText;
  help.textContent = "?";
  countGroup.append(count, help);
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
    meta.append(countGroup, recovery, actions);
  } else {
    meta.append(countGroup, actions);
  }
  card.append(meta);

  let playableIndex = 0;
  if (rotation.once) {
    playableIndex = appendSection(card, rotation, "once", playableIndex, active, state, context);
  }
  appendSection(card, rotation, "repeat", playableIndex, active, state, context);

  if (picker?.rotationId === rotation.id) {
    card.classList.add("has-ability-picker");
    card.append(pickerView(rotation, state, context));
  }
  return card;
}

// *** Rotation sections

function appendSection(
  card: HTMLElement,
  rotation: Rotation,
  section: Section,
  playableIndex: number,
  active: boolean,
  state: State,
  context: EditorContext
): number {
  const content = section === "once" ? rotation.once ?? [] : rotation.steps;
  const wrapper = document.createElement("section");
  wrapper.className = "rotation-section";

  if (rotation.once) {
    const header = document.createElement("div");
    header.className = "rotation-section-header";
    const label = document.createElement("strong");
    label.textContent = section === "once" ? "Run-Once:" : "Rotation:";
    header.append(label);
    if (section === "once") {
      const remove = textBtn("Remove", () => {
        if (textEditor?.rotationId === rotation.id) textEditor = null;
        state.removeOnce(rotation.id);
      });
      remove.classList.add("is-danger");
      header.append(remove);
    }
    wrapper.append(header);
  }

  const sequence = document.createElement("div");
  sequence.className = "rotation-sequence";
  content.forEach((step, index) => {
    const current = active && isAbility(step) && !!step.abilityId
      && playableIndex === context.currentIndex;
    sequence.append(...stepView(rotation, section, index, playableIndex, current, state, context));
    if (isAbility(step) && step.abilityId) playableIndex += 1;
  });
  sequence.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  sequence.addEventListener("drop", (event) => {
    event.preventDefault();
    const source = readDrag(event);
    if (source?.rotationId === rotation.id) {
      state.moveStep(rotation.id, source.section, source.index, section, content.length);
    }
  });
  wrapper.append(sequence, sectionFooter(rotation, section, state, context));
  card.append(wrapper);
  return playableIndex;
}

function sectionFooter(
  rotation: Rotation,
  section: Section,
  state: State,
  context: EditorContext
): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "rotation-footer";
  const addAbility = document.createElement("button");
  addAbility.type = "button";
  addAbility.className = "compact-button is-primary";
  addAbility.dataset.pickerSection = section;
  addAbility.textContent = "+ Add Ability";
  addAbility.addEventListener("click", () => state.addMore(rotation.id, { abilityId: "" }, section));
  const addMore = document.createElement("button");
  addMore.type = "button";
  addMore.className = "compact-button";
  addMore.textContent = "+ More";
  addMore.addEventListener("click", () => {
    stepMenu = stepMenu?.rotationId === rotation.id && stepMenu.section === section
      ? null
      : { rotationId: rotation.id, section };
    renderEditor(footer.closest(".rotation-editor") as HTMLElement, state, context);
  });
  const moreHelp = document.createElement("span");
  const moreHelpText = [
    "Run-Once: Runs once before the repeating rotation begins.",
    "Cue Note: Shows a custom message below the next playable cue.",
    "Editor Note: Adds a editor note inside the rotation."
  ].join("\n");
  moreHelp.className = "rotation-help-icon";
  moreHelp.setAttribute("role", "img");
  moreHelp.setAttribute("aria-label", moreHelpText);
  moreHelp.title = moreHelpText;
  moreHelp.textContent = "?";
  footer.append(addAbility, addMore, moreHelp);

  if (stepMenu?.rotationId === rotation.id && stepMenu.section === section) {
    const menu = document.createElement("div");
    menu.className = "step-menu";
    if (!rotation.once) {
      menu.append(textBtn("Run-Once", () => {
        stepMenu = null;
        state.addOnce(rotation.id);
      }));
    }
    menu.append(
      textBtn("Cue Note", () => addText("cue-note")),
      textBtn("Editor Note", () => addText("note"))
    );
    footer.append(menu);
  }
  return footer;

  function addText(type: "cue-note" | "note"): void {
    stepMenu = null;
    state.addMore(rotation.id, { type, text: "" }, section);
  }
}

// *** Rotation deletion

function deletePrompt(
  rotation: Rotation,
  state: State,
  context: EditorContext,
  anchor: HTMLElement
): HTMLElement {
  const prompt = document.createElement("section");
  prompt.className = "rotation-delete-popover";
  prompt.setAttribute("role", "alertdialog");
  prompt.setAttribute("aria-labelledby", "rotation-delete-message");
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
    if (textEditor?.rotationId === rotation.id) textEditor = null;
    state.remove(rotation.id);
  });
  confirmButton.classList.add("rotation-delete-confirm");
  actions.append(cancelButton, confirmButton);
  prompt.append(message, actions);

  prompt.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancel();
  });
  window.setTimeout(() => {
    if (!prompt.isConnected) return;
    const card = prompt.closest<HTMLElement>(".rotation-card");
    if (!card) return;
    const gap = 4;
    const cardRect = card.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const maxLeft = Math.max(gap, card.clientWidth - prompt.offsetWidth - gap);
    prompt.style.left = `${Math.max(gap, Math.min(anchorRect.right - cardRect.left - prompt.offsetWidth, maxLeft))}px`;
    let top = anchorRect.bottom - cardRect.top + gap;
    const listBottom = card.closest(".rotation-list")?.getBoundingClientRect().bottom ?? window.innerHeight;
    if (cardRect.top + top + prompt.offsetHeight > Math.min(window.innerHeight, listBottom)) {
      const above = anchorRect.top - cardRect.top - prompt.offsetHeight - gap;
      if (above >= gap) top = above;
    }
    prompt.style.top = `${top}px`;
    cancelButton.focus();
  }, 0);
  return prompt;

  function cancel(): void {
    deleteId = null;
    const editor = prompt.closest(".rotation-editor") as HTMLElement | null;
    if (editor) renderEditor(editor, state, context);
  }
}

// *** Sequence entries

function stepView(
  rotation: Rotation,
  section: Section,
  index: number,
  playableIndex: number,
  current: boolean,
  state: State,
  context: EditorContext
): HTMLElement[] {
  const step = section === "once" ? rotation.once![index] : rotation.steps[index];
  if (!isAbility(step)) return textStepView(rotation, section, index, step, state, context);
  const entry = entryById.get(step.abilityId);
  const label = entry?.name ?? (step.abilityId || "Empty ability");
  const element = document.createElement("div");
  element.className = `sequence-step${current ? " is-current" : ""}`;
  element.dataset.rotationId = rotation.id;
  element.dataset.section = section;
  element.dataset.stepIndex = String(index);
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
  number.textContent = String(playableIndex + 1);
  choose.append(icon, number);
  choose.addEventListener("click", () => {
    picker = { rotationId: rotation.id, section, replaceIndex: index };
    renderEditor(element.closest(".rotation-editor") as HTMLElement, state, context);
  });

  const remove = iconBtn("×", `Remove ${label}`, () => state.removeStep(rotation.id, section, index));
  remove.classList.add("sequence-remove");
  element.append(choose, remove);

  bindDrag(element, rotation.id, section, index, state);
  choose.addEventListener("keydown", (event) => {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    state.moveStep(rotation.id, section, index, section, index + (event.key === "ArrowLeft" ? -1 : 1));
  });
  return [element];
}

// *** Cue Note editor

function textStepView(
  rotation: Rotation,
  section: Section,
  index: number,
  step: Exclude<Step, { abilityId: string }>,
  state: State,
  context: EditorContext
): HTMLElement[] {
  const cueNote = isCueNote(step);
  if (!cueNote) return noteView(rotation, section, index, step, state, context);
  const expanded = textEditor?.rotationId === rotation.id
    && textEditor.section === section
    && textEditor.index === index;
  const element = document.createElement("div");
  element.className = "sequence-step sequence-text-tile";
  element.draggable = true;

  const open = document.createElement("button");
  open.type = "button";
  open.className = `sequence-step-main sequence-text-main ${cueNote ? "is-cue-note" : "is-note"}`;
  open.textContent = cueNote ? "Cue Note" : "Note";
  open.setAttribute("aria-label", `${expanded ? "Collapse" : "Edit"} ${cueNote ? "Cue Note" : "Note"}`);
  element.append(open);
  bindDrag(element, rotation.id, section, index, state);

  let input: HTMLTextAreaElement | null = null;
  open.addEventListener("click", () => {
    if (expanded) {
      textEditor = null;
      state.replaceStep(rotation.id, section, index, { ...step, text: input?.value ?? step.text });
      return;
    }
    textEditor = { rotationId: rotation.id, section, index };
    focusTextEditor = true;
    renderEditor(element.closest(".rotation-editor") as HTMLElement, state, context);
  });

  if (!expanded) return [element];

  const editor = document.createElement("div");
  editor.className = `sequence-text-editor ${cueNote ? "is-cue-note" : "is-note"}`;
  const header = document.createElement("div");
  header.className = "sequence-text-editor-header";
  const title = document.createElement("strong");
  title.textContent = cueNote ? "Cue Note" : "Note";
  const close = textBtn("Done", () => {
    textEditor = null;
    state.replaceStep(rotation.id, section, index, { ...step, text: input?.value ?? step.text });
  });
  close.title = `Save and collapse ${cueNote ? "Cue Note" : "Note"}`;
  close.addEventListener("mousedown", (event) => event.preventDefault());
  const remove = iconBtn("×", "Remove Cue Note", () => {
    textEditor = null;
    state.removeStep(rotation.id, section, index);
  });
  remove.classList.add("is-danger");
  remove.addEventListener("mousedown", (event) => event.preventDefault());
  const actions = document.createElement("div");
  actions.className = "sequence-text-editor-actions";
  actions.append(close, remove);
  header.append(title, actions);

  const editorInput = document.createElement("textarea");
  input = editorInput;
  editorInput.rows = 1;
  editorInput.maxLength = cueNoteMaxChars;
  editorInput.value = step.text;
  editorInput.placeholder = cueNote ? "Notes/Instructions" : "Rotation note";
  editorInput.setAttribute("aria-label", cueNote ? "Cue Note" : "Note");
  editorInput.addEventListener("change", () => {
    const text = editorInput.value;
    window.setTimeout(() => {
      const current = state.rotations.find((item) => item.id === rotation.id);
      if (!current) return;
      const onceIndex = current.once?.indexOf(step) ?? -1;
      const repeatIndex = current.steps.indexOf(step);
      if (onceIndex >= 0) state.replaceStep(rotation.id, "once", onceIndex, { ...step, text });
      else if (repeatIndex >= 0) state.replaceStep(rotation.id, "repeat", repeatIndex, { ...step, text });
    }, 0);
  });
  editorInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close.click();
      return;
    }
    if (!event.ctrlKey || event.key !== "Enter") return;
    event.preventDefault();
    close.click();
  });
  const helper = document.createElement("small");
  helper.textContent = "Shown below the next playable cue.";
  editor.append(header, editorInput, helper);
  const shouldFocus = focusTextEditor;
  focusTextEditor = false;
  window.setTimeout(() => {
    if (!element.isConnected) return;
    const sequence = element.parentElement;
    const card = element.closest(".rotation-card");
    if (!sequence || !card) return;
    card.classList.add("has-cue-note-editor");
    editor.style.left = `${Math.min(element.offsetLeft, Math.max(0, sequence.clientWidth - editor.offsetWidth))}px`;
    editor.style.top = `${element.offsetTop + element.offsetHeight + 3}px`;
    if (shouldFocus) editorInput.focus();
  }, 0);
  return [element, editor];
}

// *** Note editor

function noteView(
  rotation: Rotation,
  section: Section,
  index: number,
  step: Exclude<Step, { abilityId: string }>,
  state: State,
  context: EditorContext
): HTMLElement[] {
  const editing = textEditor?.rotationId === rotation.id
    && textEditor.section === section
    && textEditor.index === index;
  const row = document.createElement("div");
  row.className = `sequence-note${editing ? " is-editing" : ""}`;
  row.draggable = !editing;
  bindDrag(row, rotation.id, section, index, state);

  const label = document.createElement("span");
  label.className = "sequence-note-label";
  label.textContent = "Note:";

  if (!editing) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "sequence-note-open";
    const text = document.createElement("span");
    text.className = "sequence-note-text";
    text.textContent = step.text || "Click to Add note text";
    open.append(label, text);
    open.addEventListener("click", () => {
      textEditor = { rotationId: rotation.id, section, index };
      focusTextEditor = true;
      renderEditor(row.closest(".rotation-editor") as HTMLElement, state, context);
    });
    row.append(open);
    return [row];
  }

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 500;
  input.value = step.text;
  input.placeholder = "Rotation note";
  input.setAttribute("aria-label", "Note");
  input.addEventListener("change", () => {
    const text = input.value;
    window.setTimeout(() => {
      const current = state.rotations.find((item) => item.id === rotation.id);
      if (!current) return;
      const onceIndex = current.once?.indexOf(step) ?? -1;
      const repeatIndex = current.steps.indexOf(step);
      if (onceIndex >= 0) state.replaceStep(rotation.id, "once", onceIndex, { ...step, text });
      else if (repeatIndex >= 0) state.replaceStep(rotation.id, "repeat", repeatIndex, { ...step, text });
    }, 0);
  });

  const done = textBtn("Done", () => {
    textEditor = null;
    state.replaceStep(rotation.id, section, index, { ...step, text: input.value });
  });
  done.addEventListener("mousedown", (event) => event.preventDefault());
  const remove = iconBtn("×", "Remove Note", () => {
    textEditor = null;
    state.removeStep(rotation.id, section, index);
  });
  remove.classList.add("is-danger");
  remove.addEventListener("mousedown", (event) => event.preventDefault());
  input.addEventListener("keydown", (event) => {
    if (!event.ctrlKey || event.key !== "Enter") return;
    event.preventDefault();
    done.click();
  });
  row.append(label, input, done, remove);
  if (focusTextEditor) {
    focusTextEditor = false;
    window.setTimeout(() => input.focus(), 0);
  }
  return [row];
}

// *** Drag and drop

function bindDrag(
  element: HTMLElement,
  rotationId: string,
  section: Section,
  index: number,
  state: State
): void {
  element.addEventListener("dragstart", (event) => {
    if (textEditor?.rotationId === rotationId) textEditor = null;
    event.dataTransfer?.setData("text/plain", `${rotationId}|${section}|${index}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    element.classList.add("is-dragging");
  });
  element.addEventListener("dragend", () => element.classList.remove("is-dragging"));
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const source = readDrag(event);
    if (source?.rotationId === rotationId) {
      state.moveStep(rotationId, source.section, source.index, section, index);
    }
  });
}

function readDrag(event: DragEvent): { rotationId: string; section: Section; index: number } | null {
  const [rotationId, section, rawIndex] = (event.dataTransfer?.getData("text/plain") ?? "").split("|");
  const index = Number(rawIndex);
  return rotationId && (section === "once" || section === "repeat") && Number.isInteger(index)
    ? { rotationId, section, index }
    : null;
}

// *** Ability picker

function pickerView(rotation: Rotation, state: State, context: EditorContext): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "ability-picker";
  const header = document.createElement("div");
  header.className = "ability-picker-header";
  const title = document.createElement("strong");
  title.textContent = "Edit Ability";
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
      const section = picker?.rotationId === rotation.id ? picker.section : "repeat";
      picker = null;
      if (replaceIndex === null) state.addMore(rotation.id, { abilityId: entry.id }, section);
      else state.replaceStep(rotation.id, section, replaceIndex, { abilityId: entry.id });
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
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close.click();
  });
  updateResults();
  panel.append(header, filters, search, results);
  window.setTimeout(() => {
    if (!panel.isConnected) return;
    const card = panel.closest<HTMLElement>(".rotation-card");
    const current = picker?.rotationId === rotation.id ? picker : null;
    if (!card || !current) return;
    const anchor = current.replaceIndex === null
      ? card.querySelector<HTMLElement>(`[data-picker-section="${current.section}"]`)
      : card.querySelector<HTMLElement>(`.sequence-step[data-section="${current.section}"][data-step-index="${current.replaceIndex}"]`);
    if (!anchor) return;
    const gap = 4;
    const cardRect = card.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const maxLeft = Math.max(gap, card.clientWidth - panel.offsetWidth - gap);
    panel.style.left = `${Math.max(gap, Math.min(anchorRect.left - cardRect.left, maxLeft))}px`;
    let top = anchorRect.bottom - cardRect.top + gap;
    const listBottom = card.closest(".rotation-list")?.getBoundingClientRect().bottom ?? window.innerHeight;
    if (cardRect.top + top + panel.offsetHeight > Math.min(window.innerHeight, listBottom)) {
      const above = anchorRect.top - cardRect.top - panel.offsetHeight - gap;
      if (above >= gap) top = above;
    }
    panel.style.top = `${top}px`;
    search.focus();
  }, 0);
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

// *** Import and export

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
