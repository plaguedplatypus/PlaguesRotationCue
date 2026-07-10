import type { SlotBox, TrackedBar } from "../types";

export const ACTION_SLOT_ICON_WIDTH = 31;
export const ACTION_SLOT_ICON_HEIGHT = 31;

export type SlotBounds = {
	x: number;
	y: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
};

export type SlotCooldownRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type SlotCooldownOcrRect = SlotCooldownRect & {
	screenX: number;
	screenY: number;
	screenWidth: number;
	screenHeight: number;
};

export function cleanSlotNumber(value: unknown, fallback = 0) {
	const slot = Math.round(Number(value));
	if (Number.isFinite(slot) && slot > 0) return slot;
	const fallbackSlot = Math.round(Number(fallback));
	return Number.isFinite(fallbackSlot) && fallbackSlot > 0 ? fallbackSlot : 0;
}

export const manualLayouts: Record<string, {
	label: string;
	stepX: number;
	stepY: number;
	rowStepX: number;
	rowStepY: number;
	rowLen: number;
	length: number;
}> = {
	"1x14": { label: "1x14", stepX: 36, stepY: 0, rowStepX: 0, rowStepY: 0, rowLen: 14, length: 14 },
	"2x14": { label: "2x14", stepX: 36, stepY: 0, rowStepX: 0, rowStepY: 40, rowLen: 14, length: 28 },
	"2x7": { label: "2x7", stepX: 35, stepY: 0, rowStepX: 0, rowStepY: 35, rowLen: 7, length: 14 },
	"7x2": { label: "7x2", stepX: 0, stepY: 35, rowStepX: 35, rowStepY: 0, rowLen: 7, length: 14 },
	"14x1": { label: "14x1", stepX: 0, stepY: 36, rowStepX: 0, rowStepY: 0, rowLen: 14, length: 14 },
};

export function makeManualSlots(x: number, y: number, layoutId: string, scale = 1): SlotBox[] {
	const layout = manualLayouts[layoutId] || manualLayouts["1x14"];
	const slots: SlotBox[] = [];
	let cx = Math.round(x);
	let cy = Math.round(y);
	const safeScale = Math.max(0.6, Math.min(1.8, Number(scale) || 1));
	const stepX = Math.round(layout.stepX * safeScale);
	const stepY = Math.round(layout.stepY * safeScale);
	const rowStepX = Math.round(layout.rowStepX * safeScale);
	const rowStepY = Math.round(layout.rowStepY * safeScale);
	const iconWidth = Math.max(16, Math.round(ACTION_SLOT_ICON_WIDTH * safeScale));
	const iconHeight = Math.max(16, Math.round(ACTION_SLOT_ICON_HEIGHT * safeScale));

	for (let i = 0; i < layout.length; i++) {
		slots.push({
			index: i + 1,
			x: cx,
			y: cy,
			width: iconWidth,
			height: iconHeight,
		});

		cx += stepX;
		cy += stepY;

		if ((i + 1) % layout.rowLen === 0) {
			cx += rowStepX - layout.rowLen * stepX;
			cy += rowStepY - layout.rowLen * stepY;
		}
	}

	return slots;
}

function safeSlotRect(slot: SlotBox | null | undefined): SlotBox | null {
	if (!slot) return null;
	return {
		...slot,
		index: cleanSlotNumber(slot.index),
		x: Math.round(Number(slot.x) || 0),
		y: Math.round(Number(slot.y) || 0),
		width: Math.max(1, Math.round(Number(slot.width) || ACTION_SLOT_ICON_WIDTH)),
		height: Math.max(1, Math.round(Number(slot.height) || ACTION_SLOT_ICON_HEIGHT)),
	};
}

export function barOffset(bar: Partial<Pick<TrackedBar, "offsetX" | "offsetY">> | null | undefined) {
	return {
		x: Number(bar?.offsetX) || 0,
		y: Number(bar?.offsetY) || 0,
	};
}

export function slotWithOffset(slot: SlotBox, offsetX = 0, offsetY = 0): SlotBox {
	return {
		...slot,
		x: slot.x + offsetX,
		y: slot.y + offsetY,
	};
}

function normalizedLayoutId(layout: unknown) {
	return String(layout || "").replace(/x/g, "x");
}

function horizontalRowLengthForLayout(layout: unknown) {
	const layoutId = normalizedLayoutId(layout);
	if (layoutId === "2x14") return 14;
	if (layoutId === "2x7") return 7;
	return 0;
}

export function slotHorizontalRowIndex(
	slot: Pick<SlotBox, "index"> | null | undefined,
	bar: Pick<TrackedBar, "layout"> | null | undefined
) {
	const rowLength = horizontalRowLengthForLayout(bar?.layout);
	if (!rowLength) return 0;
	const slotIndex = cleanSlotNumber(slot?.index);
	return slotIndex > 0 ? Math.floor((slotIndex - 1) / rowLength) : 0;
}

export function slotVisualRowOffsetY(
	slot: Pick<SlotBox, "index"> | null | undefined,
	bar: Pick<TrackedBar, "layout"> | null | undefined
) {
	const layoutId = normalizedLayoutId(bar?.layout);
	if (layoutId === "2x14") return -slotHorizontalRowIndex(slot, bar);
	return 0;
}

export function getSlotRect(
	bar: (Pick<TrackedBar, "layout"> & Partial<Pick<TrackedBar, "offsetX" | "offsetY">>) | null | undefined,
	slot: SlotBox | null | undefined
): SlotBox | null {
	const cleanSlot = safeSlotRect(slot);
	if (!cleanSlot) return null;
	const offset = barOffset(bar);
	return slotWithOffset(cleanSlot, offset.x, offset.y + slotVisualRowOffsetY(cleanSlot, bar));
}

export function getSlotRectsForBar(
	bar: (Pick<TrackedBar, "layout" | "slots"> & Partial<Pick<TrackedBar, "offsetX" | "offsetY">>) | null | undefined
): SlotBox[] {
	if (!bar?.slots?.length) return [];
	return bar.slots
		.map(slot => getSlotRect(bar, slot))
		.filter((slot): slot is SlotBox => !!slot);
}

export function boundsForRect(rect: SlotCooldownRect | SlotBox, pad = 0): SlotBounds {
	const safePad = Math.max(0, Math.round(Number(pad) || 0));
	const x = Math.round(Number(rect.x) || 0) - safePad;
	const y = Math.round(Number(rect.y) || 0) - safePad;
	const width = Math.max(1, Math.round(Number(rect.width) || 1));
	const height = Math.max(1, Math.round(Number(rect.height) || 1));
	const right = x + width + safePad * 2;
	const bottom = y + height + safePad * 2;
	return {
		x,
		y,
		right,
		bottom,
		width: Math.max(1, right - x),
		height: Math.max(1, bottom - y),
	};
}

export function getSlotHighlightRect(
	bar: (Pick<TrackedBar, "layout"> & Partial<Pick<TrackedBar, "offsetX" | "offsetY">>) | null | undefined,
	slot: SlotBox | null | undefined,
	pad = 1
): SlotBounds | null {
	const rect = getSlotRect(bar, slot);
	return rect ? boundsForRect(rect, pad) : null;
}

export function getSlotCooldownRect(
	bar: (Pick<TrackedBar, "layout"> & Partial<Pick<TrackedBar, "offsetX" | "offsetY">>) | null | undefined,
	slot: SlotBox | null | undefined
): SlotCooldownRect | null {
	const rect = getSlotRect(bar, slot);
	if (!rect) return null;

	const scaleX = Math.max(0.6, Number(rect.width || ACTION_SLOT_ICON_WIDTH) / ACTION_SLOT_ICON_WIDTH);
	const scaleY = Math.max(0.6, Number(rect.height || ACTION_SLOT_ICON_HEIGHT) / ACTION_SLOT_ICON_HEIGHT);
	const topInset = Math.max(0, Math.round(0 * scaleY));
	const fieldHeight = Math.max(9, Math.round(Number(rect.height || ACTION_SLOT_ICON_HEIGHT) * 0.42));
	const expandLeft = Math.max(1, Math.round(1 * scaleX));
	const expandRight = Math.max(1, Math.round(1 * scaleX));
	const expandDown = Math.max(1, Math.round(1 * scaleY));

	return {
		x: Math.round(Number(rect.x) - expandLeft),
		y: Math.round(Number(rect.y) + topInset),
		width: Math.max(8, Math.round(Number(rect.width || ACTION_SLOT_ICON_WIDTH) + expandLeft + expandRight)),
		height: Math.max(6, fieldHeight + expandDown),
	};
}

export function getSlotCooldownOcrRect(
	capture: ImageData,
	caparea: any,
	slot: SlotBox
): SlotCooldownOcrRect {
	const field = getSlotCooldownRect(null, slot) || {
		x: slot.x,
		y: slot.y,
		width: slot.width,
		height: slot.height,
	};
	const x = Math.max(0, Math.round(field.x - Number(caparea?.x || 0)));
	const y = Math.max(0, Math.round(field.y - Number(caparea?.y || 0)));
	const width = Math.max(1, Math.min(Math.round(field.width), capture.width - x));
	const height = Math.max(1, Math.min(Math.round(field.height), capture.height - y));

	return {
		x,
		y,
		width,
		height,
		screenX: field.x,
		screenY: field.y,
		screenWidth: width,
		screenHeight: height,
	};
}

export function getSlotIndexRect(
	bar: (Pick<TrackedBar, "layout"> & Partial<Pick<TrackedBar, "offsetX" | "offsetY">>) | null | undefined,
	slot: SlotBox | null | undefined,
	badgeWidth: number,
	badgeHeight: number,
	inset = 1
): SlotCooldownRect | null {
	const rect = getSlotRect(bar, slot);
	if (!rect) return null;
	const safeInset = Math.max(0, Math.round(Number(inset) || 0));
	const width = Math.max(1, Math.round(Number(badgeWidth) || 1));
	const height = Math.max(1, Math.round(Number(badgeHeight) || 1));
	return {
		x: rect.x + rect.width - width - safeInset,
		y: rect.y + rect.height - height - safeInset,
		width,
		height,
	};
}

export function getBarBounds(
	bar: (Pick<TrackedBar, "layout" | "slots"> & Partial<Pick<TrackedBar, "offsetX" | "offsetY">>) | null | undefined,
	pad = 0
): SlotBounds | null {
	const slots = getSlotRectsForBar(bar);
	if (!slots.length) return null;
	const safePad = Math.max(0, Math.round(Number(pad) || 0));
	const x = Math.min(...slots.map(slot => slot.x)) - safePad;
	const y = Math.min(...slots.map(slot => slot.y)) - safePad;
	const right = Math.max(...slots.map(slot => slot.x + slot.width)) + safePad;
	const bottom = Math.max(...slots.map(slot => slot.y + slot.height)) + safePad;
	return {
		x,
		y,
		right,
		bottom,
		width: Math.max(1, right - x),
		height: Math.max(1, bottom - y),
	};
}

export function commitBarOffset(bar: Pick<TrackedBar, "slots" | "offsetX" | "offsetY"> | null | undefined) {
	if (!bar) return;
	const offset = barOffset(bar);
	bar.slots.forEach(slot => {
		slot.x += offset.x;
		slot.y += offset.y;
	});
	bar.offsetX = 0;
	bar.offsetY = 0;
}
