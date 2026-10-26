import { BadRequest, FEATURES, type Json } from './features';

export interface Env {
  YOUCAM_API_KEY: string;
  ASSETS: Fetcher;
  USAGE: KVNamespace;
  /** Units the whole site may spend per UTC day (live mode). */
  DAILY_UNITS: string;
  /** Units one visitor (by IP) may spend per UTC day. */
  VISITOR_UNITS: string;
}

const UPSTREAM = 'https://yce-api-01.makeupar.com';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TASK_ID = /^[A-Za-z0-9_+/=-]{16,200}$/;
// Result images live on YouCam's S3 buckets; only those hosts may be proxied.
const RESULT_HOST = /^yce-[a-z0-9-]+\.s3[a-z0-9.-]*\.amazonaws\.com$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function upstream(env: Env, path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(UPSTREAM + path, {
    ...init,
    headers: { authorization: `Bearer ${env.YOUCAM_API_KEY}`, 'content-type': 'application/json', ...init.headers },
  });
  const text = await res.text();
  let body: Json;
  try {
    body = JSON.parse(text) as Json;
  } catch {
    throw new HttpError(502, `YouCam returned a non-JSON response (${res.status})`);
  }
  if (res.status === 429) throw new HttpError(429, 'The try-on service is busy. Please wait a minute and try again.');
  if (!res.ok) {
    // Log the upstream detail for us; the client gets a short, non-sensitive message.
    console.error('youcam error', res.status, path, text.slice(0, 500));
    const code = typeof body.error_code === 'string' ? body.error_code : typeof body.error === 'string' ? body.error : 'upstream_error';
    throw new HttpError(res.status >= 500 ? 502 : 400, code);
  }
  return body;
}

const today = () => new Date().toISOString().slice(0, 10);

async function visitorKey(request: Request): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ahead:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reserves `units` from the daily budgets, or throws 429. KV is eventually consistent, so this is a soft cap. */
async function reserveUnits(env: Env, request: Request, units: number): Promise<void> {
  const day = today();
  const siteKey = `units:${day}`;
  const visKey = `units:${day}:${await visitorKey(request)}`;
  const [site, vis] = await Promise.all([env.USAGE.get(siteKey), env.USAGE.get(visKey)]);
  const siteUsed = Number(site ?? 0);
  const visUsed = Number(vis ?? 0);
  if (siteUsed + units > Number(env.DAILY_UNITS)) {
    throw new HttpError(429, 'daily_budget_reached');
  }
  if (visUsed + units > Number(env.VISITOR_UNITS)) {
    throw new HttpError(429, 'visitor_budget_reached');
  }
  const ttl = { expirationTtl: 60 * 60 * 48 };
  await Promise.all([env.USAGE.put(siteKey, String(siteUsed + units), ttl), env.USAGE.put(visKey, String(visUsed + units), ttl)]);
}

interface UploadSlot {
  file_id: string;
  url: string;
  headers: Record<string, string>;
}

async function createUploadSlot(env: Env, contentType: string, size: number): Promise<UploadSlot> {
  const res = await upstream(env, '/s2s/v2.0/file', {
    method: 'POST',
    body: JSON.stringify({ files: [{ content_type: contentType, file_name: contentType === 'image/png' ? 'photo.png' : 'photo.jpg', file_size: size }] }),
  });
  const file = (res.data as { files?: Array<{ file_id: string; requests: Array<{ url: string; headers: Record<string, string> }> }> })?.files?.[0];
  const req = file?.requests?.[0];
  if (!file || !req) throw new HttpError(502, 'upload_slot_missing');
  return { file_id: file.file_id, url: req.url, headers: req.headers };
}

async function readJson(request: Request): Promise<Json> {
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Json;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'Body must be a JSON object');
}

async function handleApi(request: Request, env: Env, path: string[]): Promise<Response> {
  const [head, feature, taskId, extra] = path;

  // POST /api/file -> presigned upload slot (the browser PUTs the bytes straight to YouCam's storage)
  if (head === 'file' && request.method === 'POST' && path.length === 1) {
    const body = await readJson(request);
    const type = body.content_type;
    const size = body.file_size;
    if (type !== 'image/jpeg' && type !== 'image/png') throw new HttpError(400, 'Only JPEG or PNG photos are supported');
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      throw new HttpError(400, 'Photos must be smaller than 10 MB');
    }
    return json(await createUploadSlot(env, type, size));
  }

  // GET /api/templates?token= -> hairstyle templates (no unit cost)
  if (head === 'templates' && request.method === 'GET' && path.length === 1) {
    const token = new URL(request.url).searchParams.get('token');
    if (token !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(token)) throw new HttpError(400, 'Invalid token');
    const qs = `page_size=20${token ? `&starting_token=${token}` : ''}`;
    return json(await upstream(env, `/s2s/v2.1/task/template/hair-transfer?${qs}`));
  }

  // GET /api/result?u= -> streams a result image from YouCam storage (signed URLs expire after 2 h)
  if (head === 'result' && request.method === 'GET' && path.length === 1) {
    const raw = new URL(request.url).searchParams.get('u') ?? '';
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      throw new HttpError(400, 'Invalid result URL');
    }
    if (target.protocol !== 'https:' || !RESULT_HOST.test(target.hostname)) throw new HttpError(400, 'Result URL not allowed');
    const res = await fetch(target.toString());
    if (!res.ok) throw new HttpError(502, 'result_fetch_failed');
    return new Response(res.body, {
      headers: { 'content-type': res.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'private, max-age=600' },
    });
  }

  if (head !== 'task' || !feature) throw new HttpError(404, 'Not found');
  const spec = FEATURES[feature];
  if (!spec) throw new HttpError(404, 'Unknown feature');

  // POST /api/task/:feature -> create
  if (request.method === 'POST' && path.length === 2) {
    const input = await readJson(request);
    // For the hat feature `ref_file_id` is a headwear photo the visitor uploaded through /api/file
    // (a YouCam file id, never a URL); no other feature accepts a reference file.
    if (feature !== 'hat') delete input.ref_file_id;
    let body: Json;
    try {
      body = spec.body(input);
    } catch (e) {
      if (e instanceof BadRequest) throw new HttpError(400, e.message);
      throw e;
    }
    await reserveUnits(env, request, spec.units);
    const res = await upstream(env, spec.run, { method: 'POST', body: JSON.stringify(body) });
    const id = (res.data as { task_id?: string })?.task_id;
    if (!id) throw new HttpError(502, 'task_id_missing');
    return json({ task_id: id });
  }

  if (!taskId || !TASK_ID.test(taskId)) throw new HttpError(400, 'Invalid task id');

  // GET /api/task/:feature/:id -> poll
  if (request.method === 'GET' && path.length === 3) {
    const res = await upstream(env, spec.poll + encodeURIComponent(taskId));
    const data = (res.data ?? {}) as Json;
    return json({ status: data.task_status, error: data.error ?? null, results: data.results ?? null });
  }

  // POST /api/task/:feature/:id/delete -> remove inputs and outputs from YouCam
  if (request.method === 'POST' && extra === 'delete' && path.length === 4) {
    await upstream(env, '/s2s/v2.0/task/delete', { method: 'POST', body: JSON.stringify({ task_id: taskId }) });
    return json({ deleted: true });
  }

  throw new HttpError(405, 'Method not allowed');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'POST' && request.headers.get('origin') && request.headers.get('origin') !== url.origin) {
      return json({ error: 'Cross-origin requests are not allowed' }, 403);
    }
    if (!env.YOUCAM_API_KEY) return json({ error: 'Server is missing its YouCam API key' }, 500);
    try {
      return await handleApi(request, env, url.pathname.slice(5).split('/').filter(Boolean));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error('unhandled', e);
      return json({ error: 'Internal error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
