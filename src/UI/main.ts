import * as a1lib from "alt1/base";
import { CurrentActionBarCueOverlay } from "../alt1/actionBar";
import { DiagnosticAbilityReader } from "../alt1/abilityReader";
import { abilityById } from "../data/abilities";
import { RotationEngine } from "../rotation/engine";
import type { AppState } from "../state";
import type { AbilityScanResult, ExpectedAbilityObservation, ScreenPoint } from "../types";
import { diagnosticsBodyMarkup, diagnosticsPanelMarkup, diagnosticsStatus } from "./diagnostics";
import { renderEditor } from "./editor";
import { Alt1CueOverlay, isAlt1Available } from "./overlay";
import {
  bindSettingsShell,
  loadSettings,
  saveSettings,
  settingsModalMarkup
} from "./settings";
import { showPatchNotesModal } from "../updates/updateToast";

const EXPECTED_POLL_MS = 250;
const OVERLAY_KEEPALIVE_MS = 5_000;
const DIAGNOSTICS_REFRESH_MS = 500;
const TRACKING_RECOVERY_RETRY_MS = 30_000;
const TRANSFER_MESSAGE_MS = 4_000;

export function mountApp(root: HTMLElement, state: AppState): void {
  const engine = new RotationEngine();
  const alt1Overlay = new Alt1CueOverlay();
  const actionBarCueOverlay = new CurrentActionBarCueOverlay();
  const abilityReader = new DiagnosticAbilityReader();
  let selectedRotationId = "";
  let scanResult: AbilityScanResult | null = null;
  let scanInProgress = false;
  let trackingEnabled = false;
  let trackingInProgress = false;
  let trackingTimer: number | null = null;
  let trackingRecoveryTimer: number | null = null;
  let trackingObservation: ExpectedAbilityObservation | null = null;
  let lastDiagnosticsRefreshAt = 0;
  let diagnosticsOpen = false;
  let settingsOpen = false;
  let settingsScrollTop = 0;
  let settings = loadSettings();
  let overlayPlacementActive = false;
  let overlayPlacementTimer: number | null = null;
  let overlayPlacementListener: ((event: a1lib.Alt1EventType["alt1pressed"]) => void) | null = null;
  let footerMessage = "";
  let footerMessageTimer: number | null = null;
  engine.setRotation(state.activeRotation);
  alt1Overlay.setPosition(settings.overlayPosition);
  alt1Overlay.setScale(settings.cueScale);
  alt1Overlay.setBorderThickness(settings.cueBorderThickness);
  alt1Overlay.setBorderColor(settings.cueBorderColor);
  alt1Overlay.setOpacity(settings.overlayOpacity);
  alt1Overlay.setShowAbilityNames(settings.showAbilityNames);
  alt1Overlay.setShowNextLabel(settings.showNextLabel);

  const upcomingCues = (count: number) => engine.getUpcomingSteps(count, settings.loopRotationAtEnd);

  const updateFooterStatus = (): void => {
    const footer = root.querySelector<HTMLElement>(".app-footer");
    const text = footer?.querySelector<HTMLElement>("span");
    if (!footer || !text) return;
    footer.classList.toggle("has-message", !!footerMessage);
    text.textContent = footerMessage || (state.activeRotation
      ? `Active: ${state.activeRotation.name}`
      : "No active rotation");
  };

  const showTransferMessage = (message: string): void => {
    footerMessage = message;
    if (footerMessageTimer !== null) window.clearTimeout(footerMessageTimer);
    updateFooterStatus();
    footerMessageTimer = window.setTimeout(() => {
      footerMessage = "";
      footerMessageTimer = null;
      updateFooterStatus();
    }, TRANSFER_MESSAGE_MS);
  };

  const redrawActionBarCue = (): void => {
    const abilityId = engine.getCurrentStep()?.abilityId;
    const location = !scanInProgress && scanResult?.recognized && abilityId
      ? abilityReader.getAbilityLocation(abilityId)
      : null;
    actionBarCueOverlay.draw(location, settings.cueBorderColor, settings.cueBorderThickness);
  };

  const overlayKeepaliveTimer = window.setInterval(() => {
    redrawActionBarCue();
    if (settings.showCueOverlay && !overlayPlacementActive) {
      void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
    }
  }, OVERLAY_KEEPALIVE_MS);

  const resetExpectedTracking = (): void => {
    abilityReader.resetExpectedTracking();
    trackingObservation = null;
  };

  const stopExpectedTracking = (): void => {
    trackingEnabled = false;
    if (trackingTimer !== null) window.clearInterval(trackingTimer);
    trackingTimer = null;
    if (trackingRecoveryTimer !== null) window.clearTimeout(trackingRecoveryTimer);
    trackingRecoveryTimer = null;
    resetExpectedTracking();
  };

  const scheduleTrackingRecovery = (delay = 750): void => {
    if (trackingRecoveryTimer !== null || !settings.autoAdvanceRotation
      || !state.activeRotation || !isAlt1Available()) return;
    trackingRecoveryTimer = window.setTimeout(() => {
      trackingRecoveryTimer = null;
      if (settings.autoAdvanceRotation && state.activeRotation && !scanInProgress) {
        void runFullScan(false, true);
      }
    }, delay);
  };

  function bindDiagnosticsControls(scope: ParentNode): void {
    scope.querySelector("#scan-action-bars")?.addEventListener("click", () => { void runFullScan(); });
    scope.querySelector("#toggle-tracking")?.addEventListener("click", () => {
      if (trackingEnabled) {
        stopExpectedTracking();
        updateRuntimeCueUi();
      } else {
        startExpectedTracking();
      }
    });
  }

  function refreshDiagnosticsPanel(force = false): void {
    const status = root.querySelector<HTMLElement>(".diagnostics-panel summary small");
    if (status) status.textContent = diagnosticsStatus({ trackingEnabled, alt1Available: isAlt1Available() });
    if (!settings.showDiagnostics || !diagnosticsOpen || settingsOpen) return;
    const now = Date.now();
    if (!force && now - lastDiagnosticsRefreshAt < DIAGNOSTICS_REFRESH_MS) return;
    lastDiagnosticsRefreshAt = now;

    const body = root.querySelector<HTMLElement>(".diagnostics-body");
    if (!body) return;
    const expectedAbilityId = engine.getCurrentStep()?.abilityId;
    const observation = trackingObservation?.abilityId === expectedAbilityId
      ? trackingObservation
      : null;
    body.innerHTML = diagnosticsBodyMarkup({
      result: scanResult,
      scanning: scanInProgress,
      expectedAbilityId,
      currentStepIndex: engine.getCurrentIndex(),
      rotationStepCount: engine.getStepCount(),
      trackingEnabled,
      observation,
      alt1Available: isAlt1Available()
    });
    bindDiagnosticsControls(body);
  }

  function refreshScanControls(): void {
    root.querySelectorAll<HTMLButtonElement>(".rotation-scan-button").forEach((button) => {
      button.disabled = !isAlt1Available() || scanInProgress;
      button.textContent = scanInProgress ? "Scanning…" : "Scan";
    });
    refreshDiagnosticsPanel(true);
  }

  function updateRuntimeCueUi(): void {
    const currentIndex = engine.getCurrentIndex();
    root.querySelectorAll<HTMLElement>(".sequence-step[data-rotation-id]").forEach((step) => {
      const isCurrent = step.dataset.rotationId === state.activeRotationId
        && step.dataset.playableIndex !== undefined
        && Number(step.dataset.playableIndex) === currentIndex;
      step.classList.toggle("is-current", isCurrent);
    });

    if (settings.showCueOverlay && !overlayPlacementActive) {
      void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
    }
    redrawActionBarCue();
    refreshDiagnosticsPanel(true);
  }

  function advanceAfterConfirmedUse(): boolean {
    const stepCount = engine.getStepCount();
    if (!stepCount) return false;
    if (engine.getCurrentIndex() >= stepCount - 1) {
      if (!settings.loopRotationAtEnd) return false;
      engine.reset();
      return true;
    }
    return engine.next(false);
  }

  const pollExpected = async (): Promise<void> => {
    if (!trackingEnabled || trackingInProgress || scanInProgress) return;
    const abilityId = engine.getCurrentStep()?.abilityId;
    if (!abilityId || !abilityById.has(abilityId)) {
      trackingEnabled = false;
      if (trackingTimer !== null) window.clearInterval(trackingTimer);
      trackingTimer = null;
      trackingObservation = null;
      updateRuntimeCueUi();
      return;
    }

    trackingInProgress = true;
    let recoverAfterPoll = false;
    let cueUiUpdateRequired = false;
    try {
      const observation = await abilityReader.observeExpectedAbility(abilityId);
      trackingObservation = observation;
      if (observation.state === "identity-lost" || !observation.slotFound) {
        trackingEnabled = false;
        if (trackingTimer !== null) window.clearInterval(trackingTimer);
        trackingTimer = null;
        recoverAfterPoll = settings.autoAdvanceRotation;
        cueUiUpdateRequired = true;
      }
      if (observation.useEvent && settings.autoAdvanceRotation) {
        cueUiUpdateRequired = true;
        const advanced = advanceAfterConfirmedUse();
        resetExpectedTracking();
        if (!advanced) {
          trackingEnabled = false;
          if (trackingTimer !== null) window.clearInterval(trackingTimer);
          trackingTimer = null;
        }
      }
    } finally {
      trackingInProgress = false;
      if (cueUiUpdateRequired) updateRuntimeCueUi();
      else refreshDiagnosticsPanel();
      if (recoverAfterPoll) scheduleTrackingRecovery();
    }
  };

  const startExpectedTracking = (): boolean => {
    const abilityId = engine.getCurrentStep()?.abilityId;
    if (trackingEnabled || !isAlt1Available() || !scanResult?.recognized
      || !abilityId || !abilityById.has(abilityId)
      || !abilityReader.getAbilityLocation(abilityId)) return false;
    if (trackingRecoveryTimer !== null) window.clearTimeout(trackingRecoveryTimer);
    trackingRecoveryTimer = null;
    resetExpectedTracking();
    trackingEnabled = true;
    trackingTimer = window.setInterval(() => { void pollExpected(); }, EXPECTED_POLL_MS);
    void pollExpected();
    refreshDiagnosticsPanel(true);
    return true;
  };

  const runFullScan = async (showGeometry = true, retryOnMissingExpected = false): Promise<void> => {
    if (scanInProgress || !isAlt1Available()) return;
    stopExpectedTracking();
    scanInProgress = true;
    refreshScanControls();
    scanResult = await abilityReader.scan({ showGeometry });
    scanInProgress = false;
    refreshScanControls();
    redrawActionBarCue();
    if (settings.autoAdvanceRotation && state.activeRotation && scanResult.recognized) {
      if (!startExpectedTracking()) {
        refreshDiagnosticsPanel(true);
        if (retryOnMissingExpected) scheduleTrackingRecovery(TRACKING_RECOVERY_RETRY_MS);
      }
    } else {
      refreshDiagnosticsPanel(true);
      if (retryOnMissingExpected) scheduleTrackingRecovery(TRACKING_RECOVERY_RETRY_MS);
    }
  };

  const finishManualNavigation = (): void => {
    resetExpectedTracking();
    if (settings.autoAdvanceRotation && !trackingEnabled) startExpectedTracking();
    updateRuntimeCueUi();
  };
  const previousCue = (): void => { engine.previous(); finishManualNavigation(); };
  const nextCue = (): void => { engine.next(settings.loopRotationAtEnd); finishManualNavigation(); };
  const resetCue = (): void => { engine.reset(); finishManualNavigation(); };

  const alt1CueKeybindListener = (): void => {
    if (settingsOpen || !state.activeRotation || overlayPlacementActive) return;
    nextCue();
  };
  a1lib.on("alt1pressed", alt1CueKeybindListener);

  const updateOverlayPlacementUi = (message?: string): void => {
    const button = root.querySelector<HTMLButtonElement>("#settings-reposition-overlay");
    if (button) {
      button.disabled = overlayPlacementActive || !settings.showCueOverlay;
      button.textContent = overlayPlacementActive ? "Waiting for Alt+1" : "Reposition Overlay";
    }
    const status = root.querySelector<HTMLElement>("#settings-overlay-position-status");
    if (status) {
      status.textContent = message ?? (overlayPlacementActive
        ? "Move the preview with your cursor, then press Alt+1."
        : settings.overlayPosition ? "Custom position saved." : "Using the default position.");
    }
  };

  const stopOverlayPlacement = (redraw = true): void => {
    overlayPlacementActive = false;
    if (overlayPlacementTimer !== null) window.clearInterval(overlayPlacementTimer);
    overlayPlacementTimer = null;
    if (overlayPlacementListener) a1lib.removeListener("alt1pressed", overlayPlacementListener);
    overlayPlacementListener = null;
    if (redraw) {
      if (settings.showCueOverlay) void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      else alt1Overlay.clear();
    }
    updateOverlayPlacementUi();
  };

  const startOverlayPlacement = (): void => {
    if (overlayPlacementActive) return;
    if (!isAlt1Available()) {
      updateOverlayPlacementUi("Open Rotation Cue inside Alt1 to reposition its overlay.");
      return;
    }

    overlayPlacementActive = true;
    updateOverlayPlacementUi();
    overlayPlacementTimer = window.setInterval(() => {
      const position = cleanScreenPoint(a1lib.getMousePosition());
      if (!position) return;
      void alt1Overlay.drawPlacementPreview(upcomingCues(settings.upcomingAbilities), position);
    }, 100);

    overlayPlacementListener = (event): void => {
      if (!overlayPlacementActive) return;
      const position = cleanScreenPoint(event.mouseRs ?? { x: event.x, y: event.y });
      if (!position) {
        stopOverlayPlacement(false);
        alt1Overlay.clear();
        updateOverlayPlacementUi("Could not read the RuneScape cursor position. Please try again.");
        return;
      }

      settings = { ...settings, overlayPosition: position };
      saveSettings(settings);
      alt1Overlay.setPosition(position);
      stopOverlayPlacement(false);
      if (settings.showCueOverlay) void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      updateOverlayPlacementUi("Position saved.");
    };
    a1lib.on("alt1pressed", overlayPlacementListener);
  };

  const render = (): void => {
    const currentSettingsBody = root.querySelector<HTMLElement>(".settings-modal-body");
    if (currentSettingsBody) settingsScrollTop = currentSettingsBody.scrollTop;

    const rotationChanged = selectedRotationId !== state.activeRotationId;
    const activatedRotationId = rotationChanged && state.activeRotation ? state.activeRotationId : "";
    selectedRotationId = state.activeRotationId;
    if (rotationChanged) {
      stopExpectedTracking();
      engine.setRotation(state.activeRotation);
    } else {
      engine.syncRotation(state.activeRotation);
    }

    const expectedAbilityId = engine.getCurrentStep()?.abilityId;
    const currentObservation = trackingObservation?.abilityId === expectedAbilityId
      ? trackingObservation
      : null;

    root.innerHTML = `
      <header class="app-titlebar">
        <h1>Rotation Cue</h1>
        <button class="settings-trigger" id="open-settings" type="button" title="Settings" aria-label="Open settings">⋯</button>
        <span class="connection-dot ${isAlt1Available() ? "is-live" : ""}" title="${isAlt1Available() ? "Alt1 connected" : "Browser mode"}"></span>
      </header>

      <main class="rotation-editor" id="rotation-editor" aria-label="Rotation builder"></main>

      ${diagnosticsPanelMarkup({
        result: scanResult,
        scanning: scanInProgress,
        expectedAbilityId,
        currentStepIndex: engine.getCurrentIndex(),
        rotationStepCount: engine.getStepCount(),
        trackingEnabled,
        observation: currentObservation,
        alt1Available: isAlt1Available(),
        open: diagnosticsOpen,
        visible: settings.showDiagnostics
      })}
      <footer class="app-footer${footerMessage ? " has-message" : ""}"><span>${footerMessage
        ? escapeHtml(footerMessage)
        : state.activeRotation ? `Active: ${escapeHtml(state.activeRotation.name)}` : "No active rotation"}</span></footer>
      ${settingsOpen ? settingsModalMarkup(settings, overlayPlacementActive) : ""}
    `;

    renderEditor(requiredElement(root, "#rotation-editor"), state, {
      currentIndex: engine.getCurrentIndex(),
      canScan: isAlt1Available(),
      scanInProgress,
      onScan: () => { void runFullScan(); },
      onPrevious: previousCue,
      onNext: nextCue,
      onReset: resetCue,
      onTransferMessage: showTransferMessage
    });
    const overlayCues = upcomingCues(settings.upcomingAbilities);
    if (!settings.showCueOverlay) alt1Overlay.clear();
    else if (!overlayPlacementActive) void alt1Overlay.draw(overlayCues);
    redrawActionBarCue();

    root.querySelector(".diagnostics-panel")?.addEventListener("toggle", (event) => {
      diagnosticsOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
    bindDiagnosticsControls(root);
    root.querySelector("#open-settings")?.addEventListener("click", () => {
      settingsScrollTop = 0;
      settingsOpen = true;
      render();
      root.querySelector<HTMLButtonElement>("#close-settings")?.focus();
    });
    root.querySelector("#close-settings")?.addEventListener("click", () => {
      settingsOpen = false;
      render();
    });
    root.querySelector("#settings-backdrop")?.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      settingsOpen = false;
      render();
    });
    if (settingsOpen) {
      bindSettingsShell(root);
      root.querySelector("#show-patch-notes")?.addEventListener("click", showPatchNotesModal);
      const settingsBody = root.querySelector<HTMLElement>(".settings-modal-body");
      if (settingsBody) settingsBody.scrollTop = settingsScrollTop;
    }
    root.querySelector<HTMLInputElement>("#settings-show-overlay")?.addEventListener("change", (event) => {
      const checked = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, showCueOverlay: checked };
      saveSettings(settings);
      const reposition = root.querySelector<HTMLButtonElement>("#settings-reposition-overlay");
      if (reposition) reposition.disabled = !checked || overlayPlacementActive;
      if (checked) {
        void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      } else {
        if (overlayPlacementActive) stopOverlayPlacement(false);
        alt1Overlay.clear();
      }
    });
    root.querySelector("#settings-reposition-overlay")?.addEventListener("click", startOverlayPlacement);
    root.querySelector<HTMLInputElement>("#settings-cue-scale")?.addEventListener("input", (event) => {
      const cueScale = Number((event.currentTarget as HTMLInputElement).value);
      settings = { ...settings, cueScale };
      saveSettings(settings);
      alt1Overlay.setScale(cueScale);
      if (settings.showCueOverlay && !overlayPlacementActive) {
        void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLSelectElement>("#settings-upcoming")?.addEventListener("change", (event) => {
      const upcomingAbilities = Number((event.currentTarget as HTMLSelectElement).value);
      settings = { ...settings, upcomingAbilities };
      saveSettings(settings);
      if (settings.showCueOverlay && !overlayPlacementActive) {
        void alt1Overlay.draw(upcomingCues(upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-border-thickness")?.addEventListener("input", (event) => {
      const cueBorderThickness = Number((event.currentTarget as HTMLInputElement).value);
      settings = { ...settings, cueBorderThickness };
      saveSettings(settings);
      alt1Overlay.setBorderThickness(cueBorderThickness);
      redrawActionBarCue();
      if (settings.showCueOverlay && !overlayPlacementActive) {
        void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-border-color")?.addEventListener("input", (event) => {
      const cueBorderColor = (event.currentTarget as HTMLInputElement).value;
      settings = { ...settings, cueBorderColor };
      saveSettings(settings);
      alt1Overlay.setBorderColor(cueBorderColor);
      redrawActionBarCue();
      if (settings.showCueOverlay && !overlayPlacementActive) {
        void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-overlay-opacity")?.addEventListener("change", (event) => {
      const overlayOpacity = (event.currentTarget as HTMLInputElement).checked ? 50 : 100;
      settings = { ...settings, overlayOpacity };
      saveSettings(settings);
      alt1Overlay.setOpacity(overlayOpacity);
      if (settings.showCueOverlay && !overlayPlacementActive) {
        void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-show-ability-names")?.addEventListener("change", (event) => {
      const showAbilityNames = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, showAbilityNames };
      saveSettings(settings);
      alt1Overlay.setShowAbilityNames(showAbilityNames);
      if (settings.showCueOverlay && !overlayPlacementActive) {
        void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-show-next-label")?.addEventListener("change", (event) => {
      const showNextLabel = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, showNextLabel };
      saveSettings(settings);
      alt1Overlay.setShowNextLabel(showNextLabel);
      if (settings.showCueOverlay && !overlayPlacementActive) {
        void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-auto-advance")?.addEventListener("change", (event) => {
      const autoAdvanceRotation = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, autoAdvanceRotation };
      saveSettings(settings);
      if (!autoAdvanceRotation) {
        stopExpectedTracking();
      } else if (state.activeRotation) {
        if (scanResult?.recognized) startExpectedTracking();
        else void runFullScan(false);
      }
    });
    root.querySelector<HTMLInputElement>("#settings-loop-rotation")?.addEventListener("change", (event) => {
      const loopRotationAtEnd = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, loopRotationAtEnd };
      saveSettings(settings);
      if (settings.showCueOverlay && !overlayPlacementActive) {
        void alt1Overlay.draw(upcomingCues(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-show-diagnostics")?.addEventListener("change", (event) => {
      const checked = (event.currentTarget as HTMLInputElement).checked;
      settings = {
        ...settings,
        showDiagnostics: checked
      };
      saveSettings(settings);
      const panel = root.querySelector<HTMLElement>(".diagnostics-panel");
      if (panel) panel.hidden = !checked;
    });
    if (activatedRotationId && isAlt1Available()) {
      window.setTimeout(() => {
        if (state.activeRotationId === activatedRotationId) void runFullScan(false);
      }, 0);
    }
  };

  document.addEventListener("keydown", (event) => {
    if (!settingsOpen || event.code !== "Escape") return;
    event.preventDefault();
    settingsOpen = false;
    render();
  });

  const clearOverlayForShutdown = (): void => {
    a1lib.removeListener("alt1pressed", alt1CueKeybindListener);
    stopExpectedTracking();
    stopOverlayPlacement(false);
    alt1Overlay.clear();
    actionBarCueOverlay.clear();
    window.clearInterval(overlayKeepaliveTimer);
    if (footerMessageTimer !== null) window.clearTimeout(footerMessageTimer);
  };
  window.addEventListener("pagehide", clearOverlayForShutdown);
  window.addEventListener("beforeunload", clearOverlayForShutdown);

  state.subscribe(render);
  render();
}

function cleanScreenPoint(value: unknown): ScreenPoint | null {
  const point = value as Partial<ScreenPoint> | null | undefined;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: Math.round(x), y: Math.round(y) }
    : null;
}

function requiredElement(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
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
