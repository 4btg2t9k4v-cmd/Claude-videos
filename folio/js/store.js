import { idb, STORES } from './db.js';
import { uid, dayKey, debounce } from './util.js';
import { sanitizeStoredHTML } from './editor/text.js';

/* ------------------------------------------------------------------ */
/* In-memory state mirrored to IndexedDB. All mutations go through    */
/* the functions below so saving and the "Saved" indicator stay true. */
/* ------------------------------------------------------------------ */

export const S = {
  notebooks: new Map(),
  pages: new Map(),
  decks: new Map(),
  cards: new Map(),
  quizzes: new Map(),
  templates: new Map(),
  settings: null,
  activity: {},     // dayKey -> {min, cards, pages, quiz, edits}
  reminders: [],    // {id, title, due, notebookId, done}
  translations: { history: [], favorites: [] },
  personalDict: [],
};

export const DEFAULT_SETTINGS = {
  id: 'settings',
  name: '',
  theme: 'light',
  paperFollowsTheme: true,
  ai: { key: '', model: '', models: [] },
  writingLang: 'auto',
  autocorrect: true,
  liveCheck: false,
  pencilOnly: false,
  shortcuts: {},
  dashboard: { order: ['school', 'continue', 'notebooks', 'recentPages', 'favorites', 'activity', 'reminders', 'suggestions'], hidden: [] },
  timer: { focus: 25, short: 5, long: 15 },
  translator: { target: 'es', source: 'auto', tint: 'theme' },
  editorDefaults: { font: 'Newsreader', size: 18 },
  lastBackup: 0,
  onboarded: false,
};

/* ---------- events ---------- */
const listeners = {};
export function on(evt, fn) { (listeners[evt] ||= new Set()).add(fn); return () => listeners[evt].delete(fn); }
export function emit(evt, data) { (listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }

/* ---------- save status ---------- */
let pending = 0;
let lastError = null;
function track(p) {
  pending++;
  emit('save', { state: 'saving' });
  return p.then((v) => {
    pending--;
    if (!pending) emit('save', { state: lastError ? 'error' : 'saved', at: Date.now() });
    return v;
  }, (e) => {
    pending--;
    lastError = e;
    console.error('Save failed', e);
    emit('save', { state: 'error', error: e });
    throw e;
  });
}
export const isSaving = () => pending > 0;

function persist(store, obj) { lastError = null; return track(idb.put(store, obj)); }
function remove(store, id) { return track(idb.del(store, id)); }

/* ---------- init ---------- */
export async function initStore() {
  const [nbs, pages, decks, cards, quizzes, templates, kv] = await Promise.all(
    ['notebooks', 'pages', 'decks', 'cards', 'quizzes', 'templates', 'kv'].map((s) => idb.all(s)));
  nbs.forEach((n) => S.notebooks.set(n.id, n));
  pages.forEach((p) => S.pages.set(p.id, p));
  decks.forEach((d) => S.decks.set(d.id, d));
  cards.forEach((c) => S.cards.set(c.id, c));
  quizzes.forEach((q) => S.quizzes.set(q.id, q));
  templates.forEach((t) => S.templates.set(t.id, t));
  const kvm = Object.fromEntries(kv.map((r) => [r.id, r]));
  S.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), kvm.settings || {});
  S.activity = kvm.activity?.data || {};
  S.reminders = kvm.reminders?.data || [];
  S.translations = kvm.translations?.data || { history: [], favorites: [] };
  S.personalDict = kvm.personalDict?.data || [];
  purgeTrash();
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* not critical */ }
}

function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v);
    else a[k] = v;
  }
  return a;
}

/* ---------- settings & kv ---------- */
const saveSettingsSoon = debounce(() => persist('kv', S.settings), 300);
export function setSetting(path, value) {
  const keys = path.split('.');
  let o = S.settings;
  for (const k of keys.slice(0, -1)) o = o[k] ||= {};
  o[keys.at(-1)] = value;
  saveSettingsSoon();
  emit('settings', { path, value });
}
export function saveKV(name) {
  const map = { activity: S.activity, reminders: S.reminders, translations: S.translations, personalDict: S.personalDict };
  return persist('kv', { id: name, data: map[name] });
}
const saveActivitySoon = debounce(() => saveKV('activity'), 1500);

/* ---------- activity log ---------- */
export function logActivity(kind, amount = 1) {
  const k = dayKey();
  const d = (S.activity[k] ||= { min: 0, cards: 0, pages: 0, quiz: 0, edits: 0 });
  d[kind] = (d[kind] || 0) + amount;
  saveActivitySoon();
  emit('activity');
}

/* ---------- notebooks ---------- */
export const COVER_COLORS = ['#7A2E3A', '#23395B', '#2F5D50', '#8C6A3F', '#4B3F72', '#9A4A2F', '#3F5F7A', '#5E6B3A', '#2B2B2E', '#B08968', '#6B4E71', '#1F6F78'];

export function createNotebook(data = {}) {
  const n = {
    id: uid('nb_'),
    title: data.title || 'Untitled notebook',
    description: data.description || '',
    color: data.color || COVER_COLORS[S.notebooks.size % COVER_COLORS.length],
    cover: data.cover || 'cloth',
    coverImage: data.coverImage || '',
    labelStyle: data.labelStyle || 'plate',
    subject: data.subject || '',
    lang: data.lang || 'auto',
    favorite: false,
    archived: false,
    deletedAt: 0,
    folders: [],
    toc: { title: 'Contents', hidden: [], showHeadings: true },
    paper: data.paper || { type: 'lined', color: '', texture: 'none', margin: 56, spacing: 32, border: 'none', layout: 'single', bgImage: '' },
    order: Date.now(),
    createdAt: Date.now(), updatedAt: Date.now(), openedAt: 0,
  };
  S.notebooks.set(n.id, n);
  persist('notebooks', n);
  emit('notebooks');
  return n;
}
export function updateNotebook(id, patch, quiet = false) {
  const n = S.notebooks.get(id);
  if (!n) return;
  Object.assign(n, patch, { updatedAt: Date.now() });
  persist('notebooks', n);
  if (!quiet) emit('notebooks');
  return n;
}
export function touchNotebook(id) {
  const n = S.notebooks.get(id);
  if (!n) return;
  n.openedAt = Date.now();
  persist('notebooks', n);
}
export function notebooks({ includeArchived = false } = {}) {
  return [...S.notebooks.values()].filter((n) => !n.deletedAt && (includeArchived || !n.archived)).sort((a, b) => a.order - b.order);
}
export function duplicateNotebook(id) {
  const src = S.notebooks.get(id);
  const copy = createNotebook({ ...structuredClone(src), title: src.title + ' (copy)' });
  const folderMap = {};
  copy.folders = src.folders.map((f) => { const nf = { ...f, id: uid('f_') }; folderMap[f.id] = nf.id; return nf; });
  updateNotebook(copy.id, { folders: copy.folders, toc: structuredClone(src.toc), paper: structuredClone(src.paper), cover: src.cover, coverImage: src.coverImage, description: src.description, subject: src.subject, lang: src.lang });
  for (const p of pagesOf(id)) {
    createPage(copy.id, { ...structuredClone(p), folderId: p.folderId ? folderMap[p.folderId] : null }, { quiet: true });
  }
  emit('pages');
  return copy;
}
export function trashNotebook(id) { updateNotebook(id, { deletedAt: Date.now() }); }
export function restoreNotebook(id) { updateNotebook(id, { deletedAt: 0 }); }
export function destroyNotebook(id) {
  for (const p of [...S.pages.values()].filter((p) => p.notebookId === id)) destroyPage(p.id, true);
  S.notebooks.delete(id);
  remove('notebooks', id);
  emit('notebooks');
}

/* ---------- pages ---------- */
export function createPage(notebookId, data = {}, { quiet = false } = {}) {
  const siblings = pagesOf(notebookId);
  const p = {
    id: uid('pg_'),
    notebookId,
    folderId: data.folderId ?? null,
    title: data.title ?? '',
    html: data.html ?? '',
    ink: data.ink || [],
    paper: data.paper || null,      // null = inherit notebook paper
    tags: data.tags || [],
    bookmarked: false,
    archived: false,
    lang: data.lang || '',
    deletedAt: 0,
    review: data.review || null,    // {next, step}
    kind: data.kind || '',          // 'pdf' for imported PDF pages
    order: data.order ?? (siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 1),
    createdAt: Date.now(), updatedAt: Date.now(), openedAt: 0,
  };
  S.pages.set(p.id, p);
  persist('pages', p);
  logActivity('pages');
  if (!quiet) emit('pages', { notebookId });
  return p;
}
export function updatePage(id, patch, { quiet = false } = {}) {
  const p = S.pages.get(id);
  if (!p) return;
  Object.assign(p, patch, { updatedAt: Date.now() });
  persist('pages', p);
  if (!quiet) emit('pages', { notebookId: p.notebookId, pageId: id });
  return p;
}
export function touchPage(id) {
  const p = S.pages.get(id);
  if (!p) return;
  p.openedAt = Date.now();
  persist('pages', p);
}
export function pagesOf(notebookId, { includeArchived = true } = {}) {
  return [...S.pages.values()].filter((p) => p.notebookId === notebookId && !p.deletedAt && (includeArchived || !p.archived)).sort((a, b) => a.order - b.order);
}
export function duplicatePage(id) {
  const p = S.pages.get(id);
  const copy = createPage(p.notebookId, { ...structuredClone(p), title: (p.title || 'Untitled') + ' (copy)', order: p.order + 0.5 });
  normalizeOrder(p.notebookId);
  return copy;
}
export function normalizeOrder(notebookId) {
  pagesOf(notebookId).forEach((p, i) => { if (p.order !== i + 1) { p.order = i + 1; persist('pages', p); } });
  emit('pages', { notebookId });
}
export function trashPage(id) { updatePage(id, { deletedAt: Date.now() }); }
export function restorePage(id) {
  const p = S.pages.get(id);
  const nb = S.notebooks.get(p.notebookId);
  if (nb?.deletedAt) restoreNotebook(nb.id);
  updatePage(id, { deletedAt: 0 });
}
export function destroyPage(id, quiet = false) {
  S.pages.delete(id);
  remove('pages', id);
  idb.byIndex('versions', 'pageId', id).then((vs) => idb.delMany('versions', vs.map((v) => v.id)));
  if (!quiet) emit('pages', {});
}
function purgeTrash() {
  const cutoff = Date.now() - 30 * 86400000;
  for (const p of [...S.pages.values()]) if (p.deletedAt && p.deletedAt < cutoff) destroyPage(p.id, true);
  for (const n of [...S.notebooks.values()]) if (n.deletedAt && n.deletedAt < cutoff) destroyNotebook(n.id);
}

/* ---------- versions ---------- */
const lastVersionAt = {};
export async function snapshotVersion(page, force = false) {
  const last = lastVersionAt[page.id] || 0;
  if (!force && Date.now() - last < 4 * 60000) return;
  lastVersionAt[page.id] = Date.now();
  const v = { id: uid('v_'), pageId: page.id, ts: Date.now(), title: page.title, html: page.html, ink: page.ink, paper: page.paper };
  await track(idb.put('versions', v));
  const all = (await idb.byIndex('versions', 'pageId', page.id)).sort((a, b) => b.ts - a.ts);
  if (all.length > 40) await idb.delMany('versions', all.slice(40).map((x) => x.id));
}
export async function versionsOf(pageId) {
  return (await idb.byIndex('versions', 'pageId', pageId)).sort((a, b) => b.ts - a.ts);
}

/* ---------- templates ---------- */
export function saveTemplate(t) {
  const tpl = { id: t.id || uid('tp_'), name: t.name, paper: t.paper, html: t.html || '', createdAt: Date.now() };
  S.templates.set(tpl.id, tpl);
  persist('templates', tpl);
  emit('templates');
  return tpl;
}
export function deleteTemplate(id) { S.templates.delete(id); remove('templates', id); emit('templates'); }

/* ---------- flashcards ---------- */
export function createDeck(data = {}) {
  const d = { id: uid('dk_'), name: data.name || 'New deck', notebookId: data.notebookId || '', color: data.color || '', createdAt: Date.now(), updatedAt: Date.now(), source: data.source || '' };
  S.decks.set(d.id, d);
  persist('decks', d);
  emit('decks');
  return d;
}
export function updateDeck(id, patch) { const d = S.decks.get(id); Object.assign(d, patch, { updatedAt: Date.now() }); persist('decks', d); emit('decks'); }
export function deleteDeck(id) {
  for (const c of cardsOf(id)) { S.cards.delete(c.id); remove('cards', c.id); }
  S.decks.delete(id); remove('decks', id); emit('decks');
}
export function cardsOf(deckId) { return [...S.cards.values()].filter((c) => c.deckId === deckId).sort((a, b) => a.createdAt - b.createdAt); }
export function createCard(deckId, data) {
  const c = {
    id: uid('cd_'), deckId,
    type: data.type || 'qa', front: data.front || '', back: data.back || '', options: data.options || [], answer: data.answer ?? 0,
    image: data.image || '', topic: data.topic || '', difficulty: data.difficulty || 'medium', hint: data.hint || '',
    srs: { due: Date.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0 },
    stats: { correct: 0, wrong: 0, last: 0 },
    createdAt: Date.now() + Math.random(),
  };
  S.cards.set(c.id, c);
  persist('cards', c);
  return c;
}
export function updateCard(id, patch) { const c = S.cards.get(id); Object.assign(c, patch); persist('cards', c); emit('cards'); return c; }
export function deleteCard(id) { S.cards.delete(id); remove('cards', id); emit('cards'); }

/** SM-2 style scheduling. grade: 0 again, 1 hard, 2 good, 3 easy */
export function gradeCard(id, grade) {
  const c = S.cards.get(id);
  const s = { ...c.srs };
  const day = 86400000;
  if (grade === 0) {
    s.lapses++; s.reps = 0; s.interval = 0; s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = Date.now() + 60 * 1000;
  } else {
    s.reps++;
    if (s.reps === 1) s.interval = grade === 3 ? 3 : 1;
    else if (s.reps === 2) s.interval = grade === 1 ? 2 : grade === 3 ? 7 : 4;
    else s.interval = Math.round(s.interval * (grade === 1 ? 1.2 : grade === 3 ? s.ease * 1.3 : s.ease));
    s.ease = Math.max(1.3, s.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
    s.due = Date.now() + s.interval * day;
  }
  const stats = { ...c.stats, last: Date.now() };
  if (grade === 0) stats.wrong++; else stats.correct++;
  updateCard(id, { srs: s, stats });
  logActivity('cards');
}
export function dueCards(deckId) {
  const now = Date.now();
  return [...S.cards.values()].filter((c) => (!deckId || c.deckId === deckId) && c.srs.due <= now);
}

/* ---------- quizzes ---------- */
export function saveQuiz(q) {
  q.id ||= uid('qz_');
  q.createdAt ||= Date.now();
  S.quizzes.set(q.id, q);
  persist('quizzes', q);
  emit('quizzes');
  return q;
}
export function deleteQuiz(id) { S.quizzes.delete(id); remove('quizzes', id); emit('quizzes'); }

/* ---------- reminders ---------- */
export function addReminder(r) { S.reminders.push({ id: uid('rm_'), done: false, ...r }); saveKV('reminders'); emit('reminders'); }
export function updateReminder(id, patch) { Object.assign(S.reminders.find((r) => r.id === id), patch); saveKV('reminders'); emit('reminders'); }
export function deleteReminder(id) { S.reminders = S.reminders.filter((r) => r.id !== id); saveKV('reminders'); emit('reminders'); }

/* ---------- backup ---------- */
export async function exportAll() {
  const out = { app: 'study-notebook', version: 1, exportedAt: Date.now() };
  for (const s of STORES) out[s] = await idb.all(s);
  // never put the API key or school logins into a backup file
  out.kv = out.kv.filter((r) => r.id !== 'schoolAuth').map((r) => (r.id === 'settings' ? { ...r, ai: { ...(r.ai || {}), key: '' } } : r));
  return out;
}
export async function importAll(data, { replace = false } = {}) {
  if (data?.app !== 'study-notebook') throw new Error('This file is not a Study Notebook backup.');
  for (const s of STORES) {
    if (!Array.isArray(data[s])) continue;
    if (replace) await idb.clear(s);
    let rows = s === 'kv' ? data[s].filter((r) => r.id !== 'schoolAuth').map((r) => (r.id === 'settings' ? { ...r, ai: { ...(r.ai || {}), key: S.settings.ai.key, models: S.settings.ai.models, model: S.settings.ai.model } } : r)) : data[s];
    if (['pages', 'templates', 'versions'].includes(s)) rows = rows.map((r) => ({ ...r, html: sanitizeStoredHTML(r.html) }));
    await idb.putMany(s, rows);
  }
}
