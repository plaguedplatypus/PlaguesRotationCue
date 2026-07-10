import type { SlotBox } from "../types";

export function iconTemplateBounds(capture: ImageData, caparea: any, slot: SlotBox) {
	const width = capture.width;
	const height = capture.height;
	const slotX = Math.round(slot.x - caparea.x);
	const slotY = Math.round(slot.y - caparea.y);
	const scaleX = Math.max(0.6, Number(slot.width || 31) / 31);
	const scaleY = Math.max(0.6, Number(slot.height || 31) / 31);

	return {
		left: Math.max(0, slotX + Math.round(4 * scaleX)),
		top: Math.max(0, slotY + Math.round(4 * scaleY)),
		right: Math.min(width - 1, slotX + slot.width - Math.round(5 * scaleX)),
		bottom: Math.min(height - 1, slotY + slot.height - Math.round(8 * scaleY)),
	};
}

export function normalizeVector(raw: number[]) {
	const mean = raw.reduce((a, b) => a + b, 0) / Math.max(1, raw.length);
	const centered = raw.map(value => value - mean);
	const magnitude = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0)) || 1;
	return centered.map(value => Math.round((value / magnitude) * 10000) / 10000);
}

export function sampleIconVector(capture: ImageData, caparea: any, slot: SlotBox, size = 16) {
	const bounds = iconTemplateBounds(capture, caparea, slot);
	const sourceWidth = Math.max(1, bounds.right - bounds.left + 1);
	const sourceHeight = Math.max(1, bounds.bottom - bounds.top + 1);
	const raw: number[] = [];

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const normalizedX = (x + 0.5) / size;
			const normalizedY = (y + 0.5) / size;
			const insetX = 0.08 + normalizedX * 0.84;
			const insetY = 0.08 + normalizedY * 0.84;

			const pixelX = Math.max(0, Math.min(capture.width - 1, Math.round(bounds.left + insetX * sourceWidth)));
			const pixelY = Math.max(0, Math.min(capture.height - 1, Math.round(bounds.top + insetY * sourceHeight)));
			const index = (pixelY * capture.width + pixelX) * 4;
			raw.push(
				capture.data[index] / 255,
				capture.data[index + 1] / 255,
				capture.data[index + 2] / 255
			);
		}
	}

	return normalizeVector(raw);
}

function iconMaskIndices(includePixel: (x: number, y: number) => boolean) {
	const indices: number[] = [];
	for (let y = 0; y < 16; y++) {
		for (let x = 0; x < 16; x++) {
			if (includePixel(x, y)) indices.push((y * 16 + x) * 3);
		}
	}
	return indices;
}

function maskedIconSimilarityAtIndices(a: number[], b: number[], indices: number[]) {
	if (!indices.length) return -1;

	let sumA = 0;
	let sumB = 0;
	let count = 0;
	for (const index of indices) {
		for (let channel = 0; channel < 3; channel++) {
			sumA += Number(a[index + channel]);
			sumB += Number(b[index + channel]);
			count++;
		}
	}

	const meanA = sumA / count;
	const meanB = sumB / count;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (const index of indices) {
		for (let channel = 0; channel < 3; channel++) {
			const valueA = Number(a[index + channel]) - meanA;
			const valueB = Number(b[index + channel]) - meanB;
			dot += valueA * valueB;
			normA += valueA * valueA;
			normB += valueB * valueB;
		}
	}

	if (normA <= 0 || normB <= 0) return -1;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const notEdge = (x: number, y: number) => x > 0 && y > 0 && x < 15 && y < 15;
const ICON_SIMILARITY_MASKS = [
	iconMaskIndices(notEdge),
	iconMaskIndices((x, y) => notEdge(x, y) && !(x <= 9 && y >= 9)),
	iconMaskIndices((x, y) => notEdge(x, y) && !(x <= 9 && y <= 6)),
	iconMaskIndices((x, y) => notEdge(x, y) && y <= 11),
	iconMaskIndices((x, y) => notEdge(x, y) && y >= 4),
	iconMaskIndices((x, y) => notEdge(x, y) && !(y >= 10 && (x <= 8 || x >= 12))),
	iconMaskIndices((x, y) => notEdge(x, y) && y <= 11 && !(x <= 8 && y >= 9)),
	iconMaskIndices((x, y) => x >= 3 && x <= 12 && y >= 3 && y <= 12 && !(x <= 8 && y >= 9)),
	iconMaskIndices((x, y) => notEdge(x, y) && (y <= 8 || x >= 8) && !(x <= 8 && y >= 9)),
];

export function iconSimilarity(a?: number[], b?: number[]) {
	if (!a || !b || a.length !== b.length) return -1;
	if (a.length === 16 * 16 * 3) {
		let best = -1;
		for (const mask of ICON_SIMILARITY_MASKS) {
			best = Math.max(best, maskedIconSimilarityAtIndices(a, b, mask));
		}
		return best;
	}

	let dot = 0;
	for (let index = 0; index < a.length; index++) {
		dot += Number(a[index]) * Number(b[index]);
	}
	return dot;
}

export function sampleAlignedIconVectors(
	sampler: (capture: ImageData, caparea: any, slot: SlotBox, size?: number) => number[],
	capture: ImageData,
	caparea: any,
	slot: SlotBox,
	size = 16,
	radius = 2
) {
	const vectors: number[][] = [];
	for (let deltaY = -radius; deltaY <= radius; deltaY++) {
		for (let deltaX = -radius; deltaX <= radius; deltaX++) {
			const vector = sampler(capture, caparea, {
				...slot,
				x: Number(slot.x) + deltaX,
				y: Number(slot.y) + deltaY,
			}, size);
			if (vector.length) vectors.push(vector);
		}
	}
	return vectors;
}
