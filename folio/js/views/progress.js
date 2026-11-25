import { S, notebooks, pagesOf, cardsOf } from '../store.js';
import { h, ic, fmtDate, dayKey } from '../util.js';
import { menuButton } from '../main.js';
import { heatmap, streak } from './home.js';
import { pageText } from '../editor/text.js';

export async function render(main) {
  const view = h('div.view');
  const pad = h('div.view-pad');
  view.append(pad);
  main.append(view);
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return { d, a: S.activity[dayKey(d)] || { min: 0, cards: 0, pages: 0, quiz: 0 } }; });
  const max = Math.max(10, ...days.map((x) => x.a.min));
  const totMin = Object.values(S.activity).reduce((s, a) => s + (a.min || 0), 0);
  const totCards = Object.values(S.activity).reduce((s, a) => s + (a.cards || 0), 0);
  const quizzes = [...S.quizzes.values()].filter((q) => q.result).sort((a, b) => a.result.at - b.result.at);
  const words = [...S.pages.values()].filter((p) => !p.deletedAt).reduce((s, p) => s + pageText(p, { maxLen: 200000 }).split(/\s+/).filter(Boolean).length, 0);

  const bars = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: '6px', alignItems: 'end', height: '150px' } },
    days.map(({ d, a }) => h('div', { style: { display: 'grid', gap: '6px', justifyItems: 'center', alignContent: 'end', height: '100%' }, title: `${d.toLocaleDateString()}: ${Math.round(a.min)} min` },
      h('div', { style: { width: '100%', maxWidth: '26px', height: Math.max(3, a.min / max * 116) + 'px', borderRadius: '6px 6px 3px 3px', background: a.min ? 'var(--accent)' : 'var(--sunken)' } }),
      h('span.faint', { style: { fontSize: '11px' } }, d.toLocaleDateString(undefined, { weekday: 'narrow' })))));

  const W = 600, H = 160;
  const line = quizzes.length > 1 ? `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Quiz scores over time"><polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" points="${quizzes.map((q, i) => `${20 + i / (quizzes.length - 1) * (W - 40)},${H - 16 - q.result.pct / 100 * (H - 32)}`).join(' ')}"/>${quizzes.map((q, i) => `<circle cx="${20 + i / (quizzes.length - 1) * (W - 40)}" cy="${H - 16 - q.result.pct / 100 * (H - 32)}" r="4" fill="var(--accent)"><title>${q.title.replace(/</g, '')}: ${q.result.pct}%</title></circle>`).join('')}<line x1="20" x2="${W - 20}" y1="${H - 16 - 0.7 * (H - 32)}" y2="${H - 16 - 0.7 * (H - 32)}" stroke="var(--line-2)" stroke-dasharray="4 4"/></svg>` : '';

  pad.append(h('div.topbar', menuButton(), h('h1', 'Progress')),
    h('div.panel', { style: { padding: '20px', marginBottom: '22px' } }, h('div.stat-row', { style: { marginTop: 0 } },
      h('div.stat', h('b', String(streak())), h('span', 'day streak')),
      h('div.stat', h('b', String(Math.round(totMin / 60 * 10) / 10)), h('span', 'hours studied')),
      h('div.stat', h('b', String(totCards)), h('span', 'cards reviewed')),
      h('div.stat', h('b', String(quizzes.length)), h('span', 'quizzes taken')),
      h('div.stat', h('b', words.toLocaleString()), h('span', 'words of notes')))),
    h('div.home-grid',
      h('section.hs.half', h('div.section-head', h('h2', 'Study minutes · last 14 days')), h('div.hs-body', bars)),
      h('section.hs.half', h('div.section-head', h('h2', 'Activity')), h('div.hs-body', heatmap(26))),
      h('section.hs.half', h('div.section-head', h('h2', 'Quiz scores')), h('div.hs-body', quizzes.length > 1 ? h('div', { html: line }) : h('p.muted', { style: { margin: 0 } }, 'Take two or more quizzes to see your trend.'))),
      h('section.hs.half', h('div.section-head', h('h2', 'By notebook')), h('div.hs-body', h('div.bars', notebooks().map((n) => {
        const decks = [...S.decks.values()].filter((d) => d.notebookId === n.id);
        const cards = decks.flatMap((d) => cardsOf(d.id));
        const learned = cards.filter((c) => c.srs.interval >= 7).length;
        const pct = cards.length ? Math.round(learned / cards.length * 100) : 0;
        return h('div.bar-row', { title: `${learned} of ${cards.length} cards learned` }, h('span', n.title), h('div.track', h('i', { style: { width: pct + '%', background: n.color } })), h('span.num', cards.length ? pct + '%' : '—'));
      })), h('p.faint', { style: { fontSize: '12.5px', margin: '10px 0 0' } }, 'Share of each notebook’s flashcards you have learned (reviewed successfully at a 7+ day interval).'))),
    ));
  void ic; void fmtDate; void pagesOf;
}
