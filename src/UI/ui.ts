import type { AppState, RotationModel } from "../types";
import { clampInt } from "../utils";
import { RCUE_RELEASE_ID } from "../Release/releaseNotes";
import { highlightColorKeys } from "./events";
import {
	abilityIconRenderSrc,
} from "./abilityPicker";
import { renderBarsView } from "./barView";
import {
	renderActiveAbilityMenu,
	renderRotationsView,
} from "./rotationView";
type AppEventsRenderDeps = {
	app: AppState;
	getElement: (id: string) => any;
	getRotation: (id: string) => RotationModel | null;
	activeRotation: () => RotationModel | null;
	RCueMappingApi: any;
	manualBarActionsApi: any;
	RCueRuntimeApi: any;
	abilityLabel: (id: string) => string;
	abilityIconRenderSrc?: (id: string) => string;
	abilityIconFile: (id: string) => string;
	getOpenAbilityMenuKey: () => string;
	getOpenAbilityMenuX: () => number;
	getOpenAbilityMenuY: () => number;
	getOpenAbilityMenuAnchorTop: () => number;
	getLastCue: () => any;
	getCooldownBaselineStatus: () => string;
	getIconDetectStatus: () => string;
};

export function createAppEventsRenderApi(deps: AppEventsRenderDeps) {
	const iconSrcForAbility = deps.abilityIconRenderSrc || abilityIconRenderSrc;
	let lastFooterText = "";
	let slotFaces: HTMLElement[] = [];

	function compactFooterStatus(status: string) {
		if (status === "Cooldown tracking ready") return "Tracking ready";
		if (status === "Cooldown tracking unavailable") return "Tracking unavailable";

		const updatedIcons = /^All rotation abilities are mapped; updated (\d+) learned icons?$/.exec(status);
		if (updatedIcons) {
			const count = Number(updatedIcons[1]);
			return count ? `${count} icon${count === 1 ? "" : "s"} updated` : "No icons updated";
		}

		if (status === "All rotation abilities are mapped; learned icons could not be updated") {
			return "Learned icons not updated";
		}

		const scanResult = /^Scan (complete|incomplete): (\d+\/\d+) mapped; (\d+) need review$/.exec(status);
		if (scanResult) {
			const reviewCount = Number(scanResult[3]);
			return reviewCount
				? `Scan ${scanResult[2]} · ${reviewCount} to review`
				: `Scan ${scanResult[2]}`;
		}

		return status;
	}

	function renderSettingsVersion() {
		const version = deps.getElement("app-version") as HTMLElement | null;
		if (version) version.textContent = `Version ${RCUE_RELEASE_ID}`;
	}

	function renderBars() {
		renderBarsView({
			app: deps.app,
			startManualBarSetup: deps.manualBarActionsApi.startManualBarSetup,
			gridText: deps.RCueMappingApi.gridText,
		});
	}

	function activeAbilityMenu() {
		return renderActiveAbilityMenu({
			openAbilityMenuKey: deps.getOpenAbilityMenuKey(),
			openAbilityMenuX: deps.getOpenAbilityMenuX(),
			openAbilityMenuY: deps.getOpenAbilityMenuY(),
			openAbilityMenuAnchorTop: deps.getOpenAbilityMenuAnchorTop(),
			getRotation: deps.getRotation,
			abilityIconRenderSrc: iconSrcForAbility,
			abilityIconFile: deps.abilityIconFile,
		});
	}

	function renderRotations() {
		const editor = deps.getElement("rotation-editor");
		renderRotationsView({
			app: deps.app,
			editor,
			gridText: deps.RCueMappingApi.gridText,
			findAbilitySlot: deps.RCueMappingApi.findAbilitySlot,
			abilityLabel: deps.abilityLabel,
			abilityIconRenderSrc: iconSrcForAbility,
			abilityIconFile: deps.abilityIconFile,
			activeAbilityMenu,
			openAbilityMenuKey: deps.getOpenAbilityMenuKey(),
		});
		slotFaces = Array.from(editor.querySelectorAll("[data-slot-face]")) as HTMLElement[];
	}

	function updateSlotClasses(cue: any) {
		if (deps.app.activeTab !== "rotation") return;
		const activeRotationId = deps.activeRotation()?.id || "";
		const anchorStep = cue?.anchorStep || cue?.step;
		slotFaces.forEach(el => {
			const rotId = el.getAttribute("data-rotation-id");
			const barId = el.getAttribute("data-bar-id");
			const slot = Number(el.getAttribute("data-slot"));
			const step = Number(el.getAttribute("data-step"));
			const rot = deps.getRotation(String(rotId || ""));
			if (!rot) return;
			const state = rotId === activeRotationId
				? deps.RCueRuntimeApi.slotState({ barId: String(barId || ""), slot })
				: { status: "inactive" };
			const suggested =
				rotId === activeRotationId &&
				anchorStep?.mapped &&
				anchorStep.rotationId === rotId &&
				anchorStep.barId === barId &&
				Number(anchorStep.slot) === slot &&
				Number(anchorStep.order) === step;
			const classKey = `${state.status}:${suggested ? cue.mode : ""}`;
			if (el.dataset.runtimeClassKey === classKey) return;
			el.dataset.runtimeClassKey = classKey;
			el.classList.toggle("ready", state.status === "ready");
			el.classList.toggle("cooldown", state.status === "cooldown");
			el.classList.toggle("unknown", state.status === "unknown");
			el.classList.toggle("suggested", !!suggested);
			el.classList.toggle("recovery", !!suggested && cue.mode === "recovery");
		});
	}

	function updateFooter() {
		const rot = deps.activeRotation();
		const activeText = rot ? `Active: ${rot.title}` : "No active rotation";
		const lines: string[] = [];
		if (rot) lines.push(compactFooterStatus(deps.getCooldownBaselineStatus()));
		const iconStatus = deps.getIconDetectStatus();
		if (iconStatus && iconStatus !== "Icon setup optional") {
			lines.push(...compactFooterStatus(iconStatus).split(/\s*;\s*/).filter(Boolean));
		}
		const nextText = `${activeText}|${lines.join("|")}`;
		if (nextText !== lastFooterText) {
			deps.getElement("selected-footer").textContent = activeText;
			const footer = deps.getElement("status-footer");
			const items = lines.map(line => {
				const item = document.createElement("span");
				item.className = "footer-status-item";
				item.textContent = line;
				return item;
			});
			footer.replaceChildren(...items);
			lastFooterText = nextText;
		}
	}

	function render() {
		document.querySelectorAll<HTMLElement>(".skill-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === deps.app.activeTab));
		document.querySelectorAll(".tab-page").forEach(page => page.classList.remove("active"));
		deps.getElement("tab-" + deps.app.activeTab)?.classList.add("active");
		deps.getElement("overlay-enabled").checked = !!deps.app.overlayEnabled;
		deps.getElement("auto-advance-cue").checked = deps.app.autoAdvanceCue !== false;
		deps.getElement("show-large-current-cue").checked = !!deps.app.showLargeCurrentCue;
		deps.getElement("set-large-cue-position").disabled = !deps.app.showLargeCurrentCue;
		const largeCueStatus = deps.getElement("large-cue-position-status");
		largeCueStatus.hidden = true;
		largeCueStatus.textContent = "";
		renderSettingsVersion();
		for (const key of highlightColorKeys) {
			deps.getElement(`highlight-color-${key}`).value = deps.app.highlightColors?.[key] || "";
		}
		const thickness = clampInt(deps.app.highlightBorderThickness, 1, 2, 1);
		deps.getElement("highlight-border-thickness").value = String(thickness);
		deps.getElement("highlight-border-thickness-value").textContent = `${thickness}px`;
		renderBars();
		renderRotations();
		updateFooter();
		updateSlotClasses(deps.getLastCue());
	}

	return {
		updateSlotClasses,
		updateFooter,
		render,
	};
}
