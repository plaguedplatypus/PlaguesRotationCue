export interface ReleaseNote {
  version: string;
  title?: string;
  items: string[];
}

export const RELEASE_HISTORY: ReleaseNote[] = [
  {
    version: "1.0.0",
    title: "Rotation Cue Rebuild",
    items: [
      "Completely rebuilt Rotation Cue on a much smaller, cleaner architecture.",
      "Added support for detecting multiple visible action bars, including secondary and detached bars.",
      "Added direct ability detection from the action bars.",
      "Added improved ability recognition.",
      "Added a redesigned compact rotation builder",
      "Added searchable ability selection.",
      "Added configurable cue-overlay size/count options.",
      "Removed the manual Action Bar setup system.",
      "Removed learned/manual slot mappings.",
      "And more...",
      "",
      "Note: Old rotations may not be compatible with this new version. Rebuilding your rotations is recommended.",
    ]
  }
];

export function latestReleaseNote(): ReleaseNote | null {
  return RELEASE_HISTORY[0] ?? null;
}

export const ROTATION_CUE_VERSION = latestReleaseNote()?.version ?? "0.0.0";
