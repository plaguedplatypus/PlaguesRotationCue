import type { AppState, TrackedBar } from "../types";

type LargeCueKeybindWindowDeps = {
	app: AppState;
	save: () => void;
	clearLargeCue: () => void;
	showBarBoxes: (barId: string) => void;
};

type WindowBar = {
	id: string;
	name: string;
	layout: string;
	slots: number[];
	keybinds: Record<string, string>;
};

function html(value: any) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function configuredBars(app: AppState): TrackedBar[] {
	const bars = Array.isArray(app.configuredBars) ? app.configuredBars : [];
	return bars.length ? bars : (app.configuredBar ? [app.configuredBar] : []);
}

function windowBars(app: AppState): WindowBar[] {
	return configuredBars(app).map(bar => ({
		id: bar.id,
		name: bar.name,
		layout: String(bar.layout || "1x14"),
		slots: [...(bar.slots || [])]
			.map(slot => Number(slot.index) || 0)
			.filter(slot => slot > 0)
			.sort((a, b) => a - b),
		keybinds: { ...(app.largeCueKeybinds?.[bar.id] || {}) },
	}));
}

function setKeybind(app: AppState, barId: string, slot: number, value: string) {
	const cleanValue = String(value || "").trim().slice(0, 12);
	if (!barId || !slot) return;

	app.largeCueKeybinds = {
		...(app.largeCueKeybinds || {}),
		[barId]: {
			...((app.largeCueKeybinds || {})[barId] || {}),
		},
	};

	if (cleanValue) {
		app.largeCueKeybinds[barId][String(slot)] = cleanValue;
	} else {
		delete app.largeCueKeybinds[barId][String(slot)];
		if (!Object.keys(app.largeCueKeybinds[barId]).length) delete app.largeCueKeybinds[barId];
	}
}

export function openLargeCueKeybindWindow(deps: LargeCueKeybindWindowDeps) {
	const popupName = "rotation_cue_large_cue_keybinds";
	const win = window.open("", popupName, "width=400,height=345,resizable=no,scrollbars=yes");
	if (!win) {
		alert("Popup blocked. Allow popups for this local app to edit Large Cue keybinds.");
		return;
	}

	const apiKey = "__RCueLargeCueKeybindApi";
	(window as any)[apiKey] = {
		setKeybind: (barId: string, slot: number, value: string) => {
			setKeybind(deps.app, barId, slot, value);
			deps.save();
			deps.clearLargeCue();
			return windowBars(deps.app);
		},
		showBarBoxes: (barId: string) => deps.showBarBoxes(String(barId || "")),
		bars: () => windowBars(deps.app),
	};

	const initialBars = windowBars(deps.app);
	win.document.open();
	win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Rotation Cue - Large Cue Keybinds</title>
<style>
:root {
	--bg: #101419;
	--panel: #181f24;
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
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
*::-webkit-scrollbar-track { background: #161a1d; }
*::-webkit-scrollbar-thumb {
	min-height: 48px;
	border: 1px solid #161a1d;
	background: #9b7a36;
}
*::-webkit-scrollbar-thumb:hover { background: #d9a441; }
html, body {
	margin: 0;
	padding: 0;
	min-width: 400px;
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
	display: flex;
	justify-content: flex-start;
	align-items: flex-start;
}
#root {
	width: 400px;
	flex: 0 0 auto;
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
.hint {
	color: var(--muted);
	font-size: 11px;
	line-height: 1.3;
	margin: 4px 0 7px;
}
.bar-panel {
	width: 360px;
	border: 1px solid var(--gold-soft);
	border-radius: 5px;
	background: rgba(14, 29, 37, .72);
	margin-top: 8px;
	padding: 6px;
}
.bar-header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding-bottom: 5px;
	margin-bottom: 6px;
	border-bottom: 1px solid rgba(216,197,138,.25);
}
.bar-title {
	flex: 1 1 auto;
	min-width: 0;
	font-weight: 700;
	color: var(--gold);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.slot-count {
	color: var(--muted);
	font-size: 11px;
	margin: 0 0 5px;
}
.slot-grid {
	display: grid;
	grid-template-columns: repeat(2, 158px);
	gap: 3px 12px;
	width: max-content;
}
.slot-row {
	display: grid;
	grid-template-columns: 46px 108px;
	align-items: center;
	gap: 4px;
	min-width: 0;
}
.slot-row label {
	color: var(--muted);
	font-size: 11px;
	white-space: nowrap;
}
.slot-row input {
	width: 100%;
	min-width: 0;
	height: 21px;
	padding: 2px 5px;
	text-align: center;
	border: 1px solid var(--border-soft);
	border-radius: 2px;
	background: #080d12;
	color: var(--text);
	box-shadow: inset 0 1px 2px rgba(0,0,0,.45);
	font: inherit;
}
.slot-row input:focus {
	outline: none;
	border-color: var(--gold-bright);
	background: #0c1218;
	box-shadow: 0 0 0 1px rgba(217,164,65,.22), inset 0 1px 2px rgba(0,0,0,.45);
}
.empty {
	color: var(--muted);
	font-size: 11px;
	padding: 8px;
}
</style>
</head>
<body>
<div id="root"></div>
<script>
const API_KEY = ${JSON.stringify(apiKey)};
let bars = ${JSON.stringify(initialBars)};

function esc(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function api() {
	return window.opener && window.opener[API_KEY];
}

function slotRow(bar, slot) {
	const value = String((bar.keybinds || {})[String(slot)] || "");
	return '<div class="slot-row">' +
		'<label for="keybind-' + esc(bar.id) + '-' + slot + '">Slot ' + slot + '</label>' +
		'<input id="keybind-' + esc(bar.id) + '-' + slot + '" data-bar-id="' + esc(bar.id) + '" data-slot="' + slot + '" maxlength="12" autocomplete="off" spellcheck="false" value="' + esc(value) + '">' +
	'</div>';
}

function barPanel(bar) {
	const slots = Array.isArray(bar.slots) ? bar.slots : [];
	const splitAt = slots.length > 14 ? 14 : Math.ceil(slots.length / 2);
	const left = slots.filter(slot => slot <= splitAt);
	const right = slots.filter(slot => slot > splitAt);
	return '<section class="bar-panel">' +
		'<div class="bar-header">' +
			'<div class="bar-title">' + esc(bar.name || "Action Bar") + '</div>' +
			'<button data-action="show-boxes" data-bar-id="' + esc(bar.id) + '">Show Boxes</button>' +
		'</div>' +
		'<div class="slot-count">(' + slots.length + ' slot' + (slots.length === 1 ? '' : 's') + ')</div>' +
		'<div class="slot-grid">' +
			'<div>' + left.map(slot => slotRow(bar, slot)).join("") + '</div>' +
			'<div>' + right.map(slot => slotRow(bar, slot)).join("") + '</div>' +
		'</div>' +
	'</section>';
}

function render() {
	document.getElementById("root").innerHTML =
		'<div class="header"><div class="title">Large Cue Keybinds - VISUAL ONLY -</div></div>' +
		'<div class="hint"><div>Type the keybinds for each slot you want to display.</div><div>Shorthand is recommended for long key combinations. ie: Shift+Q -> S+Q</div></div>' +
		(bars.length ? bars.map(barPanel).join("") : '<div class="empty">Configure an action bar first.</div>');
}

document.addEventListener("input", event => {
	const input = event.target;
	if (!(input instanceof HTMLInputElement)) return;
	const slot = Number(input.dataset.slot || 0);
	const barId = String(input.dataset.barId || "");
	bars = api()?.setKeybind(barId, slot, input.value) || bars;
});

document.addEventListener("click", event => {
	const button = event.target.closest("button");
	if (!button) return;
	if (button.dataset.action === "show-boxes") {
		api()?.showBarBoxes(button.dataset.barId || "");
	}
});

render();
</script>
</body>
</html>`);
	win.document.close();
	win.focus();
}
