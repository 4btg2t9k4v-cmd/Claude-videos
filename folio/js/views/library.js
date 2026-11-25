import { S, on, notebooks, pagesOf } from '../store.js';
import { h, ic, segmented } from '../util.js';
import { menuButton } from '../main.js';
import { notebookCard, newNotebookTile } from './home.js';

export async function render(main) {
  const view = h('div.view');
  const pad = h('div.view-pad');
  view.append(pad);
  main.append(view);
  let show = 'active', sort = 'recent', q = '';
  const grid = h('div');
  const search = h('input.field', { type: 'search', placeholder: 'Filter notebooks', style: { maxWidth: '280px' }, on: { input: (e) => { q = e.target.value.toLowerCase(); draw(); } } });
  pad.append(h('div.topbar', menuButton(), h('h1', 'All notebooks')),
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' } },
      search,
      segmented([{ value: 'active', label: 'Active' }, { value: 'favorites', label: 'Favorites' }, { value: 'archived', label: 'Archived' }], show, (v) => { show = v; draw(); }),
      segmented([{ value: 'recent', label: 'Recent' }, { value: 'name', label: 'A–Z' }, { value: 'created', label: 'Created' }, { value: 'pages', label: 'Most pages' }], sort, (v) => { sort = v; draw(); })),
    grid);
  function draw() {
    let list = notebooks({ includeArchived: true });
    list = list.filter((n) => (show === 'archived' ? n.archived : !n.archived) && (show !== 'favorites' || n.favorite));
    if (q) list = list.filter((n) => (n.title + ' ' + (n.subject || '') + ' ' + (n.description || '')).toLowerCase().includes(q));
    const by = { recent: (a, b) => Math.max(b.openedAt, b.updatedAt) - Math.max(a.openedAt, a.updatedAt), name: (a, b) => a.title.localeCompare(b.title), created: (a, b) => b.createdAt - a.createdAt, pages: (a, b) => pagesOf(b.id).length - pagesOf(a.id).length };
    list.sort(by[sort]);
    grid.innerHTML = '';
    if (!list.length && show !== 'active') { grid.append(h('div.empty', h('h3', show === 'archived' ? 'No archived notebooks' : 'No favorites yet'), h('p', show === 'archived' ? 'Archive notebooks from finished classes to keep your shelf tidy.' : 'Star a notebook from its menu to see it here.'))); return; }
    grid.append(h('div.covers', list.map(notebookCard), show === 'active' && !q ? newNotebookTile() : null));
  }
  const off = on('notebooks', draw);
  draw();
  return () => off();
}
