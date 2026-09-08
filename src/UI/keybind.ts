import { rotationEntryById } from "../data/abilityData";
import type { AbilityScanResult, DetectedSlot } from "../types";

const KEYBINDS_KEY = "rotation-cue.visual-keybinds.v1";

export type VisualKeybinds = Record<string, string>;

export function loadVisualKeybinds(): VisualKeybinds {
  try {
    const stored = JSON.parse(localStorage.getItem(KEYBINDS_KEY) ?? "null") as unknown;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).flatMap(([abilityId, value]) =>
      typeof value === "string" && value.trim() ? [[abilityId, value.trim()]] : []
    ));
  } catch {
    return {};
  }
}

export function saveVisualKeybinds(keybinds: VisualKeybinds): void {
  localStorage.setItem(KEYBINDS_KEY, JSON.stringify(keybinds));
}

export function cueKeybindSequence(
  abilityId: string,
  keybinds: VisualKeybinds,
  autoAdvance: boolean
): string[] {
  const entry = rotationEntryById.get(abilityId);
  const keybind = keybinds[abilityId];
  if (!entry || !keybind || entry.pickerSection === "item" || entry.pickerSection === "cue") {
    return ["Alt+1"];
  }
  return autoAdvance && entry.cooldownSeconds !== undefined
    ? [keybind]
    : [keybind, "Alt+1"];
}

export function visualKeybindModalMarkup(
  result: AbilityScanResult | null,
  keybinds: VisualKeybinds,
  scanning: boolean,
  selectedBarIndex: number
): string {
  const recognized = recognizedSlots(result);
  const groups = new Map<number, DetectedSlot[]>();
  recognized.forEach((slot) => {
    const slots = groups.get(slot.barIndex) ?? [];
    slots.push(slot);
    groups.set(slot.barIndex, slots);
  });

  const groupedBars = [...groups.entries()].sort(([left], [right]) => left - right);
  const activeBarIndex = groups.has(selectedBarIndex)
    ? selectedBarIndex
    : groupedBars[0]?.[0];
  const activeSlots = activeBarIndex === undefined ? [] : groups.get(activeBarIndex) ?? [];
  const tabs = groupedBars.length
    ? `<div class="visual-keybind-tabs" role="tablist" aria-label="Detected action bars">
        ${groupedBars.map(([barIndex]) => {
          const active = barIndex === activeBarIndex;
          return `<button class="visual-keybind-tab${active ? " is-active" : ""}" type="button"
            id="visual-keybind-tab-${barIndex}" role="tab" aria-selected="${active}"
            aria-controls="visual-keybind-panel-${barIndex}" data-keybind-bar-index="${barIndex}">${barLabel(barIndex)}</button>`;
        }).join("")}
      </div>`
    : "";
  const content = activeBarIndex !== undefined
    ? `<div class="visual-keybind-list" id="visual-keybind-panel-${activeBarIndex}"
        role="tabpanel" aria-labelledby="visual-keybind-tab-${activeBarIndex}">
        ${activeSlots.sort((left, right) => left.slotIndex - right.slotIndex)
          .map((slot) => visualKeybindRow(slot, keybinds)).join("")}
      </div>`
    : `<p class="visual-keybind-empty">${result
      ? "No bindable abilities were found. Scan the action bars again."
      : "Scan the action bars to load fields for the detected abilities."}</p>`;

  const status = result
    ? `${result.barsFound} bar${result.barsFound === 1 ? "" : "s"} · ${recognized.length} bindable abilit${recognized.length === 1 ? "y" : "ies"}`
    : "No action-bar scan available";

  return `
    <div class="settings-backdrop" id="keybinds-backdrop">
      <section class="settings-modal visual-keybind-modal" role="dialog" aria-modal="true" aria-labelledby="visual-keybind-title">
        <header class="settings-modal-heading">
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

export function bindVisualKeybindFields(
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
      const keybind = keybindFromEvent(event);
      if (!keybind) return;
      button.dataset.value = keybind;
      onChange(abilityId, keybind);
      button.blur();
    });
  });
}

function recognizedSlots(result: AbilityScanResult | null): DetectedSlot[] {
  return result?.slots.filter((slot) => {
    if (!slot.accepted || !slot.abilityId) return false;
    const entry = rotationEntryById.get(slot.abilityId);
    return entry?.pickerSection !== "item" && entry?.pickerSection !== "cue";
  }) ?? [];
}

function visualKeybindRow(slot: DetectedSlot, keybinds: VisualKeybinds): string {
  const abilityId = slot.abilityId!;
  const entry = rotationEntryById.get(abilityId);
  const value = keybinds[abilityId] ?? "";
  const name = entry?.name ?? abilityId;
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
      <button class="visual-keybind-input" type="button" data-ability-id="${escapeHtml(abilityId)}"
        data-value="${escapeHtml(value)}" aria-label="Set keybind for ${escapeHtml(name)}">${escapeHtml(value || "Unbound")}</button>
    </div>`;
}

function keybindFromEvent(event: KeyboardEvent): string | null {
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
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  })[character] as string);
}
