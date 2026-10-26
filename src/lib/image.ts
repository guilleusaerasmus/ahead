// Photo preparation on the device: fix orientation, downscale to what each YouCam
// feature accepts, and re-encode as JPEG (the hairstyle API only takes JPEG).

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export class PhotoError extends Error {}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('This file could not be read as a photo. Try a JPEG or PNG.');
  }
}

/**
 * Downscales so the long side is at most `maxLong` and re-encodes as JPEG.
 * Rejects photos whose short side is below `minShort` (YouCam refuses them anyway).
 */
export async function preparePhoto(file: Blob, maxLong: number, minShort: number): Promise<PreparedPhoto> {
  const bitmap = await decode(file);
  try {
    const short = Math.min(bitmap.width, bitmap.height);
    if (short < minShort) {
      throw new PhotoError(`This photo is too small (${bitmap.width}×${bitmap.height}). Please use one at least ${minShort} pixels on its shorter side.`);
    }
    const scale = Math.min(1, maxLong / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('Your browser could not process the photo.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new PhotoError('Your browser could not process the photo.');
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

/** Head-and-shoulders photo used for hair, headwear and brow try-ons (hairstyle API: long side ≤ 1024, JPEG). */
export const preparePortrait = (file: Blob) => preparePhoto(file, 1024, 512);

/** Close-up face photo used for skin and colour analysis (SD skin analysis needs a short side ≥ 480). */
export const prepareCloseUp = (file: Blob) => preparePhoto(file, 1900, 480);
