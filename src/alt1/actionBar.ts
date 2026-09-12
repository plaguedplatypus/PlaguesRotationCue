import * as a1lib from "alt1/base";

export type LayoutId = "flat" | "grid" | "tower" | "vertical";
export type BarKind = "main" | "secondary";

type Mode = "modern" | "classic";

type Placement = {
  mode: Mode;
  fromCog: { x: number; y: number };
  fromAdrenaline: { x: number; y: number };
  pitchX: number;
  pitchY: number;
};

export interface Slot {
  x: number;
  y: number;
  width: 31;
  height: 31;
  index: number;
}

export interface SlotLocation {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bar {
  id: string;
  kind: BarKind;
  layout: LayoutId;
  x: number;
  y: number;
  score: number;
  slots: Slot[];
}

type Layout = {
  id: LayoutId;
  columns: number;
  rows: number;
  order: "row" | "column";
  placements: readonly Placement[];
  controlFromCog: { x: number; y: number };
};

const slotSize = 31 as const;
const minStructureScore = 0.86;
const originTolerance = 5;
const controlTolerance = 1;

const layouts: readonly Layout[] = [
  {
    id: "flat", columns: 14, rows: 1, order: "row",
    // Classic leaves more space between the slots and the right-side controls.
    placements: [
      {
        mode: "modern", fromCog: { x: -505, y: -16 }, fromAdrenaline: { x: -126, y: 33 },
        pitchX: 36, pitchY: 0
      },
      {
        mode: "classic", fromCog: { x: -524, y: -16 }, fromAdrenaline: { x: -130, y: 33 },
        pitchX: 37, pitchY: 0
      }
    ],
    controlFromCog: { x: -4, y: -17 }
  },
  {
    id: "grid", columns: 7, rows: 2, order: "row",
    placements: [
      {
        mode: "modern", fromCog: { x: -243, y: -53 }, fromAdrenaline: { x: -122, y: 53 },
        pitchX: 35, pitchY: 35
      }
    ],
    controlFromCog: { x: -4, y: -55 }
  },
  {
    id: "tower", columns: 2, rows: 7, order: "column",
    placements: [
      {
        mode: "modern", fromCog: { x: -53, y: -243 }, fromAdrenaline: { x: -71, y: -130 },
        pitchX: 35, pitchY: 35
      }
    ],
    controlFromCog: { x: -58, y: -1 }
  },
  {
    id: "vertical", columns: 1, rows: 14, order: "column",
    placements: [
      {
        mode: "modern", fromCog: { x: -16, y: -505 }, fromAdrenaline: { x: -39, y: -138 },
        pitchX: 0, pitchY: 36
      }
    ],
    controlFromCog: { x: -20, y: -1 }
  }
];

type Anchors = { cog: ImageData; control: ImageData; adrenaline: ImageData[] };

export class Locator {
  private anchorLoad: Promise<Anchors> | null = null;

  async find(screen: a1lib.ImgRef): Promise<Bar[]> {
    const anchors = await this.prepare();
    const cogs = screen.findSubimage(anchors.cog);
    const controls = screen.findSubimage(anchors.control);
    const mainAnchors = anchors.adrenaline.flatMap((anchor) => screen.findSubimage(anchor));
    const bars: Bar[] = [];
    const mainMatch = findMain(cogs, mainAnchors);
    const mode = mainMatch?.placement.mode;

    if (mainMatch) {
      const main = makeBar(screen, mainMatch.cog, mainMatch.layout, mainMatch.placement, false);
      if (main) {
        main.kind = "main";
        bars.push(main);
      }
    }

    for (const cog of cogs) {
      let best = findBar(screen, cog, layouts, mode);

      // nearby control button confirms layouts with the same cog position.
      const corrected = layouts.find((entry) => controls.some((control) =>
        Math.abs(control.x - (cog.x + entry.controlFromCog.x)) <= controlTolerance
        && Math.abs(control.y - (cog.y + entry.controlFromCog.y)) <= controlTolerance
      ));
      if (corrected) {
        const match = findBar(screen, cog, [corrected], mode);
        if (match) best = match;
      }
      if (best && !bars.some((bar) => sameOrigin(bar, best!))) {
        bars.push(best);
      }
    }

    bars.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "main" ? -1 : 1;
      return left.y - right.y || left.x - right.x;
    });
    let secondary = 0;
    bars.forEach((bar) => {
      bar.id = bar.kind === "main" ? "main" : `secondary-${++secondary}`;
    });
    return bars;
  }

  private prepare(): Promise<Anchors> {
    this.anchorLoad ??= Promise.all([
      a1lib.imageDataFromUrl("./assets/anchors/action-bar-cog.png"),
      a1lib.imageDataFromUrl("./assets/anchors/action-bar-control.png"),
      a1lib.imageDataFromUrl("./assets/anchors/main-adrenaline.png"),
      a1lib.imageDataFromUrl("./assets/anchors/main-adrenaline-sword.png")
    ]).then(([cog, control, crossedSwords, singleSword]) => ({
      cog,
      control,
      adrenaline: [crossedSwords, singleSword]
    }));
    return this.anchorLoad;
  }
}

export function clearGeometry(): void {
  const api = window.alt1;
  if (!api) return;
  api.overLaySetGroup("rotation-cue-action-bars");
  api.overLayClearGroup("rotation-cue-action-bars");
  api.overLayRefreshGroup("rotation-cue-action-bars");
}

export function showGeometry(bars: readonly Bar[], durationMs = 12000): void {
  const api = window.alt1;
  if (!api) return;
  const mainColor = a1lib.mixColor(54, 220, 255);
  const secondaryColor = a1lib.mixColor(255, 199, 57);
  api.overLaySetGroup("rotation-cue-action-bars");
  api.overLayFreezeGroup("rotation-cue-action-bars");
  api.overLayClearGroup("rotation-cue-action-bars");
  let secondary = 0;
  bars.forEach((bar) => {
    const color = bar.kind === "main" ? mainColor : secondaryColor;
    bar.slots.forEach((slot) => {
      api.overLayRect(color, slot.x, slot.y, slot.width, slot.height, durationMs, 1);
      api.overLayText(String(slot.index + 1).padStart(2, "0"), color, 8,
        slot.x + 2, slot.y + 10, durationMs);
    });
    const label = bar.kind === "main"
      ? `Main (${bar.layout})`
      : `Secondary ${++secondary} (${bar.layout})`;
    api.overLayText(label, color, 12, bar.x, Math.max(0, bar.y - 7), durationMs);
  });
  api.overLayRefreshGroup("rotation-cue-action-bars");
}

const cueGroup = "rotation-cue-current-action-bar-slot";
const cueLifetimeMs = 20_000;
const cueRefreshMs = 10_000;

export class SlotOverlay {
  private lastSignature = "";
  private lastDrawAt = 0;

  draw(location: SlotLocation | null, borderColor: string, borderThickness: number): void {
    const api = window.alt1;
    if (!api) return;
    const thickness = Math.max(0, Math.min(3, Math.round(borderThickness)));
    if (!location || thickness === 0) {
      this.clear();
      return;
    }

    const color = cleanColor(borderColor);
    const signature = `${location.x}:${location.y}:${location.width}:${location.height}:${color}:${thickness}`;
    const now = Date.now();
    if (signature === this.lastSignature && now - this.lastDrawAt < cueRefreshMs) return;

    try {
      api.overLaySetGroup(cueGroup);
      const canContinue = typeof api.overLayFreezeGroup === "function"
        && typeof api.overLayContinueGroup === "function";
      if (canContinue) api.overLayFreezeGroup(cueGroup);
      api.overLayClearGroup(cueGroup);
      api.overLayRect(
        overlayColor(color),
        location.x - thickness,
        location.y - thickness,
        location.width + thickness * 2,
        location.height + thickness * 2,
        cueLifetimeMs,
        thickness
      );
      if (canContinue) api.overLayContinueGroup(cueGroup);
      else api.overLayRefreshGroup(cueGroup);
      this.lastSignature = signature;
      this.lastDrawAt = now;
    } catch (error) {
      console.warn("Current action-bar cue overlay draw failed", error);
    }
  }

  clear(): void {
    if (!window.alt1 || !this.lastSignature) return;
    try {
      window.alt1.overLaySetGroup(cueGroup);
      window.alt1.overLayClearGroup(cueGroup);
      window.alt1.overLayRefreshGroup(cueGroup);
    } catch {
    }
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }
}

function cleanColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#f2c94c";
}

function overlayColor(value: string): number {
  return a1lib.mixColor(
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16)
  );
}

function getSlots(x: number, y: number, layout: Layout, placement: Placement): Slot[] {
  const slots: Slot[] = [];
  for (let index = 0; index < 14; index++) {
    const column = layout.order === "row"
      ? index % layout.columns
      : Math.floor(index / layout.rows);
    const row = layout.order === "row"
      ? Math.floor(index / layout.columns)
      : index % layout.rows;
    slots.push({
      x: x + column * placement.pitchX,
      y: y + row * placement.pitchY,
      width: slotSize,
      height: slotSize,
      index
    });
  }
  return slots;
}

function makeBar(
  screen: a1lib.ImgRef,
  cog: { x: number; y: number },
  layout: Layout,
  placement: Placement,
  requireStructure = true
): Bar | null {
  const x = cog.x + placement.fromCog.x;
  const y = cog.y + placement.fromCog.y;
  const slots = getSlots(x, y, layout, placement);
  if (!fitsScreen(screen, slots)) return null;
  const score = scoreLayout(screen, slots);
  if (requireStructure && score < minStructureScore) return null;
  return {
    id: "",
    kind: "secondary",
    layout: layout.id,
    x,
    y,
    score,
    slots
  };
}

function findBar(
  screen: a1lib.ImgRef,
  cog: { x: number; y: number },
  selected: readonly Layout[],
  mode?: Mode
): Bar | null {
  let best: Bar | null = null;
  for (const layout of selected) {
    const preferred = mode
      ? layout.placements.filter((placement) => placement.mode === mode)
      : layout.placements;
    const placements = preferred.length ? preferred : layout.placements;
    for (const placement of placements) {
      const match = makeBar(screen, cog, layout, placement);
      if (match && (!best || match.score > best.score)) best = match;
    }
  }
  return best;
}

function findMain(
  cogs: readonly { x: number; y: number }[],
  mainPositions: readonly { x: number; y: number }[]
) {
  for (const cog of cogs) {
    for (const layout of layouts) {
      for (const placement of layout.placements) {
        if (isMainBar(cog, placement, mainPositions)) return { cog, layout, placement };
      }
    }
  }
  return null;
}

function isMainBar(
  cog: { x: number; y: number },
  placement: Placement,
  mainPositions: readonly { x: number; y: number }[]
): boolean {
  const barX = cog.x + placement.fromCog.x;
  const barY = cog.y + placement.fromCog.y;
  return mainPositions.some((anchor) =>
    Math.abs(barX - (anchor.x + placement.fromAdrenaline.x)) <= originTolerance
    && Math.abs(barY - (anchor.y + placement.fromAdrenaline.y)) <= originTolerance
  );
}

function fitsScreen(screen: a1lib.ImgRef, slots: readonly Slot[]): boolean {
  return slots.every((slot) => slot.x >= screen.x && slot.y >= screen.y
    && slot.x + slot.width <= screen.x + screen.width
    && slot.y + slot.height <= screen.y + screen.height);
}

function scoreLayout(screen: a1lib.ImgRef, slots: readonly Slot[]): number {
  const left = Math.min(...slots.map((slot) => slot.x));
  const top = Math.min(...slots.map((slot) => slot.y));
  const right = Math.max(...slots.map((slot) => slot.x + slot.width));
  const bottom = Math.max(...slots.map((slot) => slot.y + slot.height));
  const image = screen.toData(left, top, right - left, bottom - top);
  // slots have dark rims. The game does not give us a nicer tell, because of course it doesn't.
  let dark = 0;
  let sampled = 0;
  for (const slot of slots) {
    const x = slot.x - left;
    const y = slot.y - top;
    for (let offset = 0; offset < slotSize; offset += 3) {
      for (const point of [
        [x + offset, y], [x + offset, y + slotSize - 1],
        [x, y + offset], [x + slotSize - 1, y + offset]
      ]) {
        sampled++;
        if (luminance(image, point[0], point[1]) < 80) dark++;
      }
    }
  }
  return sampled ? dark / sampled : 0;
}

function luminance(image: ImageData, x: number, y: number): number {
  const offset = (y * image.width + x) * 4;
  return image.data[offset] * 0.2126
    + image.data[offset + 1] * 0.7152
    + image.data[offset + 2] * 0.0722;
}

function sameOrigin(left: Bar, right: Bar): boolean {
  return Math.abs(left.x - right.x) <= 3 && Math.abs(left.y - right.y) <= 3;
}
