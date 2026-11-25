// Global search across notebooks, pages (full text), tags, flashcards and quizzes.
import { h, ic, sheet, esc, timeAgo } from '../util.js';
import { S, notebooks } from '../store.js';
import { pageText } from '../editor/text.js';
import { go } from '../main.js';

export function openPalette() {
  if (document.querySelector('.palette')) return;
  const input = h('input', { type: 'search', placeholder: 'Search notes, tags (#exam), flashcards…', 'aria-label': 'Search', autofocus: true });
  const results = h('div.pal-results');
  let filter = 'all';
  const filters = h('div.pal-filters.chips', ['all', 'pages', 'notebooks', 'cards', 'quizzes'].map((f) => h('button.chip', { type: 'button', 'aria-pressed': String(f === filter), text: f[0].toUpperCase() + f.slice(1), on: { click: (e) => { filter = f; filters.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); run(); } } })));
  const s = sheet({ cls: 'palette', body: h('div', h('div.pal-input', h('span', { html: ic('search') }), input), filters, results) });
  s.el.classList.add('palette');
  let sel = 0;
  let items = [];
  const texts = new Map();
  const textOf = (p) => { if (!texts.has(p.id)) texts.set(p.id, pageText(p, { maxLen: 50000 })); return texts.get(p.id); };
  function snippet(text, q) {
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return esc(text.slice(0, 140));
    const a = Math.max(0, i - 50);
    return (a ? '…' : '') + esc(text.slice(a, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, i + q.length + 90)) + '…';
  }
  function run() {
    const raw = input.value.trim();
    const q = raw.toLowerCase();
    results.innerHTML = '';
    items = [];
    const group = (title, list) => { if (!list.length) return; results.append(h('div.pal-group', title)); list.forEach((it) => { const el = h('div.pal-item', { on: { click: () => open(it), pointerenter: () => { sel = items.indexOf(it); mark(); } } }, h('span', { html: ic(it.icon) }), h('div', h('div.pi-t', it.title), it.sub ? h('div.pi-s', { html: it.sub }) : null)); it.el = el; items.push(it); results.append(el); }); };
    const pages = [...S.pages.values()].filter((p) => !p.deletedAt && S.notebooks.get(p.notebookId) && !S.notebooks.get(p.notebookId).deletedAt);
    if (!q) {
      group('Recent pages', pages.sort((a, b) => Math.max(b.openedAt, b.updatedAt) - Math.max(a.openedAt, a.updatedAt)).slice(0, 8).map((p) => ({ icon: 'file-text', title: p.title || 'Untitled page', sub: esc(S.notebooks.get(p.notebookId).title) + ' · ' + timeAgo(p.updatedAt), href: `#/nb/${p.notebookId}/${p.id}` })));
      mark();
      return;
    }
    if (filter === 'all' || filter === 'notebooks') group('Notebooks', notebooks({ includeArchived: true }).filter((n) => (n.title + ' ' + n.subject + ' ' + n.description).toLowerCase().includes(q)).map((n) => ({ icon: 'book', title: n.title, sub: esc(n.subject || n.description || ''), href: '#/nb/' + n.id })));
    if (filter === 'all' || filter === 'pages') {
      const tag = q.startsWith('#') ? q.slice(1) : null;
      const hits = [];
      for (const p of pages) {
        if (tag) { if ((p.tags || []).some((t) => t.startsWith(tag))) hits.push({ p, score: 3, sub: (p.tags || []).map((t) => '#' + t).join(' ') }); continue; }
        const t = (p.title || '').toLowerCase();
        const body = textOf(p);
        const inTitle = t.includes(q);
        const inBody = body.toLowerCase().includes(q);
        const inTags = (p.tags || []).some((x) => x.includes(q));
        if (inTitle || inBody || inTags) hits.push({ p, score: (inTitle ? 3 : 0) + (inTags ? 2 : 0) + (inBody ? 1 : 0), sub: snippet(body, q) });
      }
      group('Pages', hits.sort((a, b) => b.score - a.score || b.p.updatedAt - a.p.updatedAt).slice(0, 30).map(({ p, sub }) => ({ icon: 'file-text', title: (p.title || 'Untitled page') + ' — ' + S.notebooks.get(p.notebookId).title, sub, href: `#/nb/${p.notebookId}/${p.id}` })));
    }
    if (filter === 'all' || filter === 'cards') group('Flashcards', [...S.cards.values()].filter((c) => (c.front + ' ' + c.back).toLowerCase().includes(q)).slice(0, 12).map((c) => ({ icon: 'cards', title: c.front.slice(0, 90), sub: snippet(c.back || '', q), href: '#/cards/' + c.deckId })));
    if (filter === 'all' || filter === 'quizzes') group('Quizzes', [...S.quizzes.values()].filter((z) => z.title.toLowerCase().includes(q)).map((z) => ({ icon: 'quiz', title: z.title, sub: z.result ? z.result.pct + '%' : 'Not taken', href: '#/quiz/' + z.id })));
    if (!items.length) results.append(h('div.empty', { style: { padding: '30px' } }, h('p', `Nothing matches “${raw}”.`)));
    sel = 0;
    mark();
  }
  function mark() { items.forEach((it, i) => it.el.classList.toggle('on', i === sel)); items[sel]?.el.scrollIntoView({ block: 'nearest' }); }
  function open(it) { s.close(); go(it.href); }
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    if (e.key === 'Enter' && items[sel]) open(items[sel]);
  });
  run();
  setTimeout(() => input.focus(), 60);
}
