import { S, on, restorePage, destroyPage, restoreNotebook, destroyNotebook } from '../store.js';
import { h, ic, iconBtn, confirmDialog, timeAgo, toast } from '../util.js';
import { menuButton } from '../main.js';

export async function render(main) {
  const view = h('div.view');
  const pad = h('div.view-pad', { style: { maxWidth: '860px' } });
  view.append(pad);
  main.append(view);
  const draw = () => {
    pad.innerHTML = '';
    const nbs = [...S.notebooks.values()].filter((n) => n.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
    const pages = [...S.pages.values()].filter((p) => p.deletedAt && !S.notebooks.get(p.notebookId)?.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
    const days = (t) => Math.max(0, 30 - Math.floor((Date.now() - t) / 86400000));
    pad.append(h('div.topbar', menuButton(), h('h1', 'Recently deleted'),
      nbs.length + pages.length ? h('button.btn.ghost', { type: 'button', html: ic('trash') + '<span>Empty</span>', on: { click: async () => {
        if (!(await confirmDialog(`Permanently delete ${nbs.length + pages.length} item(s)? This can’t be undone.`, { danger: true, okLabel: 'Delete forever' }))) return;
        nbs.forEach((n) => destroyNotebook(n.id)); pages.forEach((p) => destroyPage(p.id)); toast('Deleted for good.');
      } } }) : null),
      h('p.muted', { style: { marginTop: '-12px' } }, 'Items stay here for 30 days, then are removed automatically.'));
    if (!nbs.length && !pages.length) { pad.append(h('div.panel', h('div.empty', h('h3', 'Nothing here'), h('p', 'Deleted pages and notebooks appear here for 30 days.')))); return; }
    const row = (title, sub, restore, destroy) => h('div.list-row',
      h('div.lr-main', h('div.lr-title', title), h('div.lr-sub', sub)),
      h('button.btn.sm', { type: 'button', text: 'Restore', on: { click: restore } }),
      iconBtn('trash', 'Delete forever', async () => { if (await confirmDialog(`Delete “${title}” forever?`, { danger: true, okLabel: 'Delete forever' })) destroy(); }, 'sm'));
    if (nbs.length) pad.append(h('div.section-head', h('h2', 'Notebooks')), h('div.panel', { style: { padding: '6px' } }, nbs.map((n) => row(n.title, `Deleted ${timeAgo(n.deletedAt)} · ${days(n.deletedAt)} days left`, () => { restoreNotebook(n.id); toast('Notebook restored'); }, () => destroyNotebook(n.id)))));
    if (pages.length) pad.append(h('div.section-head', { style: { marginTop: '24px' } }, h('h2', 'Pages')), h('div.panel', { style: { padding: '6px' } }, pages.map((p) => row(p.title || 'Untitled page', `${S.notebooks.get(p.notebookId)?.title || ''} · deleted ${timeAgo(p.deletedAt)} · ${days(p.deletedAt)} days left`, () => { restorePage(p.id); toast('Page restored'); }, () => destroyPage(p.id)))));
  };
  const offs = [on('pages', draw), on('notebooks', draw)];
  draw();
  return () => offs.forEach((f) => f());
}
