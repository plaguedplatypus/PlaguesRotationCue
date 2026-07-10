import type { AppState, HighlightColorKey } from "../types";
import { clampInt, readJsonFile } from "../utils";
import { STEP_SEPARATOR_LABEL_MAX_LENGTH } from "../Rotation/rotationSteps";
import { RCUE_DISCORD_INVITE_URL } from "../Release/releaseNotes";
import { showReleaseNotesModal } from "../Release/updateToast";
import { openLargeCueKeybindWindow } from "./largeCueKeybindWindow";

export type AppEventsDeps = {
	app: AppState;
	styles: string[];
	getOpenAbilityMenuKey: () => string;
	setOpenAbilityMenuKey: (value: string) => void;
	setOpenAbilityMenuX: (value: number) => void;
	setOpenAbilityMenuY: (value: number) => void;
	setOpenAbilityMenuAnchorTop: (value: number) => void;
	setPauseUntil: (value: number) => void;
	defaultHighlightColors: AppState["highlightColors"];
	save: () => void;
	render: () => void;
	clearCueGroup: () => void;
	clearLargeCue: () => void;
	startLargeCuePositionSetup: () => void;
	manualBarActionsApi: any;
	profileApi: any;
	iconTrainingApi: any;
	rotationActionsApi: any;
	exportRuntimeDiagnostics: () => void;
};

const $ = (id: string) => document.getElementById(id) as any;
export const highlightColorKeys: HighlightColorKey[] = ["current", "rotation", "cooldown"];

function pauseUi(deps: AppEventsDeps, ms: number) {
	deps.setPauseUntil(Date.now() + ms);
}

let stepLabelMeasureContext: CanvasRenderingContext2D | null | undefined;

function stepLabelInputWidthPx(label: string) {
	const value = String(label || "Step").slice(0, STEP_SEPARATOR_LABEL_MAX_LENGTH);
	const fallbackWidth = Math.ceil(Math.max(5, value.length) * 6.1) + 10;

	if (typeof document === "undefined") return fallbackWidth;
	if (stepLabelMeasureContext === undefined) {
		const canvas = document.createElement("canvas");
		stepLabelMeasureContext = canvas.getContext("2d");
	}
	if (!stepLabelMeasureContext) return fallbackWidth;

	stepLabelMeasureContext.font = "700 11px Arial, sans-serif";
	return Math.ceil(Math.max(stepLabelMeasureContext.measureText(value || "Step").width, 28)) + 10;
}

export function bindAppEvents(
	deps: AppEventsDeps,
	installAbilityIconFallbacks: (onResolved?: () => void) => void
) {
	installAbilityIconFallbacks(deps.render);
	let draggedRotationId = "";
	let draggedStepIndex = -1;
	let dragPointerId = -1;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStarted = false;
	let dragSourceTile: HTMLElement | null = null;
	let suppressAbilityClickUntil = 0;

	const clearDragClasses = () => {
		document.querySelectorAll(".rotation-step-item.dragging, .rotation-step-item.drag-over")
			.forEach(tile => tile.classList.remove("dragging", "drag-over"));
	};

	const settingsCog = $("app-cog") as HTMLButtonElement;
	const settingsPanel = $("settings-panel") as HTMLElement;
	const positionSettingsPanel = () => {
		const cogRect = settingsCog.getBoundingClientRect();
		const top = Math.max(4, Math.round(cogRect.bottom + 6));
		const right = Math.max(4, Math.round(window.innerWidth - cogRect.right));
		settingsPanel.style.setProperty("--settings-panel-top", `${top}px`);
		settingsPanel.style.setProperty("--settings-panel-right", `${right}px`);
	};
	settingsCog.addEventListener("click", () => {
		positionSettingsPanel();
		settingsPanel.classList.toggle("open");
	});
	window.addEventListener("resize", () => {
		if (settingsPanel.classList.contains("open")) positionSettingsPanel();
	});
	$("show-selected-bar")?.addEventListener("click", () => deps.manualBarActionsApi.drawBarPreview());
	$("join-discord").addEventListener("click", () => {
		try {
			window.open(RCUE_DISCORD_INVITE_URL, "_blank", "noopener");
		} catch {
			window.location.href = RCUE_DISCORD_INVITE_URL;
		}
	});
	$("app-version").addEventListener("click", showReleaseNotesModal);
	$("export-profile").addEventListener("click", () => deps.profileApi.exportProfile());
	$("overlay-enabled").addEventListener("change", function (this: HTMLInputElement) {
		deps.app.overlayEnabled = this.checked;
		deps.save();
		if (!deps.app.overlayEnabled) deps.clearCueGroup();
	});
	$("auto-advance-cue").addEventListener("change", function (this: HTMLInputElement) {
		deps.app.autoAdvanceCue = this.checked;
		deps.save();
	});
	$("show-large-current-cue").addEventListener("change", function (this: HTMLInputElement) {
		deps.app.showLargeCurrentCue = this.checked;
		deps.save();
		if (!this.checked) deps.clearLargeCue();
		deps.render();
	});
	$("set-large-cue-position").addEventListener("click", () => deps.startLargeCuePositionSetup());
	$("large-cue-keybinds-toggle").addEventListener("click", () => {
		openLargeCueKeybindWindow({
			app: deps.app,
			save: deps.save,
			clearLargeCue: deps.clearLargeCue,
			showBarBoxes: barId => deps.manualBarActionsApi.drawBarPreview(barId),
		});
	});
	for (const key of highlightColorKeys) {
		$(`highlight-color-${key}`).addEventListener("change", function (this: HTMLInputElement) {
			deps.app.highlightColors = {
				...deps.defaultHighlightColors,
				...deps.app.highlightColors,
				[key]: this.value,
			};
			deps.save();
			deps.clearCueGroup();
		});
	}
	$("reset-highlight-colors").addEventListener("click", () => {
		deps.app.highlightColors = { ...deps.defaultHighlightColors };
		deps.save();
		deps.clearCueGroup();
		deps.render();
	});
	$("highlight-border-thickness").addEventListener("input", function (this: HTMLInputElement) {
		const thickness = clampInt(this.value, 1, 2, 1);
		deps.app.highlightBorderThickness = thickness;
		$("highlight-border-thickness-value").textContent = `${thickness}px`;
		deps.save();
		deps.clearCueGroup();
	});

	$("profile-import-file").addEventListener("change", (event: Event) => {
		const input = event.target as HTMLInputElement;
		readJsonFile(input.files?.[0], deps.profileApi.importProfile);
		input.value = "";
	});
	$("rotation-import-file").addEventListener("change", (event: Event) => {
		const input = event.target as HTMLInputElement;
		readJsonFile(input.files?.[0], deps.profileApi.importRotation);
		input.value = "";
	});
	document.querySelectorAll(".skill-tab").forEach(rawButton => {
		const button = rawButton as HTMLElement;
		button.addEventListener("click", () => {
			deps.app.activeTab = button.dataset.tab || "bars";
			deps.save();
			deps.render();
		});
	});

	document.body.addEventListener("focusin", (event: Event) => {
		const target = event.target as HTMLElement;
		if (target.closest("select,input,button")) pauseUi(deps, 1500);
	});
	document.body.addEventListener("pointerdown", (event: PointerEvent) => {
		const target = event.target as HTMLElement;
		if (target.closest("select,input,button")) pauseUi(deps, 1500);
		if (target.closest(".rotation-step-separator-label-input")) return;

		const tile = target.closest("[data-drag-rotation-id]") as HTMLElement | null;
		if (event.button !== 0 || !tile || tile.dataset.reorderable !== "true") return;

		draggedRotationId = String(tile.dataset.dragRotationId || "");
		draggedStepIndex = Number(tile.dataset.dragStep);
		if (!draggedRotationId || !Number.isInteger(draggedStepIndex)) return;

		dragPointerId = event.pointerId;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStarted = false;
		dragSourceTile = tile;
		try {
			target.setPointerCapture(event.pointerId);
		} catch {
			// Body listeners still handle drags when pointer capture is unavailable.
		}
	});
	document.body.addEventListener("wheel", () => pauseUi(deps, 900), { passive: true });
	document.body.addEventListener("keydown", (event: KeyboardEvent) => {
		const target = event.target as HTMLElement;
		if (target.closest("select,input")) pauseUi(deps, 900);
	});
	document.body.addEventListener("pointermove", (event: PointerEvent) => {
		if (event.pointerId !== dragPointerId || !dragSourceTile) return;
		if (!dragStarted && Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) < 6) return;

		dragStarted = true;
		dragSourceTile.classList.add("dragging");
		event.preventDefault();

		const hovered = document.elementFromPoint(event.clientX, event.clientY)
			?.closest("[data-drag-rotation-id]") as HTMLElement | null;
		document.querySelectorAll(".rotation-step-item.drag-over")
			.forEach(item => item.classList.remove("drag-over"));
		if (
			hovered &&
			hovered.dataset.dragRotationId === draggedRotationId &&
			Number(hovered.dataset.dragStep) !== draggedStepIndex
		) {
			hovered.classList.add("drag-over");
		}
	});
	document.body.addEventListener("pointerup", (event: PointerEvent) => {
		if (event.pointerId !== dragPointerId) return;

		const dropTile = document.querySelector(".rotation-step-item.drag-over") as HTMLElement | null;
		const rotationId = draggedRotationId;
		const fromIndex = draggedStepIndex;
		const toIndex = Number(dropTile?.dataset.dragStep);
		const shouldMove = dragStarted && Number.isInteger(toIndex);
		if (dragStarted) {
			event.preventDefault();
			suppressAbilityClickUntil = Date.now() + 250;
		}

		clearDragClasses();
		draggedRotationId = "";
		draggedStepIndex = -1;
		dragPointerId = -1;
		dragStarted = false;
		dragSourceTile = null;

		if (shouldMove) deps.rotationActionsApi.moveRotationStep(rotationId, fromIndex, toIndex);
	});
	document.body.addEventListener("pointercancel", () => {
		clearDragClasses();
		draggedRotationId = "";
		draggedStepIndex = -1;
		dragPointerId = -1;
		dragStarted = false;
		dragSourceTile = null;
	});

	document.body.addEventListener("click", (event: MouseEvent) => {
		const target = event.target as HTMLElement;
		const button = target.closest("button") as HTMLElement | null;
		if (button) {
			event.preventDefault();
			event.stopPropagation();

			const { action, id, style } = button.dataset;
			if (action === "open-bar-map") { deps.iconTrainingApi.openBarSlotAbilityWindow(); return; }
			if (action === "export-runtime-debug") { deps.exportRuntimeDiagnostics(); return; }
			if (action === "show-bar-boxes") { deps.manualBarActionsApi.drawBarPreview(String(id || "")); return; }
			if (action === "delete-bar") { deps.manualBarActionsApi.deleteBar(String(id || "")); return; }
			if (action === "nudge-bar") {
				deps.manualBarActionsApi.nudgeBar(
					String(id || ""),
					Number(button.dataset.dx || 0) * (event.shiftKey ? 5 : 1),
					Number(button.dataset.dy || 0) * (event.shiftKey ? 5 : 1)
				);
				return;
			}
			if (action === "reset-bar-offset") { deps.manualBarActionsApi.resetBarOffset(String(id || "")); return; }
			if (action === "select-combat-style" && deps.styles.includes(String(style || ""))) {
				deps.app.activeCombatStyle = String(style || "Melee");
				deps.save();
				deps.render();
				return;
			}
			if (action === "add-rotation") {
				deps.rotationActionsApi.createRotation(String(style || deps.app.activeCombatStyle || "Melee"));
				return;
			}
			if (action === "reorder-rotation") {
				deps.rotationActionsApi.reorderRotation(
					String(style || ""),
					String(id || ""),
					button.dataset.direction
				);
				return;
			}
			if (action === "add-rotation-step") { deps.rotationActionsApi.addRotationStep(String(id || "")); return; }
			if (action === "add-step-separator") { deps.rotationActionsApi.addStepSeparator(String(id || "")); return; }
			if (action === "clear-empty-rotation-steps") { deps.rotationActionsApi.clearEmptyRotationSteps(String(id || "")); return; }
			if (action === "toggle-ability-menu") {
				if (Date.now() < suppressAbilityClickUntil) return;
				const menuMode = event.shiftKey ? "other" : "abilities";
				const key = `${id}:${button.dataset.step}:${menuMode}`;
				if (deps.getOpenAbilityMenuKey() === key) {
					deps.setOpenAbilityMenuKey("");
				} else {
					const rect = button.getBoundingClientRect();
					deps.setOpenAbilityMenuKey(key);
					deps.setOpenAbilityMenuX(Math.round(rect.left));
					deps.setOpenAbilityMenuY(Math.round(rect.bottom + 2));
					deps.setOpenAbilityMenuAnchorTop(Math.round(rect.top));
				}
				deps.render();
				return;
			}
			if (action === "set-rotation-step-ability") {
				deps.rotationActionsApi.setRotationStep(id, button.dataset.step, button.dataset.abilityId || "");
				return;
			}
			if (action === "clear-rotation-step") {
				deps.rotationActionsApi.clearRotationStep(id, button.dataset.step);
				return;
			}
			if (action === "delete-rotation-step") { deps.rotationActionsApi.deleteRotationStep(id, button.dataset.step); return; }
			if (action === "delete-rotation") { deps.rotationActionsApi.deleteRotation(String(id || "")); return; }
			if (action === "set-active-rotation") { deps.rotationActionsApi.setActive(String(id || "")); return; }
			if (action === "scan-rotation") { deps.rotationActionsApi.scanRotation(String(id || "")); return; }
			if (action === "reset-active-rotation") {
				deps.setPauseUntil(0);
				deps.rotationActionsApi.resetActiveRotation(String(id || ""));
				return;
			}
			if (action === "back-active-rotation") {
				deps.setPauseUntil(0);
				deps.rotationActionsApi.backActiveRotation(String(id || ""));
				return;
			}
			if (action === "skip-active-rotation") {
				deps.setPauseUntil(0);
				deps.rotationActionsApi.skipActiveRotation(String(id || ""));
				return;
			}
			if (action === "toggle-rotation") { deps.rotationActionsApi.toggleRotation(String(id || "")); return; }
			if (action === "export-rotation") { deps.profileApi.exportRotation(id); return; }
			if (action === "import-rotation") { deps.profileApi.requestImport(id); return; }
			return;
		}

		if (target.closest("select,input")) return;
		if (deps.getOpenAbilityMenuKey() && !target.closest(".rotation-ability-tile") && !target.closest("[data-floating-ability-menu]")) {
			deps.setOpenAbilityMenuKey("");
			deps.render();
			return;
		}

	});

	document.body.addEventListener("change", event => {
		if (!(event.target instanceof HTMLSelectElement)) return;
		pauseUi(deps, 800);
		if (event.target.dataset.action === "rotation-step-ability") {
			deps.rotationActionsApi.setRotationStep(event.target.dataset.id, event.target.dataset.step, event.target.value);
		}
	});

	document.body.addEventListener("input", event => {
		if (!(event.target instanceof HTMLInputElement)) return;
		if (event.target.dataset.action === "rotation-title") {
			deps.rotationActionsApi.setTitle(event.target.dataset.id, event.target.value);
		}
		if (event.target.dataset.action === "step-separator-label") {
			const cleanLabel = String(event.target.value || "").slice(0, STEP_SEPARATOR_LABEL_MAX_LENGTH);
			if (event.target.value !== cleanLabel) event.target.value = cleanLabel;
			event.target.style.width = `${stepLabelInputWidthPx(cleanLabel)}px`;
			deps.rotationActionsApi.setStepSeparatorLabel(
				event.target.dataset.id,
				event.target.dataset.step,
				cleanLabel
			);
		}
	});
}
