interface ReleaseImage {
  src: string;
  alt: string;
}

export interface ReleaseSection {
  items: string[];
  image?: ReleaseImage;
}

export interface ReleaseNote {
  version: string;
  title?: string;
  items?: string[];
  sections?: ReleaseSection[];
}

export const releases: ReleaseNote[] = [
  {
    version: "1.4.0",
    title: "Cooldown Checker",
    items: [
      "Added cooldown check on rotation editor.",
      "Added Invoke Arisen Flesh (Necromancy).",
      "Added Malachi's crossbow to the Item Picker.",
    ]
  },
  {
    version: "1.3.2",
    title: "Necromancy Items",
    items: [
      "Added Necromancy weapons to the Item Picker:",
      "Omni Guard, Death Guard, Devourer's Guard.",
    ]
  },
  {
    version: "1.3.1",
    title: "Havenhythe part II",
    items: [
      "Added the new abilities:",
      "Vital Drain - (Constitution/Utility)",
      "Vampyre Slayer - (Constitution/Utility)",
      "Sanguine Offering - (Magic)",
    ]
  },
  {
    version: "1.3.0",
    title: "Rotation Notes",
        items: [
          "Added '+ More' for Rotations:",
          "Add a 'Run-Once' rotation, add Editor Notes, or add Cue Notes.",
          "Editor Notes are in-line notes rows inside the rotation.",
        ],
  },
  {
    version: "1.2.0",
    title: "Classic Interface",
    items: [
      "Added support for Classic Interface Layout.",
    ]
  },
  {
    version: "1.1.2",
    title: "Sequence Abilities",
    items: [
      "Fixed an issue with Dismember's and Spectral Scythe's secondary casts breaking rotations.",
    ]
  },
  {
    version: "1.1.1",
    title: "Ability/Item Picker",
    items: [
      "Added additional prayers and items to the Ability Picker.",
    ]
  },
  {
    version: "1.1.0",
    title: "Keybind Visuals",
    items: [
      "Improved symmetry of the Cue Overlay.",
      "Added visual cooldown to Current Cue if a cooldown is present on the action bar.",
      "Added Keybind Visuals to the top of the Current Cue, option available in Settings.",
      "Keybind Visuals are assigned per ability icon from scanned action bars and persist when switching between styles.",
      "If moving abilities, be sure to update any assigned Keybind Visuals in settings.",
      "Moved some abilities in the Ability Picker.",
      "Confirmation when deleting rotations.",
      "More items will be added to the Picker...",
    ]
  },
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

export function latestRelease(): ReleaseNote | null {
  return releases[0] ?? null;
}

export const appVersion = latestRelease()?.version ?? "0.0.0";
