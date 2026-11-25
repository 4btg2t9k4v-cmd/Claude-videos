// Turns Pawnote's raw HTTP requests into calls to the Pronote relay (/api/pronote).
// `post` sends the JSON body to the relay and resolves to a fetch Response.
// In a native app, replace this whole fetcher with one that uses the native HTTP stack.

function plainHeaders(hdrs) {
  if (!hdrs) return {};
  if (typeof hdrs.forEach === 'function' && typeof hdrs.get === 'function') {
    const o = {};
    hdrs.forEach((v, k) => { o[k] = v; });
    return o;
  }
  return { ...hdrs };
}

export class RelayError extends Error {
  constructor(message, status) { super(message); this.status = status; this.code = 'relay'; }
}

async function call(post, payload) {
  let res;
  try {
    res = await post(JSON.stringify(payload));
  } catch {
    throw new RelayError('No connection. Check your internet and try again.', 0);
  }
  let data;
  try { data = await res.json(); } catch { throw new RelayError(RELAY_MISSING, res.status); }
  if (!res.ok) throw new RelayError(data?.error || 'The school connection service refused the request.', res.status);
  return data;
}

/** Fetcher in the shape Pawnote expects: (req) => {status, content, headers}. */
export function relayFetcherFor(post) {
  return async (req) => {
    let content = req.content;
    if (content != null && typeof content !== 'string') {
      // Pawnote only uploads files when a student hands in homework, which the app never does.
      throw new RelayError('Sending files to Pronote is not supported.', 0);
    }
    const data = await call(post, {
      url: req.url.href ?? String(req.url),
      method: req.method || 'GET',
      headers: plainHeaders(req.headers),
      content,
      redirect: req.redirect,
    });
    return { status: data.status, content: data.content ?? '', headers: data.headers || {} };
  };
}

/** Downloads a Pronote attachment through the relay. Resolves to {bytes: Uint8Array, type}. */
export async function relayDownload(post, url) {
  const data = await call(post, { url, method: 'GET', headers: {}, binary: true });
  if (data.status >= 400) throw new RelayError(`Pronote refused the file (${data.status}).`, data.status);
  const bin = atob(data.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: (data.headers['content-type'] || 'application/octet-stream').split(';')[0] };
}

export const RELAY_MISSING = 'This copy of the app has no Pronote relay, so it can’t reach Pronote. It must run with its relay function: locally with “node scripts/dev-server.mjs”, or on Netlify deployed from GitHub (not drag-and-drop). See SCHOOL.md.';

/** True when /api/pronote is our relay (it answers GET with a JSON 405). */
export async function relayAvailable() {
  if (location.protocol === 'file:') return false;
  try {
    const r = await fetch('/api/pronote', { method: 'GET', cache: 'no-store' });
    return r.status === 405 && (r.headers.get('content-type') || '').includes('json');
  } catch { return false; }
}

/** The relay as used by the web app. */
export const webPost = (body) => fetch('/api/pronote', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
