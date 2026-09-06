import type { ScreenPoint } from "../types";
import { ROTATION_CUE_VERSION } from "../updates/updateNotes";

const SETTINGS_KEY = "rotation-cue.interface-settings.v1";

export interface RotationCueSettings {
  autoAdvanceRotation: boolean;
  loopRotationAtEnd: boolean;
  showCueOverlay: boolean;
  overlayPosition: ScreenPoint | null;
  cueScale: number;
  upcomingAbilities: number;
  cueBorderThickness: number;
  cueBorderColor: string;
  overlayOpacity: number;
  showAbilityNames: boolean;
  showNextLabel: boolean;
  showDiagnostics: boolean;
}

const defaultSettings: RotationCueSettings = {
  autoAdvanceRotation: true,
  loopRotationAtEnd: true,
  showCueOverlay: true,
  overlayPosition: null,
  cueScale: 100,
  upcomingAbilities: 4,
  cueBorderThickness: 2,
  cueBorderColor: "#f2c94c",
  overlayOpacity: 100,
  showAbilityNames: true,
  showNextLabel: true,
  showDiagnostics: false
};

export function loadSettings(): RotationCueSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<RotationCueSettings> | null;
    const settings: RotationCueSettings = {
      autoAdvanceRotation: typeof stored?.autoAdvanceRotation === "boolean"
        ? stored.autoAdvanceRotation
        : defaultSettings.autoAdvanceRotation,
      loopRotationAtEnd: typeof stored?.loopRotationAtEnd === "boolean"
        ? stored.loopRotationAtEnd
        : defaultSettings.loopRotationAtEnd,
      showCueOverlay: typeof stored?.showCueOverlay === "boolean"
        ? stored.showCueOverlay
        : defaultSettings.showCueOverlay,
      overlayPosition: cleanScreenPoint(stored?.overlayPosition),
      cueScale: cleanRange(stored?.cueScale, 25, 100, defaultSettings.cueScale),
      upcomingAbilities: cleanRange(stored?.upcomingAbilities, 1, 4, defaultSettings.upcomingAbilities),
      cueBorderThickness: cleanRange(stored?.cueBorderThickness, 0, 3, defaultSettings.cueBorderThickness),
      cueBorderColor: cleanColor(stored?.cueBorderColor, defaultSettings.cueBorderColor),
      overlayOpacity: cleanOpacity(stored?.overlayOpacity),
      showAbilityNames: typeof stored?.showAbilityNames === "boolean"
        ? stored.showAbilityNames
        : defaultSettings.showAbilityNames,
      showNextLabel: typeof stored?.showNextLabel === "boolean"
        ? stored.showNextLabel
        : defaultSettings.showNextLabel,
      showDiagnostics: typeof stored?.showDiagnostics === "boolean"
        ? stored.showDiagnostics
        : defaultSettings.showDiagnostics
    };
    saveSettings(settings);
    return settings;
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: RotationCueSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function settingsModalMarkup(settings: RotationCueSettings, positioningOverlay = false): string {
  return `
    <div class="settings-backdrop" id="settings-backdrop">
      <section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-modal-heading">
          <h2 id="settings-title">Settings</h2>
          <div class="settings-release-links">
            <span class="settings-version-label">version ${ROTATION_CUE_VERSION}</span>
            <button class="settings-patch-notes" id="show-patch-notes" type="button" title="Show Patch Notes">Patch Notes</button>
          </div>
          <button class="settings-modal-close" id="close-settings" type="button" title="Close settings" aria-label="Close settings">x</button>
        </header>
        <div class="settings-modal-body">
          ${settingsSection("Automation", `
            ${toggleRow("Auto-advance rotation", "settings-auto-advance", settings.autoAdvanceRotation)}
            ${toggleRow("Loop rotation at end", "settings-loop-rotation", settings.loopRotationAtEnd)}
          `)}

          ${settingsSection("Cue Overlay", `
            ${toggleRow("Show cue overlay", "settings-show-overlay", settings.showCueOverlay)}
            <div class="settings-row">
              <span class="settings-label">Change overlay position</span>
              <button class="settings-action" id="settings-reposition-overlay" type="button"
                ${!settings.showCueOverlay || positioningOverlay ? "disabled" : ""}>${positioningOverlay ? "Waiting for Alt+1" : "Reposition Overlay"}</button>
            </div>
            <p class="settings-hint" id="settings-overlay-position-status">${positioningOverlay
              ? "Move the preview with your cursor, then press Alt+1."
              : settings.overlayPosition ? "Custom position saved." : "Using the default position."}</p>
            ${rangeRow("Cue scale", "settings-cue-scale", 55, 100, 5, settings.cueScale, "%")}
            ${selectRow("Number of upcoming abilities", "settings-upcoming", ["1", "2", "3", "4"], String(settings.upcomingAbilities))}
            ${rangeRow("Border thickness", "settings-border-thickness", 0, 3, 1, settings.cueBorderThickness, "px")}
            ${colorRow("Border color", "settings-border-color", settings.cueBorderColor)}
            ${toggleRow("Use 50% overlay opacity", "settings-overlay-opacity", settings.overlayOpacity === 50)}
            ${toggleRow("Show ability names", "settings-show-ability-names", settings.showAbilityNames)}
            ${toggleRow("Show NEXT Label", "settings-show-next-label", settings.showNextLabel)}
          `)}

          ${settingsSection("Interface", `
            ${toggleRow("Show Diagnostics", "settings-show-diagnostics", settings.showDiagnostics)}
          `)}

          ${settingsSection("Keybind", `
            <div class="settings-keybind-list" aria-label="Cue keybinds">
              ${keybindRow("Next Cue", "Advance to the next rotation cue.", "Alt+1")}
            </div>
          `)}

          ${settingsSection("Data", `
            <div class="settings-button-pair">
              <button class="settings-action" type="button" data-placeholder-action>Export All Rotations</button>
              <button class="settings-action" type="button" data-placeholder-action>Import Rotations</button>
            </div>
          `)}

          ${settingsSection("Support", `
            <div class="support-links">
              <a class="support-link" href="https://ko-fi.com/plaguedplatypus" target="_blank" rel="noopener noreferrer">
                <img src="./assets/coffee.png" alt="" />
                <span>Coffee!</span>
              </a>
              <a class="support-link" href="https://discord.com/invite/xAc578gPjW" target="_blank" rel="noopener noreferrer">
                <img src="./assets/discord.png" alt="" />
                <span>Join Discord</span>
              </a>
            </div>
          `)}
        </div>
      </section>
    </div>`;
}

function cleanScreenPoint(value: unknown): ScreenPoint | null {
  const point = value as Partial<ScreenPoint> | null | undefined;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: Math.round(x), y: Math.round(y) }
    : null;
}

function cleanRange(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, Math.round(number)))
    : fallback;
}

function cleanOpacity(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return defaultSettings.overlayOpacity;
  return number <= 75 ? 50 : 100;
}

function cleanColor(value: unknown, fallback: string): string {
  const color = String(value ?? "").toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

export function bindSettingsShell(container: ParentNode): void {
  container.querySelectorAll<HTMLInputElement>(".settings-range").forEach((input) => {
    const output = input.parentElement?.querySelector<HTMLOutputElement>("output");
    if (!output) return;
    input.addEventListener("input", () => {
      output.value = `${input.value}${input.dataset.unit ?? ""}`;
    });
  });
}

function settingsSection(title: string, content: string): string {
  return `
    <section class="settings-section">
      <h3>${title}</h3>
      <div class="settings-section-body">${content}</div>
    </section>`;
}

function toggleRow(label: string, id: string, checked = false): string {
  return `
    <label class="settings-row settings-toggle-row" for="${id}">
      <span class="settings-label">${label}</span>
      <input class="settings-toggle-input" id="${id}" type="checkbox" ${checked ? "checked" : ""}>
      <span class="settings-toggle" aria-hidden="true"></span>
    </label>`;
}

function rangeRow(
  label: string,
  id: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit: string
): string {
  return `
    <label class="settings-range-row" for="${id}">
      <span class="settings-label">${label}</span>
      <output for="${id}">${value}${unit}</output>
      <input class="settings-range" id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}">
    </label>`;
}

function selectRow(label: string, id: string, options: string[], selected: string): string {
  return `
    <label class="settings-row" for="${id}">
      <span class="settings-label">${label}</span>
      <select class="settings-select" id="${id}">
        ${options.map((option) => `<option ${option === selected ? "selected" : ""}>${option}</option>`).join("")}
      </select>
    </label>`;
}

function colorRow(label: string, id: string, value: string): string {
  return `
    <label class="settings-row" for="${id}">
      <span class="settings-label">${label}</span>
      <input class="settings-color" id="${id}" type="color" value="${value}">
    </label>`;
}

function keybindRow(label: string, description: string, keybind: string): string {
  return `
    <div class="settings-keybind-row">
      <span class="settings-keybind-label"><strong>${label}</strong><small>${description}</small></span>
      <span class="settings-keybind" aria-label="${label}: ${keybind}">${keybind}</span>
    </div>`;
}
