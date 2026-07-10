import { cleanAbilityId } from "../Abilities/abilityData";
import type { RotationStepEntry, RotationStepSeparator } from "../types";

export const STEP_SEPARATOR_TYPE = "step_separator";
export const STEP_SEPARATOR_LABEL_MAX_LENGTH = 43;
const DEFAULT_STEP_SEPARATOR_LABEL = "Step";

export function isRotationStepSeparator(value: any): value is RotationStepSeparator {
	return !!value &&
		typeof value === "object" &&
		String(value.type || "") === STEP_SEPARATOR_TYPE;
}

export function cleanStepSeparatorLabel(value: any, fallback = DEFAULT_STEP_SEPARATOR_LABEL) {
	const label = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, STEP_SEPARATOR_LABEL_MAX_LENGTH);
	return label || fallback;
}

export function rotationStepAbilityId(value: any) {
	return typeof value === "string" ? cleanAbilityId(value) : "";
}

export function cleanRotationStepEntry(value: any): RotationStepEntry | "" {
	if (isRotationStepSeparator(value)) {
		return {
			type: STEP_SEPARATOR_TYPE,
			label: cleanStepSeparatorLabel(value.label),
		};
	}

	return rotationStepAbilityId(value);
}

export function cleanRotationSteps(value: any): RotationStepEntry[] {
	return Array.isArray(value)
		? value.map(cleanRotationStepEntry).filter((entry): entry is RotationStepEntry => !!entry)
		: [];
}

export function rotationAbilityEntries(value: any): string[] {
	return Array.isArray(value)
		? value.map(rotationStepAbilityId).filter(Boolean)
		: [];
}

export function nextStepSeparatorLabel(entries: any[]) {
	let highestStepNumber = 0;
	for (const entry of Array.isArray(entries) ? entries : []) {
		if (!isRotationStepSeparator(entry)) continue;
		const match = cleanStepSeparatorLabel(entry.label).match(/^step\s+(\d+)$/i);
		const stepNumber = match ? Number(match[1]) : 0;
		if (Number.isInteger(stepNumber) && stepNumber > highestStepNumber) {
			highestStepNumber = stepNumber;
		}
	}
	return `Step ${highestStepNumber + 1}`;
}

export function createStepSeparator(entries: any[]): RotationStepSeparator {
	return {
		type: STEP_SEPARATOR_TYPE,
		label: nextStepSeparatorLabel(entries),
	};
}
