import { abilityById, rotationEntryById } from "../data/abilities";
import type { AbilityScanResult, DetectedSlot, ExpectedAbilityObservation } from "../types";

export interface DiagnosticsViewState {
  result: AbilityScanResult | null;
  scanning: boolean;
  expectedAbilityId: string | undefined;
  currentStepIndex: number;
  rotationStepCount: number;
  trackingEnabled: boolean;
  observation: ExpectedAbilityObservation | null;
  alt1Available: boolean;
}

interface DiagnosticsPanelState extends DiagnosticsViewState {
  open: boolean;
  visible: boolean;
}

export function diagnosticsPanelMarkup(state: DiagnosticsPanelState): string {
  return `
    <details class="diagnostics-panel" ${state.open ? "open" : ""} ${state.visible ? "" : "hidden"}>
      <summary>
        <span><b>Diagnostics</b><small>${diagnosticsStatus(state)}</small></span>
        <span class="details-chevron">▾</span>
      </summary>
      <div class="diagnostics-body">${diagnosticsBodyMarkup(state)}</div>
    </details>`;
}

export function diagnosticsBodyMarkup(state: DiagnosticsViewState): string {
  return `
    <div class="diagnostics-heading">
      <div><p class="section-kicker">DIAGNOSTICS</p><h2 id="diagnostics-heading">Action-bar detection</h2></div>
      <button class="button button-accent" id="scan-action-bars" type="button" ${!state.alt1Available || state.scanning ? "disabled" : ""}>${state.scanning ? "Scanning…" : "Full scan"}</button>
    </div>
    ${diagnosticsMarkup(state)}`;
}

export function diagnosticsStatus(state: Pick<DiagnosticsViewState, "trackingEnabled" | "alt1Available">): string {
  return state.trackingEnabled ? "Tracking" : state.alt1Available ? "Ready" : "Browser mode";
}

function diagnosticsMarkup(state: DiagnosticsViewState): string {
  if (state.scanning) {
    return `<div class="diagnostics-empty"><span class="scan-pulse"></span><p>Locating visible bars and comparing slot icons…</p></div>`;
  }

  const discovery = !state.result
    ? `<div class="diagnostics-empty"><p>${state.alt1Available
      ? "Run a full discovery scan with the RuneScape action bars visible and unobstructed."
      : "RuneScape capture is unavailable in normal browser mode. Manual rotation controls remain available."}</p></div>`
    : `
      <p class="diagnostics-message diagnostics-${state.result.availability}">${escapeHtml(state.result.message)}</p>
      <div class="diagnostic-metrics">
        <div><strong>${state.result.barsFound}</strong><span>Bars found</span></div>
        <div><strong>${state.result.slotsFound}</strong><span>Slots captured</span></div>
        <div><strong>${state.result.recognized}</strong><span>Recognized</span></div>
        <div><strong>${state.result.empty}</strong><span>Empty</span></div>
        <div><strong>${state.result.unknown}</strong><span>Unknown</span></div>
        <div><strong>${state.result.durationMs}<small> ms</small></strong><span>Scan time</span></div>
      </div>`;

  const visibleRows = state.result?.slots.map(slotMarkup).join("") ?? "";
  return `
    ${discovery}
    ${trackingMarkup(state, Boolean(state.result?.recognized))}
    ${visibleRows ? `<div class="detected-list" role="list">${visibleRows}</div>` : ""}
  `;
}

function trackingMarkup(state: DiagnosticsViewState, hasDiscovery: boolean): string {
  const entry = state.expectedAbilityId ? rotationEntryById.get(state.expectedAbilityId) : undefined;
  const ability = state.expectedAbilityId ? abilityById.get(state.expectedAbilityId) : undefined;
  const trackingState = state.observation?.state ?? (state.trackingEnabled ? "acquiring-baseline" : "unavailable");
  const canTrack = state.alt1Available && hasDiscovery && Boolean(ability);
  const cooldownRaw = state.observation?.cooldownRawText || "—";
  const cooldownSeconds = state.observation?.cooldownSeconds !== undefined
    ? `${state.observation.cooldownSeconds} s`
    : "—";
  const identity = state.observation ? `${Math.round(state.observation.identitySimilarity * 100)}%` : "—";
  const brightness = state.observation?.brightnessRatio !== undefined
    ? `${Math.round(state.observation.brightnessRatio * 100)}%`
    : "—";
  const gcdTransient = state.observation ? (state.observation.gcdTransient ? "YES" : "No") : "—";
  const cooldownFrames = state.observation?.cooldownFrames ?? 0;
  const useEvent = state.observation
    ? `${state.observation.useEvent ? "YES" : "No"} · ${state.observation.useEventCount}`
    : "No · 0";
  const latency = state.observation?.detectionLatencyMs !== undefined
    ? `${state.observation.detectionLatencyMs} ms`
    : "—";
  const slotFound = state.observation ? (state.observation.slotFound ? "Found" : "Missing") : "—";
  const armed = state.observation ? (state.observation.armed ? "ARMED" : "Disarmed") : "—";
  const step = entry && state.rotationStepCount
    ? `${state.currentStepIndex + 1} / ${state.rotationStepCount}`
    : "—";
  const message = state.observation?.message ?? (canTrack
    ? "Start the harness, establish a ready baseline, then use the expected ability in RuneScape."
    : entry && !entry.scannable
      ? "This reminder advances manually."
      : state.alt1Available
        ? "A successful full scan is required before slot-only tracking."
        : "Expected-use tracking is available only inside Alt1.");

  return `
    <article class="tracking-card">
      <div class="tracking-heading">
        <div>
          <p class="section-kicker">EXPECTED-ABILITY HARNESS</p>
          <div class="expected-ability">
            ${entry ? `<img src="${entry.icon}" alt="" width="36" height="36">` : `<div class="unknown-icon">?</div>`}
            <div><h3>${escapeHtml(entry?.name ?? "No expected ability")}</h3><small>${entry ? `ID: ${escapeHtml(entry.id)} · ` : ""}${entry && !entry.scannable ? "manual cue" : "250 ms slot-only observations"}</small></div>
          </div>
        </div>
        <span class="tracking-state tracking-${trackingState}">${escapeHtml(trackingState.replace(/-/g, " "))}</span>
      </div>
      <p class="tracking-message">${escapeHtml(message)}</p>
      <div class="tracking-metrics">
        <div><strong>${step}</strong><span>Rotation step</span></div>
        <div><strong>${slotFound}</strong><span>Expected slot</span></div>
        <div><strong>${armed}</strong><span>Detector state</span></div>
        <div><strong>${identity}</strong><span>Identity</span></div>
        <div><strong>${brightness}</strong><span>Brightness / ready</span></div>
        <div><strong>${gcdTransient}</strong><span>GCD transient</span></div>
        <div><strong>${escapeHtml(cooldownRaw)}</strong><span>Cooldown OCR raw</span></div>
        <div><strong>${cooldownSeconds}</strong><span>Parsed cooldown</span></div>
        <div><strong>${cooldownFrames}</strong><span>Cooldown frames</span></div>
        <div><strong>${useEvent}</strong><span>Use event · total</span></div>
        <div><strong>${state.observation?.observationMs ?? "—"}${state.observation ? " ms" : ""}</strong><span>Sample time</span></div>
        <div><strong>${latency}</strong><span>Last latency</span></div>
      </div>
      <div class="tracking-controls">
        <button class="button ${state.trackingEnabled ? "button-secondary" : "button-primary"}" id="toggle-tracking" type="button" ${!state.trackingEnabled && !canTrack ? "disabled" : ""}>${state.trackingEnabled ? "Stop tracking" : "Start tracking"}</button>
      </div>
    </article>`;
}

function slotMarkup(slot: DetectedSlot): string {
  const ability = slot.abilityId ? abilityById.get(slot.abilityId) : undefined;
  const confidence = `${Math.round(slot.confidence * 100)}%`;
  const margin = `${Math.round(slot.margin * 100)}% margin`;
  const location = `Bar ${slot.barIndex} · Slot ${slot.slotIndex}`;
  if (slot.empty) {
    const emptyConfidence = `${Math.round((slot.emptyScore ?? 0) * 100)}%`;
    return `
      <div class="detected-row is-unknown" role="listitem">
        ${slot.previewDataUrl ? `<img class="capture-preview" src="${slot.previewDataUrl}" alt="Captured empty slot">` : `<div class="unknown-icon">—</div>`}
        <div><strong>Empty slot</strong><small>${location} · Empty match: ${emptyConfidence}</small></div>
        <span class="match-confidence">${emptyConfidence}</span>
        <span class="state-pill">empty</span>
      </div>`;
  }
  if (slot.accepted && ability) {
    return `
      <div class="detected-row is-recognized" role="listitem">
        <img src="${ability.icon}" alt="" width="32" height="32">
        <div><strong>${escapeHtml(ability.name)}</strong><small>${location} · ${margin}</small></div>
        <span class="match-confidence">${confidence}</span>
        <span class="state-pill">found</span>
      </div>`;
  }

  const candidate = ability?.name ? `Best: ${ability.name}` : "No candidate";
  return `
    <div class="detected-row is-unknown" role="listitem">
      ${slot.previewDataUrl ? `<img class="capture-preview" src="${slot.previewDataUrl}" alt="Captured slot">` : `<div class="unknown-icon">?</div>`}
      <div><strong>Unknown slot</strong><small>${location} · ${escapeHtml(candidate)} · ${margin} · ${escapeHtml(slot.rejectionReason ?? "Rejected")}</small></div>
      <span class="match-confidence">${confidence}</span>
      <span class="state-pill">rejected</span>
    </div>`;
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
