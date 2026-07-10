import {
	abilityById,
	abilityCanTrainIcon,
	abilityFamilyIds,
	abilityLabel,
} from "../Abilities/abilityData";
import { sampleIconVector } from "./iconVectors";

function validTemplateVector(vector: any): vector is number[] {
	return Array.isArray(vector) && vector.length === 16 * 16 * 3;
}

export function iconTemplateVectors(template: any): number[][] {
	const vectors: number[][] = Array.isArray(template?.vectors)
		? template.vectors.filter(validTemplateVector)
		: [];
	if (
		validTemplateVector(template?.vector) &&
		!vectors.some((candidate: number[]) =>
			candidate === template.vector ||
			candidate.every((value: number, index: number) => value === template.vector[index])
		)
	) {
		vectors.push(template.vector);
	}
	return vectors.slice(-4);
}

export function abilityFamilyTemplate(templates: Record<string, any>, abilityIdValue: string) {
	const familyTemplates = abilityFamilyIds(abilityIdValue)
		.map(id => templates?.[id])
		.filter(Boolean);
	if (!familyTemplates.length) return null;

	const vectors = familyTemplates.flatMap(template => iconTemplateVectors(template).slice(-2));
	if (!vectors.length) return null;

	const latest = familyTemplates[familyTemplates.length - 1];
	return {
		...latest,
		abilityId: abilityIdValue,
		vector: vectors[vectors.length - 1],
		vectors,
	};
}

export function storeLearnedIconTemplate(
	templates: Record<string, any>,
	abilityIdValue: string,
	vector: number[],
	metadata: Record<string, any> = {}
) {
	const id = String(abilityIdValue || "");
	if (!id || !validTemplateVector(vector)) return false;

	const existing = templates[id] || {};
	const existingVectors = iconTemplateVectors(existing);
	const duplicate = existingVectors.some(candidate =>
		candidate === vector ||
		candidate.every((value, index) => value === vector[index])
	);
	const vectors = duplicate ? existingVectors : [...existingVectors, vector].slice(-4);
	templates[id] = {
		...existing,
		...metadata,
		abilityId: id,
		size: 16,
		vector,
		vectors,
		learnedAt: Date.now(),
		source: String(metadata.source || existing.source || "learned"),
	};
	return true;
}

export function cleanLearnedIconTemplates(raw: any) {
	const out: Record<string, any> = {};
	for (const [abilityIdValue, template] of Object.entries(raw || {}) as Array<[string, any]>) {
		if (!abilityById[abilityIdValue] || !abilityCanTrainIcon(abilityIdValue)) continue;
		const vectors = iconTemplateVectors(template);
		if (!vectors.length) continue;
		const vector = vectors[vectors.length - 1];
		out[abilityIdValue] = {
			...template,
			abilityId: abilityIdValue,
			name: abilityLabel(abilityIdValue),
			style: abilityById[abilityIdValue].style,
			size: 16,
			vector,
			vectors,
			source: String(template?.source || "learned"),
		};
	}
	return out;
}

type BundledIconTemplateDeps = {
	abilityIconSrc: (id: string) => string;
};

export function createBundledIconTemplateApi(deps: BundledIconTemplateDeps) {
	const cache: Partial<Record<string, Promise<any | null>>> = {};

	function loadTemplate(abilityIdValue: string) {
		const id = String(abilityIdValue || "");
		const cached = cache[id];
		if (cached) return cached;

		const promise = new Promise<any | null>(resolve => {
			const src = deps.abilityIconSrc(id);
			if (!src || typeof Image === "undefined" || typeof document === "undefined") {
				resolve(null);
				return;
			}

			const image = new Image();
			image.onload = () => {
				const width = Number(image.naturalWidth || image.width);
				const height = Number(image.naturalHeight || image.height);
				const canvas = document.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				const context = canvas.getContext("2d", { willReadFrequently: true });

				if (!context || !width || !height) {
					resolve(null);
					return;
				}

				context.drawImage(image, 0, 0, width, height);
				const capture = context.getImageData(0, 0, width, height);
				const vector = sampleIconVector(capture, { x: 0, y: 0 }, {
					index: 1,
					x: 0,
					y: 0,
					width,
					height,
				}, 16);

				resolve(vector.length ? {
					vectors: [vector],
					source: "bundled",
				} : null);
			};
			image.onerror = () => resolve(null);
			image.src = src;
		});
		cache[id] = promise;

		return promise;
	}

	async function templatesFor(abilityIds: string[]) {
		const uniqueIds = Array.from(new Set(abilityIds.map(String).filter(Boolean)));
		const loaded = await Promise.all(uniqueIds.map(async id => {
			const familyTemplates = await Promise.all(abilityFamilyIds(id).map(loadTemplate));
			const vectors = familyTemplates
				.filter(Boolean)
				.flatMap(template => iconTemplateVectors(template));
			return [id, vectors.length ? { vectors, source: "bundled" } : null] as const;
		}));
		return Object.fromEntries(loaded.filter(([, template]) => !!template));
	}

	return {
		templatesFor,
	};
}
