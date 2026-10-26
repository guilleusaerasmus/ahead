// Browser side of the YouCam flow: upload a photo, run a whitelisted task through
// our Worker, poll until done, then ask YouCam to delete the task's files.

export type Feature = 'skin' | 'tone' | 'hair-length' | 'hair-density' | 'hairstyle' | 'hair-color' | 'hat' | 'brows';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('network', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `http_${res.status}`, res.status);
  return body as T;
}

const postJson = <T>(path: string, data: unknown) =>
  call<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

/** Uploads a photo straight to YouCam's storage through a presigned URL and returns its file id. */
export async function uploadPhoto(photo: Blob): Promise<string> {
  const type = photo.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const slot = await postJson<{ file_id: string; url: string; headers: Record<string, string> }>('/api/file', {
    content_type: type,
    file_size: photo.size,
  });
  // Content-Length is set by the browser; sending it explicitly is forbidden.
  const headers = Object.fromEntries(Object.entries(slot.headers).filter(([k]) => k.toLowerCase() !== 'content-length'));
  let put: Response;
  try {
    put = await fetch(slot.url, { method: 'PUT', headers, body: photo });
  } catch {
    throw new ApiError('upload_failed', 0);
  }
  if (!put.ok) throw new ApiError('upload_failed', put.status);
  return slot.file_id;
}

export interface TaskResult {
  url?: string;
  output?: Array<{ type: string; raw_score: number; ui_score: number; mask_urls?: string[] }>;
  [key: string]: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// YouCam allows ~250 requests per 5 minutes per key for the whole site, so we keep
// at most two tasks in flight and poll with a gentle backoff.
let inFlight = 0;
const waiters: Array<() => void> = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= 2) await new Promise<void>((r) => waiters.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiters.shift()?.();
  }
}

export interface TaskOutcome {
  results: TaskResult;
  /** The result image, downloaded before the task is deleted (for image-producing features). */
  image?: Blob;
}

/** Runs one task to completion. Rejects with ApiError(code) on a task error such as `error_hair_too_short`. */
export function runTask(feature: Feature, input: Record<string, unknown>, signal?: AbortSignal): Promise<TaskOutcome> {
  return slot(async () => {
    const { task_id } = await postJson<{ task_id: string }>(`/api/task/${feature}`, input);
    const started = Date.now();
    let wait = 2500;
    try {
      for (;;) {
        await sleep(wait);
        if (signal?.aborted) throw new ApiError('cancelled', 0);
        const s = await call<{ status: string; error: string | null; results: TaskResult | null }>(`/api/task/${feature}/${encodeURIComponent(task_id)}`);
        if (s.status === 'success' && s.results) {
          const image = typeof s.results.url === 'string' ? await fetchResultImage(s.results.url) : undefined;
          return { results: s.results, image };
        }
        if (s.status === 'error') throw new ApiError(s.error ?? 'task_failed', 422);
        if (Date.now() - started > 180_000) throw new ApiError('timeout', 504);
        wait = Math.min(wait + 1000, 6000);
      }
    } finally {
      // Privacy: remove the uploaded photo and the outputs from YouCam as soon as we are done.
      void postJson(`/api/task/${feature}/${encodeURIComponent(task_id)}/delete`, {}).catch(() => undefined);
    }
  });
}

/** Downloads a result image (signed URLs expire after 2 hours) so it can be kept on this device. */
export async function fetchResultImage(url: string): Promise<Blob> {
  const res = await fetch(`/api/result?u=${encodeURIComponent(url)}`);
  if (!res.ok) throw new ApiError('result_fetch_failed', res.status);
  return res.blob();
}

export interface HairTemplate {
  id: string;
  title?: string;
  thumb?: string;
  [key: string]: unknown;
}

export async function listHairTemplates(token?: string): Promise<{ templates: HairTemplate[]; next?: string }> {
  const res = await call<{ data?: { templates?: HairTemplate[]; next_token?: string } }>(
    `/api/templates${token ? `?token=${encodeURIComponent(token)}` : ''}`,
  );
  return { templates: res.data?.templates ?? [], next: res.data?.next_token || undefined };
}
