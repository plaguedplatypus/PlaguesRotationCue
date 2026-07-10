import { encodeImageString, mixColor } from "alt1/base";
import type { ManualGuidanceChain } from "../Rotation/cueEngine";

export type LabelBadge = {
	image: string;
	width: number;
	height: number;
};

type LargeCueDisplay = {
	primaryStep: any;
	primaryLabel: string;
	sequenceItems: Array<{
		step: any | null;
		label: string;
	}>;
};

type LargeCueOverlayDeps = {
	app: any;
	largeCueGroup: string;
	overlayLifetime: number;
	refreshInterval: number;
	renderLargeCueBitmap?: (abilityId: string, label: string, color: any, size: number) => LabelBadge | null;
	renderLargeCueSequenceBadge?: (label: string, color: any, compact: boolean) => LabelBadge | null;
	getAbilityIconSrc?: (abilityId: string) => string;
	getLargeCueKeybind?: (barId: string, slot: number) => string;
	getAbilityLabel?: (abilityId: string) => string;
	getHighlightColor: (key: "current" | "rotation" | "cooldown") => any;
	getBorderThickness: () => number;
	isLargeCuePlacementActive?: () => boolean;
	getPauseUntil: () => number;
	overlayContextInactive: () => boolean;
};

export function buildLargeCueDisplay(cue: any, guidance: ManualGuidanceChain | null): LargeCueDisplay | null {
	const manualGuidance = Array.isArray(guidance?.manualGuidance)
		? guidance.manualGuidance.filter(item => item?.step)
		: [];

	if (manualGuidance.length) {
		const maxMiniCueItems = 4;
		const anchor = guidance?.trackedGuidance;
		const hasAnchor = !!(anchor?.step && anchor.label);
		const manualMiniCapacity = hasAnchor ? maxMiniCueItems - 1 : maxMiniCueItems;
		const manualMiniItems = manualGuidance
			.slice(1)
			.map(item => ({ step: item.step, label: String(item.label || "") }))
			.filter(item => !!item.step && !!item.label);
		const sequenceItems: LargeCueDisplay["sequenceItems"] = [];

		if (manualMiniItems.length > manualMiniCapacity) {
			const visibleManualCount = Math.max(0, manualMiniCapacity - 1);
			sequenceItems.push(...manualMiniItems.slice(0, visibleManualCount));
			sequenceItems.push({
				step: null,
				label: `+${manualMiniItems.length - visibleManualCount}`,
			});
		} else {
			sequenceItems.push(...manualMiniItems.slice(0, manualMiniCapacity));
		}

		if (hasAnchor) {
			sequenceItems.push({ step: anchor.step, label: String(anchor.label) });
		}

		return {
			primaryStep: manualGuidance[0].step,
			primaryLabel: String(manualGuidance[0].label || ""),
			sequenceItems: sequenceItems.slice(0, maxMiniCueItems),
		};
	}

	if (!cue?.step || cue.mode === "none") return null;
	return {
		primaryStep: cue.step,
		primaryLabel: String(cue.sequenceLabel || ""),
		sequenceItems: [],
	};
}

function cssColor(color: any) {
	const unsignedColor = Number(color) >>> 0;
	return `rgb(${(unsignedColor >>> 16) & 255}, ${(unsignedColor >>> 8) & 255}, ${unsignedColor & 255})`;
}

function abilityInitials(label: string) {
	if (/^\+\d+$/.test(String(label || ""))) return String(label);
	const words = String(label || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!words.length) return "?";
	return words.slice(0, 2).map(word => word[0]).join("").toUpperCase();
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

export function createLargeCueOverlay(deps: LargeCueOverlayDeps) {
	let lastLargeCueDrawAt = 0;
	let lastLargeCueSignature = "";
	let largeCueNeedsClear = true;
	const largeCueIconCache = new Map<string, LabelBadge>();
	const largeCueFallbackCache = new Map<string, LabelBadge>();
	const largeCueIconLoading = new Set<string>();
	const failedLargeCueIconSources = new Set<string>();
	const largeCueSequenceBadgeCache = new Map<string, LabelBadge>();
	const largeCueKeybindBadgeCache = new Map<string, LabelBadge>();
	const largeCueKeybindTextColor = mixColor(232, 232, 232);
	const largeCueKeybindTextCssColor = "#e8e8e8";
	const largeCueDarkCssColor = "#001f1c";

	function clearLargeCue() {
		if (!window.alt1) return;
		try {
			window.alt1.overLaySetGroup(deps.largeCueGroup);
			window.alt1.overLayClearGroup(deps.largeCueGroup);
			window.alt1.overLayRefreshGroup(deps.largeCueGroup);
		} catch { /* Alt1 may reject overlay calls while closing. */ }
		lastLargeCueDrawAt = 0;
		lastLargeCueSignature = "";
		largeCueNeedsClear = false;
	}

	function fallbackLargeCueBitmap(label: string, color: any, size: number): LabelBadge | null {
		const key = `${label}:${Number(color) >>> 0}:${size}`;
		const cached = largeCueFallbackCache.get(key);
		if (cached) return cached;
		if (typeof document === "undefined") return null;

		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext("2d");
		if (!context) return null;

		context.fillStyle = "#080808";
		context.fillRect(0, 0, size, size);
		context.fillStyle = cssColor(color);
		const text = abilityInitials(label);
		let fontSize = Math.max(12, Math.round(size * 0.34));
		context.font = `bold ${fontSize}px Arial, sans-serif`;
		while (context.measureText(text).width > size - 4 && fontSize > 8) {
			fontSize--;
			context.font = `bold ${fontSize}px Arial, sans-serif`;
		}
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.fillText(text, size / 2, size / 2);

		const bitmap = {
			image: encodeImageString(context.getImageData(0, 0, size, size)),
			width: size,
			height: size,
		};
		largeCueFallbackCache.set(key, bitmap);
		return bitmap;
	}

	function loadLargeCueIcon(abilityId: string, src: string, size: number) {
		const key = `${abilityId}:${src}:${size}`;
		if (
			largeCueIconCache.has(key) ||
			largeCueIconLoading.has(key) ||
			failedLargeCueIconSources.has(key) ||
			typeof Image === "undefined" ||
			typeof document === "undefined"
		) return;

		largeCueIconLoading.add(key);
		const image = new Image();
		image.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = size;
				canvas.height = size;
				const context = canvas.getContext("2d");
				if (!context) throw new Error("Canvas unavailable");
				context.imageSmoothingEnabled = false;
				context.drawImage(image, 0, 0, size, size);
				largeCueIconCache.set(key, {
					image: encodeImageString(context.getImageData(0, 0, size, size)),
					width: size,
					height: size,
				});
				lastLargeCueDrawAt = 0;
				lastLargeCueSignature = "";
			} catch {
				failedLargeCueIconSources.add(key);
			} finally {
				largeCueIconLoading.delete(key);
			}
		};
		image.onerror = () => {
			largeCueIconLoading.delete(key);
			failedLargeCueIconSources.add(key);
		};
		image.src = src;
	}

	function largeCueBitmap(abilityId: string, label: string, color: any, size: number) {
		const injected = deps.renderLargeCueBitmap?.(abilityId, label, color, size);
		if (injected) return injected;

		const src = deps.getAbilityIconSrc?.(abilityId) || "";
		const iconKey = `${abilityId}:${src}:${size}`;
		const icon = src ? largeCueIconCache.get(iconKey) : null;
		if (icon) return icon;
		if (src) loadLargeCueIcon(abilityId, src, size);
		return fallbackLargeCueBitmap(label, color, size);
	}

	function renderLargeCueSequenceBadge(label: string, color: any, compact = false): LabelBadge | null {
		const injected = deps.renderLargeCueSequenceBadge?.(label, color, compact);
		if (injected) return injected;

		const key = `${label}:${Number(color) >>> 0}:${compact ? "compact-top-right-tight-v4" : "large-top-right-taller-v7"}`;
		const cached = largeCueSequenceBadgeCache.get(key);
		if (cached) return cached;
		if (typeof document === "undefined") return null;

		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) return null;
		const fontSize = compact ? 9 : 14;
		const paddingX = 1;
		const paddingY = compact ? 1 : 2;
		const font = `bold ${fontSize}px "Arial Black", Arial, sans-serif`;
		context.font = font;
		const metrics = context.measureText(label);
		const left = Math.ceil(Math.max(0, metrics.actualBoundingBoxLeft || 0));
		const right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width);
		const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize);
		const descent = Math.ceil(Number.isFinite(metrics.actualBoundingBoxDescent)
			? metrics.actualBoundingBoxDescent
			: 2);
		const extraRight = compact ? 0 : 3;
		const extraTop = compact ? 0 : 1;
		const width = Math.max(8, left + right + paddingX * 2 + extraRight);
		const height = compact
			? Math.max(10, ascent + descent + paddingY * 2)
			: Math.max(14, ascent + descent + paddingY * 2 + extraTop);
		canvas.width = width;
		canvas.height = height;

		const drawContext = canvas.getContext("2d");
		if (!drawContext) return null;
		drawContext.fillStyle = largeCueDarkCssColor;
		drawContext.fillRect(0, 0, width, height);
		drawContext.fillStyle = cssColor(color);
		drawContext.font = font;
		if (compact) {
			drawContext.textAlign = "left";
			drawContext.textBaseline = "alphabetic";
			drawContext.fillText(label, paddingX + left, extraTop + paddingY + ascent);
		} else {
			drawContext.textAlign = "center";
			drawContext.textBaseline = "middle";
			drawContext.fillText(label, Math.round(width / 2), Math.round(height / 2) + 0.5);
		}

		const badge = {
			image: encodeImageString(drawContext.getImageData(0, 0, width, height)),
			width,
			height,
		};
		largeCueSequenceBadgeCache.set(key, badge);
		return badge;
	}

	function drawLargeCueSkipArrows(alt1: any, centerX: number, cueY: number, color: any, lifetime: number) {
		const arrowWidth = 14;
		const arrowHeight = 13;
		const rowWidth = 50;
		const rowY = Math.round(cueY) - arrowHeight - 2;
		const leftX = Math.round(centerX - rowWidth / 2);
		const rightX = Math.round(centerX + rowWidth / 2 - arrowWidth);

		if (
			!alt1 ||
			rowY < 0 ||
			!Number.isFinite(leftX - 2) ||
			!Number.isFinite(rightX)
		) return;

		try {
			const drawArrow = (label: string, x: number) => {
				const textX = Math.round(x + 2);
				const textY = Math.round(rowY);
				alt1.overLayText(label, color, 11, textX, textY, lifetime);
			};
			drawArrow("◀", leftX);
			drawArrow("▶", rightX);
		} catch (error) {
			console.warn("Large cue skip arrow draw failed", error);
		}
	}

	function renderLargeCueKeybindBadge(labelValue: string, primary = false): LabelBadge | null {
		const label = String(labelValue || "").trim();
		if (!label || typeof document === "undefined") return null;

		const key = `${label}:${primary ? "primary" : "mini"}:opaque-v14`;
		const cached = largeCueKeybindBadgeCache.get(key);
		if (cached) return cached;

		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) return null;

		const maxWidth = primary ? 54 : 27;
		const minWidth = primary ? 12 : 9;
		const paddingX = primary ? 2 : 1;
		const paddingY = 1;
		let fontSize = primary ? 14 : 9;
		let font = `bold ${fontSize}px Arial, sans-serif`;
		context.font = font;

		while (Math.ceil(context.measureText(label).width) + paddingX * 2 > maxWidth && fontSize > (primary ? 10 : 7)) {
			fontSize--;
			font = `bold ${fontSize}px Arial, sans-serif`;
			context.font = font;
		}

		const metrics = context.measureText(label);
		const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize);
		const descent = Math.ceil(Number.isFinite(metrics.actualBoundingBoxDescent)
			? metrics.actualBoundingBoxDescent
			: 2);
		const width = Math.max(minWidth, Math.min(maxWidth, Math.ceil(metrics.width) + paddingX * 2));
		const height = Math.max(primary ? 15 : 11, ascent + descent + paddingY * 2);
		canvas.width = width;
		canvas.height = height;

		const drawContext = canvas.getContext("2d");
		if (!drawContext) return null;
		drawContext.fillStyle = largeCueDarkCssColor;
		drawContext.fillRect(0, 0, width, height);
		drawContext.fillStyle = largeCueKeybindTextCssColor;
		drawContext.font = font;
		drawContext.textAlign = "left";
		drawContext.textBaseline = "alphabetic";
		drawContext.fillText(label, paddingX, paddingY + ascent + 1);

		const badge = {
			image: encodeImageString(drawContext.getImageData(0, 0, width, height)),
			width,
			height,
		};
		largeCueKeybindBadgeCache.set(key, badge);
		return badge;
	}

	function drawLargeCueKeybindText(
		alt1: any,
		labelValue: string,
		x: number,
		y: number,
		primary: boolean,
		lifetime: number
	) {
		const badge = renderLargeCueKeybindBadge(labelValue, primary);
		if (badge && typeof alt1.overLayImage === "function") {
			alt1.overLayImage(Math.round(x), Math.round(y), badge.image, badge.width, lifetime);
			return;
		}

		const label = String(labelValue || "").trim();
		if (!label) return;
		const fontSize = primary ? 14 : 9;
		if (typeof alt1.overLayTextEx === "function") {
			alt1.overLayTextEx(label, largeCueKeybindTextColor, fontSize, Math.round(x), Math.round(y), lifetime, "Arial", false, true);
		} else {
			alt1.overLayText(label, largeCueKeybindTextColor, fontSize, Math.round(x), Math.round(y), lifetime);
		}
	}

	function keybindForStep(step: any) {
		const barId = String(step?.barId || "");
		const slot = Number(step?.slot) || 0;
		return String(deps.getLargeCueKeybind?.(barId, slot) || "").trim();
	}

	function drawLargeCuePlacementPreview(position: { x: number; y: number } | null) {
		if (!deps.app.overlayEnabled || !position || !window.alt1 || Date.now() < deps.getPauseUntil()) {
			if (largeCueNeedsClear) clearLargeCue();
			return;
		}

		const centerX = Number(position.x);
		const centerY = Number(position.y);
		if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
			if (largeCueNeedsClear) clearLargeCue();
			return;
		}

		try {
			const alt1 = window.alt1;
			const frozen = beginGroup(alt1, deps.largeCueGroup);
			const size = 56;
			const x = Math.round(centerX - size / 2);
			const y = Math.round(centerY - size / 2);
			alt1.overLayRect(deps.getHighlightColor("current"), x, y, size, size, 700, 2);
			finishGroup(alt1, deps.largeCueGroup, frozen);
			largeCueNeedsClear = true;
			lastLargeCueDrawAt = Date.now();
			lastLargeCueSignature = `placement:${Math.round(centerX)}:${Math.round(centerY)}`;
		} catch (error) {
			console.warn("Large cue placement preview draw failed", error);
		}
	}

	function drawLargeCue(cue: any, guidance: ManualGuidanceChain | null) {
		const position = deps.app.largeCurrentCuePosition;
		const display = buildLargeCueDisplay(cue, guidance);
		if (
			!deps.app.overlayEnabled ||
			!deps.app.showLargeCurrentCue ||
			deps.isLargeCuePlacementActive?.() ||
			!position ||
			!display
		) {
			if (largeCueNeedsClear) clearLargeCue();
			return;
		}
		if (!window.alt1 || Date.now() < deps.getPauseUntil()) return;

		const centerX = Number(position.x);
		const centerY = Number(position.y);
		if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
			if (largeCueNeedsClear) clearLargeCue();
			return;
		}

		const size = 56;
		const color = deps.getHighlightColor("current");
		const abilityId = String(display.primaryStep?.abilityId || "");
		const abilityName = deps.getAbilityLabel?.(abilityId) || abilityId;
		const bitmap = largeCueBitmap(abilityId, abilityName, color, size);
		const primaryKeybind = keybindForStep(display.primaryStep);
		const sequenceKeys = display.sequenceItems.map(item => ({
			abilityId: String(item.step?.abilityId || ""),
			label: item.label,
			keybind: item.step ? keybindForStep(item.step) : "",
		}));
		const signature = [
			abilityId,
			display.primaryLabel,
			primaryKeybind,
			sequenceKeys.map(item => `${item.abilityId}:${item.label}:${item.keybind}`).join(","),
			Math.round(centerX),
			Math.round(centerY),
			color,
			deps.getBorderThickness(),
		].join(":");
		const now = Date.now();
		if (
			signature === lastLargeCueSignature &&
			(deps.overlayContextInactive() || now - lastLargeCueDrawAt < deps.refreshInterval)
		) return;

		try {
			const alt1 = window.alt1;
			const frozen = beginGroup(alt1, deps.largeCueGroup);
			const x = Math.round(centerX - size / 2);
			const y = Math.round(centerY - size / 2);

			drawLargeCueSkipArrows(alt1, centerX, y, color, deps.overlayLifetime);

			if (bitmap && typeof alt1.overLayImage === "function") {
				alt1.overLayImage(x, y, bitmap.image, bitmap.width, deps.overlayLifetime);
			} else {
				alt1.overLayRect(color, x, y, size, size, deps.overlayLifetime, 1);
				const initials = abilityInitials(abilityName);
				alt1.overLayText(initials, color, 16, x + 14, y + 18, deps.overlayLifetime);
			}

			if (display.primaryLabel) {
				const badge = renderLargeCueSequenceBadge(display.primaryLabel, color);
				if (badge && typeof alt1.overLayImage === "function") {
					const inset = deps.getBorderThickness();
					alt1.overLayImage(
						x + size - badge.width - inset,
						y + inset,
						badge.image,
						badge.width,
						deps.overlayLifetime
					);
				}
			}

			if (primaryKeybind) {
				const keybindBadge = renderLargeCueKeybindBadge(primaryKeybind, true);
				drawLargeCueKeybindText(
					alt1,
					primaryKeybind,
					x + 1,
					y + size - (keybindBadge?.height ?? 15),
					true,
					deps.overlayLifetime
				);
			}

			alt1.overLayRect(color, x, y, size, size, deps.overlayLifetime, deps.getBorderThickness());

			const miniSize = 28;
			const miniGap = 3;
			const stripWidth = display.sequenceItems.length
				? display.sequenceItems.length * miniSize +
					(display.sequenceItems.length - 1) * miniGap
				: 0;
			let tileX = Math.round(centerX - stripWidth / 2);
			const tileY = y + size + 4;
			for (const item of display.sequenceItems) {
				if (!item.step) {
					const hiddenTile = largeCueBitmap("", item.label, color, miniSize);
					if (hiddenTile && typeof alt1.overLayImage === "function") {
						alt1.overLayImage(tileX, tileY, hiddenTile.image, hiddenTile.width, deps.overlayLifetime);
					}
					alt1.overLayRect(color, tileX, tileY, miniSize, miniSize, deps.overlayLifetime, 1);
					tileX += miniSize + miniGap;
					continue;
				}

				const itemAbilityId = String(item.step.abilityId || "");
				const itemAbilityName = deps.getAbilityLabel?.(itemAbilityId) || itemAbilityId;
				const itemBitmap = largeCueBitmap(itemAbilityId, itemAbilityName, color, miniSize);
				if (itemBitmap && typeof alt1.overLayImage === "function") {
					alt1.overLayImage(tileX, tileY, itemBitmap.image, itemBitmap.width, deps.overlayLifetime);
				}
				const itemKeybind = keybindForStep(item.step);
				if (itemKeybind) {
					const keybindBadge = renderLargeCueKeybindBadge(itemKeybind, false);
					drawLargeCueKeybindText(
						alt1,
						itemKeybind,
						tileX + 1,
						tileY + miniSize - (keybindBadge?.height ?? 11),
						false,
						deps.overlayLifetime
					);
				}
				const itemBadge = renderLargeCueSequenceBadge(item.label, color, true);
				if (itemBadge && typeof alt1.overLayImage === "function") {
					alt1.overLayImage(
						tileX + miniSize - itemBadge.width - 1,
						tileY + 1,
						itemBadge.image,
						itemBadge.width,
						deps.overlayLifetime
					);
				}
				alt1.overLayRect(color, tileX, tileY, miniSize, miniSize, deps.overlayLifetime, 1);
				tileX += miniSize + miniGap;
			}

			finishGroup(alt1, deps.largeCueGroup, frozen);
			lastLargeCueSignature = signature;
			lastLargeCueDrawAt = now;
			largeCueNeedsClear = true;
		} catch (error) {
			console.warn("Large cue overlay draw failed", error);
		}
	}

	return {
		clearLargeCue,
		drawLargeCuePlacementPreview,
		drawLargeCue,
		invalidate: () => { lastLargeCueDrawAt = 0; },
	};
}
