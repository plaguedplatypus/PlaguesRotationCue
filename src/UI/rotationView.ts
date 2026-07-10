import {
	abilityBehavior,
	abilityLibrary,
	otherAbilityLibrary,
	rotationCooldownGuide,
	styles,
} from "../Abilities/abilityData";
import type { AbilityMeta } from "../Abilities/abilityData";
import type {
	AppState,
	ConfiguredRotationStep,
	RotationModel,
	TrackedBar,
} from "../types";
import { html } from "../utils";
import {
	isRotationStepSeparator,
	rotationAbilityEntries,
	rotationStepAbilityId,
	STEP_SEPARATOR_LABEL_MAX_LENGTH,
} from "../Rotation/rotationSteps";
import {
	renderAbilityPickerIcon,
	renderAbilityPickerOptions,
} from "./abilityPicker";

export type RotationRenderInput = {
	app: AppState;
	editor: HTMLElement;
	gridText: (bar: TrackedBar) => string;
	findAbilitySlot: (rotation: RotationModel, abilityId: string) => ConfiguredRotationStep | null;
	abilityLabel: (id: string) => string;
	abilityIconRenderSrc: (id: string) => string;
	abilityIconFile: (id: string) => string;
	activeAbilityMenu: () => string;
	openAbilityMenuKey: string;
};

function styleLabel(style: string) {
	return style === "Necromancy" ? "Necro" : style;
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

function combatTabs(input: RotationRenderInput) {
	return `<div class="combat-style-tabs">${styles.map(style => `
		<button class="combat-style-tab ${input.app.activeCombatStyle === style ? "active" : ""}" data-action="select-combat-style" data-style="${style}">${styleLabel(style)}</button>
	`).join("")}</div>`;
}

function rotationStepEditor(input: RotationRenderInput, rot: RotationModel) {
	const steps = Array.isArray(rot.abilitySteps) ? rot.abilitySteps : [];
	const emptyCount = steps.filter(step => !isRotationStepSeparator(step) && !rotationStepAbilityId(step)).length;
	const mappingStates = steps.map(entry => {
		const abilityIdValue = rotationStepAbilityId(entry);
		const behavior = abilityBehavior(abilityIdValue);
		return {
			abilityId: abilityIdValue,
			cueMarker: behavior.cueMarker,
			reminder: behavior.reminder,
			mappedRequired: behavior.mappedRequired,
			stepSeparator: isRotationStepSeparator(entry),
			mapped: abilityIdValue && behavior.mappedRequired
				? input.findAbilitySlot(rot, abilityIdValue)
				: null,
		};
	});
	let displayStepNumber = 0;
	const tiles = steps.map((entry, index) => {
		if (isRotationStepSeparator(entry)) {
			return `
				<div
					class="rotation-step-item rotation-step-separator"
					data-drag-rotation-id="${rot.id}"
					data-drag-step="${index}"
					data-reorderable="${steps.length > 1}"
					title="${html(entry.label)}${steps.length > 1 ? " · Drag to reorder" : ""}">
					<input
						class="rotation-step-separator-label-input"
						data-action="step-separator-label"
						data-id="${rot.id}"
						data-step="${index}"
						value="${html(entry.label)}"
						maxlength="${STEP_SEPARATOR_LABEL_MAX_LENGTH}"
						style="width: ${stepLabelInputWidthPx(entry.label)}px"
						title="Rename step separator"
						aria-label="Step separator label">
					<div class="rotation-step-separator-line"></div>
					<button
						type="button"
						class="mini-button rotation-step-separator-delete"
						data-action="delete-rotation-step"
						data-id="${rot.id}"
						data-step="${index}"
						title="Remove step separator">x</button>
				</div>`;
		}

		displayStepNumber += 1;
		const abilityIdValue = rotationStepAbilityId(entry);
		const mapped = mappingStates[index].mapped;
		const cueMarker = mappingStates[index].cueMarker;
		const reminder = mappingStates[index].reminder;
		const slotText = abilityIdValue
			? cueMarker
				? "cue marker"
				: reminder
					? "visual reminder"
					: mapped ? `slot ${mapped.slot}` : "no slot"
			: "empty";
		const badgeText = abilityIdValue && mappingStates[index].mappedRequired ? (mapped ? `S${mapped.slot}` : "!") : "";
		const mappedBarId = mapped?.barId || "";
		const mappedSlot = mapped?.slot || 0;
		const menuKey = `${rot.id}:${index}`;
		const menuOpen = input.openAbilityMenuKey === menuKey || input.openAbilityMenuKey.startsWith(`${menuKey}:`);
		const abilityText = abilityIdValue ? input.abilityLabel(abilityIdValue) : "";
		const iconSrc = abilityIdValue ? input.abilityIconRenderSrc(abilityIdValue) : "";
		const title = `${abilityText || "Empty"} · ${slotText}`;

		return `
			<div
				class="rotation-step-item rotation-ability-tile ${cueMarker ? "cue-marker" : reminder ? "reminder" : mapped ? "mapped" : abilityIdValue ? "unmapped" : ""} ${menuOpen ? "menu-open" : ""}"
				data-drag-rotation-id="${rot.id}"
				data-drag-step="${index}"
				data-reorderable="${steps.length > 1}"
				title="${html(title)}${steps.length > 1 ? " · Drag to reorder" : ""}">
				<button
					type="button"
					class="slot-face rotation-slot-face ${iconSrc ? "has-ability-icon" : ""}"
					data-action="toggle-ability-menu"
					data-id="${rot.id}"
					data-step="${index}"
					data-slot-face="1"
					data-rotation-id="${rot.id}"
					data-bar-id="${html(mappedBarId)}"
					data-slot="${mappedSlot}">
					${iconSrc ? `<img class="rotation-ability-icon" src="${html(iconSrc)}" data-icon-file="${html(input.abilityIconFile(abilityIdValue))}" alt="">` : ""}
					${badgeText ? `<div class="slot-map-badge">${html(badgeText)}</div>` : ""}
					<div class="slot-step-number">${displayStepNumber}</div>
					${abilityText && !iconSrc ? `<div class="slot-ability-short">${html(abilityText)}</div>` : ""}
				</button>
			</div>`;
	}).join("");
	const configuredStates = mappingStates.filter(state => !!state.abilityId && state.mappedRequired && !state.stepSeparator);
	const mappedCount = configuredStates.filter(state => !!state.mapped).length;
	const missingCounts = new Map<string, number>();
	configuredStates
		.filter(state => !state.mapped)
		.forEach(state => {
			const name = input.abilityLabel(state.abilityId);
			missingCounts.set(name, (missingCounts.get(name) || 0) + 1);
		});
	const missingNames = Array.from(missingCounts.entries()).map(([name, count]) =>
		count > 1 ? `${name} (${count} steps)` : name
	);
	const mappingSummary = configuredStates.length
		? `<div class="rotation-mapping-summary">
			<span>${mappedCount}/${configuredStates.length} mapped</span>
			${missingNames.length
				? `<span class="rotation-mapping-missing">Needs mapping: ${html(missingNames.join(", "))}</span>`
				: `<span class="rotation-mapping-complete">Ready to use</span>`}
		</div>`
		: "";
	const cooldownGuideEntries = rotationCooldownGuide(rotationAbilityEntries(steps));
	const cooldownGuide = cooldownGuideEntries.length
		? `<details class="rotation-cooldown-guide" title="Estimates use steps. Revolution actions and manual delays are not counted.">
			<summary><span class="rotation-cooldown-guide-label">Cooldown Guide</span></summary>
			<div class="rotation-cooldown-guide-note">Advisory only. Excludes Revolution, manual delays, and cooldown modifiers.</div>
			<div class="rotation-cooldown-guide-list">
				${cooldownGuideEntries.map(entry => {
					const cooldown = Number.isInteger(entry.cooldown)
						? String(entry.cooldown)
						: entry.cooldown.toFixed(1);
					const repeat = entry.estimatedRepeatSeconds.toFixed(1);
					const statusClass = `rotation-cooldown-guide-item ${entry.status}`;
					const result = entry.earlyBySeconds > 0.25
						? ` · early by ~${entry.earlyBySeconds.toFixed(1)}s`
						: "";
					return `<div class="${statusClass}">${html(entry.name)} · ${cooldown}s CD · repeats ~${repeat}s later${result}</div>`;
				}).join("")}
			</div>
		</details>`
		: "";

	return `
		<div class="hint">Click a square for abilities. Shift-click for items, prayers, and markers. Hold and drag to reorder entries.</div>
		${tiles ? `<div class="rotation-ability-grid">${tiles}</div>` : ""}
		${mappingSummary}
		${cooldownGuide}
		${input.activeAbilityMenu()}
		<div class="button-row add-step-row">
			<button data-action="add-rotation-step" data-id="${rot.id}" class="primary">+ Add Ability</button>
			<button data-action="add-step-separator" data-id="${rot.id}">+ Add Step</button>
			<button data-action="clear-empty-rotation-steps" data-id="${rot.id}"
				title="${emptyCount ? `Remove ${emptyCount} empty ability slot${emptyCount === 1 ? "" : "s"}` : "No empty ability slots"}"
				${emptyCount ? "" : "disabled"}>Clear Empty</button>
		</div>`;
}

function rotationCard(input: RotationRenderInput, rot: RotationModel, canMoveUp: boolean, canMoveDown: boolean) {
	const active = input.app.activeRotationId === rot.id;
	const entries = Array.isArray(rot.abilitySteps) ? rot.abilitySteps : [];
	const count = entries.filter(entry => !isRotationStepSeparator(entry)).length;
	const separatorCount = entries.filter(isRotationStepSeparator).length;
	const currentStep = count ? Math.min(Number(rot.rotationIndex) || 0, count - 1) + 1 : 0;
	return `
		<div class="rotation-card ${active ? "active-rotation" : ""}">
			<div class="rotation-card-header">
				<button class="mini-button" data-action="toggle-rotation" data-id="${rot.id}" title="${rot.collapsed ? "Edit" : "Minimize"}">${rot.collapsed ? "▸" : "▾"}</button>
				<div class="rotation-order-controls" aria-label="Reorder rotation">
					<button class="mini-button rotation-order-button" data-action="reorder-rotation"
						data-id="${rot.id}" data-style="${html(rot.combatStyle)}" data-direction="up"
						title="Move rotation up" ${canMoveUp ? "" : "disabled"}>↑</button>
					<button class="mini-button rotation-order-button" data-action="reorder-rotation"
						data-id="${rot.id}" data-style="${html(rot.combatStyle)}" data-direction="down"
						title="Move rotation down" ${canMoveDown ? "" : "disabled"}>↓</button>
				</div>
				<input class="rotation-title-input" data-action="rotation-title" data-id="${rot.id}" value="${html(rot.title)}" title="Rotation title">
				<button data-action="set-active-rotation" data-id="${rot.id}" class="${active ? "active-button" : ""}" title="${active ? "Deactivate this rotation" : "Activate this rotation"}">${active ? "Deactivate" : "Activate"}</button>
				<button data-action="delete-rotation" data-id="${rot.id}" class="danger" title="Delete rotation">x</button>
			</div>
			<div class="rotation-meta-actions">
				<span>${count} ${count === 1 ? "ability" : "abilities"}${separatorCount ? ` - ${separatorCount} step${separatorCount === 1 ? "" : "s"}` : ""}${active && count ? ` - current ${currentStep}` : ""}</span>
				${active ? `
					<div class="rotation-recovery-controls" aria-label="Rotation recovery">
						<button data-action="back-active-rotation" data-id="${rot.id}" class="mini-button" title="Go back one rotation step">←</button>
						<button data-action="reset-active-rotation" data-id="${rot.id}" class="mini-button" title="Reset rotation to step one">↺</button>
						<button data-action="skip-active-rotation" data-id="${rot.id}" class="mini-button" title="Skip the current rotation step">→</button>
					</div>` : ""}
				<div class="rotation-import-export">
					<button data-action="scan-rotation" data-id="${rot.id}" title="Scan once to fill missing slot mappings from bundled and learned icons">Scan</button>
					<button data-action="export-rotation" data-id="${rot.id}">Export</button>
					<button data-action="import-rotation" data-id="${rot.id}">Import</button>
				</div>
			</div>
			${rot.collapsed ? "" : rotationStepEditor(input, rot)}
		</div>`;
}

export function renderRotationsView(input: RotationRenderInput) {
	const editor = input.editor;
	const bars = input.app.configuredBars?.length
		? input.app.configuredBars
		: input.app.configuredBar
			? [input.app.configuredBar]
			: [];
	if (!bars.length) {
		editor.innerHTML = combatTabs(input) + `<div class="hint">Add an action bar first.</div>`;
		return;
	}

	const activeStyle = styles.includes(input.app.activeCombatStyle) ? input.app.activeCombatStyle : "Melee";
	const rotations = input.app.rotations.filter(rot => rot.combatStyle === activeStyle);
	editor.innerHTML = combatTabs(input) + `
			<section class="rotation-bar-section">
				<div class="panel-title editor-title bar-section-title">
					<span class="bar-title-text">${bars.length === 1 ? `${html(bars[0].name)} - ${html(input.gridText(bars[0]))}` : `${bars.length} Action Bars`}</span>
					<div class="section-actions">
						<button data-action="add-rotation" data-style="${activeStyle}" class="primary">Add New Rotation</button>
					</div>
				</div>
				<div class="bar-rotations">
					${rotations.length ? rotations.map((rot, index) =>
						rotationCard(input, rot, index > 0, index < rotations.length - 1)
					).join("") : `<div class="hint no-rotations-hint">No ${html(styleLabel(activeStyle))} rotations for this bar yet.</div>`}
				</div>
			</section>`;
}

export type AbilityMenuInput = {
	openAbilityMenuKey: string;
	openAbilityMenuX: number;
	openAbilityMenuY: number;
	openAbilityMenuAnchorTop: number;
	getRotation: (id: string) => RotationModel | null;
	abilityIconRenderSrc: (id: string) => string;
	abilityIconFile: (id: string) => string;
};

function abilityMenuIconHtml(input: AbilityMenuInput, abilityIdValue: string) {
	return renderAbilityPickerIcon(input.abilityIconRenderSrc(abilityIdValue), "ability-menu-icon", "ability-menu-icon-empty");
}

function abilityMenuButton(input: AbilityMenuInput, ability: AbilityMeta, rot: RotationModel, index: number, selectedAbilityId = "") {
	return `
		<button
			type="button"
			class="ability-menu-option ${selectedAbilityId === ability.id ? "selected" : ""}"
			data-action="set-rotation-step-ability"
			data-id="${rot.id}"
			data-step="${index}"
			data-ability-id="${html(ability.id)}">
			${abilityMenuIconHtml(input, ability.id)}
			<span class="ability-menu-label">${html(ability.name)}</span>
		</button>`;
}

function abilityMenuOptions(input: AbilityMenuInput, rot: RotationModel, index: number, selectedAbilityId = "", menuMode: "abilities" | "other" = "abilities") {
	const sourceAbilities = menuMode === "other" ? otherAbilityLibrary : abilityLibrary;
	const modeLabel = menuMode === "other" ? "OTHER" : "ABILITIES";
	return `<div class="ability-menu-mode-title">${modeLabel}</div>` + renderAbilityPickerOptions({
		style: rot.combatStyle,
		abilities: sourceAbilities,
		selectedAbilityId,
		clearHtml: `
			<button
				type="button"
				class="ability-menu-option remove-option"
				data-action="delete-rotation-step"
				data-id="${rot.id}"
				data-step="${index}">
				<span class="ability-menu-label">Remove</span>
			</button>`,
		separatorHtml: `<div class="ability-menu-separator"></div>`,
		sectionTitleClass: "ability-menu-section-title",
		renderOption: ability => abilityMenuButton(input, ability as AbilityMeta, rot, index, selectedAbilityId),
	});
}

export function renderActiveAbilityMenu(input: AbilityMenuInput) {
	if (!input.openAbilityMenuKey) return "";
	const [rotId, stepText, modeText] = input.openAbilityMenuKey.split(":");
	const menuMode: "abilities" | "other" = modeText === "other" ? "other" : "abilities";
	const rot = input.getRotation(rotId);
	const index = Number(stepText);
	if (!rot || !Array.isArray(rot.abilitySteps) || !Number.isFinite(index)) return "";

	const selectedAbilityId = rotationStepAbilityId(rot.abilitySteps[index]);

	const menuWidth = 220;
	const margin = 8;
	const footerReserve = 24;

	const appRoot = document.querySelector(".app") || document.getElementById("app") || document.body;
	const rect = appRoot.getBoundingClientRect();

	const viewportLeft = Math.max(0, rect.left);
	const viewportTop = Math.max(0, rect.top);
	const viewportRight = Math.min(window.innerWidth || rect.right, rect.right);
	const viewportBottom = Math.min(window.innerHeight || rect.bottom, rect.bottom) - footerReserve;

	const requestedX = Number(input.openAbilityMenuX) || viewportLeft + margin;
	const anchorTop = Number(input.openAbilityMenuAnchorTop) || viewportTop + margin;
	const anchorBottom = Number(input.openAbilityMenuY) || anchorTop + 34;

	const safeX = Math.max(viewportLeft + margin, Math.min(requestedX, viewportRight - menuWidth - margin));

	const roomBelow = viewportBottom - anchorBottom - margin;
	const roomAbove = anchorTop - viewportTop - margin;
	const preferredHeight = Math.min(300, Math.max(110, viewportBottom - viewportTop - margin * 2));

	let safeY = anchorBottom + 2;
	let maxHeight = roomBelow;

	if (roomBelow >= 150 || roomBelow >= roomAbove) {
		safeY = Math.max(viewportTop + margin, anchorBottom + 2);
		maxHeight = Math.max(88, viewportBottom - safeY - margin);
	} else {
		maxHeight = Math.max(88, Math.min(preferredHeight, roomAbove));
		safeY = Math.max(viewportTop + margin, anchorTop - maxHeight - 2);
	}

	return `
		<div
			class="ability-floating-menu"
			style="left:${Math.round(safeX)}px; top:${Math.round(safeY)}px; --ability-menu-max-height:${Math.round(maxHeight)}px;"
			data-floating-ability-menu="1">
			${abilityMenuOptions(input, rot, index, selectedAbilityId, menuMode)}
		</div>`;
}
