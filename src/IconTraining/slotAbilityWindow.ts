import { popupAbilityPickerScript } from "../UI/abilityPicker";
import type { AbilityOption, IconTrainingProfiles } from "../types";

type SlotGroup = {
	title: string;
	slots: Array<{ storageSlot: number; displaySlot: number }>;
};

type SlotAbilityWindowData = {
	activeCombatStyle: string;
	barName: string;
	barLayout: string;
	slotCount: number;
	bars?: Array<{
		id: string;
		name: string;
		layout: string;
		slotCount: number;
		profiles: IconTrainingProfiles;
	}>;
	styles: string[];
	profiles: IconTrainingProfiles;
	abilities: AbilityOption[];
	otherAbilities?: AbilityOption[];
	status: string;
	slotGroups?: SlotGroup[];
};

type SlotAbilityWindowOptions = SlotAbilityWindowData & {
	onSetTrainingSlot: (style: string, barId: string, slot: number, abilityId: string) => SlotAbilityWindowData | null;
	onLearnIcons: (style: string) => SlotAbilityWindowData | null;
	onAutoDetect: (style: string, barId: string) => SlotAbilityWindowData | null;
	onClearTrainingProfile: (style: string) => SlotAbilityWindowData | null;
	onClearLearned: () => SlotAbilityWindowData | null;
	onSelectStyle: (style: string) => SlotAbilityWindowData | null;
};

export function slotGroupsForBar(slotCount: number, barLayout: string): SlotGroup[] {
	const localSlots = Array.from({ length: 14 }, (_, index) => index + 1);
	const group = (title: string, offset: number): SlotGroup => ({
		title,
		slots: localSlots.map(slot => ({
			storageSlot: offset + slot,
			displaySlot: slot,
		})),
	});

	if (String(barLayout || "").replace(/x/g, "x") === "2x14" || Number(slotCount) > 14) {
		return [
			group("Top bar · slots 1-14", 0),
			group("Bottom bar · slots 1-14", 14),
		];
	}

	return [group("", 0)];
}

export function openSlotAbilityWindow(options: SlotAbilityWindowOptions) {
	const popupName = "rotation_cue_icon_training_settings";
	const popupHeight = Number(options.slotCount) > 14 ? 760 : 560;
	const win = window.open("", popupName, `width=700,height=${popupHeight},resizable=yes,scrollbars=yes`);
	if (!win) {
		alert("Popup blocked. Allow popups for this local app to edit icon training settings.");
		return;
	}

	const apiKey = "__RCueIconTrainingApi";
	(window as any)[apiKey] = {
		setTrainingSlot: options.onSetTrainingSlot,
		learnIcons: options.onLearnIcons,
		autoDetect: options.onAutoDetect,
		clearTrainingProfile: options.onClearTrainingProfile,
		clearLearned: options.onClearLearned,
		selectStyle: options.onSelectStyle,
	};

	const initialData: SlotAbilityWindowData = {
		activeCombatStyle: options.activeCombatStyle,
		barName: options.barName,
		barLayout: options.barLayout,
		slotCount: options.slotCount,
		bars: options.bars || [],
		styles: options.styles,
		profiles: options.profiles || {},
		abilities: options.abilities,
		otherAbilities: options.otherAbilities || [],
		status: options.status,
		slotGroups: slotGroupsForBar(options.slotCount, options.barLayout),
	};

	win.document.open();
	win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Rotation Cue - Map Abilities / Learned Icons</title>
<style>
:root {
	--bg: #101419;
	--panel: #181f24;
	--panel-2: #262626;
	--border: #4a4030;
	--border-soft: #302c25;
	--gold: #d8c58a;
	--gold-bright: #d9a441;
	--gold-soft: #5a4a2a;
	--text: #f1f1f1;
	--muted: #aeb1ad;
}
* { box-sizing: border-box; }
* {
	scrollbar-color: #9b7a36 #161a1d;
	scrollbar-width: thin;
}
*::-webkit-scrollbar {
	width: 8px;
	height: 8px;
}
*::-webkit-scrollbar-button {
	display: none;
	width: 0;
	height: 0;
}
*::-webkit-scrollbar-track {
	background: #161a1d;
}
*::-webkit-scrollbar-thumb {
	min-height: 48px;
	border: 1px solid #161a1d;
	background: #9b7a36;
}
*::-webkit-scrollbar-thumb:hover {
	background: #d9a441;
}
html, body {
	margin: 0;
	padding: 0;
	width: 100%;
	min-height: 100%;
	background: var(--bg);
	color: var(--text);
	font-family: Arial, Helvetica, sans-serif;
	font-size: 12px;
}
body {
	padding: 6px;
	background:
		radial-gradient(circle at 50% 0%, rgba(90, 74, 42, .16), transparent 38%),
		linear-gradient(180deg, rgba(18, 27, 32, .98), rgba(12, 17, 22, .98));
}
button {
	border: 1px solid var(--border);
	background: linear-gradient(#262626, #1e1e1e);
	color: var(--gold);
	padding: 3px 6px;
	border-radius: 3px;
	cursor: pointer;
	box-shadow:
		inset 1px 1px 0 rgba(255,255,255,.05),
		inset -1px -1px 0 rgba(0,0,0,.74);
	min-height: 22px;
	font: inherit;
	text-shadow: 0 1px 0 #000;
}
button:hover { border-color: #9b7a36; color: #fff0bd; }
button:active:not(:disabled) { transform: translateY(1px); }
button.primary {
	border-color: var(--gold-bright);
	background: linear-gradient(#4a3518, #20170c);
	box-shadow:
		inset 0 0 4px rgba(255, 200, 80, .28),
		0 0 3px rgba(255, 180, 60, .32);
	color: #fff2c4;
}
button.danger {
	border-color: #734747;
	background: linear-gradient(#412222, #241212);
}
.header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding-bottom: 5px;
	margin-bottom: 5px;
	border-bottom: 1px solid rgba(176,154,96,.22);
}
.title {
	flex: 1 1 auto;
	min-width: 0;
	font-weight: 700;
	color: var(--gold);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.sub {
	color: var(--muted);
	font-size: 11px;
	margin-bottom: 5px;
}
.button-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 4px;
	flex-wrap: wrap;
	margin: 5px 0;
}
.button-row button {
	font-size: 10px;
	height: 22px;
	padding: 2px 5px;
}
.button-group {
	display: flex;
	align-items: center;
	gap: 4px;
	flex-wrap: wrap;
}
.hint {
	color: var(--muted);
	font-size: 11px;
	line-height: 1.25;
	margin: 4px 0 5px;
}
.tabs {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 3px;
	margin: 5px 0;
}
.tabs button {
	min-width: 0;
	height: 22px;
	padding: 2px;
	font-size: 11px;
	overflow: hidden;
	text-overflow: ellipsis;
}
.tabs button.active {
	border-color: var(--gold-bright);
	background: linear-gradient(#4a3518, #20170c);
	box-shadow:
		inset 0 0 4px rgba(255, 200, 80, .35),
		0 0 3px rgba(255, 180, 60, .38);
	color: #fff2aa;
}
.map-panel {
	border: 2px solid var(--gold-soft);
	border-radius: 5px;
	background: rgba(14, 29, 37, .72);
	margin-top: 7px;
	padding: 6px;
}
.map-panel-header {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 5px;
}
.map-panel-title {
	flex: 1 1 auto;
	min-width: 0;
	font-weight: 700;
	color: var(--gold);
}
.slot-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	column-gap: 10px;
	row-gap: 4px;
	margin-top: 6px;
	position: relative;
}
.slot-group + .slot-group {
	margin-top: 10px;
	padding-top: 9px;
	border-top: 1px solid rgba(216,197,138,.25);
}
.slot-group-title {
	margin-bottom: 4px;
	color: #fff2c4;
	font-size: 11px;
	font-weight: 700;
}
.slot-grid::before {
	content: "";
	position: absolute;
	top: 0;
	bottom: 0;
	left: 50%;
	width: 1px;
	background: rgba(216,197,138,.25);
	transform: translateX(-.5px);
	pointer-events: none;
}
.slot-col {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}
.slot-col.left { padding-right: 5px; }
.slot-col.right { padding-left: 5px; }
.slot-row {
	position: relative;
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
}
.slot-num {
	flex: 0 0 18px;
	color: var(--muted);
	font-size: 10px;
	text-align: right;
}
.slot-picker {
	flex: 1 1 auto;
	min-width: 0;
	height: 23px;
	display: flex;
	align-items: center;
	gap: 5px;
	text-align: left;
	font-size: 10px;
	padding: 2px 5px;
}
.ability-icon,
.ability-menu-mode-title {
	padding: 4px 5px 5px;
	border-bottom: 1px solid var(--border-soft);
	color: var(--gold);
	font-size: 10px;
	font-weight: 800;
	letter-spacing: 0.4px;
	text-transform: uppercase;
}

.slot-picker .ability-menu-icon {
	width: 18px;
	height: 18px;
	flex: 0 0 18px;
	object-fit: contain;
	border-radius: 2px;
}
.ability-label {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.ability-floating-menu {
	position: fixed !important;
	left: var(--menu-x, 8px);
	top: var(--menu-y, 8px);
	width: 220px !important;
	max-height: var(--ability-menu-max-height, 280px) !important;
	overflow-y: auto !important;
	overflow-x: hidden !important;
	overscroll-behavior: contain;
	z-index: 999999 !important;
	padding: 4px;
	border: 2px solid var(--gold-soft);
	border-radius: 4px;
	background: rgba(12, 20, 24, .98);
	box-shadow: 0 6px 20px rgba(0,0,0,.72);
	display: grid;
	grid-auto-rows: max-content;
	scrollbar-width: thin;
}
.ability-menu-option {
	display: grid !important;
	grid-template-columns: 24px minmax(0, 1fr);
	align-items: center;
	gap: 6px;
	width: 100%;
	min-height: 28px;
	padding: 2px 5px;
	border: 1px solid transparent;
	background: transparent;
	color: #fff;
	text-align: left;
	font-size: 10px;
	font-weight: 600;
	white-space: nowrap;
}
.ability-menu-option:hover,
.ability-menu-option.selected {
	border-color: var(--border);
	background: #252525;
}
.ability-menu-option.selected {
	box-shadow: inset 2px 0 0 var(--gold);
}
.ability-menu-option.remove-option {
	display: flex !important;
	color: #ffb8b8;
}
.ability-menu-icon,
.ability-menu-icon-empty {
	width: 24px;
	height: 24px;
	border-radius: 2px;
	object-fit: cover;
	pointer-events: none;
}
.ability-menu-icon-empty {
	border: 1px dashed var(--border-soft);
}
.ability-menu-label {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	pointer-events: none;
}
.ability-menu-section-title {
	padding: 5px 5px 2px;
	color: var(--gold);
	font-size: 10px;
	font-weight: 700;
	text-transform: uppercase;
	white-space: nowrap;
}
.ability-menu-separator {
	height: 1px;
	background: var(--border-soft);
	margin: 3px 2px;
}
@media (max-width: 520px) {
	.slot-grid { grid-template-columns: 1fr; }
	.slot-grid::before { display: none; }
	.slot-col.left, .slot-col.right { padding-left: 0; padding-right: 0; }
	.map-panel-header { flex-wrap: wrap; }
}
</style>
</head>
<body>
<div id="root"></div>
<script>
const API_KEY = ${JSON.stringify(apiKey)};
let data = ${JSON.stringify(initialData)};
let activeStyle = data.activeCombatStyle || "Melee";
let openSlot = 0;
let openBarId = "";
let openMenuMode = "abilities";
let menuX = 8;
let menuY = 8;
let menuMaxHeight = 260;

function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

${popupAbilityPickerScript()}

function profile() {
	return profileForBar((data.bars || [])[0]?.id || "");
}

function barById(barId) {
	return (data.bars || []).find(bar => String(bar.id || "") === String(barId || "")) || null;
}

function profileForBar(barId) {
	const bar = barById(barId);
	if (bar) {
		if (!bar.profiles) bar.profiles = {};
		if (!bar.profiles[activeStyle]) bar.profiles[activeStyle] = { slotAbilities: {} };
		return bar.profiles[activeStyle];
	}
	if (!data.profiles) data.profiles = {};
	if (!data.profiles[activeStyle]) data.profiles[activeStyle] = { slotAbilities: {} };
	return data.profiles[activeStyle];
}

function slotButton(bar, slotNum, displayNum) {
	const selected = String((profileForBar(bar.id).slotAbilities || {})[String(slotNum)] || "");
	const ability = abilityPickerById([...(data.abilities || []), ...(data.otherAbilities || [])], selected);
	return '<div class="slot-row">' +
		'<span class="slot-num">' + displayNum + '</span>' +
		'<button class="slot-picker" data-action="toggle-menu" data-bar-id="' + esc(bar.id) + '" data-slot="' + slotNum + '">' +
			abilityPickerIconHtml(ability) +
			'<span class="ability-label">' + esc(ability ? ability.name : "Slot ability...") + '</span>' +
		'</button>' +
	'</div>';
}

function slotGroupHtml(bar, group) {
	const slots = Array.isArray(group.slots) ? group.slots : [];
	return '<div class="slot-group">' +
		(group.title ? '<div class="slot-group-title">' + esc(group.title) + '</div>' : '') +
		'<div class="slot-grid">' +
			'<div class="slot-col left">' + slots.slice(0, 7).map(slot => slotButton(bar, slot.storageSlot, slot.displaySlot)).join("") + '</div>' +
			'<div class="slot-col right">' + slots.slice(7).map(slot => slotButton(bar, slot.storageSlot, slot.displaySlot)).join("") + '</div>' +
		'</div>' +
	'</div>';
}

function slotGroupsForWindowBar(bar) {
	if (Array.isArray(bar.slotGroups)) return bar.slotGroups;
	const slotCount = Number(bar.slotCount) || 0;
	const localSlots = Array.from({ length: 14 }, (_, index) => index + 1);
	const group = (title, offset) => ({
		title,
		slots: localSlots.map(slot => ({ storageSlot: offset + slot, displaySlot: slot }))
	});
	return String(bar.layout || "").replace(/x/g, "x") === "2x14" || slotCount > 14
		? [group("Top bar · slots 1-14", 0), group("Bottom bar · slots 1-14", 14)]
		: [group("", 0)];
}

function slotGridHtml(bar) {
	return slotGroupsForWindowBar(bar).map(group => slotGroupHtml(bar, group)).join("");
}

function menuHtml() {
	if (!openSlot) return "";
	const selected = String((profileForBar(openBarId).slotAbilities || {})[String(openSlot)] || "");
	const menuAbilities = openMenuMode === "other" ? (data.otherAbilities || []) : (data.abilities || []);
	const modeLabel = openMenuMode === "other" ? "OTHER" : "ABILITIES";
	const options = renderAbilityPickerOptions({
		style: activeStyle,
		abilities: menuAbilities,
		selectedAbilityId: selected,
		clearHtml:
			'<button class="ability-menu-option remove-option" data-action="set-slot" data-bar-id="' + esc(openBarId) + '" data-slot="' + openSlot + '" data-ability-id="">' +
				'<span class="ability-menu-label">Clear slot</span>' +
			'</button>',
		separatorHtml: '<div class="ability-menu-separator"></div>',
		sectionTitleClass: "ability-menu-section-title",
		renderOption: ability =>
			'<button class="ability-menu-option ' + (selected === ability.id ? "selected" : "") + '" data-action="set-slot" data-bar-id="' + esc(openBarId) + '" data-slot="' + openSlot + '" data-ability-id="' + esc(ability.id) + '">' +
				abilityPickerIconHtml(ability) +
				'<span class="ability-menu-label">' + esc(ability.name) + '</span>' +
			'</button>'
	});

	return '<div class="ability-floating-menu" style="--menu-x:' + menuX + 'px; --menu-y:' + menuY + 'px; --ability-menu-max-height:' + menuMaxHeight + 'px;">' +
		'<div class="ability-menu-mode-title">' + modeLabel + '</div>' +
		options +
	'</div>';
}

function barPanelHtml(bar) {
	const slotCount = Number(bar.slotCount) || 0;
	return '<section class="map-panel" data-bar-id="' + esc(bar.id) + '">' +
		'<div class="map-panel-header">' +
			'<div class="map-panel-title">' + esc(bar.name || "Action Bar") + '</div>' +
			'<button data-action="auto-detect" data-bar-id="' + esc(bar.id) + '" title="Fill empty slots from saved learned icons">Fill Learned</button>' +
		'</div>' +
		'<div class="hint">(' + slotCount + ' slot' + (slotCount === 1 ? '' : 's') + ')</div>' +
		slotGridHtml(bar) +
	'</section>';
}

function render() {
	const bars = Array.isArray(data.bars) && data.bars.length
		? data.bars
		: [{
			id: "default",
			name: data.barName || "Action Bar",
			layout: data.barLayout || "1x14",
			slotCount: Number(data.slotCount) || 0,
			profiles: data.profiles || {}
		}];
	document.getElementById("root").innerHTML =
		'<div class="header">' +
			'<div class="title">Map Abilities / Learned Icons</div>' +
		'</div>' +
		'<div class="sub">' + esc(data.barName || "No action bars") + '</div>' +
		'<div class="button-row">' +
			'<div class="button-group">' +
				'<button class="primary" data-action="learn-icons">Learn Mapped Abilities</button>' +
				'<button data-action="clear-style">Clear Slots</button>' +
			'</div>' +
			'<div class="button-group">' +
				'<button class="danger" data-action="clear-learned">Delete Learned Icons</button>' +
			'</div>' +
		'</div>' +
		'<div class="hint">Use Rotation Scan first. This window is for manual fixes, extra bar items, and learned icons.</div>' +
		'<div class="hint">Click a slot for abilities. Shift-click for items, prayers, and markers. Fill Learned uses saved learned icons only.</div>' +
		'<div class="tabs">' +
			(data.styles || []).map(style => '<button data-action="style" data-style="' + esc(style) + '" class="' + (abilityPickerStyleName(activeStyle) === style ? "active" : "") + '">' + esc(style) + '</button>').join("") +
		'</div>' +
		'<div class="hint">' + esc(data.status || "") + '</div>' +
		bars.map(barPanelHtml).join("") +
		menuHtml();
}

function api() {
	return window.opener && window.opener[API_KEY];
}

function update(next) {
	if (next) data = {
		...next,
		barLayout: next.barLayout || data.barLayout,
		slotCount: Number(next.slotCount) || Number(data.slotCount) || 14,
		slotGroups: next.slotGroups || data.slotGroups,
		bars: next.bars || data.bars
	};
	if (!data.profiles || !data.profiles[activeStyle]) {
		activeStyle = data.activeCombatStyle || "Melee";
	}
	render();
}

document.addEventListener("click", event => {
	const btn = event.target.closest("button");
	if (!btn) {
		openSlot = 0;
		render();
		return;
	}
	const action = btn.dataset.action;
	const slot = Number(btn.dataset.slot || 0);
	const barId = String(btn.dataset.barId || "");

	if (action === "toggle-menu") {
		const rect = btn.getBoundingClientRect();
		const margin = 6;
		const menuWidth = 220;
		const preferredHeight = 300;
		const minHeight = 88;
		const requestedMode = event.shiftKey ? "other" : "abilities";
		const nextOpen = openSlot !== slot || openBarId !== barId || openMenuMode !== requestedMode;

		openSlot = nextOpen ? slot : 0;
		openBarId = nextOpen ? barId : "";
		openMenuMode = requestedMode;

		if (nextOpen) {
			const roomBelow = Math.max(0, window.innerHeight - rect.bottom - margin);
			const roomAbove = Math.max(0, rect.top - margin);

			menuX = Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin));

			if (roomBelow >= 150 || roomBelow >= roomAbove) {
				menuY = Math.max(margin, rect.bottom + 2);
				menuMaxHeight = Math.max(minHeight, Math.min(preferredHeight, window.innerHeight - menuY - margin));
			} else {
				menuMaxHeight = Math.max(minHeight, Math.min(preferredHeight, roomAbove));
				menuY = Math.max(margin, rect.top - menuMaxHeight - 2);
			}
		}

		render();
		return;
	}

	if (action === "set-slot") {
		openSlot = 0;
		const next = api()?.setTrainingSlot(activeStyle, barId || openBarId, slot, btn.dataset.abilityId || "");
		openBarId = "";
		update(next);
		return;
	}

	if (action === "learn-icons") { update(api()?.learnIcons(activeStyle)); return; }
	if (action === "auto-detect") { openSlot = 0; openBarId = ""; openMenuMode = "abilities"; update(api()?.autoDetect(activeStyle, barId)); return; }
	if (action === "clear-style") { openSlot = 0; update(api()?.clearTrainingProfile(activeStyle)); return; }
	if (action === "clear-learned") { update(api()?.clearLearned()); return; }
	if (action === "style") {
		openSlot = 0;
		openBarId = "";
		openMenuMode = "abilities";
		activeStyle = abilityPickerStyleName(btn.dataset.style || activeStyle);
		update(api()?.selectStyle(activeStyle) || data);
		return;
	}
});

render();
</script>
</body>
</html>`);
	win.document.close();
	win.focus();
}
