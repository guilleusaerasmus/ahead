// Turns YouCam measurements into plain-language, non-medical guidance.
// Every tip links to its source; nothing here diagnoses or recommends treatment.

export const SOURCES = {
  hairLoss: {
    label: 'American Cancer Society: Coping with hair loss',
    url: 'https://www.cancer.org/cancer/managing-cancer/side-effects/hair-skin-nails/hair-loss/coping-with-hair-loss.html',
  },
  skin: {
    label: 'American Cancer Society: Skin color changes',
    url: 'https://www.cancer.org/cancer/managing-cancer/side-effects/hair-skin-nails/skin-color-changes.html',
  },
} as const;

export type Source = (typeof SOURCES)[keyof typeof SOURCES];

// ---------- colour helpers ----------

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CIE L* (perceived lightness, 0 = black, 100 = white) of an sRGB hex colour. */
export function lightness(hex: string): number {
  const lin = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/** Mixes two hex colours; t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ra, rb)}${c(ga, gb)}${c(ba, bb)}`;
}

/** CIE L*a*b* of an sRGB hex colour (D65). */
export function toLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * Names a hair shade the way wig catalogues roughly do: by lightness first, then warmth.
 * Thresholds are on CIE L* (lightness) and chroma/hue; they are descriptive, not a colour standard.
 */
export function hairShadeName(hex: string): string {
  const [l, a, b] = toLab(hex);
  const chroma = Math.hypot(a, b);
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (chroma < 8 && l > 55) return 'Silver / grey';
  if (chroma < 10 && l > 40) return 'Ash grey';
  if (l < 15) return 'Black';
  const red = chroma > 22 && hue < 55;
  if (l < 28) return red ? 'Dark auburn' : 'Dark brown';
  if (l < 40) return red ? 'Auburn / chestnut' : 'Medium brown';
  if (l < 52) return red ? 'Copper / light auburn' : 'Light brown';
  if (l < 65) return red ? 'Strawberry blonde' : 'Dark blonde';
  return 'Blonde';
}

// ---------- brows ----------

const BROW_SHADES: Array<{ name: string; maxL: number }> = [
  { name: 'Ebony / soft black', maxL: 18 },
  { name: 'Dark brown', maxL: 28 },
  { name: 'Medium brown', maxL: 38 },
  { name: 'Soft brown', maxL: 48 },
  { name: 'Taupe', maxL: 60 },
  { name: 'Blonde', maxL: 101 },
];

/**
 * Suggests a brow pencil colour from the measured brow colour. Make-up artists usually keep
 * brows close to the natural colour; very dark brows are softened slightly so drawn-on brows
 * don't look harsh. The result is a starting point to test on the skin, not a prescription.
 */
export function browPencil(browHex: string): { hex: string; name: string } {
  const l = lightness(browHex);
  const hex = l < 20 ? mix(browHex, '#6b5a4e', 0.25) : browHex;
  const [shadeL, a, b] = toLab(hex);
  // Grey brows need a grey-taupe pencil, not a warm blonde one.
  if (Math.hypot(a, b) < 10 && shadeL > 40) return { hex, name: 'Grey / soft taupe' };
  const name = BROW_SHADES.find((s) => shadeL <= s.maxL)?.name ?? 'Taupe';
  return { hex, name };
}

// ---------- hair profile ----------

export interface HairProfile {
  measuredAt: string;
  hairColorName?: string;
  /** YouCam's hair colour family (one of a few fixed values). */
  hairHex?: string;
  /** The exact shade the user picked by tapping their hair in the photo. */
  hairSampledHex?: string;
  browHex?: string;
  skinHex?: string;
  eyeColorName?: string;
  length?: string;
  densityTerm?: string;
  /** YouCam's density estimate, 0 (none) to 3 (high). */
  density?: number;
}

/**
 * YouCam's density estimate (0–3) moves by about 0.12 (standard deviation) when only the photo
 * changes: measured 26 Oct 2026 on one hairline photo re-saved, cropped and brightened (2.44–2.72;
 * identical files give identical results). Its class label flips between "Medium" and "High"
 * around 2.5, so we track the number and treat changes under 0.5 as photo variation.
 */
export const DENSITY_MEANINGFUL_CHANGE = 0.5;

/**
 * Wig cap density is sold as a percentage (light ≈ 120–130 %, medium ≈ 150 %, heavy ≈ 180 %).
 * Matching your current fullness is what makes a wig look like "your" hair. This maps YouCam's
 * density estimate to the range to ask for, saying so when it sits on a boundary; the fitter makes the final call.
 */
export function wigDensity(value?: number, term?: string): string | undefined {
  if (value === undefined) {
    if (term === 'High Density') return 'Heavy (about 180 %)';
    if (term === 'Medium Density') return 'Medium (about 150 %)';
    if (term === 'Low Density' || term === 'Extremely Low Density') return 'Light (about 120–130 %)';
    return undefined;
  }
  const bands: Array<[number, string]> = [
    [1.5, 'Light (about 120–130 %)'],
    [2.5, 'Medium (about 150 %)'],
    [Infinity, 'Heavy (about 180 %)'],
  ];
  const at = (v: number) => bands.find(([max]) => v < max)![1];
  const low = at(Math.max(0, value - 0.15));
  const high = at(Math.min(3, value + 0.15));
  return low === high ? low : `Between ${low.split(' (')[0].toLowerCase()} and ${high.split(' (')[0].toLowerCase()}: ${low.match(/\((.*)\)/)?.[1]} to ${high.match(/\((.*)\)/)?.[1]}`;
}

export function wigLength(length?: string): string | undefined {
  if (!length) return undefined;
  if (/above the ears|short hair$/.test(length)) return 'Short (pixie or cropped)';
  if (/ear length/.test(length)) return 'Short to chin-length bob';
  if (/above chest/.test(length)) return 'Shoulder length';
  if (/long hair/.test(length)) return 'Long (below the shoulders)';
  return 'Ask your fitter to match your current length';
}

// ---------- check-ins ----------

export type SkinConcern = 'moisture' | 'redness' | 'texture' | 'radiance';

export const CONCERN_LABEL: Record<SkinConcern, string> = {
  moisture: 'Hydration',
  redness: 'Calm (low redness)',
  texture: 'Smoothness',
  radiance: 'Radiance',
};

export interface CheckIn {
  id: string;
  at: string;
  /** YouCam raw scores (1–100, higher = healthier-looking). We do not use the inflated ui_score. */
  skin?: Partial<Record<SkinConcern, number>>;
  density?: number;
  densityTerm?: string;
}

/** Gentle, sourced care tips for whichever area dropped the most since the first check-in. */
export const CARE_TIPS: Record<SkinConcern, { tips: string[]; source: Source }> = {
  moisture: {
    tips: [
      'Use a hypoallergenic, cream-based moisturiser, preferably unscented.',
      'Wash with gentle soap and warm (not hot) water, then pat dry.',
    ],
    source: SOURCES.skin,
  },
  redness: {
    tips: [
      'Avoid very hot water and products with strong perfumes or alcohol (colognes, aftershave).',
      'Wear loose, soft clothing and protect the skin from extreme heat or cold.',
    ],
    source: SOURCES.skin,
  },
  texture: {
    tips: ['Pat skin dry instead of rubbing it.', 'Choose mild soaps and lotions without harsh chemicals; ask your team what they recommend.'],
    source: SOURCES.skin,
  },
  radiance: {
    tips: [
      'Use a broad-spectrum sunscreen of SPF 30 or more with zinc oxide or titanium dioxide, at least 1 hour before going out.',
      'Cover your scalp and face from the sun with a hat or head covering.',
    ],
    source: SOURCES.skin,
  },
};

export interface Trend {
  concern: SkinConcern;
  first: number;
  last: number;
  change: number;
}

/** Change of each skin score between the first and the latest check-in. */
export function skinTrends(checkins: CheckIn[]): Trend[] {
  const withSkin = checkins.filter((c) => c.skin).sort((a, b) => a.at.localeCompare(b.at));
  if (withSkin.length < 2) return [];
  const first = withSkin[0].skin!;
  const last = withSkin[withSkin.length - 1].skin!;
  return (Object.keys(CONCERN_LABEL) as SkinConcern[])
    .filter((k) => first[k] !== undefined && last[k] !== undefined)
    .map((k) => ({ concern: k, first: first[k]!, last: last[k]!, change: last[k]! - first[k]! }));
}

/**
 * YouCam's skin scores move a little when only the photo changes. Measured on 26 Oct 2026: six
 * versions of one face (brighter, darker, warmer, cropped, heavier JPEG) gave a standard deviation
 * of at most 0.97 raw points (moisture; redness 0.89, radiance 0.27, texture 0.04). For a change
 * between two check-ins the 95 % noise threshold is 1.96·√2·σ ≈ 2.7 points. Real photos also vary
 * in pose and expression, so we use about twice that before calling a change noticeable.
 */
export const MEANINGFUL_CHANGE = 5;
