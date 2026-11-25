// Pronote relay.
//
// Browsers can't talk to Pronote directly: Pronote sends no CORS headers, and the
// Pronote protocol needs Cookie / Set-Cookie headers that browsers hide from scripts.
// So the app runs the Pronote client (Pawnote) on the student's device and sends each
// raw HTTP request here; this function performs it and hands back status, headers and body.
//
// It never logs in by itself, never stores anything and keeps no state between calls.
// Pronote encrypts its own traffic after the handshake, and the password is never sent
// in clear: Pronote uses a challenge, so this relay only ever sees ciphertext and tokens.
//
// In the native (Capacitor) app this relay is not needed: requests go out through the
// phone's native HTTP stack instead.

const MAX_BODY = 2_000_000;          // bytes accepted from the app
const MAX_FILE = 15_000_000;         // bytes returned for attachments
const TIMEOUT_MS = 20_000;
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade', 'accept-encoding', 'origin', 'referer']);

/** Only Pronote servers: Index Éducation's hosting, or any server path under /pronote/. */
export function isPronoteURL(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (/^(localhost|.*\.local|.*\.internal)$/.test(host)) return false;
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false; // no raw IPs
  if (host === 'index-education.net' || host.endsWith('.index-education.net')) return true;
  return /\/pronote(\/|$)/i.test(u.pathname);
}

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'Request too large' });
  let r;
  try { r = JSON.parse(raw); } catch { return json(400, { error: 'Bad JSON' }); }
  if (!isPronoteURL(r.url)) return json(403, { error: 'Only Pronote addresses can be reached' });

  const method = String(r.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) return json(400, { error: 'Unsupported method' });
  const headers = {};
  for (const [k, v] of Object.entries(r.headers || {})) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = String(v);
  }

  // Redirects are followed by hand so every hop is checked against the Pronote rule.
  let res;
  let url = r.url;
  let m = method;
  let body = method === 'POST' ? (r.content ?? '') : undefined;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    for (let hop = 0; ; hop++) {
      res = await fetch(url, { method: m, headers, body, redirect: 'manual', signal });
      const loc = res.headers.get('location');
      if (r.redirect === 'manual' || !loc || res.status < 300 || res.status > 399) break;
      if (hop >= 5) return json(508, { error: 'Too many redirects' });
      const next = new URL(loc, url).href;
      if (!isPronoteURL(next)) return json(403, { error: 'Pronote redirected outside Pronote' });
      if (res.status !== 307 && res.status !== 308) { m = 'GET'; body = undefined; }
      url = next;
    }
  } catch (e) {
    return json(502, { error: 'Could not reach the Pronote server', detail: String(e?.cause?.code || e?.name || e) });
  }

  // Redirects must stay on Pronote too, otherwise the app could be bounced elsewhere.
  const location = res.headers.get('location');
  const outHeaders = {};
  res.headers.forEach((v, k) => { if (k !== 'set-cookie') outHeaders[k] = v; });
  if (location) outHeaders.location = new URL(location, url).href;
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (cookies.length) outHeaders['set-cookie'] = cookies.join(', ');

  if (r.binary) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FILE) return json(413, { error: 'File too large' });
    return json(200, { status: res.status, headers: outHeaders, base64: buf.toString('base64'), url });
  }
  return json(200, { status: res.status, headers: outHeaders, content: await res.text(), url });
}

export const config = { path: '/api/pronote' };
