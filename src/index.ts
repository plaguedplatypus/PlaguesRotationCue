import "./index.html";
import "./appconfig.json";
import "./UI/style.css";

import * as a1lib from "alt1/base";
import {
	captureForTrackedBar,
	createBarScanningApi,
	createManualBarActionsApi,
} from "./Rotation/barConfig";
import { createBarReaderApi } from "./Rotation/barReader";
import {
	abilityById,
	abilityIconFile,
	abilityIconSrc,
	abilityLabel,
	styles,
} from "./Abilities/abilityData";
import {
	createBundledIconTemplateApi,
	createIconMatchingApi,
	createIconTrainingApi,
	iconSimilarity,
	sampleIconVector,
} from "./IconTraining/icons";
import {
	createRotationActionsApi,
	createRCueRuntimeApi,
	createRCueApi,
	createRCueMappingApi,
} from "./Rotation/rotation";
import { createRuntimeLoop } from "./Rotation/runtimeLoop";
import {
	abilityIconRenderSrc,
	installAbilityIconFallbacks,
} from "./UI/abilityPicker";
import { bindAppEvents } from "./UI/events";
import { createAppEventsRenderApi } from "./UI/ui";
import { createCueOverlayApi } from "./UI/overlay";
import { maybeShowUpdateToast } from "./Release/updateToast";
import { createProfileApi } from "./Profile/profile";
import {
	cleanHighlightBorderThickness,
	cleanHighlightColors,
	cleanLargeCueKeybinds,
	cleanLargeCurrentCuePosition,
	createStateStore,
	DEFAULT_HIGHLIGHT_COLORS,
} from "./Profile/stateStore";
import { dateTimeStamp, makeId, saveFile } from "./utils";
import type {
	RotationModel,
	TrackedBar,
} from "./types";

if (window.alt1) {
	window.alt1.identifyAppUrl("./appconfig.json");
}

const CUE_GROUP = "RCue";
const STATE_GROUP = "RCue-state";
const GUIDANCE_GROUP = "RCue-guidance";
const LARGE_CUE_GROUP = "RCue-large-cue";
const PREVIEW_GROUP = "RCue-preview";

function alt1Color(value: string) {
	const color = cleanHighlightColors({ current: value }).current;
	return a1lib.mixColor(
		parseInt(color.slice(1, 3), 16),
		parseInt(color.slice(3, 5), 16),
		parseInt(color.slice(5, 7), 16)
	);
}

const yellow = alt1Color(DEFAULT_HIGHLIGHT_COLORS.current);
const blue = alt1Color(DEFAULT_HIGHLIGHT_COLORS.rotation);


	const $ = (id: string) => document.getElementById(id) as any;
	const stateStore = createStateStore({ makeId });
	const { blankState, cleanBar, cleanBars, cleanRotation } = stateStore;
	let app = stateStore.load();
	const save = () => stateStore.save(app);
	const saveIconTemplates = () => stateStore.saveIconTemplates(app);
	saveIconTemplates();
	let lastKey = "";
	let appEventsRenderApi: ReturnType<typeof createAppEventsRenderApi>;
	let runtimeLoopApi: ReturnType<typeof createRuntimeLoop>;
	let pendingImport: string | null = null;
	let pendingManualLayout = "";
	let largeCuePositionListening = false;
	let largeCuePositionPreviewTimer: number | null = null;
	let openAbilityMenuKey = "";
	let openAbilityMenuX = 0;
	let openAbilityMenuY = 0;
	let openAbilityMenuAnchorTop = 0;
	let pauseUntil = 0;
	let suppressLargeCueSkipUntil = 0;
	let cooldownBaselineStatus = "Cooldown tracking unavailable";
	let iconDetectStatus = "Icon setup optional";


	function hasAlt1() {
		return !!a1lib.hasAlt1;
	}

	function configuredBars(): TrackedBar[] {
		if (!Array.isArray(app.configuredBars)) {
			app.configuredBars = app.configuredBar ? [app.configuredBar] : [];
		}
		app.configuredBar = app.configuredBars[0] || null;
		return app.configuredBars;
	}

	function getConfiguredBar(id: string): TrackedBar | null {
		return configuredBars().find(bar => bar.id === id) || null;
	}

	function getRotation(id: string): RotationModel | null {
		return app.rotations.find(rot => rot.id === id) || null;
	}

	function activeRotation(): RotationModel | null {
		return getRotation(app.activeRotationId);
	}

	function trainingCaptureBar() {
		return configuredBars()[0] || null;
	}

	function largeCueKeybind(barId: string, slot: number) {
		return String(app.largeCueKeybinds?.[barId]?.[String(slot)] || "");
	}


	const iconMatchingApi = createIconMatchingApi({
		app,
		iconSimilarity,
	});

	const bundledIconTemplateApi = createBundledIconTemplateApi({
		abilityIconSrc: id => abilityIconRenderSrc(id) || abilityIconSrc(id),
	});

	const iconTrainingApi = createIconTrainingApi({
		getApp: () => app,
		trainingCaptureBar,
		hasAlt1,
		captureForTrackedBar,
		sampleIconVector,
		availableIconTemplates: iconMatchingApi.availableIconTemplates,
		bestAbilityTemplateMatchFromSet: iconMatchingApi.bestAbilityTemplateMatchFromSet,
		abilityIconRenderSrc,
		learnedTemplateCount: iconMatchingApi.learnedTemplateCount,
		setIconStatus: status => { iconDetectStatus = status; },
		getIconStatus: () => iconDetectStatus,
		deactivateRotationsForEdit: () => RCueRuntimeApi.deactivateRotationsForEdit(),
		save,
		saveIconTemplates,
		render,
		updateFooter,
	});


	const barScanningApi = createBarScanningApi({
		getRotation,
		getConfiguredBars: configuredBars,
		availableIconTemplates: iconMatchingApi.availableIconTemplates,
		bundledIconTemplates: bundledIconTemplateApi.templatesFor,
		learnMatchedIconTemplate: iconMatchingApi.learnIconTemplate,
		captureForTrackedBar,
		sampleIconVector,
		iconSimilarity,
		abilityLabel,
		setIconStatus: status => { iconDetectStatus = status; },
		saveIconTemplates,
		save,
		render,
		updateFooter,
	});


	const RCueMappingApi = createRCueMappingApi({
		app,
	});

	const barReaderApi = createBarReaderApi({
		getConfiguredBars: configuredBars,
		hasAlt1,
		setStatus: value => { cooldownBaselineStatus = value; },
		updateFooter,
	});

	const RCueApi = createRCueApi({
		activeRotation,
		configuredSteps: RCueMappingApi.configuredSteps,
		slotState: step => barReaderApi.slotState(step),
		getFrameId: barReaderApi.getFrameId,
		abilityCooldown: abilityId => Number(abilityById[abilityId]?.cooldown || 0),
		reminderDisplayEnabled: () => !!app.showLargeCurrentCue,
		autoAdvanceCue: () => app.autoAdvanceCue !== false,
	});

	const RCueRuntimeApi = createRCueRuntimeApi({
		app,
		getSlotState: barReaderApi.slotState,
		clearCueGroup: () => cueOverlayApi.clearRotationOverlays(),
		setLastCue: value => { runtimeLoopApi.setLastCue(value); },
		setLastKey: value => { lastKey = value; },
		resetCueEngine: RCueApi.reset,
		setCooldownBaselineStatus: value => { cooldownBaselineStatus = value; },
	});

	const cueOverlayApi = createCueOverlayApi({
		app,
		cueGroup: CUE_GROUP,
		stateGroup: STATE_GROUP,
		guidanceGroup: GUIDANCE_GROUP,
		largeCueGroup: LARGE_CUE_GROUP,
		yellow,
		blue,
		getAbilityIconSrc: abilityIconRenderSrc,
		getAbilityLabel: abilityLabel,
		getHighlightColor: key => alt1Color(app.highlightColors?.[key] || DEFAULT_HIGHLIGHT_COLORS[key]),
		getBorderThickness: () => cleanHighlightBorderThickness(app.highlightBorderThickness),
		isLargeCuePlacementActive: () => largeCuePositionListening,
		getConfiguredBar,
		getLargeCueKeybind: largeCueKeybind,
		cueKey: cue => RCueApi.cueKey(cue),
		getLastKey: () => lastKey,
		setLastKey: value => { lastKey = value; },
		getPauseUntil: () => pauseUntil,
	});
	a1lib.on("rsfocus", () => cueOverlayApi.invalidate());
	a1lib.on("rslinked", () => cueOverlayApi.invalidate());

	function stopLargeCuePositionPreview(clear = true) {
		if (largeCuePositionPreviewTimer !== null) {
			window.clearInterval(largeCuePositionPreviewTimer);
			largeCuePositionPreviewTimer = null;
		}
		if (clear) cueOverlayApi.clearLargeCue();
	}

	function startLargeCuePositionPreview() {
		if (largeCuePositionPreviewTimer !== null) return;
		largeCuePositionPreviewTimer = window.setInterval(() => {
			const pos = a1lib.getMousePosition();
			if (!pos) {
				cueOverlayApi.clearLargeCue();
				return;
			}
			cueOverlayApi.drawLargeCuePlacementPreview(pos);
		}, 100);
	}

	function startLargeCuePositionSetup() {
		if (!hasAlt1()) {
			alert("Open this app inside Alt1 before setting the large cue position.");
			return;
		}

		const status = $("large-cue-position-status") as HTMLElement;
		status.textContent = "Move the preview where you want it, then press Alt+1.";
		status.hidden = false;

		if (largeCuePositionListening) return;

		largeCuePositionListening = true;
		startLargeCuePositionPreview();
		a1lib.once("alt1pressed", (ev: any) => {
			largeCuePositionListening = false;
			stopLargeCuePositionPreview();
			suppressLargeCueSkipUntil = Date.now() + 500;
			status.hidden = true;
			status.textContent = "";
			const pos = ev.mouseRs || ev.mouseAbs || { x: ev.x, y: ev.y };
			const position = cleanLargeCurrentCuePosition(pos);
			if (!position) {
				cueOverlayApi.clearLargeCue();
				alert("Could not read the mouse position. Move the cursor over the RuneScape window and try again.");
				render();
				return;
			}

			app.largeCurrentCuePosition = position;
			save();
			cueOverlayApi.invalidate();
			render();
		});
	}


	function largeCueSkipActionAt(pos: any): "back" | "next" | "" {
		const rotation = activeRotation();
		const position = app.largeCurrentCuePosition;
		if (
			!rotation ||
			!app.overlayEnabled ||
			!app.showLargeCurrentCue ||
			!position
		) return "";

		const pointerX = Number(pos?.x);
		const pointerY = Number(pos?.y);
		const centerX = Number(position.x);
		const centerY = Number(position.y);
		if (
			!Number.isFinite(pointerX) ||
			!Number.isFinite(pointerY) ||
			!Number.isFinite(centerX) ||
			!Number.isFinite(centerY)
		) return "";

		const cueSize = 56;
		const arrowWidth = 14;
		const arrowHeight = 13;
		const rowWidth = 50;
		const rowY = Math.round(centerY - cueSize / 2) - arrowHeight - 2;
		if (rowY < 0) return "";
		const leftX = Math.round(centerX - rowWidth / 2);
		const rightX = Math.round(centerX + rowWidth / 2 - arrowWidth);
		const inside = (x: number, y: number, width: number, height: number) =>
			pointerX >= x && pointerX <= x + width && pointerY >= y && pointerY <= y + height;

		if (inside(leftX - 2, rowY, arrowWidth, arrowHeight)) return "back";
		if (inside(rightX, rowY, arrowWidth, arrowHeight)) return "next";
		return "";
	}

	const rotationActionsApi = createRotationActionsApi({
		app,
		styles,
		getRotation,
		configuredSteps: RCueMappingApi.configuredSteps,
		cleanRotation,
		makeId,
		deactivateRotationsForEdit: RCueRuntimeApi.deactivateRotationsForEdit,
		resetCueLock: RCueRuntimeApi.resetCueLock,
		save,
		render,
		clearCueGroup: () => cueOverlayApi.clearRotationOverlays(),
		scanBarForRotationAbilities: id => barScanningApi.scanBarForRotationAbilities(id),
		calibrateCooldownBaseline: barReaderApi.calibrate,
		setOpenAbilityMenuKey: value => { openAbilityMenuKey = value; },
		setCooldownBaselineStatus: value => { cooldownBaselineStatus = value; },
	});


	a1lib.on("alt1pressed", (ev: any) => {
		// Alt1 overlay drawings are not DOM elements, so the Large Cue skip controls
		// use the same mouse-position event path as position setup. Hover a control
		// and press Alt+1 to activate it while keeping the main app out of the way.
		if (largeCuePositionListening || Date.now() < suppressLargeCueSkipUntil) return;
		const pos = ev.mouseRs || ev.mouseAbs || { x: ev.x, y: ev.y };
		const action = largeCueSkipActionAt(pos);
		if (!action || !app.activeRotationId) return;

		if (action === "back") {
			rotationActionsApi.backActiveRotation(app.activeRotationId);
		} else {
			rotationActionsApi.skipActiveRotation(app.activeRotationId);
		}
		cueOverlayApi.invalidate();
	});

	const profileApi = createProfileApi({
		app,
		blankState,
		cleanBar,
		cleanBars,
		cleanRotation,
		cleanHighlightColors,
		cleanHighlightBorderThickness,
		cleanLargeCurrentCuePosition,
		cleanLargeCueKeybinds,
		getRotation,
		findAbilitySlot: RCueMappingApi.findAbilitySlot,
		slotCount: RCueMappingApi.slotCount,
		makeId,
		deactivateRotationsForEdit: RCueRuntimeApi.deactivateRotationsForEdit,
		resetCueLock: RCueRuntimeApi.resetCueLock,
		saveIconTemplates,
		save,
		render,
		setCooldownBaselineStatus: value => { cooldownBaselineStatus = value; },
		getPendingImport: () => pendingImport,
		setPendingImport: value => { pendingImport = value; },
		getRotationImportInput: () => $("rotation-import-file"),
	});

	const manualBarActionsApi = createManualBarActionsApi({
		app,
		yellow,
		previewGroup: PREVIEW_GROUP,
		cueGroup: CUE_GROUP,
		hasAlt1,
		cleanBar,
		makeId,
		resetCueLock: RCueRuntimeApi.resetCueLock,
		save,
		render,
		clearGroup: cueOverlayApi.clearGroup,
		setLastKey: value => { lastKey = value; },
		setCooldownBaselineStatus: value => { cooldownBaselineStatus = value; },
		getManualLayout: () => String($("manual-layout-select")?.value || "1x14"),
		setPendingManualLayout: value => { pendingManualLayout = value; },
		getPendingManualLayout: () => pendingManualLayout,
		setBarHint: value => { const hint = $("bar-hint"); if (hint) hint.textContent = value; },
	});

	appEventsRenderApi = createAppEventsRenderApi({
		app,
		getElement: $,
		getRotation,
		activeRotation,
		RCueMappingApi,
		manualBarActionsApi,
		RCueRuntimeApi,
		abilityLabel,
		abilityIconRenderSrc,
		abilityIconFile,
		getOpenAbilityMenuKey: () => openAbilityMenuKey,
		getOpenAbilityMenuX: () => openAbilityMenuX,
		getOpenAbilityMenuY: () => openAbilityMenuY,
		getOpenAbilityMenuAnchorTop: () => openAbilityMenuAnchorTop,
		getLastCue: () => runtimeLoopApi.getLastCue(),
		getCooldownBaselineStatus: () => cooldownBaselineStatus,
		getIconDetectStatus: () => iconDetectStatus,
	});

	runtimeLoopApi = createRuntimeLoop({
		app,
		activeRotation,
		getPauseUntil: () => pauseUntil,
		configuredSteps: RCueMappingApi.configuredSteps,
		barReaderApi,
		RCueApi,
		cueOverlayApi,
		updateSlotClasses: appEventsRenderApi.updateSlotClasses,
		updateFooter,
	});


	function updateFooter() {
		appEventsRenderApi.updateFooter();
	}

	function render() {
		appEventsRenderApi.render();
	}

	function exportRuntimeDiagnostics() {
		const bars = configuredBars();
		const rotation = activeRotation();
		const configuredSteps = rotation ? RCueMappingApi.configuredSteps(rotation) : [];
		saveFile(`RCue-debug-${dateTimeStamp()}.json`, {
			type: "RCue-runtime-debug",
			version: 2,
			exportedAt: new Date().toISOString(),
			readerStatus: cooldownBaselineStatus,
			highlightColors: cleanHighlightColors(app.highlightColors),
			highlightBorderThickness: cleanHighlightBorderThickness(app.highlightBorderThickness),
			largeCueKeybinds: cleanLargeCueKeybinds(app.largeCueKeybinds),
			bars: bars.map(bar => ({
				id: bar.id,
				name: bar.name,
				layout: bar.layout,
				slots: bar.slots,
				offsetX: bar.offsetX,
				offsetY: bar.offsetY,
				activeStyleSlotAbilities: rotation
					? (bar.slotAbilitiesByStyle?.[rotation.combatStyle] || {})
					: {},
			})),
			rotation: rotation ? {
				id: rotation.id,
				title: rotation.title,
				combatStyle: rotation.combatStyle,
				abilitySteps: rotation.abilitySteps,
				rotationIndex: rotation.rotationIndex,
				configuredSteps,
			} : null,
			lastCue: runtimeLoopApi.getLastCue(),
			rotationState: runtimeLoopApi.getLastRotationState(),
			frames: barReaderApi.getDiagnostics(),
		});
	}


	function bind() {
		bindAppEvents({
			app,
			styles,
			getOpenAbilityMenuKey: () => openAbilityMenuKey,
			setOpenAbilityMenuKey: value => { openAbilityMenuKey = value; },
			setOpenAbilityMenuX: value => { openAbilityMenuX = value; },
			setOpenAbilityMenuY: value => { openAbilityMenuY = value; },
			setOpenAbilityMenuAnchorTop: value => { openAbilityMenuAnchorTop = value; },
			setPauseUntil: value => { pauseUntil = value; },
			defaultHighlightColors: DEFAULT_HIGHLIGHT_COLORS,
			save,
			render,
			clearCueGroup: () => cueOverlayApi.clearRotationOverlays(),
			clearLargeCue: () => cueOverlayApi.clearLargeCue(),
			startLargeCuePositionSetup,
			manualBarActionsApi,
			profileApi,
			iconTrainingApi,
			rotationActionsApi,
			exportRuntimeDiagnostics,
		}, installAbilityIconFallbacks);
	}


	bind();
	render();
	maybeShowUpdateToast();
	runtimeLoopApi.start();
