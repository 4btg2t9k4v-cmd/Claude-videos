import { S, on, notebooks, pagesOf, setSetting, updateNotebook, duplicateNotebook, trashNotebook, restoreNotebook, dueCards, createPage, addReminder, updateReminder, deleteReminder } from '../store.js';
import { h, ic, esc, menu, timeAgo, htmlToText, dayKey, toast, sheet, field, fmtDate, select } from '../util.js';
import { go, menuButton, savePill } from '../main.js';
import { coverEl, notebookDialog } from './nbdialogs.js';
import { hasAI, generate } from '../ai/gemini.js';
import { renderMarkdown } from '../tools/md.js';

const SECTIONS = {
  continue: { title: 'Pick up where you left off', size: 'full' },
  notebooks: { title: 'My notebooks', size: 'full' },
  recentPages: { title: 'Recent pages', size: 'half' },
  favorites: { title: 'Favorites & bookmarks', size: 'half' },
  activity: { title: 'Study activity', size: 'half' },
  reminders: { title: 'Coming up', size: 'half' },
  suggestions: { title: 'What to study next', size: 'full' },
};

export function notebookMenu(anchor, n) {
  menu(anchor, [
    { label: 'Open', icon: 'book', run: () => go('#/nb/' + n.id) },
    { label: 'Edit cover & details', icon: 'palette', run: () => notebookDialog(n) },
    { label: n.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star', run: () => updateNotebook(n.id, { favorite: !n.favorite }) },
    { label: 'Duplicate', icon: 'copy', run: () => { const c = duplicateNotebook(n.id); toast(`Made a copy: ${c.title}`); } },
    { label: n.archived ? 'Unarchive' : 'Archive', icon: 'archive', run: () => { updateNotebook(n.id, { archived: !n.archived }); toast(n.archived ? 'Notebook archived' : 'Notebook restored'); } },
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, run: () => { trashNotebook(n.id); toast(`“${n.title}” moved to Recently deleted`, { action: { label: 'Undo', run: () => restoreNotebook(n.id) } }); } },
  ]);
}

export function notebookCard(n) {
  const pages = pagesOf(n.id).length;
  const card = h('div.nb-card',
    h('a', { href: '#/nb/' + n.id, 'aria-label': 'Open ' + n.title, style: { display: 'block' } }, coverEl(n)),
    h('div.nb-meta',
      h('div.t', h('b', n.title), h('span', `${pages} page${pages === 1 ? '' : 's'} · ${timeAgo(n.openedAt || n.updatedAt)}`)),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Notebook options', html: ic('more'), on: { click: (e) => notebookMenu(e.currentTarget, n) } })));
  let t;
  card.addEventListener('contextmenu', (e) => { e.preventDefault(); notebookMenu({ left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY, width: 0, height: 0 }, n); });
  card.addEventListener('touchstart', (e) => { t = setTimeout(() => { const r = card.getBoundingClientRect(); notebookMenu({ left: r.left + 20, right: r.left + 20, top: r.top + 40, bottom: r.top + 40, width: 0, height: 0 }, n); }, 600); }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => card.addEventListener(ev, () => clearTimeout(t), { passive: true }));
  return card;
}

export function newNotebookTile() {
  return h('button.new-nb', { type: 'button', on: { click: () => notebookDialog() } }, h('span', { html: ic('plus') }), h('span', 'New notebook'));
}

export async function render(main) {
  const view = h('div.view');
  main.append(view);
  const pad = h('div.view-pad');
  view.append(pad);
  let editing = false;

  const draw = () => {
    pad.innerHTML = '';
    const hour = new Date().getHours();
    const part = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = S.settings.name ? `, <em>${esc(S.settings.name)}</em>` : '';
    const due = dueCards().length;
    const sub = [fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })];
    if (due) sub.push(`${due} flashcard${due === 1 ? '' : 's'} due`);
    const pill = savePill();
    pad.append(
      h('div.topbar', { style: { marginBottom: '8px' } }, menuButton(), h('div', { style: { flex: 1 } }), pill,
        h('button.btn.ghost.sm', { type: 'button', html: ic('layout') + `<span>${editing ? 'Done' : 'Arrange'}</span>`, on: { click: () => { editing = !editing; draw(); } } })),
      h('div.home-head',
        h('div.greet', h('h1', { html: part + name }), h('p', sub.join(' · '))),
        h('div.quick',
          h('button.btn.primary', { type: 'button', html: ic('plus') + '<span>New notebook</span>', on: { click: () => notebookDialog() } }),
          h('button.btn', { type: 'button', html: ic('file-plus') + '<span>New page</span>', on: { click: quickPage } }),
          h('button.btn', { type: 'button', html: ic('sparkles') + '<span>Create notes with AI</span>', on: { click: () => import('../ai/notes.js').then((m) => m.createNotesDialog()) } }),
          h('button.btn', { type: 'button', html: ic('cards') + '<span>Flashcards</span>', on: { click: () => go('#/cards') } }),
          h('button.btn', { type: 'button', html: ic('quiz') + '<span>Quiz me</span>', on: { click: () => import('./quiz.js').then((m) => m.quizSetupDialog()) } }),
        ),
      ),
    );
    if (!notebooks().length) {
      pad.append(welcome());
      return;
    }
    if (Date.now() - (S.settings.lastBackup || 0) > 14 * 86400000 && S.pages.size > 3) {
      pad.append(h('div.banner', h('span', { html: ic('save') }),
        h('p', 'Your notes live on this iPad. Save a backup file to iCloud Drive every couple of weeks so nothing can be lost.'),
        h('a.btn.sm', { href: '#/settings/data' }, 'Back up now')));
    }
    const grid = h('div.home-grid' + (editing ? '.editing' : ''));
    const { order, hidden } = S.settings.dashboard;
    const sizes = S.settings.dashboard.sizes || {};
    const all = [...order, ...Object.keys(SECTIONS).filter((k) => !order.includes(k))];
    all.forEach((key, i) => {
      if (!SECTIONS[key]) return;
      const off = hidden.includes(key);
      if (off && !editing) return;
      const size = sizes[key] || SECTIONS[key].size;
      const sec = h('section.hs' + (size === 'half' ? '.half' : '') + (off ? '.off' : ''), { dataset: { key } });
      const edit = h('div.hs-edit',
        h('button.icon-btn.sm', { type: 'button', title: 'Move up', html: ic('chevron-up'), disabled: i === 0, on: { click: () => move(key, -1) } }),
        h('button.icon-btn.sm', { type: 'button', title: 'Move down', html: ic('chevron-down'), disabled: i === all.length - 1, on: { click: () => move(key, 1) } }),
        h('button.icon-btn.sm', { type: 'button', title: size === 'half' ? 'Full width' : 'Half width', html: ic('columns'), on: { click: () => { setSetting('dashboard.sizes', { ...sizes, [key]: size === 'half' ? 'full' : 'half' }); draw(); } } }),
        h('button.icon-btn.sm', { type: 'button', title: off ? 'Show' : 'Hide', html: ic(off ? 'eye' : 'eye-off'), on: { click: () => toggleHidden(key) } }));
      sec.append(h('div.section-head', h('h2', SECTIONS[key].title), edit));
      sec.append(sectionBody(key));
      grid.append(sec);
    });
    pad.append(grid);
  };

  function move(key, d) {
    const order = [...S.settings.dashboard.order, ...Object.keys(SECTIONS).filter((k) => !S.settings.dashboard.order.includes(k))];
    const i = order.indexOf(key);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setSetting('dashboard.order', order);
    draw();
  }
  function toggleHidden(key) {
    const hd = new Set(S.settings.dashboard.hidden);
    hd.has(key) ? hd.delete(key) : hd.add(key);
    setSetting('dashboard.hidden', [...hd]);
    draw();
  }

  function sectionBody(key) {
    switch (key) {
      case 'continue': return continueSection();
      case 'notebooks': return h('div.hs-body.bare', h('div.covers', notebooks().map(notebookCard), newNotebookTile()));
      case 'recentPages': return recentPages();
      case 'favorites': return favorites();
      case 'activity': return activity();
      case 'reminders': return reminders();
      case 'suggestions': return suggestions();
    }
    return h('div');
  }

  const offs = [on('notebooks', draw), on('pages', debounceDraw), on('reminders', draw), on('cards', debounceDraw)];
  let dt;
  function debounceDraw() { clearTimeout(dt); dt = setTimeout(draw, 200); }
  draw();
  return () => offs.forEach((f) => f());
}

function quickPage() {
  const nbs = notebooks();
  if (!nbs.length) return notebookDialog();
  const last = [...nbs].sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0))[0];
  const p = createPage(last.id);
  go(`#/nb/${last.id}/${p.id}`);
}

function welcome() {
  return h('div.panel', { style: { padding: '8px' } }, h('div.empty',
    h('div.empty-art', { html: `<svg viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="22" y="10" width="62" height="78" rx="4" fill="currentColor" fill-opacity=".08"/><path d="M30 10v78"/><path d="M40 30h34M40 40h34M40 50h22"/><rect x="58" y="22" width="44" height="58" rx="4" transform="rotate(8 80 51)" fill="var(--surface)"/><path d="M66 40l24 3.4M65 49l24 3.4M64 58l14 2"/></svg>` }),
    h('h3', 'Start your first notebook'),
    h('p', 'Make one notebook per class. Type, handwrite with your Pencil, add tables and diagrams, then turn your notes into flashcards and quizzes.'),
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' } },
      h('button.btn.primary', { type: 'button', html: ic('plus') + '<span>New notebook</span>', on: { click: () => notebookDialog() } }),
      h('button.btn', { type: 'button', html: ic('book') + '<span>Open a sample notebook</span>', on: { click: () => import('../tools/seed.js').then((m) => m.createSample()) } })),
  ));
}

function continueSection() {
  const pages = [...S.pages.values()].filter((p) => !p.deletedAt && S.notebooks.get(p.notebookId) && !S.notebooks.get(p.notebookId).deletedAt).sort((a, b) => Math.max(b.openedAt, b.updatedAt) - Math.max(a.openedAt, a.updatedAt));
  const p = pages[0];
  if (!p) return h('div.hs-body', h('p.muted', 'Open a page and it will show up here.'));
  const n = S.notebooks.get(p.notebookId);
  const text = htmlToText(p.html).slice(0, 320);
  return h('div.hs-body', h('a.continue', { href: `#/nb/${n.id}/${p.id}` },
    coverEl(n, { elastic: true }),
    h('div',
      h('div.faint', { style: { fontSize: '13px', fontWeight: 600 } }, n.title + ' · edited ' + timeAgo(p.updatedAt)),
      h('h3', p.title || 'Untitled page'),
      h('p.excerpt', text || 'This page is empty. Tap to start writing.'),
      h('span.btn.primary.sm', { html: '<span>Continue</span>' + ic('arrow-right') }))));
}

function recentPages() {
  const pages = [...S.pages.values()].filter((p) => !p.deletedAt && !S.notebooks.get(p.notebookId)?.deletedAt).sort((a, b) => Math.max(b.openedAt, b.updatedAt) - Math.max(a.openedAt, a.updatedAt)).slice(0, 6);
  if (!pages.length) return h('div.hs-body', h('p.muted', 'No pages yet.'));
  return h('div.hs-body', { style: { padding: '8px' } }, pages.map((p) => {
    const n = S.notebooks.get(p.notebookId);
    return h('a.list-row', { href: `#/nb/${n.id}/${p.id}` }, h('i.sb-dot', { style: { background: n.color } }),
      h('div.lr-main', h('div.lr-title', p.title || 'Untitled page'), h('div.lr-sub', `${n.title} · ${timeAgo(p.updatedAt)}`)));
  }));
}

function favorites() {
  const favs = notebooks().filter((n) => n.favorite);
  const marks = [...S.pages.values()].filter((p) => p.bookmarked && !p.deletedAt).slice(0, 8);
  if (!favs.length && !marks.length) return h('div.hs-body', h('p.muted', { style: { margin: 0 } }, 'Star a notebook or bookmark a page to keep it here.'));
  return h('div.hs-body', { style: { padding: '8px' } },
    favs.map((n) => h('a.list-row', { href: '#/nb/' + n.id }, h('span', { html: ic('star'), style: { color: 'var(--accent)' } }), h('div.lr-main', h('div.lr-title', n.title), h('div.lr-sub', n.subject || 'Notebook')))),
    marks.map((p) => { const n = S.notebooks.get(p.notebookId); return h('a.list-row', { href: `#/nb/${p.notebookId}/${p.id}` }, h('span', { html: ic('bookmark'), style: { color: 'var(--accent)' } }), h('div.lr-main', h('div.lr-title', p.title || 'Untitled page'), h('div.lr-sub', n?.title || ''))); }));
}

export function heatmap(weeks = 18) {
  const heat = h('div.heat', { role: 'img', 'aria-label': 'Study activity over the last weeks' });
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1) - today.getDay());
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const a = S.activity[dayKey(d)];
    const score = a ? a.min + a.cards * 0.5 + a.pages * 3 + a.quiz * 4 + (a.edits || 0) * 0.2 : 0;
    const l = score === 0 ? 0 : score < 8 ? 1 : score < 20 ? 2 : score < 45 ? 3 : 4;
    heat.append(h('i', { dataset: { l: String(l) }, title: `${d.toLocaleDateString()}${a ? ` — ${Math.round(a.min)} min, ${a.cards} cards` : ''}` }));
  }
  return heat;
}

export function streak() {
  let s = 0;
  const d = new Date();
  if (!S.activity[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (S.activity[dayKey(d)]) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

function activity() {
  let min = 0, cards = 0;
  for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); const a = S.activity[dayKey(d)]; if (a) { min += a.min; cards += a.cards; } }
  return h('div.hs-body', heatmap(),
    h('div.stat-row',
      h('div.stat', h('b', String(streak())), h('span', 'day streak')),
      h('div.stat', h('b', String(Math.round(min))), h('span', 'minutes this week')),
      h('div.stat', h('b', String(cards)), h('span', 'cards reviewed this week'))));
}

function reminders() {
  const body = h('div.hs-body');
  const now = Date.now();
  const list = [...S.reminders].sort((a, b) => a.due - b.due).filter((r) => !r.done || now - r.due < 86400000).slice(0, 6);
  const reviews = [...S.pages.values()].filter((p) => !p.deletedAt && p.review?.next && p.review.next < now + 3 * 86400000).slice(0, 4);
  const due = dueCards();
  if (due.length) {
    body.append(h('a.list-row', { href: '#/cards', style: { padding: '8px 4px' } }, h('span', { html: ic('cards'), style: { color: 'var(--accent)' } }),
      h('div.lr-main', h('div.lr-title', `${due.length} flashcard${due.length === 1 ? '' : 's'} ready to review`), h('div.lr-sub', 'Spaced repetition keeps them in memory'))));
  }
  for (const p of reviews) {
    body.append(h('a.list-row', { href: `#/nb/${p.notebookId}/${p.id}`, style: { padding: '8px 4px' } }, h('span', { html: ic('repeat'), style: { color: 'var(--accent)' } }),
      h('div.lr-main', h('div.lr-title', 'Revise: ' + (p.title || 'Untitled page')), h('div.lr-sub', p.review.next < now ? 'Due now' : 'Due ' + fmtDate(p.review.next, { weekday: 'short', day: 'numeric', month: 'short' })))));
  }
  for (const r of list) {
    const over = !r.done && r.due < now;
    body.append(h('div.rem' + (over ? '.overdue' : '') + (r.done ? '.done' : ''),
      h('input', { type: 'checkbox', checked: r.done, 'aria-label': 'Done', on: { change: (e) => updateReminder(r.id, { done: e.target.checked }) } }),
      h('div.lr-main', h('div.lr-title', r.title), h('div.when', fmtDate(r.due, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))),
      h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Delete reminder', html: ic('x'), on: { click: () => deleteReminder(r.id) } })));
  }
  if (!list.length && !reviews.length && !due.length) body.append(h('p.muted', { style: { margin: '0 0 10px' } }, 'Nothing scheduled. Add a reminder for an exam or a study session.'));
  body.append(h('button.btn.sm', { type: 'button', style: { marginTop: '10px' }, html: ic('bell') + '<span>Add reminder</span>', on: { click: reminderDialog } }));
  return body;
}

export function reminderDialog() {
  const t = h('input.field', { type: 'text', placeholder: 'e.g. Chemistry midterm', autofocus: true });
  const d = new Date(Date.now() + 86400000); d.setMinutes(0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const when = h('input.field', { type: 'datetime-local', value: local });
  const nb = select([{ value: '', label: 'No notebook' }, ...notebooks().map((n) => ({ value: n.id, label: n.title }))], '', () => {});
  const s = sheet({ title: 'New reminder', body: h('div', field('What', t), field('When', when), field('Notebook', nb)),
    actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
      h('button.btn.primary', { type: 'button', text: 'Add', on: { click: () => {
        if (!t.value.trim()) return t.focus();
        addReminder({ title: t.value.trim(), due: new Date(when.value).getTime(), notebookId: nb.value });
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
        s.close();
      } } })] });
}

function suggestions() {
  const body = h('div.hs-body');
  const items = [];
  const due = dueCards();
  if (due.length) items.push({ icon: 'cards', text: `Review ${due.length} due flashcard${due.length === 1 ? '' : 's'} — it takes about ${Math.max(1, Math.round(due.length * 0.25))} min.`, href: '#/cards' });
  const quizzes = [...S.quizzes.values()].filter((q) => q.result).sort((a, b) => b.result.at - a.result.at);
  const weak = new Map();
  for (const q of quizzes.slice(0, 6)) for (const t of q.result.weakTopics || []) weak.set(t, (weak.get(t) || 0) + 1);
  if (weak.size) items.push({ icon: 'target', text: `Your recent quizzes show gaps in: ${[...weak.keys()].slice(0, 3).join(', ')}.`, href: '#/quiz' });
  const stale = [...S.pages.values()].filter((p) => !p.deletedAt && p.html && Date.now() - Math.max(p.openedAt, p.updatedAt) > 10 * 86400000).sort((a, b) => a.updatedAt - b.updatedAt)[0];
  if (stale) items.push({ icon: 'history', text: `You haven’t looked at “${stale.title || 'Untitled page'}” in a while. A quick reread helps it stick.`, href: `#/nb/${stale.notebookId}/${stale.id}` });
  const noCards = notebooks().find((n) => pagesOf(n.id).length >= 2 && ![...S.decks.values()].some((d) => d.notebookId === n.id));
  if (noCards) items.push({ icon: 'sparkles', text: `Turn your ${noCards.title} notes into flashcards.`, run: () => import('./cards.js').then((m) => m.generateDeckDialog({ notebookId: noCards.id })) });
  if (!items.length) items.push({ icon: 'feather', text: 'You’re all caught up. Write today’s notes or take a quick quiz.' });
  for (const it of items) {
    const row = h('div.sugg', h('span', { html: ic(it.icon) }), h('p', it.text));
    if (it.href) row.append(h('a.btn.sm', { href: it.href }, 'Go'));
    if (it.run) row.append(h('button.btn.sm', { type: 'button', text: 'Do it', on: { click: it.run } }));
    body.append(row);
  }
  body.append(h('button.btn.sm', { type: 'button', style: { marginTop: '12px' }, html: ic('sparkles') + '<span>Make me a study plan</span>', on: { click: studyPlan } }));
  return body;
}

async function studyPlan() {
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.', { action: { label: 'Open', run: () => go('#/settings/ai') } }); return; }
  const out = h('div.md', h('span.thinking', h('i'), h('i'), h('i'), ' Planning…'));
  sheet({ title: 'Your study plan', body: out, wide: true });
  const nbs = notebooks().map((n) => `- ${n.title} (${n.subject || 'no subject'}): ${pagesOf(n.id).length} pages; pages: ${pagesOf(n.id).slice(0, 12).map((p) => p.title || 'Untitled').join('; ')}`).join('\n');
  const rems = S.reminders.filter((r) => !r.done && r.due > Date.now()).map((r) => `- ${r.title} on ${new Date(r.due).toDateString()}`).join('\n') || 'none';
  const quizzes = [...S.quizzes.values()].filter((q) => q.result).slice(-6).map((q) => `- ${q.title}: ${q.result.score}/${q.result.total}, weak: ${(q.result.weakTopics || []).join(', ')}`).join('\n') || 'none';
  try {
    await generate({
      system: 'You are a calm, practical study coach for a university student. Use only the information given. Be specific and brief.',
      prompt: `Today is ${new Date().toDateString()}. Make a 7-day study plan in Markdown (a short intro line, then one heading per day with 2-4 bullet tasks of 15-45 minutes, then 3 tips). Prioritise upcoming deadlines and weak topics.\n\nNotebooks:\n${nbs}\n\nUpcoming reminders:\n${rems}\n\nFlashcards due now: ${dueCards().length}\n\nRecent quiz results:\n${quizzes}`,
      onText: (t) => { out.innerHTML = renderMarkdown(t); },
    });
  } catch (e) { out.innerHTML = ''; out.append(h('p', { style: { color: 'var(--danger)' } }, e.message)); }
}
