// Insert menu: every block the page supports, plus the per-block floating toolbar.
import { h, ic, popover, closePopover, pickFile, iconBtn, menu, toast, sheet, field } from '../util.js';
import { makeTable, tableToolbar, hydrateTable } from './table.js';
import { makeFigure, makeImageText, hydrateFigure, toggleFloat, rotate, addLabel, replaceImage, cropImage, flipImageText } from './figure.js';
import { insertDataBlock, renderBlock, EDITORS, makeBlock, DECOS, dataOf } from './blocks.js';
import { fileToImageData } from './editor.js';
import { figureStylePopover } from './inspector.js';

export function hydrate(blk, editor) {
  const t = blk.dataset.type;
  if (t === 'table') hydrateTable(blk, editor);
  else if (t === 'image' || t === 'svg' || t === 'imgtext') hydrateFigure(blk, editor);
  else renderBlock(blk, editor);
}

export function insertMenu(anchor, editor, ctx) {
  const item = (icon, label, run) => h('button.insert-item', { type: 'button', on: { click: () => { closePopover(); run(); } } }, h('span', { html: ic(icon) }), h('span', label));
  const grid = h('div.insert-grid',
    h('div.insert-head', 'Organise'),
    item('table', 'Table', () => tableDialog(editor)),
    item('columns', 'Comparison', () => { editor.insertNode(makeTable(4, 3, { headerRow: true, headerCol: true, data: [['', 'Option A', 'Option B'], ['Definition', '', ''], ['Key features', '', ''], ['Example', '', '']] })); }),
    item('info', 'Callout box', () => { editor.restoreRange(); editor.setBlockStyle('callout'); }),
    item('alert', 'Important box', () => { editor.restoreRange(); editor.setBlockStyle('important'); }),
    item('book-marked', 'Definition', () => { editor.restoreRange(); editor.setBlockStyle('definition'); }),
    item('list-checks', 'Checklist', () => { editor.restoreRange(); editor.setBlockStyle('check'); }),
    h('div.insert-head', 'Visualise'),
    item('timeline', 'Timeline', () => insertDataBlock('timeline', editor)),
    item('flow', 'Flowchart', () => insertDataBlock('flow', editor)),
    item('mindmap', 'Mind map', () => insertDataBlock('mindmap', editor)),
    item('sigma', 'Equation', () => insertDataBlock('equation', editor)),
    item('graph', 'Function graph', () => insertDataBlock('graph', editor)),
    item('atom', 'Molecule', () => insertDataBlock('molecule', editor)),
    item('map', 'Map', () => insertDataBlock('map', editor)),
    item('sparkles', 'AI diagram…', () => ctx.visualize()),
    item('func', 'Formula line', () => { editor.restoreRange(); editor.setBlockStyle('formula'); }),
    h('div.insert-head', 'Media'),
    item('image', 'Image', async () => { const f = await pickFile('image/*'); if (f) insertImageFile(f, editor); }),
    item('frame', 'Image + text', async () => { const f = await pickFile('image/*'); const src = f ? await fileToImageData(f) : null; editor.insertNode(makeImageText({ src })); }),
    item('scan', 'Scan handwriting', () => ctx.scanHandwriting()),
    h('div.insert-head', 'Page'),
    item('list-tree', 'Contents', () => insertDataBlock('toc', editor, {})),
    item('minus', 'Divider', () => { editor.insertHTMLAfterCurrent('<hr>'); }),
    item('feather', 'Ornament', () => decoMenu(anchor, editor)),
    item('sticker', 'Washi tape', () => insertDataBlock('deco', editor, { kind: 'washi' })),
    item('quote', 'Quote', () => { editor.restoreRange(); editor.setBlockStyle('quote'); }),
  );
  return popover(anchor, grid, { place: 'bottom' });
}

function decoMenu(anchor, editor) {
  menu(anchor, Object.keys(DECOS).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), icon: 'feather', run: () => insertDataBlock('deco', editor, { kind: k }) })));
}

export async function insertImageFile(file, editor) {
  try {
    const src = await fileToImageData(file);
    editor.restoreRange();
    editor.insertNode(makeFigure({ src }));
  } catch { toast('That image could not be read.', { kind: 'error' }); }
}

function tableDialog(editor) {
  const rows = h('input.field', { type: 'number', min: 1, max: 40, value: 4 });
  const cols = h('input.field', { type: 'number', min: 1, max: 12, value: 3 });
  const hr = h('input', { type: 'checkbox', checked: true });
  const hc = h('input', { type: 'checkbox' });
  const s = sheet({ title: 'Insert table', body: h('div', h('div.form-grid', field('Rows', rows), field('Columns', cols)),
    h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center', margin: '4px 0 10px' } }, hr, 'Header row on top'),
    h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, hc, 'Header column on the left')),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
    h('button.btn.primary', { type: 'button', text: 'Insert', on: { click: () => {
      s.close();
      editor.restoreRange();
      const t = makeTable(Math.min(40, Math.max(1, +rows.value || 3)), Math.min(12, Math.max(1, +cols.value || 3)), { headerRow: hr.checked, headerCol: hc.checked });
      editor.insertNode(t);
      setTimeout(() => t.querySelector('td,th')?.focus(), 50);
    } } })] });
}

/** Floating toolbar shown on a selected block. */
export function blockToolbar(blk, editor, ctx) {
  blk.querySelectorAll(':scope > .blk-ui').forEach((u) => u.remove());
  const t = blk.dataset.type;
  const ui = h('div.blk-ui.rt', { contenteditable: 'false', on: { pointerdown: (e) => e.stopPropagation() } });
  const b = (icon, label, fn) => iconBtn(icon, label, fn);
  if (t === 'table') ui.append(...tableToolbar(blk, editor));
  if (EDITORS[t]) ui.append(b('pencil', 'Edit', () => EDITORS[t](blk, editor)));
  if (['image', 'svg'].includes(t)) {
    ui.append(b('pin', 'Add label', () => addLabel(blk, editor)));
    if (t === 'image') ui.append(b('crop', 'Crop', () => cropImage(blk, editor)));
    ui.append(b('rotate-cw', 'Rotate 90°', () => rotate(blk, editor, 90)));
    ui.append(b('move', blk.classList.contains('floating') ? 'Put back in the text' : 'Move freely on the page', () => { toggleFloat(blk, editor); blockToolbar(blk, editor, ctx); }));
  }
  if (t === 'imgtext') {
    ui.append(b('image', 'Replace image', () => replaceImage(blk, editor)));
    ui.append(b('columns', 'Swap sides', () => flipImageText(blk, editor)));
  }
  if (['image', 'svg', 'imgtext', 'map', 'graph', 'flow', 'mindmap', 'molecule', 'timeline', 'equation'].includes(t)) ui.append(b('palette', 'Style', (e) => figureStylePopover(e.currentTarget, blk, editor)));
  if (t === 'svg' && blk.dataset.prompt) ui.append(b('refresh', 'Redraw with AI', () => ctx.redrawVisual(blk)));
  if (t === 'image') ui.append(b('image', 'Replace image', () => replaceImage(blk, editor)));
  if (['image', 'svg'].includes(t)) ui.append(b('cards', 'Make flashcards from this picture', () => ctx.cardsFromFigure(blk)));
  if (t === 'deco') ui.append(b('feather', 'Change ornament', (e) => menu(e.currentTarget, [...Object.keys(DECOS), 'washi'].map((k) => ({ label: k[0].toUpperCase() + k.slice(1), checked: dataOf(blk).kind === k, run: () => { editor.record(); blk.dataset.json = JSON.stringify({ kind: k }); renderBlock(blk, editor); editor.changed(); } })))));
  ui.append(
    b('more', 'More', (e) => menu(e.currentTarget, [
      { label: 'Move up', icon: 'chevron-up', run: () => editor.moveBlock(blk, -1) },
      { label: 'Move down', icon: 'chevron-down', run: () => editor.moveBlock(blk, 1) },
      { label: 'Duplicate', icon: 'copy', run: () => { editor.record(); const c = blk.cloneNode(true); c.classList.remove('selected'); c.querySelectorAll('.rt, .blk-ui').forEach((x) => x.remove()); blk.after(c); hydrate(c, editor); editor.changed(); } },
      { label: 'Add a paragraph below', icon: 'pilcrow', run: () => { editor.record(); const p = h('p', h('br')); blk.after(p); editor.deselectBlock(); const r = document.createRange(); r.setStart(p, 0); getSelection().removeAllRanges(); getSelection().addRange(r); editor.changed(); } },
      { sep: true },
      { label: 'Delete', icon: 'trash', danger: true, run: () => editor.removeBlock(blk) },
    ])),
  );
  blk.prepend(ui);
}

export { makeBlock };
