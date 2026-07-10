import TooltipReader from "alt1/tooltip";

export type ScreenRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

function validRect(value: any): ScreenRect | null {
	const rect = value?.area || value;
	const x = Number(rect?.x);
	const y = Number(rect?.y);
	const width = Number(rect?.width);
	const height = Number(rect?.height);
	return (
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		width > 0 &&
		height > 0
	)
		? { x, y, width, height }
		: null;
}

export function rectanglesIntersect(a: ScreenRect, b: ScreenRect) {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

export function detectTooltipBounds(): ScreenRect | null {
	try {
		if (TooltipReader.checkPossible(null, false, false)) {
			const below = validRect(TooltipReader.read(1));
			if (below) return below;
		}
		if (TooltipReader.checkPossible(null, true, false)) {
			const above = validRect(TooltipReader.read(-1));
			if (above) return above;
		}
	} catch (_error) {
		// Tooltip detection is a guard only; a failed read must not block OCR.
	}
	return null;
}
