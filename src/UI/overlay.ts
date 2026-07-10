import { encodeImageString } from "alt1/base";
import { getSlotHighlightRect, getSlotRect, type SlotBounds as SlotHighlightGeometry } from "../Rotation/slotGeometry";
import { clampInt } from "../utils";
import { createLargeCueOverlay, type LabelBadge } from "./largeCueOverlay";

export { buildLargeCueDisplay } from "./largeCueOverlay";

function compactSequenceLabel(label: string) {
	const parts = label.split("/");
	return parts.length > 1
		? `${parts[0]}+`
		: label;
}

type CueOverlayDeps = {
	app: any;
	cueGroup: string;
	stateGroup: string;
	guidanceGroup: string;
	largeCueGroup: string;
	yellow: any;
	blue: any;
	renderLabelBadge?: (label: string, color: any, maxWidth: number) => LabelBadge | null;
	renderLargeCueBitmap?: (abilityId: string, label: string, color: any, size: number) => LabelBadge | null;
	renderLargeCueSequenceBadge?: (label: string, color: any, compact: boolean) => LabelBadge | null;
	getAbilityIconSrc?: (abilityId: string) => string;
	getLargeCueKeybind?: (barId: string, slot: number) => string;
	getAbilityLabel?: (abilityId: string) => string;
	getHighlightColor?: (key: "current" | "rotation" | "cooldown") => any;
	getBorderThickness?: () => number;
	isLargeCuePlacementActive?: () => boolean;
	getConfiguredBar: (id: string) => any;
	cueKey: (cue: any) => string;
	getLastKey: () => string;
	setLastKey: (value: string) => void;
	getPauseUntil: () => number;
};

export function createCueOverlayApi(deps: CueOverlayDeps) {
	const overlayLifetime = 20000;
	const refreshInterval = 10000;
	let lastCueDrawAt = 0;
	let lastStateDrawAt = 0;
	let lastStateSignature = "";
	let lastGuidanceDrawAt = 0;
	let lastGuidanceSignature = "";
	const labelBadgeCache = new Map<string, LabelBadge>();

	function cssColor(color: any) {
		const unsignedColor = Number(color) >>> 0;
		return `rgb(${(unsignedColor >>> 16) & 255}, ${(unsignedColor >>> 8) & 255}, ${unsignedColor & 255})`;
	}

	function renderLabelBadge(label: string, color: any, maxWidth: number): LabelBadge | null {
		const badgeMaxWidth = Math.max(3, Math.floor(maxWidth));
		const key = `${label}:${Number(color) >>> 0}:${badgeMaxWidth}`;
		const cached = labelBadgeCache.get(key);
		if (cached) return cached;
		if (typeof document === "undefined") return null;

		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) return null;

		let renderedLabel = label;
		let fontSize = 13;
		let font = `${fontSize}px "Arial Black", Arial, sans-serif`;
		context.font = font;
		let metrics = context.measureText(renderedLabel);
		while (
			Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + 2 > badgeMaxWidth &&
			fontSize > 7
		) {
			fontSize--;
			font = `${fontSize}px "Arial Black", Arial, sans-serif`;
			context.font = font;
			metrics = context.measureText(renderedLabel);
		}
		if (Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + 2 > badgeMaxWidth) {
			renderedLabel = "...";
			fontSize = 10;
			font = `${fontSize}px "Arial Black", Arial, sans-serif`;
			context.font = font;
			metrics = context.measureText(renderedLabel);
		}
		const left = Math.ceil(Math.max(0, metrics.actualBoundingBoxLeft || 0));
		const right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width);
		const ascent = Math.ceil(metrics.actualBoundingBoxAscent || 9);
		const descent = Math.ceil(Number.isFinite(metrics.actualBoundingBoxDescent)
			? metrics.actualBoundingBoxDescent
			: 2);
		const padding = 1;
		const measuredWidth = left + right;
		canvas.width = Math.max(3, Math.min(
			badgeMaxWidth,
			measuredWidth + padding * 2
		));
		canvas.height = Math.max(3, ascent + descent + padding * 2);

		const drawContext = canvas.getContext("2d");
		if (!drawContext) return null;
		drawContext.fillStyle = "#080808";
		drawContext.fillRect(0, 0, canvas.width, canvas.height);
		drawContext.font = font;
		drawContext.textAlign = "left";
		drawContext.textBaseline = "alphabetic";
		drawContext.fillStyle = cssColor(color);
		drawContext.fillText(renderedLabel, padding + left, padding + ascent);

		const badge = {
			image: encodeImageString(drawContext.getImageData(0, 0, canvas.width, canvas.height)),
			width: canvas.width,
			height: canvas.height,
		};
		labelBadgeCache.set(key, badge);
		return badge;
	}

	function highlightColor(key: "current" | "rotation" | "cooldown") {
		if (deps.getHighlightColor) return deps.getHighlightColor(key);
		if (key === "current") return deps.yellow;
		if (key === "rotation") return deps.blue;
		return (deps as any).red;
	}

	function borderThickness() {
		return clampInt(deps.getBorderThickness?.(), 1, 2, 1);
	}

	function beginGroup(alt1: any, group: string) {
		alt1.overLaySetGroup(group);
		const canResume = typeof alt1.overLayFreezeGroup === "function" &&
			typeof alt1.overLayContinueGroup === "function";
		if (canResume) alt1.overLayFreezeGroup(group);
		alt1.overLayClearGroup(group);
		return canResume;
	}

	function finishGroup(alt1: any, group: string, frozen: boolean) {
		if (frozen) alt1.overLayContinueGroup(group);
	}

	function canDraw() {
		return deps.app.overlayEnabled &&
			!!window.alt1 &&
			Date.now() >= deps.getPauseUntil();
	}

	function overlayContextInactive() {
		const appWindowActive =
			typeof window.document?.hasFocus === "function" &&
			window.document.hasFocus();
		return window.alt1?.rsActive === false && !appWindowActive;
	}

	const largeCueOverlay = createLargeCueOverlay({
		app: deps.app,
		largeCueGroup: deps.largeCueGroup,
		overlayLifetime,
		refreshInterval,
		renderLargeCueBitmap: deps.renderLargeCueBitmap,
		renderLargeCueSequenceBadge: deps.renderLargeCueSequenceBadge,
		getAbilityIconSrc: deps.getAbilityIconSrc,
		getLargeCueKeybind: deps.getLargeCueKeybind,
		getAbilityLabel: deps.getAbilityLabel,
		getHighlightColor: highlightColor,
		getBorderThickness: borderThickness,
		isLargeCuePlacementActive: deps.isLargeCuePlacementActive,
		getPauseUntil: deps.getPauseUntil,
		overlayContextInactive,
	});

	function clearGroup(group: string) {
		if (group === deps.largeCueGroup) {
			largeCueOverlay.clearLargeCue();
			return;
		}
		if (!window.alt1) return;
		try {
			window.alt1.overLaySetGroup(group);
			window.alt1.overLayClearGroup(group);
			window.alt1.overLayRefreshGroup(group);
		} catch { /* Alt1 may reject overlay calls while closing. */ }
		if (group === deps.cueGroup) lastCueDrawAt = 0;
		if (group === deps.stateGroup) {
			lastStateDrawAt = 0;
			lastStateSignature = "";
		}
		if (group === deps.guidanceGroup) {
			lastGuidanceDrawAt = 0;
			lastGuidanceSignature = "";
		}
	}

	function clearRotationOverlays() {
		clearGroup(deps.stateGroup);
		clearGroup(deps.guidanceGroup);
		clearGroup(deps.cueGroup);
		largeCueOverlay.clearLargeCue();
		deps.setLastKey("");
	}

	function invalidate() {
		lastCueDrawAt = 0;
		lastStateDrawAt = 0;
		lastGuidanceDrawAt = 0;
		largeCueOverlay.invalidate();
	}

	type SlotHighlightBounds = SlotHighlightGeometry & {
		thickness: number;
	};

	function slotHighlightBounds(bar: any, slot: any): SlotHighlightBounds | null {
		const bounds = getSlotHighlightRect(bar, slot);
		if (!bounds) return null;

		return {
			// Keep the 1px highlight bounds fixed. Additional thickness is drawn
			// as extra 1px outline layers outside these bounds so the inner edge
			// does not shift when the slider changes from 1px to 2px.
			...bounds,
			thickness: borderThickness(),
		};
	}

	function highlightLayerBounds(bounds: SlotHighlightBounds, layer: number): SlotHighlightBounds {
		const x = bounds.x - layer;
		const y = bounds.y - layer;
		const right = bounds.right + layer;
		const bottom = bounds.bottom + layer;

		return {
			x,
			y,
			right,
			bottom,
			width: Math.max(1, right - x),
			height: Math.max(1, bottom - y),
			thickness: 1,
		};
	}

	function drawHighlightLine(
		color: any,
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		lifetime: number
	) {
		window.alt1?.overLayLine(color, 1, x1, y1, x2, y2, lifetime);
	}

	function drawSlotBox(bar: any, slot: any, color: any, lifetime: number) {
		if (!window.alt1) return;
		const bounds = slotHighlightBounds(bar, slot);
		if (!bounds) return;

		// Draw each thickness level as a separate 1px outline. This avoids
		// Alt1 line-thickness centering semantics shifting the highlight when
		// the border slider is increased.
		for (let layer = 0; layer < bounds.thickness; layer++) {
			const layerBounds = highlightLayerBounds(bounds, layer);
			drawHighlightLine(color, layerBounds.x, layerBounds.y, layerBounds.right, layerBounds.y, lifetime);
			drawHighlightLine(color, layerBounds.right, layerBounds.y, layerBounds.right, layerBounds.bottom, lifetime);
			drawHighlightLine(color, layerBounds.right, layerBounds.bottom, layerBounds.x, layerBounds.bottom, lifetime);
			drawHighlightLine(color, layerBounds.x, layerBounds.bottom, layerBounds.x, layerBounds.y, lifetime);
		}
	}

	function drawManualCorners(bar: any, slot: any, color: any, lifetime: number) {
		if (!window.alt1) return;
		const bounds = slotHighlightBounds(bar, slot);
		if (!bounds) return;
		const length = 6;

		for (let layer = 0; layer < bounds.thickness; layer++) {
			const layerBounds = highlightLayerBounds(bounds, layer);
			drawHighlightLine(color, layerBounds.x, layerBounds.y, layerBounds.x + length, layerBounds.y, lifetime);
			drawHighlightLine(color, layerBounds.x, layerBounds.y, layerBounds.x, layerBounds.y + length, lifetime);
			drawHighlightLine(color, layerBounds.right, layerBounds.y, layerBounds.right - length, layerBounds.y, lifetime);
			drawHighlightLine(color, layerBounds.right, layerBounds.y, layerBounds.right, layerBounds.y + length, lifetime);
			drawHighlightLine(color, layerBounds.x, layerBounds.bottom, layerBounds.x + length, layerBounds.bottom, lifetime);
			drawHighlightLine(color, layerBounds.x, layerBounds.bottom, layerBounds.x, layerBounds.bottom - length, lifetime);
			drawHighlightLine(color, layerBounds.right, layerBounds.bottom, layerBounds.right - length, layerBounds.bottom, lifetime);
			drawHighlightLine(color, layerBounds.right, layerBounds.bottom, layerBounds.right, layerBounds.bottom - length, lifetime);
		}
	}

	function drawSequenceLabel(
		bar: any,
		slot: any,
		labelValue: any,
		lifetime: number
	) {
		const alt1 = window.alt1;
		if (!alt1) return;
		const drawSlot = getSlotRect(bar, slot);
		if (!drawSlot) return;
		const x = drawSlot.x;
		const y = drawSlot.y;
		const rawLabel = String(labelValue || "");
		if (!rawLabel) return;
		const label = compactSequenceLabel(rawLabel);
		const currentColor = highlightColor("current");
		const maxWidth = Math.max(3, Math.floor(slot.width));
		const badge = deps.renderLabelBadge?.(label, currentColor, maxWidth) ||
			renderLabelBadge(label, currentColor, maxWidth);
		if (badge && typeof alt1.overLayImage === "function") {
			alt1.overLayImage(
				x + slot.width - badge.width,
				y + slot.height - badge.height,
				badge.image,
				badge.width,
				lifetime
			);
			return;
		}

		const fontSize = 11;
		const textX = x + slot.width;
		const textY = y + slot.height - 5;
		if (typeof alt1.overLayTextEx === "function") {
			alt1.overLayTextEx(label, currentColor, fontSize, textX, textY, lifetime, "Arial Black", true, true);
		} else {
			alt1.overLayText(label, currentColor, fontSize, textX - Math.round(label.length * 4), textY, lifetime);
		}
	}

	function stateColor(state: string) {
		if (state === "cooldown") return highlightColor("cooldown");
		if (state === "ready-idle") return highlightColor("rotation");
		return null;
	}

	function uniqueStateItems(items: any[]) {
		const priority: Record<string, number> = {
			current: 6,
			cooldown: 5,
			unknown: 3,
			unmapped: 2,
			"ready-idle": 1,
			"manual-idle": 0,
		};
		const unique = new Map<string, any>();

		for (const item of items) {
			if (!item?.step?.mapped) continue;
			const key = `${item.step.barId}:${Number(item.step.slot)}`;
			const previous = unique.get(key);
			const previousManualState = String(previous?.manualState || "");

			if (item.state === "manual-idle") {
				const manualState = "manual-idle";
				unique.set(key, previous
					? { ...previous, manualState }
					: { ...item, manualState });
				continue;
			}

			if (!previous || previous.state.startsWith("manual-") || (priority[item.state] || 0) > (priority[previous.state] || 0)) {
				unique.set(key, { ...item, manualState: previousManualState });
			}
		}

		return Array.from(unique.values());
	}

	function drawRotationState(items: any[]) {
		if (!canDraw()) return;
		if (!Array.isArray(items) || !items.length) {
			if (lastStateSignature) clearGroup(deps.stateGroup);
			return;
		}

		const now = Date.now();
		const uniqueItems = uniqueStateItems(items);
		const signature = uniqueItems
			.map(item => `${item.step.barId}:${Number(item.step.slot)}:${item.state}:${item.manualState || ""}`)
			.sort()
			.join("|") + `:${highlightColor("rotation")}:${highlightColor("cooldown")}:${borderThickness()}`;
		if (
			signature === lastStateSignature &&
			(overlayContextInactive() || now - lastStateDrawAt < refreshInterval)
		) return;

		try {
			const alt1 = window.alt1;
			const frozen = beginGroup(alt1, deps.stateGroup);

			for (const item of uniqueItems) {
				if (!item?.step?.mapped) continue;
				const bar = deps.getConfiguredBar(item.step.barId);
				const slot = bar?.slots?.[Number(item.step.slot) - 1];
				if (!bar || !slot) continue;

				const color = stateColor(String(item.state || ""));
				if (color) {
					drawSlotBox(bar, slot, color, overlayLifetime);
				}

				if (item.manualState) {
					drawManualCorners(
						bar,
						slot,
						highlightColor("rotation"),
						overlayLifetime
					);
				}
			}

			finishGroup(alt1, deps.stateGroup, frozen);
			lastStateSignature = signature;
			lastStateDrawAt = now;
		} catch (error) {
			console.warn("Rotation state overlay draw failed", error);
		}
	}

	function drawManualGuidance(items: any[]) {
		if (!canDraw()) return;
		const unique = new Map<string, any>();
		for (const item of items || []) {
			if (!item?.step?.mapped) continue;
			const key = `${item.step.barId}:${Number(item.step.slot)}`;
			const previous = unique.get(key);
			const labels = [...(previous?.labels || [])];
			const label = String(item.label || "");
			if (label && !labels.includes(label)) labels.push(label);
			unique.set(key, { ...item, labels });
		}

		const uniqueItems = Array.from(unique.values());
		if (!uniqueItems.length) {
			if (lastGuidanceSignature) clearGroup(deps.guidanceGroup);
			return;
		}

		const now = Date.now();
		const signature = uniqueItems
			.map(item => `${item.step.barId}:${Number(item.step.slot)}:${item.labels.join("/")}`)
			.sort()
			.join("|") + `:${highlightColor("current")}:${borderThickness()}`;
		if (
			signature === lastGuidanceSignature &&
			(overlayContextInactive() || now - lastGuidanceDrawAt < refreshInterval)
		) return;

		try {
			const alt1 = window.alt1;
			const frozen = beginGroup(alt1, deps.guidanceGroup);

			for (const item of uniqueItems) {
				const bar = deps.getConfiguredBar(item.step.barId);
				const slot = bar?.slots?.[Number(item.step.slot) - 1];
				if (!bar || !slot) continue;
				drawSlotBox(bar, slot, highlightColor("current"), overlayLifetime);
				drawSequenceLabel(bar, slot, item.labels.join("/"), overlayLifetime);
			}

			finishGroup(alt1, deps.guidanceGroup, frozen);
			lastGuidanceSignature = signature;
			lastGuidanceDrawAt = now;
		} catch (error) {
			console.warn("Manual guidance overlay draw failed", error);
		}
	}

	function drawCue(cue: any) {
		if (!canDraw()) return;
		const anchorStep = cue?.anchorStep || cue?.step;
		if (!cue || !anchorStep || cue.mode === "none") {
			if (deps.getLastKey()) clearGroup(deps.cueGroup);
			deps.setLastKey("");
			return;
		}

		const bar = deps.getConfiguredBar(anchorStep.barId);
		const slot = bar?.slots?.[Number(anchorStep.slot) - 1];
		if (!bar || !slot) return;

		const currentColor = highlightColor("current");
		const key = `${deps.cueKey(cue)}:${currentColor}:${borderThickness()}`;
		const now = Date.now();
		if (
			key === deps.getLastKey() &&
			(overlayContextInactive() || now - lastCueDrawAt < refreshInterval)
		) return;
		deps.setLastKey(key);

		try {
			const alt1 = window.alt1;
			const frozen = beginGroup(alt1, deps.cueGroup);
			drawSlotBox(bar, slot, currentColor, overlayLifetime);
			drawSequenceLabel(bar, slot, cue.anchorSequenceLabel || cue.sequenceLabel, overlayLifetime);
			finishGroup(alt1, deps.cueGroup, frozen);
			lastCueDrawAt = now;
		} catch (error) {
			console.warn("Overlay draw failed", error);
		}
	}

	return {
		clearGroup,
		clearLargeCue: largeCueOverlay.clearLargeCue,
		clearRotationOverlays,
		invalidate,
		drawLargeCuePlacementPreview: largeCueOverlay.drawLargeCuePlacementPreview,
		drawRotationState,
		drawManualGuidance,
		drawCue,
		drawLargeCue: largeCueOverlay.drawLargeCue,
	};
}
