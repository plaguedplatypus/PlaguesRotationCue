import {
	allReleaseNotes,
	latestReleaseNote,
} from "../Release/releaseNotes";

const UPDATE_TOAST_SEEN_KEY = "RCue-update-toast-seen-id";

function readSeenReleaseId() {
	try {
		return window.localStorage?.getItem(UPDATE_TOAST_SEEN_KEY) || "";
	} catch {
		return "";
	}
}

function writeSeenReleaseId(releaseId: string) {
	try {
		window.localStorage?.setItem(UPDATE_TOAST_SEEN_KEY, releaseId);
	} catch {
		// If storage is unavailable, still allow the toast to close for this session.
	}
}

export function maybeShowUpdateToast() {
	if (typeof window === "undefined" || typeof document === "undefined") return;

	const latest = latestReleaseNote();
	if (!latest || !latest.version || !latest.items.length) return;

	const latestVersion = latest.version;
	if (readSeenReleaseId() === latestVersion) return;
	if (document.getElementById("rcue-update-toast")) return;

	const toast = document.createElement("section");
	toast.id = "rcue-update-toast";
	toast.className = "update-toast";
	toast.setAttribute("role", "status");
	toast.setAttribute("aria-live", "polite");

	const header = document.createElement("div");
	header.className = "update-toast-header";

	const title = document.createElement("div");
	title.className = "update-toast-title";
	title.textContent = `Rotation Cue ${latest.version}`;

	const close = document.createElement("button");
	close.className = "mini-button update-toast-x";
	close.type = "button";
	close.title = "Dismiss update notes";
	close.setAttribute("aria-label", "Dismiss update notes");
	close.textContent = "X";

	header.append(title, close);

	const list = document.createElement("ul");
	list.className = "update-toast-list";
	for (const note of latest.items.slice(0, 5)) {
		const item = document.createElement("li");
		item.textContent = note;
		list.appendChild(item);
	}

	const gotIt = document.createElement("button");
	gotIt.className = "primary update-toast-dismiss";
	gotIt.type = "button";
	gotIt.textContent = "Got it";

	function dismiss() {
		writeSeenReleaseId(latestVersion);
		toast.remove();
	}

	close.addEventListener("click", dismiss);
	gotIt.addEventListener("click", dismiss);

	toast.append(header, list, gotIt);
	document.body.appendChild(toast);
}

export function showReleaseNotesModal() {
	if (typeof window === "undefined" || typeof document === "undefined") return;

	const existing = document.getElementById("rcue-release-notes-modal");
	if (existing) {
		existing.removeAttribute("hidden");
		existing.querySelector<HTMLElement>("button")?.focus?.();
		return;
	}

	const modal = document.createElement("section");
	modal.id = "rcue-release-notes-modal";
	modal.className = "release-notes-modal";
	modal.setAttribute("role", "dialog");
	modal.setAttribute("aria-modal", "true");
	modal.setAttribute("aria-label", "Patch Notes");

	const header = document.createElement("div");
	header.className = "release-notes-header";

	const title = document.createElement("strong");
	title.textContent = "Patch Notes";

	const close = document.createElement("button");
	close.className = "mini-button";
	close.type = "button";
	close.title = "Close patch notes";
	close.setAttribute("aria-label", "Close patch notes");
	close.textContent = "X";

	header.append(title, close);

	const content = document.createElement("div");
	content.className = "release-notes-content";

	for (const note of allReleaseNotes()) {
		const entry = document.createElement("section");
		entry.className = "release-notes-entry";

		const version = document.createElement("div");
		version.className = "release-notes-version";
		version.textContent = `Version: ${note.version}`;
		entry.appendChild(version);

		if (note.title) {
			const entryTitle = document.createElement("div");
			entryTitle.className = "release-notes-entry-title";
			entryTitle.textContent = note.title;
			entry.appendChild(entryTitle);
		}

		const list = document.createElement("ul");
		list.className = "release-notes-list";
		for (const itemText of note.items) {
			const item = document.createElement("li");
			item.textContent = itemText;
			list.appendChild(item);
		}

		entry.appendChild(list);
		content.appendChild(entry);
	}

	function dismiss() {
		modal.setAttribute("hidden", "");
	}

	close.addEventListener("click", dismiss);
	modal.append(header, content);
	document.body.appendChild(modal);
	close.focus?.();
}
