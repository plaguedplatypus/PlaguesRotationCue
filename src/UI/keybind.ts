import {
  bindingId,
  nextSequenceId,
  entryById,
  sequenceCooldown,
  sequenceFor
} from "../data/abilityData";
import type { ScanResult, DetectedSlot } from "../types";

const storageId = "rotation-cue.visual-keybinds.v1";

export type Keybinds = Record<string, string>;

export function loadKeybinds(): Keybinds {
  try {
    const stored = JSON.parse(localStorage.getItem(storageId) ?? "null") as unknown;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).flatMap(([abilityId, value]) =>
      typeof value === "string" && value.trim() ? [[abilityId, value.trim()]] : []
    ));
  } catch {
    return {};
  }
}

export function saveKeybinds(keybinds: Keybinds): void {
  localStorage.setItem(storageId, JSON.stringify(keybinds));
}

export function cueLabels(
  abilityId: string,
  keybinds: Keybinds,
  autoAdvance: boolean
): string[] {
  const entry = entryById.get(abilityId);
  const bindId = bindingId(abilityId);
  const keybind = keybinds[bindId] ?? keybinds[abilityId];
  if (!entry || !keybind || entry.pickerSection === "item" || entry.pickerSection === "cue") {
    return ["Alt+1"];
  }
  return autoAdvance && (entry.cooldownSeconds !== undefined
    || sequenceCooldown(abilityId) !== undefined
    || nextSequenceId(abilityId) !== undefined)
    ? [keybind]
    : [keybind, "Alt+1"];
}

export function modalMarkup(
  result: ScanResult | null,
  keybinds: Keybinds,
  scanning: boolean,
  selectedBar: number
): string {
  const recognized = bindableSlots(result);
  const groups = new Map<number, DetectedSlot[]>();
  recognized.forEach((slot) => {
    const slots = groups.get(slot.barIndex) ?? [];
    slots.push(slot);
    groups.set(slot.barIndex, slots);
  });

  const bars = [...groups.entries()].sort(([left], [right]) => left - right);
  const activeBar = groups.has(selectedBar)
    ? selectedBar
    : bars[0]?.[0];
  const slots = activeBar === undefined ? [] : groups.get(activeBar) ?? [];
  const tabs = bars.length
    ? `<div class="visual-keybind-tabs" role="tablist" aria-label="Detected action bars">
        ${bars.map(([barIndex]) => {
          const active = barIndex === activeBar;
          return `<button class="visual-keybind-tab${active ? " is-active" : ""}" type="button"
            id="visual-keybind-tab-${barIndex}" role="tab" aria-selected="${active}"
            aria-controls="visual-keybind-panel-${barIndex}" data-keybind-bar-index="${barIndex}">${barLabel(barIndex)}</button>`;
        }).join("")}
      </div>`
    : "";
  const content = activeBar !== undefined
    ? `<div class="visual-keybind-list" id="visual-keybind-panel-${activeBar}"
        role="tabpanel" aria-labelledby="visual-keybind-tab-${activeBar}">
        ${slots.sort((left, right) => left.slotIndex - right.slotIndex)
          .map((slot) => rowMarkup(slot, keybinds)).join("")}
      </div>`
    : `<p class="visual-keybind-empty">${result
      ? "No bindable abilities were found. Scan the action bars again."
      : "Scan the action bars to load the detected abilities."}</p>`;

  const status = result
    ? `${result.barsFound} bar${result.barsFound === 1 ? "" : "s"} · ${recognized.length} bindable abilit${recognized.length === 1 ? "y" : "ies"}`
    : "No action-bar scan available";

  return `
    <div class="settings-backdrop" id="visual-keybind-backdrop">
      <section class="settings-modal visual-keybind-modal" role="dialog" aria-modal="true" aria-labelledby="visual-keybind-title">
        <header class="settings-modal-header">
          <h2 id="visual-keybind-title">Visual Keybinds</h2>
          <button class="settings-modal-close" id="close-visual-keybinds" type="button" title="Back to settings" aria-label="Back to settings">x</button>
        </header>
        <div class="visual-keybind-toolbar">
          <span>${status}</span>
          <button class="settings-action" id="scan-visual-keybinds" type="button" ${scanning ? "disabled" : ""}>${scanning ? "Scanning…" : "Scan Bars"}</button>
        </div>
        ${tabs}
        <p class="visual-keybind-help">Select a field, then press its keybind. Backspace or Delete clears it; Escape cancels.</p>
        <div class="settings-modal-body visual-keybind-body" tabindex="0">
          ${content}
        </div>
      </section>
    </div>`;
}

function barLabel(barIndex: number): string {
  return barIndex === 1 ? "Main Bar" : `Bar ${barIndex - 1}`;
}

export function bindFields(
  scope: ParentNode,
  onChange: (abilityId: string, keybind: string | null) => void
): void {
  scope.querySelectorAll<HTMLButtonElement>(".visual-keybind-input[data-ability-id]").forEach((button) => {
    const idleText = () => button.dataset.value || "Unbound";
    button.addEventListener("focus", () => {
      button.textContent = "Press key…";
      button.classList.add("is-listening");
    });
    button.addEventListener("blur", () => {
      button.textContent = idleText();
      button.classList.remove("is-listening");
    });
    button.addEventListener("keydown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.key === "Escape") {
        button.blur();
        return;
      }
      const abilityId = button.dataset.abilityId;
      if (!abilityId) return;
      if ((event.key === "Backspace" || event.key === "Delete")
        && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        button.dataset.value = "";
        onChange(abilityId, null);
        button.blur();
        return;
      }
      const keybind = keyFromEvent(event);
      if (!keybind) return;
      button.dataset.value = keybind;
      onChange(abilityId, keybind);
      button.blur();
    });
  });
}

function bindableSlots(result: ScanResult | null): DetectedSlot[] {
  return result?.slots.filter((slot) => {
    if (!slot.accepted || !slot.abilityId) return false;
    const entry = entryById.get(slot.abilityId);
    return entry?.pickerSection !== "item" && entry?.pickerSection !== "cue";
  }) ?? [];
}

function rowMarkup(slot: DetectedSlot, keybinds: Keybinds): string {
  const abilityId = slot.abilityId!;
  const entry = entryById.get(abilityId);
  const bindId = bindingId(abilityId);
  const value = keybinds[bindId] ?? keybinds[abilityId] ?? "";
  const sequence = sequenceFor(abilityId);
  const name = sequence
    ? `${entryById.get(sequence[0])!.name} sequence`
    : entry?.name ?? abilityId;
  const icon = entry?.icon
    ? `<img src="${escapeHtml(entry.icon)}" alt="">`
    : "";
  return `
    <div class="visual-keybind-row">
      ${icon}
      <span class="visual-keybind-ability">
        <strong>${escapeHtml(name)}</strong>
        <small>Slot ${slot.slotIndex}</small>
      </span>
      <button class="visual-keybind-input" type="button" data-ability-id="${escapeHtml(bindId)}"
        data-value="${escapeHtml(value)}" aria-label="Set keybind for ${escapeHtml(name)}">${escapeHtml(value || "Unbound")}</button>
    </div>`;
}

function keyFromEvent(event: KeyboardEvent): string | null {
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return null;
  const key = baseKey(event);
  if (!key) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("S");
  parts.push(key);
  return parts.join("+");
}

function baseKey(event: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5);
  if (/^Numpad\d$/.test(event.code)) return `Num${event.code.slice(6)}`;
  if (/^F\d{1,2}$/.test(event.code)) return event.code;
  const symbolCodes: Record<string, string> = {
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    NumpadAdd: "Num+",
    NumpadSubtract: "Num-",
    NumpadMultiply: "Num*",
    NumpadDivide: "Num/",
    NumpadDecimal: "Num."
  };
  if (symbolCodes[event.code]) return symbolCodes[event.code];
  const names: Record<string, string> = {
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Enter",
    Tab: "Tab",
    Home: "Home",
    End: "End",
    PageUp: "PgUp",
    PageDown: "PgDn",
    Insert: "Ins"
  };
  if (names[event.key]) return names[event.key];
  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  })[char] as string);
}
