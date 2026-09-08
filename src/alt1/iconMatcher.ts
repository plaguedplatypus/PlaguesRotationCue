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

export type KnownIconMeasurement = {
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

type IconTemplate = {
  abilityId: string;
  vector: Float32Array;
};

const SAMPLE_WIDTH = 24;
const SAMPLE_HEIGHT = 18;
const ALIGNMENT_RADIUS = 2;
const ALIGNMENT_CANDIDATES = 12;
const EMPTY_MIN_SCORE = 0.78;
const EMPTY_ABILITY_TOLERANCE = 0.03;

export class IconMatcher {
  private templatesPromise: Promise<IconTemplate[]> | null = null;
  private emptyTemplatePromise: Promise<Float32Array | null> | null = null;

  prepare(): Promise<IconTemplate[]> {
    this.templatesPromise ??= Promise.all(abilities.map(async (ability) => {
      const image = await loadImageData(ability.icon);
      return image ? {
        abilityId: ability.id,
        vector: sampleVector(image, { x: 0, y: 0, width: image.width, height: image.height })
      } : null;
    })).then((templates) => templates.filter((template): template is IconTemplate => !!template));
    return this.templatesPromise;
  }

  async match(image: ImageData, rect: ImageRect): Promise<IconMatch> {
    const [templates, emptyTemplate] = await Promise.all([
      this.prepare(),
      this.prepareEmptyTemplate()
    ]);
    if (!templates.length) {
      return rejectedMatch("Ability icon templates could not be loaded");
    }

    const centerVector = sampleVector(image, rect);
    let emptyScore = emptyTemplate ? dot(centerVector, emptyTemplate) : -1;
    const candidateTemplates = templates
      .map((template) => ({ template, score: dot(centerVector, template.vector) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, ALIGNMENT_CANDIDATES);
    const bestByAbility = new Map(
      candidateTemplates.map(({ template, score }) => [template.abilityId, score])
    );

    for (let deltaY = -ALIGNMENT_RADIUS; deltaY <= ALIGNMENT_RADIUS; deltaY++) {
      for (let deltaX = -ALIGNMENT_RADIUS; deltaX <= ALIGNMENT_RADIUS; deltaX++) {
        if (deltaX === 0 && deltaY === 0) continue;
        const vector = sampleVector(image, {
          ...rect,
          x: rect.x + deltaX,
          y: rect.y + deltaY
        });
        if (emptyTemplate) emptyScore = Math.max(emptyScore, dot(vector, emptyTemplate));
        for (const { template } of candidateTemplates) {
          const score = dot(vector, template.vector);
          if (score > (bestByAbility.get(template.abilityId) ?? -1)) {
            bestByAbility.set(template.abilityId, score);
          }
        }
      }
    }

    const ranked = [...bestByAbility.entries()]
      .map(([abilityId, score]) => ({ abilityId, score }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best) return rejectedMatch("No icon candidates were produced");

    const score = clampScore(best.score);
    const runnerUpScore = clampScore(runnerUp?.score ?? -1);
    const margin = Math.max(0, score - runnerUpScore);
    const normalizedEmptyScore = clampScore(emptyScore);
    const empty = !!emptyTemplate
      && normalizedEmptyScore >= EMPTY_MIN_SCORE
      && normalizedEmptyScore >= score - EMPTY_ABILITY_TOLERANCE;
    if (empty) {
      return {
        abilityId: "",
        score,
        margin,
        empty: true,
        emptyScore: normalizedEmptyScore,
        accepted: false,
        rejectionReason: "Empty slot"
      };
    }
    const acceptsCloseColorVariant = (
      best.abilityId === "animate_dead"
      || best.abilityId === "smoke_cloud"
    )
      && score >= 0.94
      && margin >= 0.035;
    const acceptsDarkShadowBarrage = best.abilityId === "shadow_barrage"
      && score >= 0.82
      && margin >= 0.045;
    const accepted = (score >= 0.68 && margin >= 0.12) ||
      (score >= 0.72 && margin >= 0.08) ||
      (score >= 0.84 && margin >= 0.06) ||
      acceptsCloseColorVariant ||
      acceptsDarkShadowBarrage;

    return {
      abilityId: best.abilityId,
      score,
      margin,
      empty: false,
      emptyScore: normalizedEmptyScore,
      accepted,
      rejectionReason: accepted
        ? undefined
        : score < 0.68
          ? "Best match is too weak"
          : "Best match is too similar to another icon"
    };
  }

  private prepareEmptyTemplate(): Promise<Float32Array | null> {
    this.emptyTemplatePromise ??= loadImageData("./assets/empty.png")
      .then((image) => image
        ? sampleVector(image, { x: 0, y: 0, width: image.width, height: image.height })
        : null);
    return this.emptyTemplatePromise;
  }

  async measureKnownAbilities(
    image: ImageData,
    rect: ImageRect,
    abilityIds: readonly string[]
  ): Promise<KnownIconMeasurement[]> {
    const requestedIds = new Set(abilityIds);
    const templates = (await this.prepare())
      .filter((candidate) => requestedIds.has(candidate.abilityId));
    if (!templates.length) return [];

    const similarities = new Map(templates.map((template) => [template.abilityId, -1]));
    for (let deltaY = -ALIGNMENT_RADIUS; deltaY <= ALIGNMENT_RADIUS; deltaY++) {
      for (let deltaX = -ALIGNMENT_RADIUS; deltaX <= ALIGNMENT_RADIUS; deltaX++) {
        const vector = sampleVector(image, {
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

    const brightness = sampleBrightness(image, rect);
    return templates.map((template) => ({
      abilityId: template.abilityId,
      similarity: clampScore(similarities.get(template.abilityId) ?? -1),
      brightness
    }));
  }
}

function sampleVector(image: ImageData, rect: ImageRect): Float32Array {
  const scaleX = Math.max(0.6, rect.width / 31);
  const scaleY = Math.max(0.6, rect.height / 31);

  const left = rect.x + Math.round(1 * scaleX);
  const top = rect.y + Math.round(2 * scaleY);
  const right = rect.x + rect.width - Math.round(1 * scaleX);
  const bottom = rect.y + rect.height - Math.round(10 * scaleY);

  const sourceWidth = Math.max(1, right - left);
  const sourceHeight = Math.max(1, bottom - top);
  const raw = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 3);
  let outputIndex = 0;

  for (let y = 0; y < SAMPLE_HEIGHT; y++) {
    for (let x = 0; x < SAMPLE_WIDTH; x++) {
      const normalizedX = (x + 0.5) / SAMPLE_WIDTH;
      const normalizedY = (y + 0.5) / SAMPLE_HEIGHT;

      const pixelX = clamp(
        Math.round(left + normalizedX * sourceWidth),
        0,
        image.width - 1
      );
      const pixelY = clamp(
        Math.round(top + normalizedY * sourceHeight),
        0,
        Math.min(image.height - 1, Math.max(0, bottom - 1))
      );

      const pixelIndex = (pixelY * image.width + pixelX) * 4;
      raw[outputIndex++] = image.data[pixelIndex] / 255;
      raw[outputIndex++] = image.data[pixelIndex + 1] / 255;
      raw[outputIndex++] = image.data[pixelIndex + 2] / 255;
    }
  }

  return normalize(raw);
}

function normalize(raw: Float32Array): Float32Array {
  let sum = 0;
  for (const value of raw) sum += value;
  const mean = sum / Math.max(1, raw.length);
  let magnitudeSquared = 0;
  for (const value of raw) magnitudeSquared += (value - mean) ** 2;
  const magnitude = Math.sqrt(magnitudeSquared) || 1;
  const normalized = new Float32Array(raw.length);
  for (let index = 0; index < raw.length; index++) {
    normalized[index] = (raw[index] - mean) / magnitude;
  }
  return normalized;
}

function sampleBrightness(image: ImageData, rect: ImageRect): number {
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

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rejectedMatch(rejectionReason: string): IconMatch {
  return {
    abilityId: "",
    score: 0,
    margin: 0,
    accepted: false,
    rejectionReason
  };
}

function loadImageData(src: string): Promise<ImageData | null> {
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
