import { encodeImageString } from "alt1/base";
import { entryById } from "../data/abilityData";
import type { Cue, Point } from "../types";
import { cueKeys, type Keybinds } from "./keybind";

const groupName = "rotation-cue-strip";
const cueCount = 4;
const overlayLifetimeMs = 20_000;
const overlayRefreshMs = 10_000;

export function isAlt1Available(): boolean {
  return typeof window.alt1 !== "undefined";
}

export class CueOverlay {
  private imageCache = new Map<string, Promise<HTMLImageElement | null>>();
  private lastSignature = "";
  private lastDrawAt = 0;
  private position: Point | null = null;
  private scale = 1;
  private borderThickness = 2;
  private borderColor = "#f2c94c";
  private opacity = 1;
  private showNames = true;
  private showNextLabel = true;
  private keybinds: Keybinds = {};
  private autoAdvance = true;
  private currentCooldown: { abilityId: string; seconds: number } | null = null;
  private previewing = false;

  async draw(cues: Cue[]): Promise<void> {
    await this.drawAt(cues, this.position, false);
  }

  async drawPreview(cues: Cue[], position: Point): Promise<void> {
    if (this.previewing) return;
    this.previewing = true;
    try {
      await this.drawAt(cues, position, true);
    } finally {
      this.previewing = false;
    }
  }

  setPosition(position: Point | null): void {
    if (this.position?.x === position?.x && this.position?.y === position?.y) return;
    this.position = position ? { ...position } : null;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setScale(percent: number): void {
    const scale = Math.max(0.25, Math.min(1, percent / 100));
    if (this.scale === scale) return;
    this.scale = scale;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setBorder(thickness: number): void {
    const nextThickness = Math.max(0, Math.min(3, Math.round(thickness)));
    if (this.borderThickness === nextThickness) return;
    this.borderThickness = nextThickness;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setBorderColor(color: string): void {
    const nextColor = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#f2c94c";
    if (this.borderColor === nextColor) return;
    this.borderColor = nextColor;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setOpacity(percent: number): void {
    const opacity = Math.max(0.25, Math.min(1, percent / 100));
    if (this.opacity === opacity) return;
    this.opacity = opacity;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setNames(show: boolean): void {
    if (this.showNames === show) return;
    this.showNames = show;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setKeybindVisible(show: boolean): void {
    if (this.showNextLabel === show) return;
    this.showNextLabel = show;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setKeybinds(keybinds: Keybinds): void {
    const next = { ...keybinds };
    if (JSON.stringify(this.keybinds) === JSON.stringify(next)) return;
    this.keybinds = next;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setAutoAdvance(autoAdvance: boolean): void {
    if (this.autoAdvance === autoAdvance) return;
    this.autoAdvance = autoAdvance;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setCooldown(abilityId: string | null, seconds?: number): boolean {
    const cooldownActive = typeof seconds === "number"
      && Number.isFinite(seconds)
      && seconds > 0;
    const next = abilityId && cooldownActive
      ? { abilityId, seconds: Math.round(seconds) }
      : null;
    if (this.currentCooldown?.abilityId === next?.abilityId
      && this.currentCooldown?.seconds === next?.seconds) return false;
    this.currentCooldown = next;
    this.lastSignature = "";
    this.lastDrawAt = 0;
    return true;
  }

  private async drawAt(cues: Cue[], position: Point | null, placementPreview: boolean): Promise<void> {
    if (!isAlt1Available()) return;
    if (!cues.length && !placementPreview) {
      this.clear();
      return;
    }

    const positionSignature = position ? `${position.x},${position.y}` : "default";
    const visualSequence = cues.map((cue) => cue.offset === 0
      ? cueKeys(cue.step.abilityId, this.keybinds, this.autoAdvance).join("+")
      : "").join("|");
    const cooldownSignature = this.currentCooldown
      ? `${this.currentCooldown.abilityId}:${this.currentCooldown.seconds}`
      : "ready";
    const signature = `${cues.map((cue) => `${cue.step.abilityId}:${cue.stepIndex}`).join("|")}@${positionSignature}:${this.scale}:${this.borderThickness}:${this.borderColor}:${this.opacity}:${this.showNames}:${this.showNextLabel}:${visualSequence}:${cooldownSignature}`;
    if (!placementPreview && signature === this.lastSignature
      && Date.now() - this.lastDrawAt < overlayRefreshMs) return;

    const canvas = document.createElement("canvas");
    const tileWidth = 72;
    const gap = 5;
    const frameSize = 60;
    const frameInset = 3;
    const backgroundBorder = 1;
    const currentCue = cues.find((cue) => cue.offset === 0);
    const currentKeys = currentCue && this.showNextLabel
      ? cueKeys(currentCue.step.abilityId, this.keybinds, this.autoAdvance)
      : [];
    const measuringContext = document.createElement("canvas").getContext("2d");
    const badgeWidth = measuringContext
      ? measureKeys(measuringContext, currentKeys)
      : 0;
    const visualGutter = badgeWidth
      ? Math.max(0, Math.ceil((badgeWidth - tileWidth) / 2) + this.borderThickness)
      : 0;
    const frameY = badgeWidth ? 19 : 0;
    const tileHeight = frameY + frameSize + (this.showNames ? 10 : 0);
    const cueStripWidth = cues.length
      ? cues.length * tileWidth + (cues.length - 1) * gap
      : tileWidth * cueCount + (cueCount - 1) * gap;
    const logicalWidth = cueStripWidth + visualGutter * 2;
    const logicalHeight = tileHeight;
    canvas.width = Math.max(1, Math.round(logicalWidth * this.scale));
    canvas.height = Math.max(1, Math.round(logicalHeight * this.scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(this.scale, this.scale);
    const icons = await Promise.all(cues.map((cue) => {
      const icon = entryById.get(cue.step.abilityId)?.icon;
      return icon ? this.loadImage(icon) : Promise.resolve(null);
    }));

    cues.forEach((cue, index) => {
      const ability = entryById.get(cue.step.abilityId);
      const x = visualGutter + index * (tileWidth + gap);
      const current = cue.offset === 0;
      const cueFrameSize = Math.round(frameSize * cueScale(cue.offset));
      const cueIconSize = cueFrameSize - frameInset * 2;
      const frameX = x + Math.round((tileWidth - cueFrameSize) / 2);
      const cueFrameY = frameY + frameSize - cueFrameSize;

      context.fillStyle = "rgba(13, 17, 23, 0.94)";
      context.fillRect(
        frameX + frameInset - backgroundBorder,
        cueFrameY + frameInset - backgroundBorder,
        cueIconSize + backgroundBorder * 2,
        cueIconSize + backgroundBorder * 2
      );
      const icon = icons[index];
      if (icon) {
        context.drawImage(
          icon,
          frameX + frameInset,
          cueFrameY + frameInset,
          cueIconSize,
          cueIconSize
        );
      }
      const borderThickness = current ? this.borderThickness : 0;
      if (borderThickness > 0) {
        context.strokeStyle = this.borderColor;
        context.lineWidth = borderThickness;
        const borderOffset = borderThickness / 2;
        context.strokeRect(
          frameX + frameInset - borderOffset,
          cueFrameY + frameInset - borderOffset,
          cueIconSize + borderThickness,
          cueIconSize + borderThickness
        );
      }

      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      if (current && this.showNextLabel) {
        drawKeys(
          context,
          x + tileWidth / 2,
          6,
          cueKeys(cue.step.abilityId, this.keybinds, this.autoAdvance),
          this.borderColor,
          this.borderThickness
        );
      }

      if (index > 0) {
        drawArrow(context, x - gap / 2, cueFrameY + cueFrameSize / 2);
      }

      if (this.showNames) {
        context.fillStyle = "#f2f5f7";
        context.font = "9px Arial";
        const label = this.fitLabel(context, ability?.name ?? cue.step.abilityId, tileWidth - 6);
        const nameWidth = Math.min(tileWidth, Math.ceil(context.measureText(label).width) + 6);
        const nameX = x + Math.round((tileWidth - nameWidth) / 2);
        context.fillStyle = "rgba(13, 17, 23, 0.96)";
        context.fillRect(nameX, frameY + frameSize, nameWidth, 10);
        context.fillStyle = "#f2f5f7";
        context.fillText(label, x + tileWidth / 2, frameY + frameSize + 8);
      }
    });

    if (!cues.length) {
      context.fillStyle = "rgba(13, 17, 23, 0.92)";
      context.fillRect(0, 0, logicalWidth, logicalHeight);
      context.strokeStyle = "#f2c94c";
      context.lineWidth = 2;
      context.strokeRect(1, 1, logicalWidth - 2, logicalHeight - 2);
      context.fillStyle = "#f2c94c";
      context.font = "bold 14px Arial";
      context.textAlign = "center";
      context.fillText("ROTATION CUE", logicalWidth / 2, 42);
      context.fillStyle = "#f2f5f7";
      context.font = "11px Arial";
      context.fillText("Overlay position preview", logicalWidth / 2, 61);
    }

    try {
      const alt1 = window.alt1;
      alt1.overLaySetGroup(groupName);
      const canContinue = typeof alt1.overLayFreezeGroup === "function"
        && typeof alt1.overLayContinueGroup === "function";
      if (canContinue) alt1.overLayFreezeGroup(groupName);
      alt1.overLayClearGroup(groupName);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const iconRegions = cues.map((cue, index) => {
        const cueFrameSize = Math.round(frameSize * cueScale(cue.offset));
        const cueIconSize = cueFrameSize - frameInset * 2;
        const frameX = visualGutter + index * (tileWidth + gap)
          + Math.round((tileWidth - cueFrameSize) / 2);
        const cueFrameY = frameY + frameSize - cueFrameSize;
        return scaleRegion(
          frameX + frameInset,
          cueFrameY + frameInset,
          cueIconSize,
          cueIconSize,
          this.scale
        );
      });
      applyOpacity(imageData, this.opacity, iconRegions);
      context.putImageData(imageData, 0, 0);
      const currentIndex = cues.findIndex((cue) => cue.offset === 0);
      const currentAbilityId = currentIndex >= 0 ? cues[currentIndex].step.abilityId : null;
      if (currentIndex >= 0 && this.currentCooldown?.abilityId === currentAbilityId) {
        const currentFrameSize = Math.round(frameSize * cueScale(cues[currentIndex].offset));
        const currentIconSize = currentFrameSize - frameInset * 2;
        const frameX = visualGutter + currentIndex * (tileWidth + gap)
          + Math.round((tileWidth - currentFrameSize) / 2);
        const currentFrameY = frameY + frameSize - currentFrameSize;
        drawCooldown(
          context,
          frameX + frameInset + currentIconSize / 2,
          currentFrameY + frameInset + currentIconSize / 2,
          String(this.currentCooldown.seconds)
        );
      }
      const encoded = encodeImageString(context.getImageData(0, 0, canvas.width, canvas.height));
      const rsWidth = Number(alt1.rsWidth);
      const rsHeight = Number(alt1.rsHeight);
      const defaultX = Math.max(8, Math.round((rsWidth - canvas.width) / 2));
      const x = position
        ? clampCoord(Math.round(position.x - canvas.width / 2), rsWidth - canvas.width)
        : defaultX;
      const y = position
        ? clampCoord(Math.round(position.y - canvas.height / 2), rsHeight - canvas.height)
        : 72;
      alt1.overLayImage(x, y, encoded, canvas.width, placementPreview ? 700 : overlayLifetimeMs);
      if (canContinue) alt1.overLayContinueGroup(groupName);
      else alt1.overLayRefreshGroup(groupName);
      if (!placementPreview) {
        this.lastSignature = signature;
        this.lastDrawAt = Date.now();
      }
    } catch (error) {
      console.warn("Rotation Cue overlay draw failed", error);
    }
  }

  clear(): void {
    if (!isAlt1Available()) return;
    try {
      window.alt1.overLaySetGroup(groupName);
      window.alt1.overLayClearGroup(groupName);
      window.alt1.overLayRefreshGroup(groupName);
      this.lastSignature = "";
      this.lastDrawAt = 0;
    } catch {
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement | null> {
    const cached = this.imageCache.get(src);
    if (cached) return cached;
    const pending = new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
    this.imageCache.set(src, pending);
    return pending;
  }

  private fitLabel(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
    if (context.measureText(value).width <= maxWidth) return value;
    let label = value;
    while (label.length > 3 && context.measureText(`${label}…`).width > maxWidth) {
      label = label.slice(0, -1);
    }
    return `${label}…`;
  }
}

function clampCoord(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum)) return 0;
  return Math.max(0, Math.min(value, Math.max(0, maximum)));
}

function cueScale(offset: number): number {
  if (offset <= 0) return 1;
  return 0.85;
}

function drawArrow(context: CanvasRenderingContext2D, centerX: number, centerY: number): void {
  context.save();
  context.beginPath();
  context.moveTo(centerX - 2.5, centerY - 4);
  context.lineTo(centerX + 2, centerY);
  context.lineTo(centerX - 2.5, centerY + 4);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#0d1117";
  context.lineWidth = 4;
  context.stroke();
  context.strokeStyle = "#f2c94c";
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function measureKeys(context: CanvasRenderingContext2D, keybinds: string[]): number {
  if (!keybinds.length) return 0;
  context.font = "bold 10px Arial";
  const keyWidths = keybinds.map((keybind) => Math.max(14, Math.ceil(context.measureText(keybind).width) + 6));
  return keyWidths.reduce((total, width) => total + width, 0) + Math.max(0, keybinds.length - 1) * 9;
}

function drawKeys(
  context: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  keybinds: string[],
  borderColor: string,
  borderThickness: number
): void {
  if (!keybinds.length) return;
  context.font = "bold 10px Arial";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  const keyWidths = keybinds.map((keybind) => Math.max(14, Math.ceil(context.measureText(keybind).width) + 6));
  const totalWidth = keyWidths.reduce((total, width) => total + width, 0)
    + Math.max(0, keybinds.length - 1) * 9;
  let x = centerX - totalWidth / 2;

  keybinds.forEach((keybind, index) => {
    const width = keyWidths[index];
    const height = 13;
    context.fillStyle = "rgba(13, 17, 23, 0.96)";
    context.fillRect(x, y, width, height);
    if (borderThickness > 0) {
      context.strokeStyle = borderColor;
      context.lineWidth = borderThickness;
      const outwardOffset = borderThickness / 2;
      context.strokeRect(
        x - outwardOffset,
        y - outwardOffset,
        width + borderThickness,
        height + borderThickness
      );
    }
    context.fillStyle = "#f2c94c";
    context.fillText(keybind, x + width / 2, y + 10);
    x += width;
    if (index < keybinds.length - 1) {
      context.fillStyle = "#f2c94c";
      context.fillText("+", x + 4.5, y + 10);
      x += 9;
    }
  });
}

function drawCooldown(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  value: string
): void {
  context.save();
  context.font = "bold 22px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(0, 0, 0, 0.95)";
  context.lineWidth = 4;
  context.strokeText(value, centerX, centerY);
  context.fillStyle = "#ffffff";
  context.fillText(value, centerX, centerY);
  context.restore();
}

const opacityPattern = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
];

type Region = { left: number; top: number; right: number; bottom: number };

function scaleRegion(x: number, y: number, width: number, height: number, scale: number): Region {
  return {
    left: Math.floor(x * scale),
    top: Math.floor(y * scale),
    right: Math.ceil((x + width) * scale),
    bottom: Math.ceil((y + height) * scale)
  };
}

function applyOpacity(image: ImageData, opacity: number, regions: Region[]): void {
  if (opacity >= 1) return;
  const visibleLevels = Math.max(0, Math.min(64, Math.round(opacity * 64)));
  for (const region of regions) {
    const left = Math.max(0, region.left);
    const top = Math.max(0, region.top);
    const right = Math.min(image.width, region.right);
    const bottom = Math.min(image.height, region.bottom);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const alphaIndex = (y * image.width + x) * 4 + 3;
        if (image.data[alphaIndex] === 0) continue;
        if (opacityPattern[(y % 8) * 8 + (x % 8)] >= visibleLevels) {
          image.data[alphaIndex] = 0;
        }
      }
    }
  }
}
