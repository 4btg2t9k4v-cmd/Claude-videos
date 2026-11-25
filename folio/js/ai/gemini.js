// Google Gemini client (REST, called straight from the browser with the user's own key).
import { S, setSetting } from '../store.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class AIError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const hasAI = () => !!S.settings?.ai?.key;

function key() {
  const k = S.settings.ai.key;
  if (!k) throw new AIError('no_key', 'Add your free Gemini key in Settings → AI to use this.');
  return k;
}

/** List models usable for text generation; returns [{id, label}] */
export async function listModels(apiKey = key()) {
  let res;
  try {
    res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  } catch {
    throw new AIError('network', 'Could not reach Google. Check your internet connection.');
  }
  if (!res.ok) throw await toError(res);
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .filter((m) => /gemini/i.test(m.name) && !/(tts|image|embedding|live|audio|aqa|robotics|computer)/i.test(m.name))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name, out: m.outputTokenLimit || 8192, in: m.inputTokenLimit || 0 }));
}

/** Pick a sensible default: the newest stable "flash" model (fast and free-tier friendly). */
export function pickDefaultModel(models) {
  const score = (id) => {
    const v = parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
    let s = v * 10;
    if (/flash/.test(id)) s += 5;
    if (/lite/.test(id)) s -= 3;
    if (/pro/.test(id)) s -= 1; // pro has tight free limits
    if (/(preview|exp)/.test(id)) s -= 4;
    if (/-\d{3}$/.test(id)) s -= 0.5;
    return s;
  };
  return [...models].sort((a, b) => score(b.id) - score(a.id))[0]?.id || 'gemini-2.5-flash';
}

export async function connectKey(apiKey) {
  const models = await listModels(apiKey);
  if (!models.length) throw new AIError('no_models', 'This key works but has no text models available.');
  setSetting('ai.key', apiKey);
  setSetting('ai.models', models);
  if (!S.settings.ai.model || !models.some((m) => m.id === S.settings.ai.model)) setSetting('ai.model', pickDefaultModel(models));
  return models;
}

async function toError(res, model = S.settings.ai.model) {
  let body = {};
  try { body = await res.json(); } catch { /* ignore */ }
  const msg = String(body?.error?.message || res.statusText || '').slice(0, 180);
  const status = body?.error?.status || '';
  const why = ` (Google said: ${res.status}${msg ? ' — ' + msg : ''})`;
  let err;
  if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg + JSON.stringify(body))) err = new AIError('bad_key', 'Google rejected this API key. Copy it again from aistudio.google.com and paste it in Settings → AI.');
  else if (res.status === 403) err = new AIError('forbidden', 'This key is not allowed to use Gemini. Make sure the Generative Language API is enabled for it in Google AI Studio.' + why);
  else if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') err = new AIError('rate', 'You hit the free Gemini limit for now. Wait a minute and try again, or pick another model in Settings → AI.' + why);
  else if (res.status === 404) err = new AIError('model', `The model "${model}" is not available to your key. Pick another in Settings → AI.`);
  else if (res.status >= 500) err = new AIError('server', 'Google’s AI service is busy or had a problem. It was retried automatically; try again in a minute.' + why);
  else err = new AIError('request', (msg || 'The AI request failed.') + ` (${res.status})`);
  err.status = res.status;
  return err;
}

/** Another text model to try when the chosen one is overloaded or out of free quota. */
function fallbackModel(current, tried) {
  const avoid = new Set([current, ...tried]);
  const listed = (S.settings.ai.models || []).map((m) => m.id);
  const pool = listed.length ? listed : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
  const ok = pool.filter((id) => !avoid.has(id) && /flash/.test(id) && !/(preview|exp|image|tts|live|thinking|audio)/.test(id));
  if (!ok.length) return null;
  return pickDefaultModel(ok.map((id) => ({ id })));
}

function sleep(ms, signal) {
  return new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(new AIError('cancelled', 'Stopped.')); }, { once: true });
  });
}

/**
 * Generate text.
 * opts: {prompt, system, history:[{role:'user'|'model', text}], json, schema, files:[{mime, data(base64)}],
 *        temperature, onText(fullText), signal, model}
 */
export async function generate(opts) {
  const apiKey = key();
  let model = opts.model || S.settings.ai.model || 'gemini-2.5-flash';
  const contents = [];
  for (const m of opts.history || []) contents.push({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] });
  const parts = [];
  for (const f of opts.files || []) parts.push({ inline_data: { mime_type: f.mime, data: f.data } });
  parts.push({ text: opts.prompt });
  contents.push({ role: 'user', parts });
  const body = {
    contents,
    generationConfig: { temperature: opts.temperature ?? 0.4 },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.json) {
    body.generationConfig.responseMimeType = 'application/json';
    if (opts.schema) body.generationConfig.responseSchema = opts.schema;
  }
  const stream = typeof opts.onText === 'function';
  let res;
  const tried = [];
  // Busy (5xx) and quota (429) errors are common on the free tier: retry with back-off,
  // and move to another flash model (which has its own free quota) if one keeps failing.
  for (let attempt = 0; ; attempt++) {
    body.generationConfig.maxOutputTokens = Math.min(opts.maxTokens || 8192, S.settings.ai.models?.find((m) => m.id === model)?.out || 8192);
    const url = `${BASE}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new AIError('cancelled', 'Stopped.');
      if (attempt < 2) { await sleep(1500 * (attempt + 1), opts.signal); continue; }
      throw new AIError('network', 'Could not reach Google. Check your internet connection.');
    }
    if (res.ok) break;
    const err = await toError(res, model);
    const busy = err.code === 'server';
    const quota = err.code === 'rate';
    if ((!busy && !quota) || attempt >= 4) throw err;
    const alt = (quota || attempt >= 1) ? fallbackModel(model, tried) : null;
    if (quota && !alt) throw err;
    if (alt) { tried.push(model); console.info(`Gemini ${model} answered ${err.status}; trying ${alt}`); model = alt; }
    await sleep(quota ? 600 : 1200 * 2 ** attempt + Math.random() * 500, opts.signal);
  }
  opts.onModel?.(model);

  let text = '';
  let finish = '';
  let blocked = '';
  const take = (chunk) => {
    if (chunk.promptFeedback?.blockReason) blocked = chunk.promptFeedback.blockReason;
    const c = chunk.candidates?.[0];
    if (!c) return;
    if (c.finishReason) finish = c.finishReason;
    for (const p of c.content?.parts || []) if (p.text && !p.thought) text += p.text;
  };
  if (stream) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          try { take(JSON.parse(line.slice(5))); opts.onText(text); } catch { /* partial line */ }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') { const err = new AIError('cancelled', 'Stopped.'); err.partial = text; throw err; }
      throw new AIError('network', 'The connection dropped while the AI was answering.');
    }
  } else {
    take(await res.json());
  }
  if (blocked) throw new AIError('blocked', 'Gemini declined this request (' + blocked.toLowerCase() + '). Try rephrasing it.');
  if (!text.trim()) {
    if (finish === 'SAFETY') throw new AIError('blocked', 'Gemini declined to answer this for safety reasons.');
    throw new AIError('empty', 'The AI returned an empty answer. Try again.');
  }
  return { text, truncated: finish === 'MAX_TOKENS' };
}

/** Generate and parse JSON. */
export async function generateJSON(opts) {
  const { text } = await generate({ ...opts, json: true, onText: undefined });
  return parseJSON(text);
}

export function parseJSON(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const a = text.search(/[[{]/);
  const b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new AIError('bad_json', 'The AI answer could not be read. Try again.');
}

export function fileToPart(dataURL) {
  const [head, data] = dataURL.split(',');
  return { mime: head.match(/:(.*?);/)[1], data };
}
