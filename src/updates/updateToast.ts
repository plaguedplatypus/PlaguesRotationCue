import { latestRelease, releases, type ReleaseNote, type ReleaseSection } from "./updateNotes";

const seenReleaseStorageId = "rotation-cue.update-toast-seen-id";

function getSeenId(): string | null {
  try {
    return window.localStorage.getItem(seenReleaseStorageId);
  } catch {
    return null;
  }
}

function markSeen(releaseId: string): void {
  try {
    window.localStorage.setItem(seenReleaseStorageId, releaseId);
  } catch {
    return;
  }
}

export function maybeShowToast(): void {
  const latest = latestRelease();
  if (!latest?.version || !hasContent(latest) || getSeenId() === latest.version) return;

  document.querySelector(".update-toast-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "update-toast-backdrop";
  const toast = document.createElement("aside");
  toast.className = "update-toast";
  toast.setAttribute("aria-label", `Update ${latest.version}`);

  const title = document.createElement("strong");
  title.className = "update-toast-title";
  title.textContent = `Update ${latest.version}`;

  const close = document.createElement("button");
  close.className = "update-toast-close";
  close.type = "button";
  close.textContent = "Got it";
  close.addEventListener("click", () => {
    markSeen(latest.version);
    backdrop.remove();
  });

  toast.append(title);
  appendContent(toast, latest, "update-toast-list");
  toast.append(close);
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

    appendContent(entry, note, "patch-notes-list");
    content.appendChild(entry);
  }

  modal.append(header, content);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  close.focus();
}

function hasContent(note: ReleaseNote): boolean {
  return sections(note).some((section) => section.items.length > 0 || !!section.image);
}

function appendContent(container: HTMLElement, note: ReleaseNote, listClass: string): void {
  for (const releaseSection of sections(note)) {
    const section = document.createElement("div");
    section.className = "update-note-section";
    if (releaseSection.items.length) {
      const list = document.createElement("ul");
      list.className = listClass;
      for (const text of releaseSection.items) {
        const item = document.createElement("li");
        item.textContent = text;
        list.appendChild(item);
      }
      section.appendChild(list);
    }
    if (releaseSection.image) {
      section.appendChild(releaseImage(releaseSection.image.src, releaseSection.image.alt));
    }
    container.appendChild(section);
  }
}

function sections(note: ReleaseNote): ReleaseSection[] {
  return note.sections ?? [{ items: note.items ?? [] }];
}

function releaseImage(src: string, alt: string): HTMLImageElement {
  const image = document.createElement("img");
  image.className = "update-note-image";
  image.src = src;
  image.alt = alt;
  return image;
}
