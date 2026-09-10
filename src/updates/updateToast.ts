import { latestRelease, releases } from "./updateNotes";

const seenReleaseKey = "rotation-cue.update-toast-seen-id";

function getSeenId(): string | null {
  try {
    return window.localStorage.getItem(seenReleaseKey);
  } catch {
    return null;
  }
}

function markSeen(releaseId: string): void {
  try {
    window.localStorage.setItem(seenReleaseKey, releaseId);
  } catch {
    return;
  }
}

export function maybeShowToast(): void {
  const latest = latestRelease();
  if (!latest?.version || !latest.items.length || getSeenId() === latest.version) return;

  document.querySelector(".update-toast-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "update-toast-backdrop";
  const toast = document.createElement("aside");
  toast.className = "update-toast";
  toast.setAttribute("aria-label", `Update ${latest.version}`);

  const title = document.createElement("strong");
  title.className = "update-toast-title";
  title.textContent = `Update ${latest.version}`;

  const list = document.createElement("ul");
  list.className = "update-toast-list";
  for (const note of latest.items) {
    const item = document.createElement("li");
    item.textContent = note;
    list.appendChild(item);
  }

  const close = document.createElement("button");
  close.className = "update-toast-close";
  close.type = "button";
  close.textContent = "Got it";
  close.addEventListener("click", () => {
    markSeen(latest.version);
    backdrop.remove();
  });

  toast.append(title, list, close);
  backdrop.appendChild(toast);
  document.body.appendChild(backdrop);
}

export function showPatchNotes(): void {
  const existingBackdrop = document.querySelector<HTMLElement>("#rotation-cue-patch-notes-backdrop");
  if (existingBackdrop) {
    existingBackdrop.hidden = false;
    existingBackdrop.querySelector<HTMLButtonElement>(".patch-notes-close")?.focus();
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.id = "rotation-cue-patch-notes-backdrop";
  backdrop.className = "patch-notes-backdrop";
  const modal = document.createElement("section");
  modal.id = "rotation-cue-patch-notes-modal";
  modal.className = "patch-notes-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Patch Notes");

  const header = document.createElement("header");
  header.className = "patch-notes-header";
  const title = document.createElement("strong");
  title.textContent = "Patch Notes";
  const close = document.createElement("button");
  close.className = "patch-notes-close";
  close.type = "button";
  close.title = "Close patch notes";
  close.setAttribute("aria-label", "Close patch notes");
  close.textContent = "x";
  close.addEventListener("click", () => {
    backdrop.hidden = true;
  });
  header.append(title, close);

  const content = document.createElement("div");
  content.className = "patch-notes-content";
  for (const note of releases) {
    const entry = document.createElement("section");
    entry.className = "patch-notes-entry";
    const version = document.createElement("div");
    version.className = "patch-notes-version";
    version.textContent = `Version: ${note.version}`;
    entry.appendChild(version);

    if (note.title) {
      const entryTitle = document.createElement("div");
      entryTitle.className = "patch-notes-entry-title";
      entryTitle.textContent = note.title;
      entry.appendChild(entryTitle);
    }

    const list = document.createElement("ul");
    list.className = "patch-notes-list";
    for (const itemText of note.items) {
      const item = document.createElement("li");
      item.textContent = itemText;
      list.appendChild(item);
    }
    entry.appendChild(list);
    content.appendChild(entry);
  }

  modal.append(header, content);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  close.focus();
}
