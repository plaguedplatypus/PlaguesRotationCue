import { encodeImageString } from "alt1/base";
import { rotationEntryById } from "../data/abilities";
import type { CueItem, ScreenPoint } from "../types";

const GROUP_NAME = "rotation-cue-strip";
const CUE_COUNT = 4;
const OVERLAY_LIFETIME_MS = 20_000;
const OVERLAY_REFRESH_MS = 10_000;

export function isAlt1Available(): boolean {
  return typeof window.alt1 !== "undefined";
}

export class Alt1CueOverlay {
  private imageCache = new Map<string, Promise<HTMLImageElement | null>>();
  private lastSignature = "";
  private lastDrawAt = 0;
  private position: ScreenPoint | null = null;
  private scale = 1;
  private borderThickness = 2;
  private borderColor = "#f2c94c";
  private opacity = 1;
  private showAbilityNames = true;
  private showNextLabel = true;
  private placementDrawInProgress = false;

  async draw(cues: CueItem[]): Promise<void> {
    await this.drawAt(cues, this.position, false);
  }

  async drawPlacementPreview(cues: CueItem[], position: ScreenPoint): Promise<void> {
    if (this.placementDrawInProgress) return;
    this.placementDrawInProgress = true;
    try {
      await this.drawAt(cues, position, true);
    } finally {
      this.placementDrawInProgress = false;
    }
  }

  setPosition(position: ScreenPoint | null): void {
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

  setBorderThickness(thickness: number): void {
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

  setShowAbilityNames(show: boolean): void {
    if (this.showAbilityNames === show) return;
    this.showAbilityNames = show;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  setShowNextLabel(show: boolean): void {
    if (this.showNextLabel === show) return;
    this.showNextLabel = show;
    this.lastSignature = "";
    this.lastDrawAt = 0;
  }

  private async drawAt(cues: CueItem[], position: ScreenPoint | null, placementPreview: boolean): Promise<void> {
    if (!isAlt1Available()) return;
    if (!cues.length && !placementPreview) {
      this.clear();
      return;
    }

    const positionSignature = position ? `${position.x},${position.y}` : "default";
    const signature = `${cues.map((cue) => `${cue.step.abilityId}:${cue.stepIndex}`).join("|")}@${positionSignature}:${this.scale}:${this.borderThickness}:${this.borderColor}:${this.opacity}:${this.showAbilityNames}:${this.showNextLabel}`;
    if (!placementPreview && signature === this.lastSignature
      && Date.now() - this.lastDrawAt < OVERLAY_REFRESH_MS) return;

    const canvas = document.createElement("canvas");
    const tileWidth = 72;
    const gap = 5;
    const frameSize = 60;
    const iconSize = 54;
    const frameY = this.showNextLabel ? 12 : 0;
    const tileHeight = frameY + frameSize + (this.showAbilityNames ? 10 : 0);
    const logicalWidth = cues.length
      ? cues.length * tileWidth + (cues.length - 1) * gap
      : tileWidth * CUE_COUNT + (CUE_COUNT - 1) * gap;
    const logicalHeight = tileHeight;
    canvas.width = Math.max(1, Math.round(logicalWidth * this.scale));
    canvas.height = Math.max(1, Math.round(logicalHeight * this.scale));
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(this.scale, this.scale);
    const loadedIcons = await Promise.all(cues.map((cue) => {
      const icon = rotationEntryById.get(cue.step.abilityId)?.icon;
      return icon ? this.loadImage(icon) : Promise.resolve(null);
    }));

    cues.forEach((cue, index) => {
      const ability = rotationEntryById.get(cue.step.abilityId);
      const x = index * (tileWidth + gap);
      const current = cue.offset === 0;
      const frameX = x + Math.round((tileWidth - frameSize) / 2);

      context.fillStyle = "rgba(13, 17, 23, 0.94)";
      context.fillRect(frameX + 3, frameY + 3, iconSize, iconSize);
      const icon = loadedIcons[index];
      if (icon) context.drawImage(icon, frameX + 3, frameY + 3, iconSize, iconSize);
      const borderThickness = current ? this.borderThickness : 0;
      if (borderThickness > 0) {
        context.strokeStyle = this.borderColor;
        context.lineWidth = borderThickness;
        context.strokeRect(
          frameX + 3,
          frameY + 3,
          iconSize,
          iconSize
        );
      }

      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      if (current && this.showNextLabel) {
        const positionLabel = "NEXT";
        context.font = "bold 10px Arial";
        const positionWidth = Math.max(26, Math.ceil(context.measureText(positionLabel).width) + 8);
        const positionX = x + Math.round((tileWidth - positionWidth) / 2);
        context.fillStyle = "rgba(13, 17, 23, 0.96)";
        context.fillRect(positionX, 0, positionWidth, 13);
        if (this.borderThickness > 0) {
          context.strokeStyle = this.borderColor;
          context.lineWidth = this.borderThickness;
          const badgeInset = this.borderThickness / 2;
          context.strokeRect(
            positionX + badgeInset,
            badgeInset,
            positionWidth - this.borderThickness,
            13 - this.borderThickness
          );
        }
        context.fillStyle = "#f2c94c";
        context.fillText(positionLabel, x + tileWidth / 2, 10);
      }

      if (index > 0) {
        drawCueArrow(context, x - gap / 2, frameY + frameSize / 2);
      }

      if (this.showAbilityNames) {
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
      alt1.overLaySetGroup(GROUP_NAME);
      const canContinue = typeof alt1.overLayFreezeGroup === "function"
        && typeof alt1.overLayContinueGroup === "function";
      if (canContinue) alt1.overLayFreezeGroup(GROUP_NAME);
      alt1.overLayClearGroup(GROUP_NAME);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const iconOpacityRegions = cues.map((_cue, index) => {
        const frameX = index * (tileWidth + gap) + Math.round((tileWidth - frameSize) / 2);
        return scaledRegion(frameX + 3, frameY + 3, iconSize, iconSize, this.scale);
      });
      applyOverlayOpacity(imageData, this.opacity, iconOpacityRegions);
      const encoded = encodeImageString(imageData);
      const rsWidth = Number(alt1.rsWidth);
      const rsHeight = Number(alt1.rsHeight);
      const defaultX = Math.max(8, Math.round((rsWidth - canvas.width) / 2));
      const x = position
        ? clampCoordinate(Math.round(position.x - canvas.width / 2), rsWidth - canvas.width)
        : defaultX;
      const y = position
        ? clampCoordinate(Math.round(position.y - canvas.height / 2), rsHeight - canvas.height)
        : 72;
      alt1.overLayImage(x, y, encoded, canvas.width, placementPreview ? 700 : OVERLAY_LIFETIME_MS);
      if (canContinue) alt1.overLayContinueGroup(GROUP_NAME);
      else alt1.overLayRefreshGroup(GROUP_NAME);
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
      window.alt1.overLaySetGroup(GROUP_NAME);
      window.alt1.overLayClearGroup(GROUP_NAME);
      window.alt1.overLayRefreshGroup(GROUP_NAME);
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

function clampCoordinate(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum)) return 0;
  return Math.max(0, Math.min(value, Math.max(0, maximum)));
}

function drawCueArrow(context: CanvasRenderingContext2D, centerX: number, centerY: number): void {
  context.fillStyle = "rgba(13, 17, 23, 0.94)";
  context.fillRect(centerX - 6, centerY - 8, 12, 16);
  context.strokeStyle = "#485260";
  context.lineWidth = 1;
  context.strokeRect(centerX - 5.5, centerY - 7.5, 11, 15);

  context.beginPath();
  context.moveTo(centerX - 2.5, centerY - 4);
  context.lineTo(centerX + 2, centerY);
  context.lineTo(centerX - 2.5, centerY + 4);
  context.strokeStyle = "#f2c94c";
  context.lineWidth = 2;
  context.lineCap = "square";
  context.lineJoin = "miter";
  context.stroke();
}

const OPACITY_BAYER_8X8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
];

type PixelRegion = { left: number; top: number; right: number; bottom: number };

function scaledRegion(x: number, y: number, width: number, height: number, scale: number): PixelRegion {
  return {
    left: Math.floor(x * scale),
    top: Math.floor(y * scale),
    right: Math.ceil((x + width) * scale),
    bottom: Math.ceil((y + height) * scale)
  };
}

function applyOverlayOpacity(image: ImageData, opacity: number, regions: PixelRegion[]): void {
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
        if (OPACITY_BAYER_8X8[(y % 8) * 8 + (x % 8)] >= visibleLevels) {
          image.data[alphaIndex] = 0;
        }
      }
    }
  }
}
