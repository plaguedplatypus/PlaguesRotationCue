import {
	ACTION_SLOT_ICON_HEIGHT,
	ACTION_SLOT_ICON_WIDTH,
	commitBarOffset,
	getBarBounds,
	getSlotCooldownRect,
	getSlotHighlightRect,
	getSlotIndexRect,
	getSlotRectsForBar,
	makeManualSlots,
	manualLayouts,
} from "./slotGeometry";
import * as a1lib from "alt1/base";
import type { RotationStepEntry, SlotBox, TrackedBar } from "../types";
import { rotationStepAbilityId } from "./rotationSteps";
import {
	abilityFamilyKey,
	abilityRequiresMapping,
} from "../Abilities/abilityData";
import {
	abilityFamilyTemplate,
	iconTemplateVectors,
	LEARNED_ICON_MATCH_MARGIN,
	LEARNED_ICON_MATCH_THRESHOLD,
	sampleAlignedIconVectors,
	selectUniqueIconCandidates,
} from "../IconTraining/icons";

function imageDataFromCapture(captureResult: any) {
	if (!captureResult) return null;
	if (typeof captureResult.toData === "function") return captureResult.toData();
	if (captureResult.data && typeof captureResult.width === "number" && typeof captureResult.height === "number") return captureResult;
	return captureResult;
}

export function captureForTrackedBar(bar: TrackedBar | null | undefined) {
	if (!bar) return null;

	const probeBar = {
		name: bar.name,
		id: bar.id,
		layout: bar.layout,
		slots: getSlotRectsForBar(bar),
	};
	const bounds = getBarBounds(bar, 10);
	if (!bounds) return null;

	const caparea = {
		x: Math.max(0, Math.floor(bounds.x)),
		y: Math.max(0, Math.floor(bounds.y)),
		width: Math.max(1, Math.ceil(bounds.right) - Math.max(0, Math.floor(bounds.x))),
		height: Math.max(1, Math.ceil(bounds.bottom) - Math.max(0, Math.floor(bounds.y))),
	};
	const imgref = a1lib.capture(caparea.x, caparea.y, caparea.width, caparea.height);
	if (!imgref) return null;

	const img = imageDataFromCapture(imgref);
	return img ? { img, imgref, caparea, probeBar } : null;
}

type ManualBarActionsDeps = {
	app: any;
	yellow: any;
	previewGroup: string;
	cueGroup: string;
	hasAlt1: () => boolean;
	cleanBar: (bar: any) => any;
	makeId: (prefix: string) => string;
	resetCueLock: () => void;
	save: () => void;
	render: () => void;
	clearGroup: (group: string) => void;
	setLastKey: (value: string) => void;
	setCooldownBaselineStatus: (value: string) => void;
	getManualLayout: () => string;
	setPendingManualLayout: (value: string) => void;
	getPendingManualLayout: () => string;
	setBarHint: (value: string) => void;
};

type SlotIndexBadge = {
	image: string;
	width: number;
	height: number;
};

function cssColor(color: any) {
	const unsignedColor = Number(color) >>> 0;
	return `rgb(${(unsignedColor >>> 16) & 255}, ${(unsignedColor >>> 8) & 255}, ${unsignedColor & 255})`;
}

const slotIndexBadgeCache = new Map<string, SlotIndexBadge>();

function renderSlotIndexBadge(label: string, color: any): SlotIndexBadge | null {
	const key = `${label}:${Number(color) >>> 0}`;
	const cached = slotIndexBadgeCache.get(key);
	if (cached) return cached;
	if (typeof document === "undefined") return null;

	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) return null;

	const fontSize = 10;
	const font = `${fontSize}px "Arial Black", Arial, sans-serif`;
	context.font = font;
	const metrics = context.measureText(label);
	const left = Math.ceil(Math.max(0, metrics.actualBoundingBoxLeft || 0));
	const right = Math.ceil(metrics.actualBoundingBoxRight || metrics.width);
	const ascent = Math.ceil(metrics.actualBoundingBoxAscent || 8);
	const descent = Math.ceil(Number.isFinite(metrics.actualBoundingBoxDescent)
		? metrics.actualBoundingBoxDescent
		: 2);
	const padding = 1;

	canvas.width = Math.max(3, left + right + padding * 2);
	canvas.height = Math.max(3, ascent + descent + padding * 2);

	const drawContext = canvas.getContext("2d");
	if (!drawContext) return null;
	drawContext.font = font;
	drawContext.textAlign = "left";
	drawContext.textBaseline = "alphabetic";
	drawContext.fillStyle = cssColor(color);
	drawContext.fillText(label, padding + left, padding + ascent);

	const badge = {
		image: a1lib.encodeImageString(drawContext.getImageData(0, 0, canvas.width, canvas.height)),
		width: canvas.width,
		height: canvas.height,
	};
	slotIndexBadgeCache.set(key, badge);
	return badge;
}

export function createManualBarActionsApi(deps: ManualBarActionsDeps) {
	let manualSetupListening = false;
	let activePreviewKey = "";

	function configuredBars() {
		if (!Array.isArray(deps.app.configuredBars)) {
			deps.app.configuredBars = deps.app.configuredBar ? [deps.app.configuredBar] : [];
		}
		deps.app.configuredBar = deps.app.configuredBars[0] || null;
		return deps.app.configuredBars as TrackedBar[];
	}

	function layoutBarName(layout: string, duplicateIndex = 1) {
		const label = String(layout || "1x14").replace(/x/g, " x ");
		return `${label} Bar${duplicateIndex > 1 ? ` - ${duplicateIndex}` : ""}`;
	}

	function renameConfiguredBars() {
		const counts: Record<string, number> = {};
		for (const bar of configuredBars()) {
			const layout = String(bar.layout || "1x14");
			counts[layout] = (counts[layout] || 0) + 1;
			bar.name = layoutBarName(layout, counts[layout]);
		}
		deps.app.configuredBar = deps.app.configuredBars[0] || null;
	}

	function configuredBar(id: string) {
		return configuredBars().find(bar => bar.id === id) || null;
	}

	function drawPreviewLine(color: any, x1: number, y1: number, x2: number, y2: number, lifetime: number) {
		window.alt1?.overLayLine(color, 1, x1, y1, x2, y2, lifetime);
	}

	function drawPreviewSlotBounds(slot: SlotBox, color: any, lifetime: number) {
		const bounds = getSlotHighlightRect(null, slot);
		if (!bounds) return;
		drawPreviewLine(color, bounds.x, bounds.y, bounds.right, bounds.y, lifetime);
		drawPreviewLine(color, bounds.right, bounds.y, bounds.right, bounds.bottom, lifetime);
		drawPreviewLine(color, bounds.right, bounds.bottom, bounds.x, bounds.bottom, lifetime);
		drawPreviewLine(color, bounds.x, bounds.bottom, bounds.x, bounds.y, lifetime);
	}

	function clearBarPreview() {
		activePreviewKey = "";
		deps.clearGroup(deps.previewGroup);
	}

	function drawBarPreview(id = "", force = false) {
		const bars = id
			? configuredBars().filter(bar => bar.id === id)
			: configuredBars();
		if (!bars.length || !deps.hasAlt1() || !window.alt1) return;

		const previewKey = id || "__all__";
		if (!force && activePreviewKey === previewKey) {
			clearBarPreview();
			return;
		}

		try {
			const a = window.alt1;
			const lifetime = 5000;
			const thickness = 1;
			const cooldownFieldColor = a1lib.mixColor(72, 215, 72);
			a.overLaySetGroup(deps.previewGroup);
			a.overLayFreezeGroup(deps.previewGroup);
			a.overLayClearGroup(deps.previewGroup);

			bars.forEach(bar => {
				getSlotRectsForBar(bar).forEach((slot: any) => {
					drawPreviewSlotBounds(slot, deps.yellow, lifetime);
					const cooldownField = getSlotCooldownRect(null, slot);
					if (!cooldownField) return;
					const previewCooldownField = {
						...cooldownField,
						x: cooldownField.x + 1,
						width: Math.max(1, cooldownField.width - 1),
					};
					a.overLayRect(
						cooldownFieldColor,
						previewCooldownField.x,
						previewCooldownField.y,
						previewCooldownField.width,
						previewCooldownField.height,
						lifetime,
						thickness
					);
					const slotIndexLabel = String(slot.index);
					const slotIndexBadge = renderSlotIndexBadge(slotIndexLabel, deps.yellow);
					if (slotIndexBadge && typeof a.overLayImage === "function") {
						const badgeRect = getSlotIndexRect(null, slot, slotIndexBadge.width, slotIndexBadge.height);
						if (!badgeRect) return;
						a.overLayImage(
							badgeRect.x,
							badgeRect.y,
							slotIndexBadge.image,
							slotIndexBadge.width,
							lifetime
						);
					} else {
						const approximateWidth = Math.max(5, slotIndexLabel.length * 6);
						const fallbackRect = getSlotIndexRect(null, slot, approximateWidth, 10);
						if (!fallbackRect) return;
						a.overLayText(
							slotIndexLabel,
							deps.yellow,
							10,
							fallbackRect.x,
							fallbackRect.y + fallbackRect.height - 2,
							lifetime
						);
					}
				});
			});

			a.overLayRefreshGroup(deps.previewGroup);
			activePreviewKey = previewKey;
		} catch (err) {
			activePreviewKey = "";
			console.warn("Preview overlay failed", err);
		}
	}

	function startManualBarSetup() {
		if (!deps.hasAlt1()) {
			alert("Open this app inside Alt1 before adding a manual bar.");
			return;
		}
		if (manualSetupListening) {
			deps.setBarHint("Already waiting: hover over the CENTER of slot 1, then press Alt + 1.");
			return;
		}

		const layout = deps.getManualLayout() || "1x14";
		deps.setPendingManualLayout(layout);
		manualSetupListening = true;
		deps.setBarHint(`Adding Action Bar (${layout}): hover over the CENTER of slot 1, then press Alt + 1.`);

		a1lib.once("alt1pressed", ev => {
			manualSetupListening = false;
			if (!deps.getPendingManualLayout()) return;

			const pos = ev.mouseRs || ev.mouseAbs || { x: ev.x, y: ev.y };
			const x = Number(pos?.x);
			const y = Number(pos?.y);

			if (!Number.isFinite(x) || !Number.isFinite(y)) {
				alert("Could not read mouse position. Hover over slot 1 in the RuneScape window and try again.");
				deps.setPendingManualLayout("");
				return;
			}

			const pendingLayout = deps.getPendingManualLayout();
			deps.setPendingManualLayout("");
			addManualBarAt(x, y, pendingLayout);
			deps.setBarHint("Bar added.");
		});
	}

	function deleteBar(id: string) {
		const bar = configuredBar(id);
		if (!bar) return;

		deps.app.configuredBars = configuredBars().filter(item => item.id !== id);
		if (deps.app.largeCueKeybinds) delete deps.app.largeCueKeybinds[id];
		renameConfiguredBars();
		deps.app.activeRotationId = "";
		deps.setCooldownBaselineStatus("Activate a rotation");
		deps.resetCueLock();
		deps.save();
		deps.render();
		deps.clearGroup(deps.cueGroup);
		clearBarPreview();
	}

	function nudgeBar(id: string, dx: number, dy: number) {
		const bar = configuredBar(id);
		if (!bar) return;

		bar.offsetX += dx;
		bar.offsetY += dy;
		deps.setLastKey("");
		deps.app.activeRotationId = "";
		deps.setCooldownBaselineStatus("Activate a rotation");
		deps.save();
		deps.render();
		drawBarPreview(id, true);
	}

	function resetBarOffset(id: string) {
		const bar = configuredBar(id);
		if (!bar) return;

		commitBarOffset(bar);
		deps.setLastKey("");
		deps.app.activeRotationId = "";
		deps.setCooldownBaselineStatus("Activate a rotation");
		deps.save();
		deps.render();
		drawBarPreview(id, true);
	}

	function addManualBarAt(x: number, y: number, layoutId: string, scale = 1) {
		const layout = manualLayouts[layoutId] || manualLayouts["1x14"];

		const iconWidth = Math.max(16, Math.round(ACTION_SLOT_ICON_WIDTH * scale));
		const iconHeight = Math.max(16, Math.round(ACTION_SLOT_ICON_HEIGHT * scale));
		const slotX = Math.round(x - iconWidth / 2);
		const slotY = Math.round(y - iconHeight / 2);

		const bar = deps.cleanBar({
			id: deps.makeId("bar"),
			name: layoutBarName(layout.label),
			layout: layout.label,
			slots: makeManualSlots(slotX, slotY, layoutId, scale),
			offsetX: 0,
			offsetY: 0,
			slotAbilitiesByStyle: {},
		});

		deps.app.configuredBars = [...configuredBars(), bar];
		renameConfiguredBars();
		deps.app.activeRotationId = "";
		deps.setCooldownBaselineStatus("Activate a rotation");
		deps.resetCueLock();
		deps.save();
		deps.render();
		drawBarPreview(bar.id, true);
	}

	return {
		drawBarPreview,
		startManualBarSetup,
		deleteBar,
		nudgeBar,
		resetBarOffset,
		addManualBarAt,
	};
}
type RotationLike = {
	id: string;
	abilitySteps?: RotationStepEntry[];
	combatStyle?: string;
};

type BarScanningApiDeps = {
	getRotation: (id: string) => RotationLike | null;
	getConfiguredBar?: () => TrackedBar | null;
	getConfiguredBars?: () => TrackedBar[];
	availableIconTemplates: () => Record<string, any>;
	bundledIconTemplates: (abilityIds: string[]) => Promise<Record<string, any>>;
	learnMatchedIconTemplate?: (abilityId: string, vector: number[], metadata: Record<string, any>) => boolean;
	captureForTrackedBar: (bar: TrackedBar) => any;
	sampleIconVector: (capture: ImageData, caparea: any, slot: any, size?: number) => number[];
	iconSimilarity: (a?: number[], b?: number[]) => number;
	abilityLabel: (id: string) => string;
	setIconStatus: (status: string) => void;
	saveIconTemplates?: () => void;
	save: () => void;
	render: () => void;
	updateFooter: () => void;
};

export function createBarScanningApi(deps: BarScanningApiDeps) {
	const activeScans = new Set<string>();

	function configuredBars() {
		const bars = deps.getConfiguredBars?.() || [];
		if (bars.length) return bars;
		const bar = deps.getConfiguredBar?.();
		return bar ? [bar] : [];
	}

	async function scanBarForRotationAbilities(rotationId: string) {
		if (activeScans.has(rotationId)) return false;

		const rot = deps.getRotation(rotationId);
		if (!rot) return false;

		const bars = configuredBars();
		if (!bars.length) return false;

		const rotationAbilityIds = (rot.abilitySteps || [])
			.map(rotationStepAbilityId)
			.filter(Boolean);
		const wantedAbilityIds = new Set<string>(
			rotationAbilityIds.filter(abilityRequiresMapping)
		);
		const wantedFamilies = new Map<string, string>();
		for (const id of wantedAbilityIds) {
			const key = abilityFamilyKey(id);
			if (key && !wantedFamilies.has(key)) wantedFamilies.set(key, id);
		}

		if (!wantedAbilityIds.size) {
			deps.setIconStatus(rotationAbilityIds.length
				? "Scan skipped: no action-bar abilities need mapping"
				: "Scan incomplete: add abilities to the rotation first");
			deps.updateFooter();
			return false;
		}

		activeScans.add(rotationId);
		deps.setIconStatus(`Scanning ${bars.length === 1 ? "action bar" : "action bars"}...`);
		deps.updateFooter();

		try {
			const combatStyle = String(rot.combatStyle || "Hybrid");
			let refreshedTemplates = 0;
			let chosenTotal = 0;
			let capturedAny = false;
			let comparedAny = false;
			let bestObservedScore = -1;
			const learnedThreshold = LEARNED_ICON_MATCH_THRESHOLD;
			const bundledThreshold = 0.80;
			const learnedGap = LEARNED_ICON_MATCH_MARGIN;
			const bundledGap = 0.08;

			const styleSlotAbilities = (bar: TrackedBar) => {
				if (!bar.slotAbilitiesByStyle) bar.slotAbilitiesByStyle = {};
				if (!bar.slotAbilitiesByStyle[combatStyle]) bar.slotAbilitiesByStyle[combatStyle] = {};
				return bar.slotAbilitiesByStyle[combatStyle];
			};

			const mappedFamilyKeysForAllBars = () => new Set(
				bars
					.flatMap(bar => Object.values(styleSlotAbilities(bar)))
					.map(abilityFamilyKey)
					.filter(Boolean)
			);

			for (const bar of bars) {
				const slotAbilities = styleSlotAbilities(bar);
				const captured = deps.captureForTrackedBar(bar);
				if (!captured) continue;
				capturedAny = true;

				for (const [familyKey] of wantedFamilies) {
					const mappedEntry = Object.entries(slotAbilities)
						.find(([, mappedAbilityId]) => abilityFamilyKey(mappedAbilityId) === familyKey);
					const mappedAbilityId = String(mappedEntry?.[1] || "");
					const mappedSlotNumber = Number(mappedEntry?.[0]) || 0;
					if (!mappedAbilityId || !mappedSlotNumber) continue;

					const mappedSlot = captured.probeBar.slots
						.find((slot: any) => Number(slot.index) === mappedSlotNumber);
					if (!mappedSlot) continue;

					const vector = deps.sampleIconVector(captured.img, captured.caparea, mappedSlot, 16);
					if (!vector.length) continue;
					if (deps.learnMatchedIconTemplate?.(mappedAbilityId, vector, {
						name: deps.abilityLabel(mappedAbilityId),
						style: combatStyle,
						capture: {
							barId: bar.id,
							slot: mappedSlot.index,
							x: mappedSlot.x,
							y: mappedSlot.y,
							width: mappedSlot.width,
							height: mappedSlot.height,
						},
						source: "learned-scan",
					})) {
						refreshedTemplates++;
					}
				}

				const missingAbilityIds = Array.from(wantedFamilies)
					.filter(([familyKey]) => !mappedFamilyKeysForAllBars().has(familyKey))
					.map(([, abilityIdValue]) => abilityIdValue);
				if (!missingAbilityIds.length) continue;

				const learnedTemplates = deps.availableIconTemplates();
				const bundledTemplates = await deps.bundledIconTemplates(missingAbilityIds);
				const matchingTemplateIds = missingAbilityIds.filter(id =>
					iconTemplateVectors(abilityFamilyTemplate(learnedTemplates, id)).length ||
					iconTemplateVectors(bundledTemplates[id]).length
				);
				if (!matchingTemplateIds.length) continue;
				comparedAny = true;

				const slotVectors = captured.probeBar.slots
					.map((slot: any) => ({
						slot,
						vectors: sampleAlignedIconVectors(
							deps.sampleIconVector,
							captured.img,
							captured.caparea,
							slot,
							16,
							2
						),
					}))
					.filter((row: any) => row.vectors.length);

				type Candidate = {
					abilityId: string;
					slot: number;
					score: number;
					source: "learned" | "bundled";
					captureVector: number[];
				};

				const candidates: Candidate[] = [];

				for (const abilityIdValue of matchingTemplateIds) {
					const variants = [
						...iconTemplateVectors(abilityFamilyTemplate(learnedTemplates, abilityIdValue))
							.map(vector => ({ vector, source: "learned" as const })),
						...iconTemplateVectors(bundledTemplates[abilityIdValue])
							.map(vector => ({ vector, source: "bundled" as const })),
					];
					if (!variants.length) continue;

					const rows: Candidate[] = [];

					for (const row of slotVectors) {
						const scored = variants
							.map(variant => {
								const aligned = row.vectors
									.map((captureVector: number[]) => ({
										score: deps.iconSimilarity(captureVector, variant.vector),
										captureVector,
									}))
									.sort((a: any, b: any) => b.score - a.score);
								return {
									score: aligned[0]?.score ?? -1,
									captureVector: aligned[0]?.captureVector || [],
									source: variant.source,
								};
							})
							.sort((a: any, b: any) => b.score - a.score);
						const best = scored[0];
						if (!best) continue;

						rows.push({
							abilityId: abilityIdValue,
							slot: row.slot.index,
							score: best.score,
							source: best.source,
							captureVector: best.captureVector,
						});
					}

					rows.sort((a: any, b: any) => b.score - a.score);
					const bestRows = rows.slice(0, 4);
					bestObservedScore = Math.max(bestObservedScore, bestRows[0]?.score ?? -1);
					const gap = bestRows.length > 1 ? bestRows[0].score - bestRows[1].score : 1;
					const requiredGap = bestRows[0]?.source === "learned" ? learnedGap : bundledGap;
					const requiredScore = bestRows[0]?.source === "learned" ? learnedThreshold : bundledThreshold;
					const distinctiveBundledMatch =
						bestRows[0]?.source === "bundled" &&
						bestRows[0].score >= 0.72 &&
						gap >= 0.15;
					if (
						bestRows.length &&
						(
							distinctiveBundledMatch ||
							(
								bestRows[0].score >= requiredScore &&
								(gap >= requiredGap || bestRows[0].score >= 0.94)
							)
						)
					) {
						candidates.push(bestRows[0]);
					}
				}

				const unambiguousCandidates = candidates.filter((candidate: any) => {
					const competing = candidates.filter((row: any) =>
						row.slot === candidate.slot &&
						row.abilityId !== candidate.abilityId
					);
					const crossAbilityGap = competing.length ? candidate.score - competing[0].score : 1;
					return crossAbilityGap >= 0.04 || candidate.score >= 0.96;
				});
				const chosen = selectUniqueIconCandidates(unambiguousCandidates, slotAbilities);

				for (const match of chosen) {
					slotAbilities[String(match.slot)] = match.abilityId;
					const matchedSlot = captured.probeBar.slots.find((slot: any) => Number(slot.index) === match.slot);
					deps.learnMatchedIconTemplate?.(match.abilityId, match.captureVector, {
						name: deps.abilityLabel(match.abilityId),
						style: combatStyle,
						capture: matchedSlot ? {
							barId: bar.id,
							slot: matchedSlot.index,
							x: matchedSlot.x,
							y: matchedSlot.y,
							width: matchedSlot.width,
							height: matchedSlot.height,
						} : { barId: bar.id, slot: match.slot },
						source: "learned-scan",
					});
				}

				chosenTotal += chosen.length;
			}

			if (chosenTotal || refreshedTemplates) deps.saveIconTemplates?.();
			deps.save();
			const resultingMappedFamilyKeys = mappedFamilyKeysForAllBars();
			const mappedTotal = Array.from(wantedAbilityIds)
				.filter(id => resultingMappedFamilyKeys.has(abilityFamilyKey(id)))
				.length;
			const remaining = wantedAbilityIds.size - mappedTotal;

			if (!capturedAny) {
				deps.setIconStatus("Scan failed: action bars could not be read");
			} else if (!remaining) {
				deps.setIconStatus(chosenTotal || bestObservedScore >= 0
					? `Scan complete: ${mappedTotal}/${wantedAbilityIds.size} mapped; 0 need review`
					: `All rotation abilities are mapped; updated ${refreshedTemplates} learned icon${refreshedTemplates === 1 ? "" : "s"}`);
			} else {
				deps.setIconStatus(comparedAny || bestObservedScore >= 0
					? `Scan incomplete: ${mappedTotal}/${wantedAbilityIds.size} mapped; ${remaining} need review`
					: "Scan incomplete: no matching learned or bundled icons; map abilities manually");
			}

			deps.render();
			deps.updateFooter();
			return mappedTotal === wantedAbilityIds.size || chosenTotal > 0;
		} catch {
			deps.setIconStatus("Scan failed: learned or bundled icons could not be loaded");
			deps.updateFooter();
			return false;
		} finally {
			activeScans.delete(rotationId);
		}
	}

	return {
		scanBarForRotationAbilities,
	};
}
