export type SlotBox = {
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
};

export type TrackedBar = {
	id: string;
	name: string;
	layout: string;
	slots: SlotBox[];
	offsetX: number;
	offsetY: number;
	slotAbilitiesByStyle?: Record<string, Record<string, string>>;
};

export type RotationStepSeparator = {
	type: "step_separator";
	label: string;
};

export type RotationStepEntry = string | RotationStepSeparator;

export type RotationModel = {
	id: string;
	title: string;
	combatStyle: string;
	abilitySteps: RotationStepEntry[];
	rotationIndex: number;
	collapsed: boolean;
};

export type HighlightColorKey = "current" | "rotation" | "cooldown";
export type HighlightColors = Record<HighlightColorKey, string>;

export type ScreenPoint = {
	x: number;
	y: number;
};

export type AbilityOption = {
	id: string;
	name: string;
	style: string;
	scan?: boolean;
	picker?: "abilities" | "other";
	sectionId?: string;
	sectionLabel?: string;
	showInStyles?: "all" | readonly string[];
	icon?: string;
};

export type IconTrainingProfile = {
	slotAbilities: Record<string, string>;
};

export type IconTrainingProfiles = Record<string, IconTrainingProfile>;

export type LargeCueKeybinds = Record<string, Record<string, string>>;

export type AppState = {
	activeTab: string;
	activeCombatStyle: string;
	overlayEnabled: boolean;
	autoAdvanceCue: boolean;
	showLargeCurrentCue: boolean;
	largeCurrentCuePosition: ScreenPoint | null;
	largeCueKeybinds: LargeCueKeybinds;
	highlightColors: HighlightColors;
	highlightBorderThickness: number;
	activeRotationId: string;
	configuredBars: TrackedBar[];
	configuredBar: TrackedBar | null;
	rotations: RotationModel[];
	abilityTemplates: Record<string, any>;
};

export type ConfiguredRotationStep = {
	rotationId: string;
	barId: string;
	slot: number;
	abilityId: string;
	tracked: boolean;
	scan: boolean;
	cueMarker: boolean;
	reminder: boolean;
	mappedRequired: boolean;
	displayOnly: boolean;
	mapped: boolean;
	order: number;
	authoredIndex: number;
};

export type RuntimeSlotStatus = "ready" | "cooldown" | "unknown";

export type RuntimeSlotState = {
	status: RuntimeSlotStatus;
	ready: boolean;
	cooldown: number;
	confidence: number;
	globalCooldown?: boolean;
};
