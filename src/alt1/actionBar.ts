import * as a1lib from "alt1/base";

export type ModernActionBarLayout = "flat" | "grid" | "tower" | "vertical";
export type ModernActionBarKind = "main" | "secondary";

export interface ModernActionBarSlot {
  x: number;
  y: number;
  width: 31;
  height: 31;
  index: number;
}

export interface ActionBarSlotLocation {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ModernActionBar {
  id: string;
  kind: ModernActionBarKind;
  layout: ModernActionBarLayout;
  x: number;
  y: number;
  structuralScore: number;
  slots: ModernActionBarSlot[];
}

type LayoutSpec = {
  id: ModernActionBarLayout;
  columns: number;
  rows: number;
  pitchX: number;
  pitchY: number;
  order: "row" | "column";
  firstFromCog: { x: number; y: number };
  firstFromMainAnchor: { x: number; y: number };
};

const SLOT_SIZE = 31 as const;
const MIN_STRUCTURE_SCORE = 0.86;
const MAIN_ORIGIN_TOLERANCE = 5;

const LAYOUTS: readonly LayoutSpec[] = [
  {
    id: "flat", columns: 14, rows: 1, pitchX: 36, pitchY: 0, order: "row",
    firstFromCog: { x: -505, y: -16 },
    firstFromMainAnchor: { x: -126, y: 33 }
  },
  {
    id: "grid", columns: 7, rows: 2, pitchX: 35, pitchY: 35, order: "row",
    firstFromCog: { x: -243, y: -52 },
    firstFromMainAnchor: { x: -122, y: 52 }
  },
  {
    id: "tower", columns: 2, rows: 7, pitchX: 35, pitchY: 35, order: "column",
    firstFromCog: { x: -52, y: -243 },
    firstFromMainAnchor: { x: -71, y: -130 }
  },
  {
    id: "vertical", columns: 1, rows: 14, pitchX: 0, pitchY: 36, order: "column",
    firstFromCog: { x: -16, y: -505 },
    firstFromMainAnchor: { x: -39, y: -138 }
  }
];

type Anchors = { cog: ImageData; mainAdrenaline: ImageData[] };

export class ModernActionBarLocator {
  private anchorsPromise: Promise<Anchors> | null = null;

  async find(screen: a1lib.ImgRef): Promise<ModernActionBar[]> {
    const anchors = await this.prepare();
    const cogPositions = screen.findSubimage(anchors.cog);
    const mainPositions = anchors.mainAdrenaline.flatMap((anchor) => screen.findSubimage(anchor));
    const candidates: ModernActionBar[] = [];

    for (const cog of cogPositions) {
      let best: ModernActionBar | null = null;
      for (const layout of LAYOUTS) {
        const x = cog.x + layout.firstFromCog.x;
        const y = cog.y + layout.firstFromCog.y;
        const slots = createSlots(x, y, layout);
        if (!slotsFitScreen(screen, slots)) continue;
        const structuralScore = scoreStructure(screen, slots);
        if (structuralScore < MIN_STRUCTURE_SCORE) continue;
        const candidate: ModernActionBar = {
          id: "",
          kind: "secondary",
          layout: layout.id,
          x,
          y,
          structuralScore,
          slots
        };
        if (!best || candidate.structuralScore > best.structuralScore) best = candidate;
      }
      if (best && !candidates.some((candidate) => sameOrigin(candidate, best!))) {
        candidates.push(best);
      }
    }

    for (const candidate of candidates) {
      const layout = LAYOUTS.find((entry) => entry.id === candidate.layout)!;
      candidate.kind = mainPositions.some((anchor) => {
        const expectedX = anchor.x + layout.firstFromMainAnchor.x;
        const expectedY = anchor.y + layout.firstFromMainAnchor.y;
        return Math.abs(candidate.x - expectedX) <= MAIN_ORIGIN_TOLERANCE
          && Math.abs(candidate.y - expectedY) <= MAIN_ORIGIN_TOLERANCE;
      }) ? "main" : "secondary";
    }

    candidates.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "main" ? -1 : 1;
      return left.y - right.y || left.x - right.x;
    });
    let secondaryIndex = 0;
    candidates.forEach((bar) => {
      bar.id = bar.kind === "main" ? "main" : `secondary-${++secondaryIndex}`;
    });
    return candidates;
  }

  private prepare(): Promise<Anchors> {
    this.anchorsPromise ??= Promise.all([
      a1lib.imageDataFromUrl("./assets/anchors/modern-action-bar-cog.png"),
      a1lib.imageDataFromUrl("./assets/anchors/modern-main-adrenaline.png"),
      a1lib.imageDataFromUrl("./assets/anchors/modern-main-adrenaline-sword.png")
    ]).then(([cog, crossedSwords, singleSword]) => ({
      cog,
      mainAdrenaline: [crossedSwords, singleSword]
    }));
    return this.anchorsPromise;
  }
}

export function showActionBarGeometry(bars: readonly ModernActionBar[], durationMs = 12000): void {
  const api = window.alt1;
  if (!api) return;
  const mainColor = a1lib.mixColor(54, 220, 255);
  const secondaryColor = a1lib.mixColor(255, 199, 57);
  api.overLaySetGroup("rotation-cue-action-bars");
  api.overLayFreezeGroup("rotation-cue-action-bars");
  api.overLayClearGroup("rotation-cue-action-bars");
  let secondaryIndex = 0;
  bars.forEach((bar) => {
    const color = bar.kind === "main" ? mainColor : secondaryColor;
    bar.slots.forEach((slot) => {
      api.overLayRect(color, slot.x, slot.y, slot.width, slot.height, durationMs, 1);
      api.overLayText(String(slot.index + 1).padStart(2, "0"), color, 8,
        slot.x + 2, slot.y + 10, durationMs);
    });
    const label = bar.kind === "main"
      ? `Main (${bar.layout})`
      : `Secondary ${++secondaryIndex} (${bar.layout})`;
    api.overLayText(label, color, 12, bar.x, Math.max(0, bar.y - 7), durationMs);
  });
  api.overLayRefreshGroup("rotation-cue-action-bars");
}

const CURRENT_CUE_GROUP = "rotation-cue-current-action-bar-slot";
const CURRENT_CUE_LIFETIME_MS = 20_000;
const CURRENT_CUE_REFRESH_MS = 10_000;

export class CurrentActionBarCueOverlay {
  private lastSignature = "";
  private lastDrawAt = 0;

  draw(location: ActionBarSlotLocation | null, borderColor: string, borderThickness: number): void {
    const api = window.alt1;
    if (!api) return;
    const thickness = Math.max(0, Math.min(3, Math.round(borderThickness)));
    if (!location || thickness === 0) {
      this.clear();
      return;
    }

    const color = cleanOverlayColor(borderColor);
    const signature = `${location.x}:${location.y}:${location.width}:${location.height}:${color}:${thickness}`;
    const now = Date.now();
    if (signature === this.lastSignature && now - this.lastDrawAt < CURRENT_CUE_REFRESH_MS) return;

    try {
      api.overLaySetGroup(CURRENT_CUE_GROUP);
      const canContinue = typeof api.overLayFreezeGroup === "function"
        && typeof api.overLayContinueGroup === "function";
      if (canContinue) api.overLayFreezeGroup(CURRENT_CUE_GROUP);
      api.overLayClearGroup(CURRENT_CUE_GROUP);
      api.overLayRect(
        hexOverlayColor(color),
        location.x,
        location.y,
        location.width,
        location.height,
        CURRENT_CUE_LIFETIME_MS,
        thickness
      );
      if (canContinue) api.overLayContinueGroup(CURRENT_CUE_GROUP);
      else api.overLayRefreshGroup(CURRENT_CUE_GROUP);
      this.lastSignature = signature;
      this.lastDrawAt = now;
    } catch (error) {
      console.warn("Current action-bar cue overlay draw failed", error);
    }
  }

  clear(): void {
    if (!window.alt1 || !this.lastSignature) return;
    try {
      window.alt1.overLaySetGroup(CURRENT_CUE_GROUP);
      window.alt1.overLayClearGroup(CURRENT_CUE_GROUP);
      window.alt1.overLayRefreshGroup(CURRENT_CUE_GROUP);
    } catch {
    }
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }
}

function cleanOverlayColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#f2c94c";
}

function hexOverlayColor(value: string): number {
  return a1lib.mixColor(
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16)
  );
}

function createSlots(x: number, y: number, layout: LayoutSpec): ModernActionBarSlot[] {
  const slots: ModernActionBarSlot[] = [];
  for (let index = 0; index < 14; index++) {
    const column = layout.order === "row"
      ? index % layout.columns
      : Math.floor(index / layout.rows);
    const row = layout.order === "row"
      ? Math.floor(index / layout.columns)
      : index % layout.rows;
    slots.push({
      x: x + column * layout.pitchX,
      y: y + row * layout.pitchY,
      width: SLOT_SIZE,
      height: SLOT_SIZE,
      index
    });
  }
  return slots;
}

function slotsFitScreen(screen: a1lib.ImgRef, slots: readonly ModernActionBarSlot[]): boolean {
  return slots.every((slot) => slot.x >= screen.x && slot.y >= screen.y
    && slot.x + slot.width <= screen.x + screen.width
    && slot.y + slot.height <= screen.y + screen.height);
}

function scoreStructure(screen: a1lib.ImgRef, slots: readonly ModernActionBarSlot[]): number {
  const left = Math.min(...slots.map((slot) => slot.x));
  const top = Math.min(...slots.map((slot) => slot.y));
  const right = Math.max(...slots.map((slot) => slot.x + slot.width));
  const bottom = Math.max(...slots.map((slot) => slot.y + slot.height));
  const image = screen.toData(left, top, right - left, bottom - top);
  let dark = 0;
  let sampled = 0;
  for (const slot of slots) {
    const x = slot.x - left;
    const y = slot.y - top;
    for (let offset = 0; offset < SLOT_SIZE; offset += 3) {
      for (const point of [
        [x + offset, y], [x + offset, y + SLOT_SIZE - 1],
        [x, y + offset], [x + SLOT_SIZE - 1, y + offset]
      ]) {
        sampled++;
        if (luminanceAt(image, point[0], point[1]) < 80) dark++;
      }
    }
  }
  return sampled ? dark / sampled : 0;
}

function luminanceAt(image: ImageData, x: number, y: number): number {
  const offset = (y * image.width + x) * 4;
  return image.data[offset] * 0.2126
    + image.data[offset + 1] * 0.7152
    + image.data[offset + 2] * 0.0722;
}

function sameOrigin(left: ModernActionBar, right: ModernActionBar): boolean {
  return Math.abs(left.x - right.x) <= 3 && Math.abs(left.y - right.y) <= 3;
}
