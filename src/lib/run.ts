import * as store from './store';
import { ApiError, runTask, uploadPhoto, type Feature, type TaskOutcome } from './api';

/**
 * Uploads a stored photo and runs one task on it. Each task gets its own upload because
 * deleting a finished task also deletes its input file on YouCam's side.
 */
export async function analyze(feature: Feature, photoKey: string, input: Record<string, unknown> = {}): Promise<TaskOutcome> {
  const photo = await store.get<Blob>('images', photoKey);
  if (!photo) throw new ApiError('photo_missing', 0);
  const fileId = await uploadPhoto(photo);
  return runTask(feature, { ...input, src_file_id: fileId });
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export function readTone(results: Obj) {
  const c = obj(results.color);
  return {
    hairHex: str(c.hair_color),
    hairColorName: str(c.hair_color_name),
    browHex: str(c.eyebrow_color),
    skinHex: str(c.skin_color),
    eyeColorName: str(c.eye_color_name),
  };
}

export function readLength(results: Obj) {
  return str(obj(results.hair_length).term);
}

export function readDensity(results: Obj): { density?: number; term?: string } {
  const d = obj(results.hair_density);
  const n = Number.parseFloat(String(d.mapping));
  return { density: Number.isFinite(n) ? n : undefined, term: str(d.term) };
}

export function readSkin(results: Obj): Record<string, number> {
  const out: Record<string, number> = {};
  const list = Array.isArray(results.output) ? (results.output as Obj[]) : [];
  for (const item of list) {
    if (typeof item.type === 'string' && typeof item.raw_score === 'number') out[item.type] = Math.round(item.raw_score * 10) / 10;
  }
  return out;
}
