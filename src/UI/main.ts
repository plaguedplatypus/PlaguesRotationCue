import * as a1lib from "alt1/base";
import { SlotOverlay } from "../alt1/actionBar";
import { Reader } from "../alt1/abilityReader";
import { abilityById } from "../data/abilityData";
import { Engine } from "../rotation/engine";
import type { State } from "../state";
import type { ScanResult, Point } from "../types";
import { renderEditor } from "./editor";
import { bindFields, loadKeybinds, saveKeybinds, modalMarkup as keybindModal } from "./keybind";
import { CueOverlay, isAlt1Available } from "./overlay";
import { bindRanges, loadSettings, saveSettings, modalMarkup as settingsModal } from "./settings";
import { showPatchNotes } from "../updates/updateToast";

const pollMs = 250;
const keepaliveMs = 5_000;
const retryMs = 30_000;
const messageMs = 4_000;

export function mountApp(root: HTMLElement, state: State): void {
  const engine = new Engine();
  const cueOverlay = new CueOverlay();
  const slotOverlay = new SlotOverlay();
  const reader = new Reader();
  let lastActiveId = "";
  let scanResult: ScanResult | null = null;
  let scanning = false;
  let tracking = false;
  let polling = false;
  let pollTimer: number | null = null;
  let retryTimer: number | null = null;
  let settingsOpen = false;
  let keybindsOpen = false;
  let keybindBar = 1;
  let settingsScroll = 0;
  let renderedCategory = state.category;
  let settings = loadSettings();
  let keybinds = loadKeybinds();
  let placingOverlay = false;
  let placementTimer: number | null = null;
  let placementListener: ((event: a1lib.Alt1EventType["alt1pressed"]) => void) | null = null;
  let message = "";
  let msgTimer: number | null = null;
  engine.setRotation(state.active);
  cueOverlay.setPosition(settings.overlayPosition);
  cueOverlay.setScale(settings.cueScale);
  cueOverlay.setBorder(settings.cueBorderThickness);
  cueOverlay.setBorderColor(settings.cueBorderColor);
  cueOverlay.setOpacity(settings.overlayOpacity);
  cueOverlay.setNames(settings.showAbilityNames);
  cueOverlay.setLabelsShown(settings.showNextLabel);
  cueOverlay.setKeybinds(keybinds);
  cueOverlay.setAutoAdvance(settings.autoAdvanceRotation);

  const upcoming = (count: number) => engine.upcomingSteps(count, settings.loopRotationAtEnd);

  const updateMsg = (): void => {
    const current = root.querySelector<HTMLElement>(".app-message");
    if (!message) {
      current?.remove();
      return;
    }
    if (current) {
      current.textContent = message;
      return;
    }
    const next = document.createElement("div");
    next.className = "app-message";
    next.textContent = message;
    root.appendChild(next);
  };

  const showMessage = (value: string): void => {
    message = value;
    if (msgTimer !== null) window.clearTimeout(msgTimer);
    updateMsg();
    msgTimer = window.setTimeout(() => {
      message = "";
      msgTimer = null;
      updateMsg();
    }, messageMs);
  };

  // *** Overlay and tracking

  const drawSlot = (): void => {
    const abilityId = engine.currentStep()?.abilityId;
    const location = !scanning && scanResult?.recognized && abilityId
      ? reader.getLocation(abilityId)
      : null;
    slotOverlay.draw(location, settings.cueBorderColor, settings.cueBorderThickness);
  };

  // Alt1 overlay groups expire, so unchanged cues still need a quiet refresh.
  const keepaliveTimer = window.setInterval(() => {
    drawSlot();
    if (settings.showCueOverlay && !placingOverlay) {
      void cueOverlay.draw(upcoming(settings.upcomingAbilities));
    }
  }, keepaliveMs);

  const resetTracking = (): void => {
    reader.resetTracking();
    cueOverlay.setCooldown(null);
  };

  const stopTracking = (): void => {
    tracking = false;
    if (pollTimer !== null) window.clearInterval(pollTimer);
    pollTimer = null;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
    resetTracking();
  };

  const scheduleRetry = (delay = 750): void => {
    if (retryTimer !== null || !settings.autoAdvanceRotation
      || !state.active || !isAlt1Available()) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      if (settings.autoAdvanceRotation && state.active && !scanning) {
        void scanBars(false, true);
      }
    }, delay);
  };

  function refreshScan(): void {
    root.querySelectorAll<HTMLButtonElement>(".rotation-scan-button").forEach((button) => {
      button.disabled = !isAlt1Available() || scanning;
      button.textContent = scanning ? "Scanning…" : "Scan";
    });
    const keybindScan = root.querySelector<HTMLButtonElement>("#scan-visual-keybinds");
    if (keybindScan) {
      keybindScan.disabled = !isAlt1Available() || scanning;
      keybindScan.textContent = scanning ? "Scanning…" : "Scan Bars";
    }
  }

  // *** Cue tracking

  function updateCue(): void {
    const currentIndex = engine.currentIndex();
    root.querySelectorAll<HTMLElement>(".sequence-step[data-rotation-id]").forEach((step) => {
      const isCurrent = step.dataset.rotationId === state.activeId
        && step.dataset.playableIndex !== undefined
        && Number(step.dataset.playableIndex) === currentIndex;
      step.classList.toggle("is-current", isCurrent);
    });

    if (settings.showCueOverlay && !placingOverlay) {
      void cueOverlay.draw(upcoming(settings.upcomingAbilities));
    }
    drawSlot();
  }

  function advance(): boolean {
    return engine.next(settings.loopRotationAtEnd);
  }

  const poll = async (): Promise<void> => {
    if (!tracking || polling || scanning) return;
    const abilityId = engine.currentStep()?.abilityId;
    if (!abilityId || !abilityById.has(abilityId)) {
      tracking = false;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      pollTimer = null;
      updateCue();
      return;
    }

    // setInterval does not wait for OCR.
    polling = true;
    let retryAfter = false;
    let cueChanged = false;
    let cooldownChanged = false;
    try {
      const sample = await reader.observeExpected(abilityId);
      cooldownChanged = cueOverlay.setCooldown(
        sample.cooldown !== undefined ? sample.abilityId : null,
        sample.cooldown
      );
      if (sample.identityLost || !sample.slotFound) {
        tracking = false;
        if (pollTimer !== null) window.clearInterval(pollTimer);
        pollTimer = null;
        retryAfter = settings.autoAdvanceRotation;
        cueChanged = true;
      }
      if (sample.used && settings.autoAdvanceRotation) {
        cueChanged = true;
        const advanced = advance();
        resetTracking();
        if (!advanced) {
          tracking = false;
          if (pollTimer !== null) window.clearInterval(pollTimer);
          pollTimer = null;
        }
      }
    } finally {
      polling = false;
      if (cueChanged) updateCue();
      else if (cooldownChanged && settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
      if (retryAfter) scheduleRetry();
    }
  };

  const startTracking = (): boolean => {
    const abilityId = engine.currentStep()?.abilityId;
    if (tracking || !isAlt1Available() || !scanResult?.recognized
      || !abilityId || !abilityById.has(abilityId)
      || !reader.getLocation(abilityId)) return false;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
    resetTracking();
    tracking = true;
    pollTimer = window.setInterval(() => { void poll(); }, pollMs);
    void poll();
    return true;
  };

  const scanBars = async (showGeometry = true, retryMissing = false): Promise<void> => {
    if (scanning || !isAlt1Available()) return;
    stopTracking();
    scanning = true;
    refreshScan();
    scanResult = await reader.scan({ showGeometry });
    scanning = false;
    refreshScan();
    drawSlot();
    if (settings.autoAdvanceRotation && state.active && scanResult.recognized) {
      if (!startTracking()) {
        if (retryMissing) scheduleRetry(retryMs);
      }
    } else {
      if (retryMissing) scheduleRetry(retryMs);
    }
    if (keybindsOpen) render();
  };

  // *** Session controls

  const finishNavigation = (): void => {
    resetTracking();
    if (settings.autoAdvanceRotation && !tracking) startTracking();
    updateCue();
  };
  const previousCue = (): void => { engine.previous(); finishNavigation(); };
  const nextCue = (): void => { engine.next(settings.loopRotationAtEnd); finishNavigation(); };
  const resetCue = (): void => { engine.reset(); finishNavigation(); };

  const keybindListener = (): void => {
    if (settingsOpen || !state.active || placingOverlay) return;
    nextCue();
  };
  a1lib.on("alt1pressed", keybindListener);

  // *** Overlay positioning

  const updatePlacement = (message?: string): void => {
    const button = root.querySelector<HTMLButtonElement>("#settings-reposition-overlay");
    if (button) {
      button.disabled = placingOverlay || !settings.showCueOverlay;
      button.textContent = placingOverlay ? "Waiting for Alt+1" : "Reposition Overlay";
    }
    const status = root.querySelector<HTMLElement>("#settings-overlay-position-status");
    if (status) {
      status.textContent = message ?? (placingOverlay
        ? "Move the preview, then press Alt+1."
        : settings.overlayPosition ? "Custom position saved." : "Using the default position.");
    }
  };

  const stopPlacement = (redraw = true): void => {
    placingOverlay = false;
    if (placementTimer !== null) window.clearInterval(placementTimer);
    placementTimer = null;
    if (placementListener) a1lib.removeListener("alt1pressed", placementListener);
    placementListener = null;
    if (redraw) {
      if (settings.showCueOverlay) void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      else cueOverlay.clear();
    }
    updatePlacement();
  };

  const startPlacement = (): void => {
    if (placingOverlay) return;
    if (!isAlt1Available()) {
      updatePlacement("Open Rotation Cue inside Alt1 to reposition its overlay.");
      return;
    }

    placingOverlay = true;
    updatePlacement();
    placementTimer = window.setInterval(() => {
      const position = cleanPoint(a1lib.getMousePosition());
      if (!position) return;
      void cueOverlay.drawPreview(upcoming(settings.upcomingAbilities), position);
    }, 100);

    // The preview follows the cursor.
    placementListener = (event): void => {
      if (!placingOverlay) return;
      const position = cleanPoint(event.mouseRs ?? { x: event.x, y: event.y });
      if (!position) {
        stopPlacement(false);
        cueOverlay.clear();
        updatePlacement("Could not read the cursor position. Please try again.");
        return;
      }

      settings = { ...settings, overlayPosition: position };
      saveSettings(settings);
      cueOverlay.setPosition(position);
      stopPlacement(false);
      if (settings.showCueOverlay) void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      updatePlacement("Position saved.");
    };
    a1lib.on("alt1pressed", placementListener);
  };

  // *** Rendering and event

  const render = (): void => {
    const settingsBody = !keybindsOpen
      ? root.querySelector<HTMLElement>("#settings-backdrop .settings-modal-body")
      : null;
    if (settingsBody) settingsScroll = settingsBody.scrollTop;
    const editorScrollTop = renderedCategory === state.category
      ? root.querySelector<HTMLElement>(".rotation-list")?.scrollTop
      : undefined;
    renderedCategory = state.category;

    const activeChanged = lastActiveId !== state.activeId;
    const activatedId = activeChanged && state.active ? state.activeId : "";
    lastActiveId = state.activeId;
    if (activeChanged) {
      stopTracking();
      engine.setRotation(state.active);
    } else {
      engine.syncRotation(state.active);
    }

    root.innerHTML = `
      <header class="app-titlebar">
        ${state.active
          ? `<div class="titlebar-cue-controls" role="group" aria-label="Active rotation controls">
              <button class="text-button" id="titlebar-previous-cue" type="button" title="Previous cue">← Previous</button>
              <button class="icon-button" id="titlebar-reset-cue" type="button" title="Reset cue" aria-label="Reset cue">↺</button>
              <button class="text-button" id="titlebar-next-cue" type="button" title="Next cue">Next →</button>
            </div>`
          : "<h1>Rotation Cue</h1>"}
        <button class="settings-trigger" id="open-settings" type="button" title="Settings" aria-label="Open settings">⋯</button>
      </header>

      <main class="rotation-editor" id="rotation-editor" aria-label="Rotation builder"></main>

      ${message ? `<div class="app-message">${escapeHtml(message)}</div>` : ""}
      ${settingsOpen
        ? keybindsOpen
          ? keybindModal(scanResult, keybinds, scanning, keybindBar)
          : settingsModal(settings, placingOverlay)
        : ""}
    `;

    renderEditor(requireElement(root, "#rotation-editor"), state, {
      currentIndex: engine.currentIndex(),
      canScan: isAlt1Available(),
      scanning,
      onScan: () => { void scanBars(); },
      onPrevious: previousCue,
      onNext: nextCue,
      onReset: resetCue,
      onMessage: showMessage
    });
    if (editorScrollTop !== undefined) {
      const list = root.querySelector<HTMLElement>(".rotation-list");
      if (list) list.scrollTop = editorScrollTop;
    }
    root.querySelector("#titlebar-previous-cue")?.addEventListener("click", previousCue);
    root.querySelector("#titlebar-reset-cue")?.addEventListener("click", resetCue);
    root.querySelector("#titlebar-next-cue")?.addEventListener("click", nextCue);
    const overlayCues = upcoming(settings.upcomingAbilities);
    if (!settings.showCueOverlay) cueOverlay.clear();
    else if (!placingOverlay) void cueOverlay.draw(overlayCues);
    drawSlot();

    root.querySelector("#open-settings")?.addEventListener("click", () => {
      settingsScroll = 0;
      settingsOpen = true;
      keybindsOpen = false;
      render();
      root.querySelector<HTMLButtonElement>("#close-settings")?.focus();
    });
    root.querySelector("#close-settings")?.addEventListener("click", () => {
      settingsOpen = false;
      keybindsOpen = false;
      render();
    });
    root.querySelector("#settings-backdrop")?.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      settingsOpen = false;
      keybindsOpen = false;
      render();
    });
    if (settingsOpen && !keybindsOpen) {
      bindRanges(root);
      root.querySelector("#show-patch-notes")?.addEventListener("click", showPatchNotes);
      const settingsBody = root.querySelector<HTMLElement>(".settings-modal-body");
      if (settingsBody) settingsBody.scrollTop = settingsScroll;
      root.querySelector("#settings-visual-keybinds")?.addEventListener("click", () => {
        keybindsOpen = true;
        keybindBar = 1;
        render();
        root.querySelector<HTMLButtonElement>("#close-visual-keybinds")?.focus();
      });
    }
    if (settingsOpen && keybindsOpen) {
      const returnToSettings = (): void => {
        keybindsOpen = false;
        render();
        root.querySelector<HTMLButtonElement>("#settings-visual-keybinds")?.focus();
      };
      root.querySelector("#close-visual-keybinds")?.addEventListener("click", returnToSettings);
      root.querySelector("#visual-keybind-backdrop")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) returnToSettings();
      });
      root.querySelector("#scan-visual-keybinds")?.addEventListener("click", () => {
        void scanBars(false);
      });
      root.querySelectorAll<HTMLButtonElement>("[data-keybind-bar-index]").forEach((button) => {
        button.addEventListener("click", () => {
          keybindBar = Number(button.dataset.keybindBarIndex);
          render();
          root.querySelector<HTMLButtonElement>(`#visual-keybind-tab-${keybindBar}`)?.focus();
        });
      });
      bindFields(root, (abilityId, keybind) => {
        const next = { ...keybinds };
        if (keybind) next[abilityId] = keybind;
        else delete next[abilityId];
        keybinds = next;
        saveKeybinds(keybinds);
        cueOverlay.setKeybinds(keybinds);
        root.querySelectorAll<HTMLButtonElement>(".visual-keybind-input[data-ability-id]")
          .forEach((button) => {
            if (button.dataset.abilityId !== abilityId) return;
            button.dataset.value = keybind ?? "";
            button.textContent = keybind ?? "Unbound";
          });
        if (settings.showCueOverlay && !placingOverlay) {
          void cueOverlay.draw(upcoming(settings.upcomingAbilities));
        }
      });
    }
    root.querySelector<HTMLInputElement>("#settings-show-overlay")?.addEventListener("change", (event) => {
      const checked = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, showCueOverlay: checked };
      saveSettings(settings);
      const reposition = root.querySelector<HTMLButtonElement>("#settings-reposition-overlay");
      if (reposition) reposition.disabled = !checked || placingOverlay;
      if (checked) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      } else {
        if (placingOverlay) stopPlacement(false);
        cueOverlay.clear();
      }
    });
    root.querySelector("#settings-reposition-overlay")?.addEventListener("click", startPlacement);
    root.querySelector<HTMLInputElement>("#settings-cue-scale")?.addEventListener("input", (event) => {
      const cueScale = Number((event.currentTarget as HTMLInputElement).value);
      settings = { ...settings, cueScale };
      saveSettings(settings);
      cueOverlay.setScale(cueScale);
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLSelectElement>("#settings-upcoming-count")?.addEventListener("change", (event) => {
      const count = Number((event.currentTarget as HTMLSelectElement).value);
      settings = { ...settings, upcomingAbilities: count };
      saveSettings(settings);
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(count));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-border-thickness")?.addEventListener("input", (event) => {
      const cueBorderThickness = Number((event.currentTarget as HTMLInputElement).value);
      settings = { ...settings, cueBorderThickness };
      saveSettings(settings);
      cueOverlay.setBorder(cueBorderThickness);
      drawSlot();
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-border-color")?.addEventListener("input", (event) => {
      const cueBorderColor = (event.currentTarget as HTMLInputElement).value;
      settings = { ...settings, cueBorderColor };
      saveSettings(settings);
      cueOverlay.setBorderColor(cueBorderColor);
      drawSlot();
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-overlay-opacity")?.addEventListener("change", (event) => {
      const overlayOpacity = (event.currentTarget as HTMLInputElement).checked ? 50 : 100;
      settings = { ...settings, overlayOpacity };
      saveSettings(settings);
      cueOverlay.setOpacity(overlayOpacity);
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-show-ability-names")?.addEventListener("change", (event) => {
      const showAbilityNames = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, showAbilityNames };
      saveSettings(settings);
      cueOverlay.setNames(showAbilityNames);
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-show-next-label")?.addEventListener("change", (event) => {
      const showNextLabel = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, showNextLabel };
      saveSettings(settings);
      cueOverlay.setLabelsShown(showNextLabel);
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
    });
    root.querySelector<HTMLInputElement>("#settings-auto-advance")?.addEventListener("change", (event) => {
      const autoAdvanceRotation = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, autoAdvanceRotation };
      saveSettings(settings);
      cueOverlay.setAutoAdvance(autoAdvanceRotation);
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
      if (!autoAdvanceRotation) {
        stopTracking();
      } else if (state.active) {
        if (scanResult?.recognized) startTracking();
        else void scanBars(false);
      }
    });
    root.querySelector<HTMLInputElement>("#settings-loop-rotation")?.addEventListener("change", (event) => {
      const loopRotationAtEnd = (event.currentTarget as HTMLInputElement).checked;
      settings = { ...settings, loopRotationAtEnd };
      saveSettings(settings);
      if (settings.showCueOverlay && !placingOverlay) {
        void cueOverlay.draw(upcoming(settings.upcomingAbilities));
      }
    });
    if (activatedId && isAlt1Available()) {
      window.setTimeout(() => {
        if (state.activeId === activatedId) void scanBars(false);
      }, 0);
    }
  };

  document.addEventListener("keydown", (event) => {
    if (!settingsOpen || event.code !== "Escape") return;
    event.preventDefault();
    if (keybindsOpen) {
      keybindsOpen = false;
      render();
      root.querySelector<HTMLButtonElement>("#settings-visual-keybinds")?.focus();
      return;
    }
    settingsOpen = false;
    render();
  });

  // *** Cleanup

  const cleanup = (): void => {
    a1lib.removeListener("alt1pressed", keybindListener);
    stopTracking();
    stopPlacement(false);
    cueOverlay.clear();
    slotOverlay.clear();
    window.clearInterval(keepaliveTimer);
    if (msgTimer !== null) window.clearTimeout(msgTimer);
  };
  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);

  state.subscribe(render);
  render();
}

function cleanPoint(value: unknown): Point | null {
  const point = value as Partial<Point> | null | undefined;
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: Math.round(x), y: Math.round(y) }
    : null;
}

function requireElement(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
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
