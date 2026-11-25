// Translator & smart dictionary: floating button, compact popover, word pop-ups from the editor.
import { h, ic, iconBtn, popover, closePopover, segmented, select, toast, esc, uid } from '../util.js';
import { S, saveKV, setSetting } from '../store.js';
import { generateJSON, generate, hasAI } from '../ai/gemini.js';
import { guessLang } from '../editor/text.js';

export const LANG_NAMES = {
  auto: 'Detect language', en: 'English', es: 'Spanish', fr: 'French', ar: 'Arabic', de: 'German', it: 'Italian', pt: 'Portuguese',
  nl: 'Dutch', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', tr: 'Turkish', hi: 'Hindi', ur: 'Urdu', fa: 'Persian',
  he: 'Hebrew', el: 'Greek', pl: 'Polish', sv: 'Swedish', uk: 'Ukrainian', ro: 'Romanian', ca: 'Catalan', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai',
};
const TTS_LANG = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', ar: 'ar-SA', de: 'de-DE', it: 'it-IT', pt: 'pt-PT', nl: 'nl-NL', ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', tr: 'tr-TR', hi: 'hi-IN', ur: 'ur-PK', fa: 'fa-IR', he: 'he-IL', el: 'el-GR', pl: 'pl-PL', sv: 'sv-SE', uk: 'uk-UA', ro: 'ro-RO', ca: 'ca-ES', id: 'id-ID', vi: 'vi-VN', th: 'th-TH' };

export function speak(text, lang) {
  if (!('speechSynthesis' in window)) return toast('Speech isn’t available on this device.');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = TTS_LANG[lang] || lang || 'en-US';
  const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith(u.lang.slice(0, 2)));
  if (v) u.voice = v;
  u.rate = 0.92;
  speechSynthesis.speak(u);
}

/* ---------------- translation ---------------- */
export async function translate(text, target, source = 'auto') {
  text = text.trim();
  if (!text) throw new Error('Type something to translate.');
  if (hasAI()) {
    const r = await generateJSON({
      system: 'You are a professional translator and language teacher. Translations must be accurate and natural. Never add content.',
      prompt: `Translate from ${source === 'auto' ? 'the detected language' : LANG_NAMES[source]} into ${LANG_NAMES[target]}.
Reply JSON: {"detected":"ISO 639-1 code of the source","translation":"...","pronunciation":"romanisation or simple pronunciation guide of the translation if the target uses a non-Latin script or is a single word/short phrase, else empty","alternatives":["up to 3 other valid translations"],"synonyms":["up to 5 synonyms in the target language, only for single words/short phrases"],"examples":[{"source":"example sentence in source language","target":"its translation"}] (2 examples for words/phrases, none for long text),"note":"one short usage note if genuinely useful (register, false friend, gender), else empty"}
Text:
${text}`,
      temperature: 0.2,
    });
    return { ...r, engine: 'Gemini', target, text };
  }
  const src = source === 'auto' ? (guessLang(text) || 'Autodetect') : source;
  if (src === target) return { detected: src, translation: text, alternatives: [], synonyms: [], examples: [], note: 'The text is already in ' + LANG_NAMES[target] + '.', engine: 'MyMemory', target, text };
  let j;
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${src}|${target}`);
    j = await res.json();
  } catch { throw new Error('Translation needs an internet connection.'); }
  const out = j.responseData?.translatedText || '';
  if (/^PLEASE SELECT TWO DISTINCT/i.test(out)) return { detected: target, translation: text, alternatives: [], synonyms: [], examples: [], note: 'This already looks like ' + LANG_NAMES[target] + '. Pick another target language.', engine: 'MyMemory', target, text };
  if (j.responseStatus !== 200 || !out || /^(PLEASE SELECT|MYMEMORY WARNING|INVALID)/i.test(out)) throw new Error('The free translation service couldn’t translate that. Add a Gemini key in Settings for better translations.');
  const detected = j.responseData?.detectedLanguage?.split('-')[0] || (src === 'Autodetect' ? '' : src);
  const alts = [...new Set((j.matches || []).map((m) => m.translation).filter((t) => t && t !== out))].slice(0, 3);
  return { detected, translation: out, alternatives: alts, synonyms: [], examples: [], note: text.length > 480 ? 'Only the first 480 characters were translated (free service limit).' : '', engine: 'MyMemory', target, text };
}

/* ---------------- dictionary (real dictionary data first) ---------------- */
function strip(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.trim(); }

export async function lookup(word, lang = 'auto') {
  word = word.trim().replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '');
  if (!word) throw new Error('Type a word to look up.');
  const l = lang === 'auto' ? (guessLang(word) || 'en') : lang;
  const out = { word, lang: l, phonetic: '', audio: '', meanings: [], synonyms: [], antonyms: [], origin: '', source: '' };
  if (l === 'en') {
    try {
      const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word.toLowerCase()));
      if (r.ok) {
        const arr = await r.json();
        const e = arr[0];
        out.word = e.word;
        out.phonetic = e.phonetic || e.phonetics?.find((p) => p.text)?.text || '';
        out.audio = e.phonetics?.find((p) => p.audio)?.audio || '';
        out.origin = e.origin || '';
        for (const en of arr) for (const m of en.meanings) {
          out.meanings.push({ pos: m.partOfSpeech, defs: m.definitions.slice(0, 4).map((d) => ({ def: d.definition, ex: d.example || '' })) });
          out.synonyms.push(...(m.synonyms || []), ...m.definitions.flatMap((d) => d.synonyms || []));
          out.antonyms.push(...(m.antonyms || []), ...m.definitions.flatMap((d) => d.antonyms || []));
        }
        out.source = 'Free Dictionary API (Wiktionary data)';
      }
    } catch { /* fall back */ }
  }
  if (!out.meanings.length) {
    try {
      const r = await fetch('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(word), { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const entries = j[l] || j[Object.keys(j)[0]] || [];
        for (const e of entries.slice(0, 4)) out.meanings.push({ pos: e.partOfSpeech, defs: (e.definitions || []).filter((d) => strip(d.definition)).slice(0, 4).map((d) => ({ def: strip(d.definition), ex: d.examples?.[0] ? strip(d.examples[0]) : '' })) });
        if (out.meanings.length) out.source = 'Wiktionary';
      }
    } catch { /* fall back */ }
  }
  out.synonyms = [...new Set(out.synonyms)].slice(0, 10);
  out.antonyms = [...new Set(out.antonyms)].slice(0, 8);
  return out;
}

/** Extra help from Gemini: simple explanation, context meaning, synonyms/antonyms/origin if the dictionary lacked them. */
export async function explainWord(word, lang, context = '') {
  return generateJSON({
    prompt: `For the ${LANG_NAMES[lang] || ''} word or phrase "${word}"${context ? ` as used in: "${context.slice(0, 400)}"` : ''}, reply JSON:
{"simple":"a one-sentence simple explanation in English","inContext":"what it means in that context (empty if no context)","pos":"part of speech","phonetic":"IPA","synonyms":["..."],"antonyms":["..."],"origin":"brief etymology if well known, else empty","examples":["2 natural example sentences in ${LANG_NAMES[lang] || 'the same language'}"]}
Be accurate; leave a field empty rather than guess.`,
    temperature: 0.2,
  });
}

/* ---------------- history & favourites ---------------- */
function remember(entry) {
  const t = S.translations;
  t.history = [{ id: uid('t_'), at: Date.now(), ...entry }, ...t.history.filter((x) => !(x.text === entry.text && x.target === entry.target))].slice(0, 200);
  saveKV('translations');
}
function toggleFav(entry) {
  const t = S.translations;
  const i = t.favorites.findIndex((x) => x.text === entry.text && x.result === entry.result);
  if (i >= 0) t.favorites.splice(i, 1); else t.favorites.unshift({ id: uid('f_'), at: Date.now(), ...entry });
  saveKV('translations');
  return i < 0;
}

/* ---------------- UI: translator panel (used in popover and full page) ---------------- */
export function translatorPanel({ initial = '', mode = 'translate', onInsert = null, compact = true } = {}) {
  const wrap = h('div');
  let tab = mode;
  const tabs = h('div.tr-tabs', segmented([{ value: 'translate', label: 'Translate' }, { value: 'define', label: 'Dictionary' }, { value: 'saved', label: 'Saved' }], tab, (v) => { tab = v; draw(); }));
  const body = h('div.tr-body');
  wrap.append(tabs, body);
  let text = initial;
  const draw = () => {
    body.innerHTML = '';
    if (tab === 'translate') drawTranslate();
    else if (tab === 'define') drawDefine();
    else drawSaved();
  };
  function drawTranslate() {
    const cfg = S.settings.translator;
    const src = select(Object.entries(LANG_NAMES).map(([v, l]) => ({ value: v, label: l })), cfg.source || 'auto', (v) => setSetting('translator.source', v), 'sm');
    const tgt = select(Object.entries(LANG_NAMES).filter(([v]) => v !== 'auto').map(([v, l]) => ({ value: v, label: l })), cfg.target || 'es', (v) => setSetting('translator.target', v), 'sm');
    const input = h('textarea.field', { rows: compact ? 3 : 6, placeholder: 'Type or paste a word, sentence or paragraph', on: { input: (e) => { text = e.target.value; } } });
    input.value = text;
    const out = h('div.tr-out', h('span.faint', 'The translation appears here.'));
    const goBtn = h('button.btn.primary.sm', { type: 'button', html: ic('languages') + '<span>Translate</span>', on: { click: run } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); });
    body.append(h('div.tr-langs', src, iconBtn('arrow-right', 'Swap languages', () => { if (src.value === 'auto') return; const a = src.value; src.value = tgt.value; tgt.value = a; setSetting('translator.source', src.value); setSetting('translator.target', tgt.value); }, 'sm'), tgt), input, h('div.tr-row', goBtn), out);
    async function run() {
      if (!input.value.trim()) return input.focus();
      out.innerHTML = '<span class="thinking"><i></i><i></i><i></i> Translating…</span>';
      goBtn.disabled = true;
      try {
        const r = await translate(input.value, tgt.value, src.value);
        remember({ kind: 'translate', text: r.text, result: r.translation, from: r.detected, target: r.target });
        out.innerHTML = '';
        const entry = { kind: 'translate', text: r.text, result: r.translation, from: r.detected, target: r.target };
        const fav = iconBtn('star', 'Save to favourites', () => { const on = toggleFav(entry); fav.classList.toggle('on', on); toast(on ? 'Saved' : 'Removed from saved'); }, 'sm');
        fav.classList.toggle('on', S.translations.favorites.some((x) => x.text === entry.text && x.result === entry.result));
        out.append(
          h('div.main-t', { dir: 'auto' }, r.translation),
          r.pronunciation ? h('div.pron', r.pronunciation) : null,
          h('div.tr-row', { style: { marginTop: '8px' } },
            iconBtn('volume', 'Listen', () => speak(r.translation, r.target), 'sm'),
            iconBtn('copy', 'Copy', () => navigator.clipboard?.writeText(r.translation).then(() => toast('Copied')), 'sm'),
            fav,
            onInsert ? h('button.btn.sm', { type: 'button', html: ic('plus') + '<span>Insert into notes</span>', on: { click: () => { onInsert(r.translation); closePopover(); } } }) : null),
          r.detected && src.value === 'auto' ? h('div.dict-src', `Detected: ${LANG_NAMES[r.detected] || r.detected} · ${r.engine}`) : h('div.dict-src', r.engine));
        if (r.alternatives?.length) out.append(h('div.tr-sec', 'Alternatives'), h('div.tr-alt', r.alternatives.map((a) => h('span.chip', a))));
        if (r.synonyms?.length) out.append(h('div.tr-sec', 'Synonyms'), h('div.tr-alt', r.synonyms.map((a) => h('span.chip', a))));
        if (r.examples?.length) out.append(h('div.tr-sec', 'Examples'), ...r.examples.map((e) => h('div.tr-ex', { dir: 'auto' }, e.source, h('br'), h('b', e.target))));
        if (r.note) out.append(h('div.tr-sec', 'Note'), h('div.tr-ex', r.note));
      } catch (e) { out.textContent = e.message; }
      goBtn.disabled = false;
    }
    if (text) run();
  }
  function drawDefine() {
    const lang = select([{ value: 'auto', label: 'Detect' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' }, { value: 'ar', label: 'Arabic' }, { value: 'de', label: 'German' }, { value: 'it', label: 'Italian' }, { value: 'pt', label: 'Portuguese' }], 'auto', () => {}, 'sm');
    const input = h('input.field', { type: 'search', placeholder: 'Look up a word', value: text.split(/\s+/).length <= 3 ? text : '' });
    const out = h('div');
    const goBtn = h('button.btn.primary.sm', { type: 'button', text: 'Look up', on: { click: run } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    body.append(h('div.tr-langs', input, lang, goBtn), out);
    async function run() {
      if (!input.value.trim()) return input.focus();
      out.innerHTML = '<span class="thinking"><i></i><i></i><i></i> Looking up…</span>';
      try {
        const d = await lookup(input.value, lang.value);
        out.innerHTML = '';
        out.append(renderEntry(d, { onInsert, context: '' }));
        remember({ kind: 'define', text: d.word, result: d.meanings[0]?.defs[0]?.def || '', from: d.lang, target: d.lang });
      } catch (e) { out.textContent = e.message; }
    }
    if (input.value) run();
  }
  function drawSaved() {
    const t = S.translations;
    const list = (arr, empty) => arr.length ? arr.slice(0, 60).map((x) => h('div.hist-row',
      h('div.hr-t', h('div', { dir: 'auto' }, x.text), h('div', { dir: 'auto' }, x.result || '')),
      h('span.badge', (x.kind === 'define' ? 'Dict · ' : '') + (LANG_NAMES[x.target] || x.target || '').slice(0, 3)),
      iconBtn('volume', 'Listen', () => speak(x.result || x.text, x.target), 'sm'))) : [h('p.muted', empty)];
    body.append(h('div.tr-sec', 'Favourites'), ...list(t.favorites, 'Star a translation to keep it here.'),
      h('div.tr-sec', { style: { marginTop: '14px' } }, 'History'), ...list(t.history, 'Nothing yet.'),
      t.history.length ? h('button.btn.sm.ghost', { type: 'button', text: 'Clear history', on: { click: () => { t.history = []; saveKV('translations'); draw(); } } }) : null);
  }
  draw();
  return wrap;
}

export function renderEntry(d, { onInsert, context }) {
  const box = h('div', { style: { display: 'grid', gap: '6px' } });
  box.append(h('div.dict-word', h('h3', { dir: 'auto' }, d.word), d.phonetic ? h('span.ph', d.phonetic) : null,
    iconBtn('volume', 'Pronounce', () => { if (d.audio) new Audio(d.audio).play().catch(() => speak(d.word, d.lang)); else speak(d.word, d.lang); }, 'sm')));
  if (!d.meanings.length) box.append(h('p.muted', { style: { margin: 0 } }, 'No dictionary entry found.'));
  for (const m of d.meanings) {
    box.append(h('div.dict-pos', m.pos || ''), h('ol.dict-def', m.defs.map((x) => h('li', { dir: 'auto' }, x.def, x.ex ? h('span.ex', '“' + x.ex + '”') : null))));
  }
  if (d.synonyms.length) box.append(h('div.tr-sec', 'Synonyms'), h('div.tr-alt', d.synonyms.map((s) => h('span.chip', s))));
  if (d.antonyms.length) box.append(h('div.tr-sec', 'Antonyms'), h('div.tr-alt', d.antonyms.map((s) => h('span.chip', s))));
  if (d.origin) box.append(h('div.tr-sec', 'Origin'), h('div.tr-ex', d.origin));
  if (d.source) box.append(h('div.dict-src', 'Source: ' + d.source));
  const extra = h('div');
  box.append(extra);
  if (hasAI()) {
    const more = h('button.btn.sm', { type: 'button', html: ic('sparkles') + '<span>Simple explanation & context</span>', on: { click: async () => {
      more.disabled = true;
      extra.innerHTML = '<span class="thinking"><i></i><i></i><i></i></span>';
      try {
        const x = await explainWord(d.word, d.lang, context);
        extra.innerHTML = '';
        extra.append(h('div.tr-sec', 'In simple words'), h('div.tr-ex', { style: { fontStyle: 'normal' } }, x.simple || ''));
        if (x.inContext) extra.append(h('div.tr-sec', 'In your notes'), h('div.tr-ex', { style: { fontStyle: 'normal' } }, x.inContext));
        if (!d.meanings.length && x.pos) extra.append(h('div.dict-pos', x.pos));
        if (!d.phonetic && x.phonetic) extra.append(h('div.pron', x.phonetic));
        if (!d.synonyms.length && x.synonyms?.length) extra.append(h('div.tr-sec', 'Synonyms'), h('div.tr-alt', x.synonyms.map((s) => h('span.chip', s))));
        if (!d.antonyms.length && x.antonyms?.length) extra.append(h('div.tr-sec', 'Antonyms'), h('div.tr-alt', x.antonyms.map((s) => h('span.chip', s))));
        if (!d.origin && x.origin) extra.append(h('div.tr-sec', 'Origin'), h('div.tr-ex', x.origin));
        if (x.examples?.length) extra.append(h('div.tr-sec', 'Examples'), ...x.examples.map((e) => h('div.tr-ex', { dir: 'auto' }, e)));
        extra.append(h('div.dict-src', 'Explanation by Gemini — check important details.'));
      } catch (e) { extra.textContent = e.message; }
    } } });
    box.append(more);
  }
  if (onInsert && d.meanings[0]) box.append(h('button.btn.sm', { type: 'button', html: ic('plus') + '<span>Insert definition</span>', on: { click: () => { onInsert(d.meanings[0].defs[0].def); closePopover(); } } }));
  return box;
}

/* ---------------- floating button ---------------- */
let fab;
export function mountFab() {
  if (fab) return;
  fab = h('button.tr-fab', { type: 'button', title: 'Translate & define', 'aria-label': 'Translate and define', html: ic('languages'), on: { click: () => toggleTranslator() } });
  document.body.append(fab);
}
export function toggleTranslator(initial = '') {
  if (document.querySelector('.tr-pop')) { closePopover(); return; }
  const pop = popover(fab, translatorPanel({ initial }), { place: 'top', cls: 'tr-pop' });
  pop.el.dataset.tint = S.settings.translator.tint || 'theme';
  const r = fab.getBoundingClientRect();
  pop.el.style.left = Math.max(8, r.right - pop.el.offsetWidth) + 'px';
  pop.el.style.top = Math.max(8, r.top - pop.el.offsetHeight - 10) + 'px';
}

/** Compact pop-up for a selected word/phrase in the notes. */
export function wordPopover(anchor, text, mode, insert) {
  text = (text || '').trim();
  if (!text) { toast('Select a word first.'); return; }
  const host = h('div.word-pop');
  const sel = window.getSelection();
  const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : anchor.getBoundingClientRect();
  const pop = popover(rect.width ? rect : anchor, host, { place: 'bottom', cls: 'tr-pop' });
  pop.el.dataset.tint = S.settings.translator.tint || 'theme';
  let cur = mode;
  const tabs = segmented([{ value: 'translate', label: 'Translate' }, { value: 'define', label: 'Define' }, { value: 'synonyms', label: 'Synonyms' }], mode, (v) => { cur = v; run(); });
  const out = h('div', { style: { marginTop: '10px' } });
  host.append(tabs, out);
  const context = sel.anchorNode?.parentElement?.closest('p,li,td,th,h1,h2,h3,h4,blockquote')?.textContent || '';
  async function run() {
    out.innerHTML = '<span class="thinking"><i></i><i></i><i></i></span>';
    try {
      if (cur === 'translate') {
        const r = await translate(text, S.settings.translator.target || 'es');
        remember({ kind: 'translate', text, result: r.translation, from: r.detected, target: r.target });
        out.innerHTML = '';
        out.append(h('div.tr-out', h('div.main-t', { dir: 'auto' }, r.translation), r.pronunciation ? h('div.pron', r.pronunciation) : null),
          r.alternatives?.length ? h('div.tr-alt', { style: { marginTop: '8px' } }, r.alternatives.map((a) => h('span.chip', a))) : null,
          h('div.wp-actions',
            iconBtn('volume', 'Listen', () => speak(r.translation, r.target), 'sm'),
            h('button.btn.sm', { type: 'button', html: ic('plus') + '<span>Insert</span>', on: { click: () => { insert(r.translation); closePopover(); } } }),
            h('button.btn.sm.ghost', { type: 'button', text: 'To: ' + (LANG_NAMES[r.target] || r.target), on: { click: () => { closePopover(); toggleTranslator(text); } } })));
      } else if (cur === 'define') {
        const d = await lookup(text.split(/\s+/).length > 3 ? text.split(/\s+/)[0] : text);
        out.innerHTML = '';
        out.append(renderEntry(d, { onInsert: insert, context }));
      } else {
        let d = await lookup(text);
        let syn = d.synonyms;
        if (!syn.length && hasAI()) { const x = await explainWord(text, d.lang, context); syn = x.synonyms || []; d.antonyms = d.antonyms.length ? d.antonyms : x.antonyms || []; }
        out.innerHTML = '';
        if (!syn.length) out.append(h('p.muted', 'No synonyms found.'));
        out.append(h('div.tr-alt', syn.map((s) => h('button.chip', { type: 'button', title: 'Replace the selected word', on: { click: () => { insertReplace(s); } } }, s))));
        if (d.antonyms.length) out.append(h('div.tr-sec', { style: { marginTop: '10px' } }, 'Antonyms'), h('div.tr-alt', d.antonyms.map((s) => h('span.chip', s))));
        out.append(h('p.faint', { style: { fontSize: '12px', margin: '8px 0 0' } }, 'Tap a synonym to replace your selection.'));
      }
    } catch (e) { out.textContent = e.message; }
    pop.reposition();
  }
  function insertReplace(s) {
    closePopover();
    document.dispatchEvent(new CustomEvent('folio-replace-selection', { detail: s }));
  }
  run();
}
