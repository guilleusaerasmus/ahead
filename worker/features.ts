// Whitelisted YouCam features. The browser never sends a raw upstream path or
// arbitrary parameters: each feature builds its own request body from validated input.

export type Json = Record<string, unknown>;

export interface Feature {
  /** POST path that creates the task. */
  run: string;
  /** GET path prefix used to poll the task (task id is appended). */
  poll: string;
  /** Units charged by YouCam on success (from the docs' Unit Consumption tables). */
  units: number;
  /** Builds the upstream body or throws a BadRequest with a user-safe message. */
  body: (input: Json) => Json;
}

export class BadRequest extends Error {}

const FILE_ID = /^[A-Za-z0-9+/=_-]{16,200}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const TEMPLATE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const BROW_SHAPE = /^[A-Za-z0-9_-]{1,40}$/;

function fileId(input: Json, key = 'src_file_id'): string {
  const v = input[key];
  if (typeof v !== 'string' || !FILE_ID.test(v)) throw new BadRequest(`Invalid ${key}`);
  return v;
}

function int(input: Json, key: string, min: number, max: number, fallback: number): number {
  const v = input[key];
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new BadRequest(`Invalid ${key}`);
  return v;
}

function hex(input: Json, key: string): string {
  const v = input[key];
  if (typeof v !== 'string' || !HEX.test(v)) throw new BadRequest(`Invalid ${key}`);
  return v;
}

function oneOf<T extends string>(input: Json, key: string, allowed: readonly T[], fallback?: T): T {
  const v = input[key] ?? fallback;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new BadRequest(`Invalid ${key}`);
  return v as T;
}

/** Skin concerns tracked during treatment: dryness, redness, texture and dullness. 4 concerns = 9 units (SD). */
export const SKIN_ACTIONS = ['moisture', 'redness', 'texture', 'radiance'] as const;

export const FEATURES: Record<string, Feature> = {
    skin: {
      run: '/s2s/v2.0/task/skin-analysis',
      poll: '/s2s/v2.0/task/skin-analysis/',
      units: 9,
      body: (i) => ({ src_file_id: fileId(i), dst_actions: [...SKIN_ACTIONS], format: 'json' }),
    },
    tone: {
      run: '/s2s/v2.0/task/skin-tone-analysis',
      poll: '/s2s/v2.0/task/skin-tone-analysis/',
      units: 20,
      body: (i) => ({ src_file_id: fileId(i), face_angle_strictness_level: 'medium' }),
    },
    'hair-length': {
      run: '/s2s/v2.0/task/hair-length-detection',
      poll: '/s2s/v2.0/task/hair-length-detection/',
      units: 2,
      body: (i) => ({ src_file_id: fileId(i) }),
    },
    'hair-density': {
      run: '/s2s/v2.0/task/hair-density-detection',
      poll: '/s2s/v2.0/task/hair-density-detection/',
      units: 1,
      body: (i) => ({ src_file_id: fileId(i) }),
    },
    hairstyle: {
      run: '/s2s/v2.1/task/hair-transfer',
      poll: '/s2s/v2.1/task/hair-transfer/',
      units: 2,
      body: (i) => {
        const t = i.template_id;
        if (typeof t !== 'string' || !TEMPLATE_ID.test(t)) throw new BadRequest('Invalid template_id');
        return { src_file_id: fileId(i), template_id: t, hair_color: oneOf(i, 'hair_color', ['src', 'ref'] as const, 'src') };
      },
    },
    'hair-color': {
      run: '/s2s/v2.0/task/hair-color',
      poll: '/s2s/v2.0/task/hair-color/',
      units: 1,
      body: (i) => ({
        src_file_id: fileId(i),
        pattern: { name: 'full' },
        palettes: [{ color: hex(i, 'color'), color_intensity: int(i, 'intensity', 0, 100, 70), shine_intensity: 40 }],
      }),
    },
    hat: {
      run: '/s2s/v2.0/task/hat',
      poll: '/s2s/v2.0/task/hat/',
      units: 2,
      // `ref_file_id` is a headwear photo the visitor uploaded via /api/file.
      body: (i) => ({
        src_file_id: fileId(i),
        ref_file_id: fileId(i, 'ref_file_id'),
        gender: oneOf(i, 'gender', ['female', 'male'] as const),
        style: 'style_warm_cozy',
      }),
    },
    brows: {
      run: '/s2s/v2.0/task/makeup-vto',
      poll: '/s2s/v2.0/task/makeup-vto/',
      units: 1,
      body: (i) => {
        const shape = i.shape;
        const pattern =
          shape === undefined
            ? { type: 'color' }
            : typeof shape === 'string' && BROW_SHAPE.test(shape)
              ? {
                  type: 'shape',
                  name: shape,
                  thickness: int(i, 'thickness', -100, 100, 0),
                  curvature: int(i, 'curvature', -100, 100, 0),
                  definition: int(i, 'definition', 0, 100, 40),
                }
              : (() => {
                  throw new BadRequest('Invalid shape');
                })();
        return {
          src_file_id: fileId(i),
          version: '1.0',
          effects: [
            {
              category: 'eyebrows',
              pattern,
              palettes: [{ color: hex(i, 'color'), colorIntensity: int(i, 'intensity', 0, 100, 60), texture: 'matte' }],
            },
          ],
        };
      },
    },
};
