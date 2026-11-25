// Table editor: header row/column, merge & split, add/remove, resizable columns and rows, styles.
import { h, ic, menu, popover, iconBtn, clamp } from '../util.js';
import { colorGrid } from './inspector.js';

export const TABLE_STYLES = [
  { id: 'grid', label: 'Grid' }, { id: 'minimal', label: 'Minimal' }, { id: 'zebra', label: 'Striped' },
  { id: 'academic', label: 'Academic' }, { id: 'bold', label: 'Bold header' }, { id: 'rounded', label: 'Rounded' },
];

export function makeTable(rows = 3, cols = 3, { headerRow = true, headerCol = false, style = 'grid', data = null } = {}) {
  const table = h('table');
  const cg = h('colgroup');
  for (let c = 0; c < cols; c++) cg.append(h('col', { style: { width: (100 / cols).toFixed(2) + '%' } }));
  table.append(cg);
  const tb = h('tbody');
  for (let r = 0; r < rows; r++) {
    const tr = h('tr');
    for (let c = 0; c < cols; c++) {
      const head = (headerRow && r === 0) || (headerCol && c === 0);
      const val = data?.[r]?.[c] ?? '';
      tr.append(h(head ? 'th' : 'td', { contenteditable: 'true' }, val));
    }
    tb.append(tr);
  }
  table.append(tb);
  return h('figure.blk.blk-table', { contenteditable: 'false', dataset: { type: 'table', style } }, table);
}

/** Grid map: grid[r][c] = cell element (cells with spans appear in every slot they cover). */
function gridOf(table) {
  const rows = [...table.rows];
  const grid = rows.map(() => []);
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of tr.cells) {
      while (grid[r][c]) c++;
      for (let i = 0; i < cell.rowSpan; i++) for (let j = 0; j < cell.colSpan; j++) if (grid[r + i]) grid[r + i][c + j] = cell;
      c += cell.colSpan;
    }
  });
  return grid;
}
function posOf(grid, cell) {
  for (let r = 0; r < grid.length; r++) { const c = grid[r].indexOf(cell); if (c >= 0) return { r, c }; }
  return null;
}
function newCell(head) { return h(head ? 'th' : 'td', { contenteditable: 'true' }); }
function colCount(grid) { return Math.max(...grid.map((r) => r.length)); }

function syncColgroup(table) {
  const n = colCount(gridOf(table));
  let cg = table.querySelector('colgroup');
  if (!cg) { cg = h('colgroup'); table.prepend(cg); }
  while (cg.children.length < n) cg.append(h('col', { style: { width: (100 / n).toFixed(2) + '%' } }));
  while (cg.children.length > n) cg.lastElementChild.remove();
  const total = [...cg.children].reduce((s, c) => s + (parseFloat(c.style.width) || 0), 0) || 100;
  [...cg.children].forEach((c) => { c.style.width = ((parseFloat(c.style.width) || 100 / n) / total * 100).toFixed(2) + '%'; });
}

export const tableOps = {
  addRow(table, cell, below) {
    const grid = gridOf(table);
    const { r } = posOf(grid, cell);
    const at = below ? r + cell.rowSpan : r;
    const tr = h('tr');
    const cols = colCount(grid);
    const ref = table.rows[at];
    const rest = [...table.rows].slice(1);
    const headCol = rest.length > 0 && rest.every((x) => x.cells[0]?.tagName === 'TH');
    const seen = new Set();
    for (let c = 0; c < cols; c++) {
      const above = grid[at - 1]?.[c];
      const here = grid[at]?.[c];
      if (here && above === here) { if (!seen.has(here)) { here.rowSpan += 1; seen.add(here); } continue; }
      tr.append(newCell(c === 0 && headCol));
    }
    if (ref) ref.before(tr); else table.tBodies[0].append(tr);
  },
  addCol(table, cell, right) {
    const grid = gridOf(table);
    const { c } = posOf(grid, cell);
    const at = right ? c + cell.colSpan : c;
    const seen = new Set();
    grid.forEach((row, r) => {
      const left = row[at - 1], here = row[at];
      if (here && left === here) { if (!seen.has(here)) { here.colSpan += 1; seen.add(here); } return; }
      const tr = table.rows[r];
      const head = r === 0 && tr.cells[0]?.tagName === 'TH' && tr.cells[tr.cells.length - 1]?.tagName === 'TH';
      const n = newCell(head);
      // find the DOM cell to insert before: first cell in this row whose grid start column >= at
      const before = [...tr.cells].find((cl) => { const p = row.indexOf(cl); return p >= at && posOf(grid, cl).r === r; });
      if (before) before.before(n); else tr.append(n);
    });
    const cg = table.querySelector('colgroup');
    if (cg) { const ref = cg.children[at]; const col = h('col', { style: { width: (100 / (colCount(grid) + 1)).toFixed(2) + '%' } }); ref ? ref.before(col) : cg.append(col); }
    syncColgroup(table);
  },
  deleteRow(table, cell) {
    const grid = gridOf(table);
    const { r } = posOf(grid, cell);
    if (table.rows.length <= 1) return false;
    const seen = new Set();
    grid[r].forEach((cl, c) => {
      if (seen.has(cl)) return; seen.add(cl);
      const start = posOf(grid, cl);
      if (cl.rowSpan > 1) {
        if (start.r === r) {
          // move cell down to the next row
          const next = table.rows[r + 1];
          const nextRow = grid[r + 1];
          const before = [...next.cells].find((x) => nextRow.indexOf(x) > c);
          cl.rowSpan -= 1;
          if (before) before.before(cl); else next.append(cl);
        } else cl.rowSpan -= 1;
      }
    });
    table.rows[r].remove();
    return true;
  },
  deleteCol(table, cell) {
    const grid = gridOf(table);
    const { c } = posOf(grid, cell);
    if (colCount(grid) <= 1) return false;
    const seen = new Set();
    grid.forEach((row) => {
      const cl = row[c];
      if (!cl || seen.has(cl)) return; seen.add(cl);
      if (cl.colSpan > 1) cl.colSpan -= 1; else cl.remove();
    });
    table.querySelector('colgroup')?.children[c]?.remove();
    syncColgroup(table);
    return true;
  },
  mergeRight(table, cell) {
    const grid = gridOf(table);
    const { r, c } = posOf(grid, cell);
    const other = grid[r][c + cell.colSpan];
    if (!other || posOf(grid, other).r !== r || other.rowSpan !== cell.rowSpan) return false;
    if (other.textContent.trim()) cell.append(' ', ...other.childNodes);
    cell.colSpan += other.colSpan;
    other.remove();
    return true;
  },
  mergeDown(table, cell) {
    const grid = gridOf(table);
    const { r, c } = posOf(grid, cell);
    const other = grid[r + cell.rowSpan]?.[c];
    if (!other || posOf(grid, other).c !== c || other.colSpan !== cell.colSpan) return false;
    if (other.textContent.trim()) cell.append(h('br'), ...other.childNodes);
    cell.rowSpan += other.rowSpan;
    other.remove();
    return true;
  },
  split(table, cell) {
    if (cell.colSpan === 1 && cell.rowSpan === 1) return false;
    const grid = gridOf(table);
    const { r, c } = posOf(grid, cell);
    const rs = cell.rowSpan, cs = cell.colSpan;
    cell.rowSpan = 1; cell.colSpan = 1;
    let after = cell;
    for (let j = 1; j < cs; j++) { const n = newCell(cell.tagName === 'TH'); after.after(n); after = n; }
    for (let i = 1; i < rs; i++) {
      const tr = table.rows[r + i];
      const row = grid[r + i];
      const before = [...tr.cells].find((x) => row.indexOf(x) > c);
      for (let j = 0; j < cs; j++) { const n = newCell(false); if (before) before.before(n); else tr.append(n); }
    }
    return true;
  },
  toggleHeaderRow(table) {
    const first = table.rows[0];
    const isHead = [...first.cells].every((c) => c.tagName === 'TH');
    for (const cell of [...first.cells]) swapTag(cell, isHead ? 'td' : 'th');
    if (isHead) { // keep header column cells as th
      const colHead = [...table.rows].slice(1).every((r) => r.cells[0]?.tagName === 'TH');
      if (colHead) swapTag(table.rows[0].cells[0], 'th');
    }
  },
  toggleHeaderCol(table) {
    const rows = [...table.rows];
    const isHead = rows.slice(1).every((r) => r.cells[0]?.tagName === 'TH');
    const rowHead = [...rows[0].cells].every((c) => c.tagName === 'TH');
    rows.forEach((r, i) => { if (r.cells[0] && !(i === 0 && rowHead)) swapTag(r.cells[0], isHead ? 'td' : 'th'); });
  },
  equalWidths(table) {
    const cg = table.querySelector('colgroup');
    if (!cg) return;
    const n = cg.children.length;
    [...cg.children].forEach((c) => { c.style.width = (100 / n).toFixed(2) + '%'; });
    [...table.rows].forEach((r) => { r.style.height = ''; });
  },
};
function swapTag(cell, tag) {
  if (cell.tagName.toLowerCase() === tag) return cell;
  const n = document.createElement(tag);
  for (const a of cell.attributes) n.setAttribute(a.name, a.value);
  while (cell.firstChild) n.append(cell.firstChild);
  cell.replaceWith(n);
  return n;
}

let activeCell = null;
export function hydrateTable(blk, editor) {
  const table = blk.querySelector('table');
  if (!table) return;
  syncColgroup(table);
  addHandles(blk, table, editor);
  if (blk._tableBound) return;
  blk._tableBound = true;
  blk.addEventListener('focusin', (e) => {
    const cell = e.target.closest('td,th');
    if (!cell) return;
    blk.querySelectorAll('.cell-sel').forEach((c) => c.classList.remove('cell-sel'));
    cell.classList.add('cell-sel');
    activeCell = cell;
  });
  blk.addEventListener('keydown', (e) => {
    const cell = e.target.closest('td,th');
    if (!cell || e.key !== 'Tab') return;
    e.preventDefault();
    const cells = [...table.querySelectorAll('td,th')];
    let i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
    if (i >= cells.length) { editor.record(); tableOps.addRow(table, cell, true); editor.changed(); addHandles(blk, table, editor); i = cells.length; }
    const next = [...table.querySelectorAll('td,th')][Math.max(0, i)];
    if (next) { next.focus(); const r = document.createRange(); r.selectNodeContents(next); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }
  });
  blk.addEventListener('input', () => editor.changed());
}

function addHandles(blk, table, editor) {
  table.querySelectorAll('.rt').forEach((x) => x.remove());
  const grid = gridOf(table);
  const cg = table.querySelector('colgroup');
  // Column handles on the first row's cells (right edge)
  const seen = new Set();
  grid[0]?.forEach((cell, c) => {
    if (seen.has(cell)) return; seen.add(cell);
    const end = c + cell.colSpan - 1;
    if (end >= grid[0].length - 1) return;
    const hd = h('span.col-resize.rt', { contenteditable: 'false' });
    hd.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      editor.record();
      hd.classList.add('on');
      const tw = table.getBoundingClientRect().width;
      const a = cg.children[end], b = cg.children[end + 1];
      const wa = parseFloat(a.style.width), wb = parseFloat(b.style.width);
      const sx = e.clientX;
      const move = (ev) => {
        const d = ((ev.clientX - sx) / tw) * 100;
        const na = clamp(wa + d, 4, wa + wb - 4);
        a.style.width = na.toFixed(2) + '%';
        b.style.width = (wa + wb - na).toFixed(2) + '%';
      };
      const up = () => { hd.classList.remove('on'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); editor.changed(); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    cell.append(hd);
  });
  // Row handles on the first column's cells (bottom edge)
  [...table.rows].forEach((tr) => {
    const cell = tr.cells[0];
    if (!cell || cell.rowSpan > 1) return;
    const hd = h('span.row-resize.rt', { contenteditable: 'false' });
    hd.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      editor.record();
      hd.classList.add('on');
      const scale = tr.getBoundingClientRect().height / tr.offsetHeight || 1;
      const h0 = tr.offsetHeight, sy = e.clientY;
      const move = (ev) => { tr.style.height = Math.max(28, Math.round(h0 + (ev.clientY - sy) / scale)) + 'px'; };
      const up = () => { hd.classList.remove('on'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); editor.changed(); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    cell.append(hd);
  });
}

/** Buttons for the table's floating toolbar. */
export function tableToolbar(blk, editor) {
  const table = blk.querySelector('table');
  const cell = () => (activeCell && blk.contains(activeCell) ? activeCell : table.querySelector('td,th'));
  const run = (fn) => { editor.record(); fn(); hydrateTable(blk, editor); editor.changed(); };
  const rowBtn = iconBtn('rows', 'Rows', (e) => menu(e.currentTarget, [
    { label: 'Insert row above', icon: 'chevron-up', run: () => run(() => tableOps.addRow(table, cell(), false)) },
    { label: 'Insert row below', icon: 'chevron-down', run: () => run(() => tableOps.addRow(table, cell(), true)) },
    { label: 'Delete row', icon: 'trash', danger: true, run: () => run(() => tableOps.deleteRow(table, cell())) },
  ]));
  const colBtn = iconBtn('columns', 'Columns', (e) => menu(e.currentTarget, [
    { label: 'Insert column left', icon: 'chevron-left', run: () => run(() => tableOps.addCol(table, cell(), false)) },
    { label: 'Insert column right', icon: 'chevron-right', run: () => run(() => tableOps.addCol(table, cell(), true)) },
    { label: 'Equal column widths', icon: 'grid', run: () => run(() => tableOps.equalWidths(table)) },
    { label: 'Delete column', icon: 'trash', danger: true, run: () => run(() => tableOps.deleteCol(table, cell())) },
  ]));
  const mergeBtn = iconBtn('merge', 'Merge cells', (e) => menu(e.currentTarget, [
    { label: 'Merge with cell to the right', icon: 'arrow-right', run: () => run(() => tableOps.mergeRight(table, cell())) },
    { label: 'Merge with cell below', icon: 'chevron-down', run: () => run(() => tableOps.mergeDown(table, cell())) },
    { label: 'Split cell', icon: 'split', run: () => run(() => tableOps.split(table, cell())) },
  ]));
  const headBtn = iconBtn('heading', 'Headers', (e) => menu(e.currentTarget, [
    { label: 'Header row', icon: 'rows', checked: [...table.rows[0].cells].every((c) => c.tagName === 'TH'), run: () => run(() => tableOps.toggleHeaderRow(table)) },
    { label: 'Header column', icon: 'columns', checked: [...table.rows].slice(1).every((r) => r.cells[0]?.tagName === 'TH'), run: () => run(() => tableOps.toggleHeaderCol(table)) },
  ]));
  const fillBtn = iconBtn('bucket', 'Cell colour', (e) => {
    const target = cell();
    popover(e.currentTarget, h('div', { style: { padding: '12px', width: '260px' } },
      h('div.menu-head', { style: { padding: '0 0 8px' } }, 'Cell background'),
      colorGrid((c) => { editor.record(); target.style.background = c || ''; editor.changed(); }, { none: true, soft: true }),
      h('div.menu-head', { style: { padding: '12px 0 8px' } }, 'Cell text'),
      colorGrid((c) => { editor.record(); target.style.color = c || ''; editor.changed(); }, { none: true }),
      h('div.menu-head', { style: { padding: '12px 0 8px' } }, 'Align'),
      h('div', { style: { display: 'flex', gap: '2px' } },
        ...['left', 'center', 'right'].map((a) => iconBtn('align-' + a, 'Align ' + a, () => { editor.record(); target.style.textAlign = a; editor.changed(); }, 'sm')),
        ...[['top', 'chevron-up'], ['middle', 'minus'], ['bottom', 'chevron-down']].map(([v, i]) => iconBtn(i, 'Vertical ' + v, () => { editor.record(); target.style.verticalAlign = v; editor.changed(); }, 'sm')))),
    { place: 'bottom' });
  });
  const styleBtn = iconBtn('table', 'Table style', (e) => {
    const borderC = h('div');
    popover(e.currentTarget, h('div', { style: { padding: '12px', width: '280px' } },
      h('div.menu-head', { style: { padding: '0 0 8px' } }, 'Style'),
      h('div.style-grid', TABLE_STYLES.map((s) => h('button.style-opt', { type: 'button', 'aria-pressed': String(blk.dataset.style === s.id), text: s.label, on: { click: (ev) => { editor.record(); blk.dataset.style = s.id; editor.changed(); ev.currentTarget.parentElement.querySelectorAll('.style-opt').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); } } }))),
      h('div.menu-head', { style: { padding: '12px 0 8px' } }, 'Border colour'),
      colorGrid((c) => { editor.record(); table.querySelectorAll('td,th').forEach((x) => { x.style.borderColor = c || ''; }); editor.changed(); }, { none: true }),
      borderC,
      h('div.menu-head', { style: { padding: '12px 0 8px' } }, 'Text size'),
      h('div', { style: { display: 'flex', gap: '6px' } }, ...[['Small', '.82em'], ['Normal', '.92em'], ['Large', '1.05em']].map(([l, v]) => h('button.chip', { type: 'button', text: l, on: { click: () => { editor.record(); table.style.fontSize = v; editor.changed(); } } })))),
    { place: 'bottom' });
  });
  return [rowBtn, colBtn, mergeBtn, headBtn, fillBtn, styleBtn];
}
