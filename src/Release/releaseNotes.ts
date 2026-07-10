export type ReleaseNote = {
	version: string;
	title?: string;
	items: string[];
};

export const RCUE_DISCORD_INVITE_URL = "https://discord.gg/xAc578gPjW";

export const RCUE_RELEASE_HISTORY: ReleaseNote[] = [
	{
		version: "v0.1.0",
		title: "Initial release",
		items: [
			"Initial release of Rotation Cue.",
			"Feedback is welcome!",
			"Bugs or issues? Please report them on Discord or the Forum thread.",
			"" + RCUE_DISCORD_INVITE_URL,
		],
	},
];

export function latestReleaseNote(): ReleaseNote | null {
	return RCUE_RELEASE_HISTORY[0] || null;
}

export function allReleaseNotes(): ReleaseNote[] {
	return RCUE_RELEASE_HISTORY;
}

const latest = latestReleaseNote();

export const RCUE_VERSION = latest?.version || "v0.0.0";
export const RCUE_RELEASE_ID = RCUE_VERSION;
export const RCUE_RELEASE_TITLE = latest
	? `Rotation Cue Update ${latest.version}`
	: "Rotation Cue Update";
export const RCUE_RELEASE_NOTES = latest?.items || [];
