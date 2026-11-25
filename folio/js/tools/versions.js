// Version history: browse snapshots of a page and restore one.
import { h, sheet, fmtDate, toast, timeAgo } from '../util.js';
import { versionsOf, updatePage, snapshotVersion } from '../store.js';

export async function versionsDialog(page, onRestore) {
  const list = h('div.ver-list');
  const prev = h('div.ver-prev.editor');
  const restore = h('button.btn.primary', { type: 'button', text: 'Restore this version', disabled: true });
  const s = sheet({ title: 'Version history — ' + (page.title || 'Untitled page'), cls: 'full', body: h('div.ver-layout', list, prev),
    actions: [h('button.btn.ghost', { type: 'button', text: 'Close', on: { click: () => s.close() } }), restore] });
  const vs = await versionsOf(page.id);
  if (!vs.length) { list.append(h('p.muted', 'No earlier versions yet. Versions are saved every few minutes while you write.')); prev.append(h('p.muted', 'Nothing to show.')); return; }
  let chosen = null;
  vs.forEach((v, i) => {
    const b = h('button.ver-item', { type: 'button', on: { click: () => pick(v, b) } }, h('b', fmtDate(v.ts, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), h('span', i === 0 ? 'Latest snapshot · ' + timeAgo(v.ts) : timeAgo(v.ts)));
    list.append(b);
    if (i === 0) pick(v, b);
  });
  function pick(v, b) {
    chosen = v;
    list.querySelectorAll('.ver-item').forEach((x) => x.classList.toggle('on', x === b));
    prev.innerHTML = `<h1 style="font:600 30px var(--font-display);margin:0 0 16px">${(v.title || 'Untitled page').replace(/</g, '&lt;')}</h1>` + (v.html || '<p class="muted">Empty page</p>');
    prev.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
    restore.disabled = false;
  }
  restore.onclick = async () => {
    if (!chosen) return;
    await snapshotVersion(page, true);
    updatePage(page.id, { html: chosen.html, title: chosen.title, ink: chosen.ink || page.ink, paper: chosen.paper ?? page.paper });
    s.close();
    toast('Version restored. The version you replaced is saved in history too.');
    onRestore?.();
  };
}
