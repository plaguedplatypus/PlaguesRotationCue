import { abilities } from "../data/abilityData";

export type IconMatch = {
  abilityId: string;
  score: number;
  margin: number;
  empty?: boolean;
  emptyScore?: number;
  accepted: boolean;
  rejectionReason?: string;
};

export type IconSample = {
  abilityId: string;
  similarity: number;
  brightness: number;
};

export type ImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Template = {
  abilityId: string;
  vector: Float32Array;
};

const sampleWidth = 24;
const sampleHeight = 18;
const alignmentRadius = 2;
const alignCandidates = 12;
const emptyMinScore = 0.78;
const emptyTolerance = 0.03;

export class Matcher {
  private templateLoad: Promise<Template[]> | null = null;
  private emptyLoad: Promise<Float32Array | null> | null = null;

  prepare(): Promise<Template[]> {
    this.templateLoad ??= Promise.all(abilities.map(async (ability) => {
      const image = await loadImage(ability.icon);
      return image ? {
        abilityId: ability.id,
        vector: sample(image, { x: 0, y: 0, width: image.width, height: image.height })
      } : null;
    })).then((templates) => templates.filter((template): template is Template => !!template));
    return this.templateLoad;
  }

  async match(image: ImageData, rect: ImageRect): Promise<IconMatch> {
    const [templates, emptyTemplate] = await Promise.all([
      this.prepare(),
      this.prepareEmpty()
    ]);
    if (!templates.length) {
      return reject("Ability icon templates could not be loaded");
    }

    const center = sample(image, rect);
    let emptyScore = emptyTemplate ? dot(center, emptyTemplate) : -1;
    const candidates = templates
      .map((template) => ({ template, score: dot(center, template.vector) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, alignCandidates);
    const scores = new Map(
      candidates.map(({ template, score }) => [template.abilityId, score])
    );

    for (let deltaY = -alignmentRadius; deltaY <= alignmentRadius; deltaY++) {
      for (let deltaX = -alignmentRadius; deltaX <= alignmentRadius; deltaX++) {
        if (deltaX === 0 && deltaY === 0) continue;
        const vector = sample(image, {
          ...rect,
          x: rect.x + deltaX,
          y: rect.y + deltaY
        });
        if (emptyTemplate) emptyScore = Math.max(emptyScore, dot(vector, emptyTemplate));
        for (const { template } of candidates) {
          const score = dot(vector, template.vector);
          if (score > (scores.get(template.abilityId) ?? -1)) {
            scores.set(template.abilityId, score);
          }
        }
      }
    }

    const ranked = [...scores.entries()]
      .map(([abilityId, score]) => ({ abilityId, score }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0]!;
    const second = ranked[1];

    const score = clamp01(best.score);
    const secondScore = clamp01(second?.score ?? -1);
    const margin = Math.max(0, score - secondScore);
    const emptyMatch = clamp01(emptyScore);
    const empty = !!emptyTemplate
      && emptyMatch >= emptyMinScore
      && emptyMatch >= score - emptyTolerance;
    if (empty) {
      return {
        abilityId: "",
        score,
        margin,
        empty: true,
        emptyScore: emptyMatch,
        accepted: false,
        rejectionReason: "Empty slot"
      };
    }
    // These icons are identical in design, so I will accept the best color match and hope for the best.
    const colorVariant = (
      best.abilityId === "animate_dead"
      || best.abilityId === "smoke_cloud"
    )
      && score >= 0.94
      && margin >= 0.035;
    const darkBarrage = best.abilityId === "shadow_barrage"
      && score >= 0.82
      && margin >= 0.045;
    const accepted = (score >= 0.68 && margin >= 0.12) ||
      (score >= 0.72 && margin >= 0.08) ||
      (score >= 0.84 && margin >= 0.06) ||
      colorVariant ||
      darkBarrage;

    return {
      abilityId: best.abilityId,
      score,
      margin,
      empty: false,
      emptyScore: emptyMatch,
      accepted,
      rejectionReason: accepted
        ? undefined
        : score < 0.68
          ? "Best match is too weak"
          : "Best match is too similar to another icon"
    };
  }

  private prepareEmpty(): Promise<Float32Array | null> {
    this.emptyLoad ??= loadImage("./assets/empty.png")
      .then((image) => image
        ? sample(image, { x: 0, y: 0, width: image.width, height: image.height })
        : null);
    return this.emptyLoad;
  }

  async measureKnown(
    image: ImageData,
    rect: ImageRect,
    abilityIds: readonly string[]
  ): Promise<IconSample[]> {
    const wanted = new Set(abilityIds);
    const templates = (await this.prepare())
      .filter((candidate) => wanted.has(candidate.abilityId));
    if (!templates.length) return [];

    const similarities = new Map(templates.map((template) => [template.abilityId, -1]));
    for (let deltaY = -alignmentRadius; deltaY <= alignmentRadius; deltaY++) {
      for (let deltaX = -alignmentRadius; deltaX <= alignmentRadius; deltaX++) {
        const vector = sample(image, {
          ...rect,
          x: rect.x + deltaX,
          y: rect.y + deltaY
        });
        for (const template of templates) {
          similarities.set(template.abilityId, Math.max(
            similarities.get(template.abilityId) ?? -1,
            dot(vector, template.vector)
          ));
        }
      }
    }

    const brightness = getBrightness(image, rect);
    return templates.map((template) => ({
      abilityId: template.abilityId,
      similarity: clamp01(similarities.get(template.abilityId) ?? -1),
      brightness
    }));
  }
}

function sample(image: ImageData, rect: ImageRect): Float32Array {
  // Trying to avoid the keybinds on the bottom of the icons and the cooldown text at the top of the icons...
  const scaleX = Math.max(0.6, rect.width / 31);
  const scaleY = Math.max(0.6, rect.height / 31);

  const left = rect.x + Math.round(1 * scaleX);
  const top = rect.y + Math.round(2 * scaleY);
  const right = rect.x + rect.width - Math.round(1 * scaleX);
  const bottom = rect.y + rect.height - Math.round(10 * scaleY);

  const srcWidth = Math.max(1, right - left);
  const srcHeight = Math.max(1, bottom - top);
  const raw = new Float32Array(sampleWidth * sampleHeight * 3);
  let at = 0;

  for (let y = 0; y < sampleHeight; y++) {
    for (let x = 0; x < sampleWidth; x++) {
      const nx = (x + 0.5) / sampleWidth;
      const ny = (y + 0.5) / sampleHeight;

      const px = clamp(
        Math.round(left + nx * srcWidth),
        0,
        image.width - 1
      );
      const py = clamp(
        Math.round(top + ny * srcHeight),
        0,
        Math.min(image.height - 1, Math.max(0, bottom - 1))
      );

      const pixel = (py * image.width + px) * 4;
      raw[at++] = image.data[pixel] / 255;
      raw[at++] = image.data[pixel + 1] / 255;
      raw[at++] = image.data[pixel + 2] / 255;
    }
  }

  return normalize(raw);
}

function normalize(raw: Float32Array): Float32Array {
  let sum = 0;
  for (const value of raw) sum += value;
  const mean = sum / Math.max(1, raw.length);
  let magnitudeSq = 0;
  for (const value of raw) magnitudeSq += (value - mean) ** 2;
  const magnitude = Math.sqrt(magnitudeSq) || 1;
  const vector = new Float32Array(raw.length);
  for (let index = 0; index < raw.length; index++) {
    vector[index] = (raw[index] - mean) / magnitude;
  }
  return vector;
}

function getBrightness(image: ImageData, rect: ImageRect): number {
  const left = clamp(Math.round(rect.x + rect.width * 0.16), 0, image.width - 1);
  const top = clamp(Math.round(rect.y + rect.height * 0.16), 0, image.height - 1);
  const right = clamp(Math.round(rect.x + rect.width * 0.84), left + 1, image.width);
  const bottom = clamp(Math.round(rect.y + rect.height * 0.76), top + 1, image.height);
  let luminance = 0;
  let pixels = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = (y * image.width + x) * 4;
      luminance += image.data[index] * 0.2126 +
        image.data[index + 1] * 0.7152 +
        image.data[index + 2] * 0.0722;
      pixels++;
    }
  }
  return pixels ? luminance / pixels / 255 : 0;
}

function dot(left: Float32Array, right: Float32Array): number {
  let score = 0;
  for (let index = 0; index < left.length; index++) score += left[index] * right[index];
  return score;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function reject(rejectionReason: string): IconMatch {
  return {
    abilityId: "",
    score: 0,
    margin: 0,
    accepted: false,
    rejectionReason
  };
}

function loadImage(src: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || !canvas.width || !canvas.height) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
