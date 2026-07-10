import type { AppState, TrackedBar } from "../types";
import { html } from "../utils";

export type RenderBarsInput = {
	app: AppState;
	startManualBarSetup: () => void;
	gridText: (bar: TrackedBar) => string;
};

const $ = (id: string) => document.getElementById(id) as any;

function ensureManualControls(input: RenderBarsInput) {
	const hint = $("bar-hint");
	if (!hint || $("manual-bar-controls")) return;

	const wrap = document.createElement("div");
	wrap.id = "manual-bar-controls";
	wrap.className = "button-row add-bar-row";
	wrap.innerHTML = `
		<select id="manual-layout-select" title="Action bar layout">
			<option value="1x14">1x14</option>
			<option value="2x14">2x14</option>
			<option value="2x7">2x7</option>
			<option value="7x2">7x2</option>
			<option value="14x1">14x1</option>
		</select>
		<button id="start-manual-bar" class="primary" title="Hover over the CENTER of slot 1, then press Alt + 1.">Add Bar</button>
	`;
	hint.insertAdjacentElement("afterend", wrap);
	$("start-manual-bar")?.addEventListener("click", input.startManualBarSetup);
}

function renderManualOnlyControls(input: RenderBarsInput) {
	ensureManualControls(input);
	const bars = input.app.configuredBars?.length
		? input.app.configuredBars
		: input.app.configuredBar
			? [input.app.configuredBar]
			: [];
	const hasBar = bars.length > 0;

	const setupButton = $("start-manual-bar") as HTMLButtonElement | null;
	const showButton = $("show-selected-bar") as HTMLButtonElement | null;
	const mapButton = $("open-icon-training-settings") as HTMLButtonElement | null;
	const layoutSelect = $("manual-layout-select") as HTMLSelectElement | null;

	if (setupButton) {
		setupButton.textContent = "Add Bar";
		setupButton.title = "Hover over the CENTER of slot 1, then press Alt + 1.";
	}
	if (showButton) showButton.disabled = !hasBar;
	if (mapButton) mapButton.disabled = !hasBar;

	const hint = $("bar-hint");
	if (hint) {
		hint.textContent = "Choose a layout, then hover over the CENTER of slot 1 and press Alt + 1.";
	}

	const configuredBarGuidance = document.querySelector(".configured-bar-guidance") as HTMLElement | null;
	if (configuredBarGuidance) {
		configuredBarGuidance.hidden = false;
		configuredBarGuidance.textContent = "Use Show Boxes to confirm alignment; use the arrows for small adjustments.";
	}
}

export function renderBarsView(input: RenderBarsInput) {
	renderManualOnlyControls(input);

	const list = $("tracked-bar-list");
	if (!list) return;

	const bars = input.app.configuredBars?.length
		? input.app.configuredBars
		: input.app.configuredBar
			? [input.app.configuredBar]
			: [];

	if (!bars.length) {
		list.innerHTML = `<div class="hint">No action bar configured yet.</div>`;
		return;
	}

	list.innerHTML = bars.map(bar => `
				<div class="tracked-bar compact-bar selected" data-id="${bar.id}">
					<div class="tracked-bar-top compact-bar-top">
						<div class="compact-bar-main">
							<div class="tracked-bar-name">${html(bar.name)}</div>
						</div>
						<button data-action="show-bar-boxes" data-id="${bar.id}" title="Highlight this bar's slot and cooldown boxes">Show Boxes</button>
						<button data-action="delete-bar" data-id="${bar.id}" class="danger">x</button>
					</div>
					<div class="bar-adjust compact-adjust">
						<span>Adjust</span>
						<button data-action="nudge-bar" data-id="${bar.id}" data-dx="-1" data-dy="0" title="Move overlay left. Shift-click = 5px">←</button>
						<button data-action="nudge-bar" data-id="${bar.id}" data-dx="1" data-dy="0" title="Move overlay right. Shift-click = 5px">→</button>
						<button data-action="nudge-bar" data-id="${bar.id}" data-dx="0" data-dy="-1" title="Move overlay up. Shift-click = 5px">↑</button>
						<button data-action="nudge-bar" data-id="${bar.id}" data-dx="0" data-dy="1" title="Move overlay down. Shift-click = 5px">↓</button>
						<button data-action="reset-bar-offset" data-id="${bar.id}" title="Finalize this position for cooldown tracking">Set 0</button>
						<span class="offset-readout">${bar.offsetX}, ${bar.offsetY}</span>
					</div>
					<div class="hint bar-finalize-hint">- Set 0 finalizes this position for cooldown tracking and slot scanning.</div>
					<div class="hint bar-finalize-hint">- Cooldown text must be within the Green Box.</div>
				</div>`).join("");
}
