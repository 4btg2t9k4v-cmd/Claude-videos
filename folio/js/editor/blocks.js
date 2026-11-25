// Data-driven blocks (equation, timeline, flowchart, mind map, map, molecule, graph, decorations, contents).
// Each block is <figure class="blk" data-type data-json> with a .blk-render child that is rebuilt from data.
import { h, ic, esc, sheet, field, select, segmented, toast, iconBtn, debounce } from '../util.js';
import { compile } from './mathexpr.js';
import { tex } from '../tools/md.js';
import { S, pagesOf } from '../store.js';
import { headingsOf } from './text.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); kids.flat().forEach((k) => k != null && e.append(k)); return e; };

export function dataOf(blk) { try { return JSON.parse(blk.dataset.json || '{}'); } catch { return {}; } }
export function setData(blk, data, editor) {
  editor?.record();
  blk.dataset.json = JSON.stringify(data);
  renderBlock(blk, editor);
  editor?.changed();
}

export function makeBlock(type, data, { caption = true } = {}) {
  const cls = { equation: 'blk-eq', timeline: 'blk-timeline', flow: 'blk-diagram', mindmap: 'blk-diagram', map: 'blk-map', molecule: 'blk-mol', graph: 'blk-graph', deco: 'blk-deco', toc: 'blk-toc' }[type] || '';
  return h('figure.blk.' + cls, { contenteditable: 'false', dataset: { type, json: JSON.stringify(data) } },
    h('div.blk-render'),
    caption ? h('figcaption', { contenteditable: 'true' }) : null);
}

export function renderBlock(blk, editor) {
  const type = blk.dataset.type;
  const data = dataOf(blk);
  let host = blk.querySelector(':scope > .blk-render');
  if (!host) { host = h('div.blk-render'); blk.prepend(host); }
  host.innerHTML = '';
  try {
    if (type === 'equation') renderEquation(host, data);
    else if (type === 'timeline') renderTimeline(host, data, blk);
    else if (type === 'flow') host.append(renderFlow(data));
    else if (type === 'mindmap') host.append(renderMindmap(data));
    else if (type === 'map') renderMap(host, data);
    else if (type === 'molecule') renderMolecule(host, data);
    else if (type === 'graph') renderGraph(host, data);
    else if (type === 'deco') renderDeco(host, data, blk);
    else if (type === 'toc') renderToc(host, editor);
  } catch (e) {
    host.append(h('p.eq-error', 'Could not draw this block: ' + e.message));
  }
}

/* ---------------- equation ---------------- */
function renderEquation(host, d) {
  host.innerHTML = tex(d.latex || '\\text{Tap to edit equation}', true);
  if (d.num) host.append(h('span.eq-num', `(${d.num})`));
}
export function editEquation(blk, editor) {
  const d = dataOf(blk);
  const ta = h('textarea.field', { rows: 3, style: { fontFamily: 'var(--font-mono)' }, placeholder: 'e.g. x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' });
  ta.value = d.latex || '';
  const prev = h('div.vis-preview', { style: { textAlign: 'center', minHeight: '70px', fontSize: '1.25em' } });
  const num = h('input.field.sm', { type: 'text', placeholder: 'e.g. 1', value: d.num || '', style: { width: '90px' } });
  const draw = () => { prev.innerHTML = tex(ta.value || '\\square', true); };
  ta.addEventListener('input', draw);
  const snip = (label, s) => h('button.chip', { type: 'button', text: label, on: { click: () => { const st = ta.selectionStart; ta.setRangeText(s, st, ta.selectionEnd, 'end'); ta.focus(); draw(); } } });
  const snippets = h('div.chips', snip('a/b', '\\frac{a}{b}'), snip('√', '\\sqrt{x}'), snip('xⁿ', 'x^{n}'), snip('xₙ', 'x_{n}'), snip('∑', '\\sum_{i=1}^{n}'), snip('∫', '\\int_{a}^{b} f(x)\\,dx'), snip('lim', '\\lim_{x \\to \\infty}'),
    snip('±', '\\pm'), snip('≠', '\\neq'), snip('≤', '\\leq'), snip('→', '\\rightarrow'), snip('⇌', '\\rightleftharpoons'), snip('π', '\\pi'), snip('θ', '\\theta'), snip('Δ', '\\Delta'), snip('α', '\\alpha'), snip('β', '\\beta'), snip('λ', '\\lambda'), snip('matrix', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'), snip('vector', '\\vec{v}'), snip('°', '^{\\circ}'));
  const words = h('input.field', { type: 'text', placeholder: 'Or describe it: “area of a circle”, “ideal gas law”…' });
  const aiBtn = h('button.btn.sm', { type: 'button', html: ic('sparkles') + '<span>Write it for me</span>', on: { click: async () => {
    if (!words.value.trim()) return words.focus();
    const { generate, hasAI } = await import('../ai/gemini.js');
    if (!hasAI()) return toast('Add your Gemini key in Settings → AI first.');
    aiBtn.disabled = true;
    try {
      const { text } = await generate({ prompt: `Write the standard LaTeX (KaTeX-compatible, no $ delimiters, no explanation) for: ${words.value}. Reply with only the LaTeX.`, temperature: 0.1 });
      ta.value = text.replace(/^```(?:latex)?|```$/g, '').replace(/^\$+|\$+$/g, '').trim();
      draw();
    } catch (e) { toast(e.message, { kind: 'error' }); }
    aiBtn.disabled = false;
  } } });
  draw();
  const s = sheet({ title: 'Equation', wide: true, body: h('div', field('LaTeX', ta), snippets, h('div', { style: { height: '14px' } }), prev,
    h('div', { style: { display: 'flex', gap: '10px', marginTop: '14px', alignItems: 'center', flexWrap: 'wrap' } }, words, aiBtn),
    h('div', { style: { marginTop: '14px' } }, field('Equation number (optional)', num))),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
    h('button.btn.primary', { type: 'button', text: 'Done', on: { click: () => { setData(blk, { latex: ta.value.trim(), num: num.value.trim() }, editor); s.close(); } } })] });
}

/* ---------------- timeline ---------------- */
function renderTimeline(host, d, blk) {
  blk.dataset.layout = d.layout || 'vertical';
  const tl = h('div.tl');
  for (const it of d.items || []) tl.append(h('div.tl-item', h('div.tl-date', it.date || ''), h('div.tl-title', it.title || ''), it.text ? h('div.tl-text', it.text) : null));
  if (!(d.items || []).length) tl.append(h('div.tl-item', h('div.tl-date', 'Date'), h('div.tl-title', 'Tap to add events')));
  host.append(tl);
}
export function editTimeline(blk, editor) {
  const d = dataOf(blk);
  const items = structuredClone(d.items || []);
  if (!items.length) items.push({ date: '', title: '', text: '' });
  let layout = d.layout || 'vertical';
  const list = h('div', { style: { display: 'grid', gap: '10px' } });
  const draw = () => {
    list.innerHTML = '';
    items.forEach((it, i) => {
      const row = h('div', { style: { display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '8px', alignItems: 'start', padding: '10px', borderRadius: '12px', background: 'var(--sunken)' } },
        h('input.field.sm', { type: 'text', placeholder: 'Date', value: it.date, on: { input: (e) => { it.date = e.target.value; } } }),
        h('div', { style: { display: 'grid', gap: '6px' } },
          h('input.field.sm', { type: 'text', placeholder: 'Event', value: it.title, on: { input: (e) => { it.title = e.target.value; } } }),
          (() => { const t = h('textarea.field.sm', { rows: 2, placeholder: 'Details (optional)', on: { input: (e) => { it.text = e.target.value; } } }); t.value = it.text || ''; return t; })()),
        h('div', { style: { display: 'grid' } },
          iconBtn('chevron-up', 'Move up', () => { if (i) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } }, 'sm'),
          iconBtn('chevron-down', 'Move down', () => { if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); } }, 'sm'),
          iconBtn('trash', 'Remove', () => { items.splice(i, 1); draw(); }, 'sm')));
      list.append(row);
    });
  };
  draw();
  const s = sheet({ title: 'Timeline', wide: true, body: h('div',
    h('div', { style: { display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' } },
      segmented([{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }], layout, (v) => { layout = v; })),
    list,
    h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
      h('button.btn.sm', { type: 'button', html: ic('plus') + '<span>Add event</span>', on: { click: () => { items.push({ date: '', title: '', text: '' }); draw(); } } }),
      h('button.btn.sm.ghost', { type: 'button', text: 'Sort by date', on: { click: () => { items.sort((a, b) => yearOf(a.date) - yearOf(b.date)); draw(); } } }))),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
    h('button.btn.primary', { type: 'button', text: 'Done', on: { click: () => { setData(blk, { layout, items: items.filter((i) => i.date || i.title) }, editor); s.close(); } } })] });
}
function yearOf(s) {
  const m = String(s).match(/(-?\d{1,4})\s*(BC|BCE|AD|CE)?/i);
  if (!m) return 0;
  let y = parseInt(m[1], 10);
  if (/BC/i.test(m[2] || '')) y = -y;
  return y;
}

/* ---------------- flowchart ---------------- */
function wrapText(t, max = 18) {
  const words = String(t).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}
export function parseFlow(src) {
  const nodes = new Map();
  const edges = [];
  const node = (raw) => {
    let label = raw.trim();
    let shape = 'rect';
    if (/^\(\(.*\)\)$/.test(label) || /^\(.*\)$/.test(label)) { shape = 'pill'; label = label.replace(/^\(+|\)+$/g, ''); }
    else if (/^\{.*\}$/.test(label) || /\?$/.test(label)) { shape = 'diamond'; label = label.replace(/^\{|\}$/g, ''); }
    else if (/^\[.*\]$/.test(label)) label = label.slice(1, -1);
    const key = label.toLowerCase();
    if (!nodes.has(key)) nodes.set(key, { id: key, label, shape });
    else if (shape !== 'rect') nodes.get(key).shape = shape;
    return key;
  };
  for (const line of String(src || '').split('\n')) {
    if (!line.trim()) continue;
    const [chain, edgeLabel] = line.split(/\s:\s|\|/).map((x) => x?.trim());
    const parts = chain.split(/\s*(?:-->|->|→|=>)\s*/).filter(Boolean);
    const ids = parts.map(node);
    for (let i = 0; i < ids.length - 1; i++) edges.push({ from: ids[i], to: ids[i + 1], label: i === ids.length - 2 ? edgeLabel || '' : '' });
  }
  return { nodes: [...nodes.values()], edges };
}
function renderFlow(d) {
  const { nodes, edges } = parseFlow(d.src || 'Start -> Step -> End');
  const horiz = d.dir === 'LR';
  const level = new Map(nodes.map((n) => [n.id, 0]));
  for (let k = 0; k < nodes.length; k++) for (const e of edges) if (e.from !== e.to && level.get(e.to) <= level.get(e.from) && k < nodes.length - 1) level.set(e.to, level.get(e.from) + 1);
  const layers = [];
  for (const n of nodes) (layers[level.get(n.id)] ||= []).push(n);
  const W = 168, H = 64, GX = 46, GY = 56;
  const maxPer = Math.max(...layers.map((l) => l?.length || 0));
  const spanH = maxPer * W + (maxPer - 1) * GX;
  const spanV = maxPer * H + (maxPer - 1) * GY;
  const pos = new Map();
  layers.forEach((layer, li) => {
    if (!layer) return;
    const count = layer.length;
    layer.forEach((n, i) => {
      if (horiz) {
        const y = (spanV - (count * H + (count - 1) * GY)) / 2 + i * (H + GY);
        const x = li * (W + GX);
        pos.set(n.id, { x, y, cx: x + W / 2, cy: y + H / 2 });
      } else {
        const x = (spanH - (count * W + (count - 1) * GX)) / 2 + i * (W + GX);
        const y = li * (H + GY);
        pos.set(n.id, { x, y, cx: x + W / 2, cy: y + H / 2 });
      }
    });
  });
  const allX = [...pos.values()].map((p) => p.x), allY = [...pos.values()].map((p) => p.y);
  const width = Math.max(...allX) + W + 20, height = Math.max(...allY) + H + 20;
  const svg = sv('svg', { viewBox: `-10 -10 ${width} ${height}`, role: 'img', 'aria-label': 'Flowchart', style: `max-width:${Math.round(width * 0.92)}px;margin:0 auto` });
  svg.append(sv('defs', {}, sv('marker', { id: 'ah', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, sv('path', { d: 'M0 0L10 5L0 10z', class: 'arrowhead' }))));
  const edgeG = sv('g');
  for (const e of edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    let x1, y1, x2, y2;
    if (horiz) { x1 = a.x + W; y1 = a.cy; x2 = b.x; y2 = b.cy; if (b.x <= a.x) { x1 = a.cx; y1 = a.y + H; x2 = b.cx; y2 = b.y + H; } }
    else { x1 = a.cx; y1 = a.y + H; x2 = b.cx; y2 = b.y; if (b.y <= a.y) { x1 = a.x + W; y1 = a.cy; x2 = b.x + W; y2 = b.cy; } }
    const back = horiz ? b.x <= a.x : b.y <= a.y;
    const path = back
      ? (horiz ? `M${x1} ${y1} C${x1} ${y1 + 50} ${x2} ${y2 + 50} ${x2} ${y2 + 4}` : `M${x1} ${y1} C${x1 + 60} ${y1} ${x2 + 60} ${y2} ${x2 + 4} ${y2}`)
      : (horiz ? `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2 - 2} ${y2}` : `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2 - 2}`);
    edgeG.append(sv('path', { d: path, class: 'd-edge', 'marker-end': 'url(#ah)' }));
    if (e.label) {
      const t = sv('text', { x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2 - 4, class: 'd-edge-label' });
      t.textContent = e.label;
      edgeG.append(t);
    }
  }
  svg.append(edgeG);
  for (const n of nodes) {
    const p = pos.get(n.id);
    const g = sv('g', { class: 'd-node' });
    if (n.shape === 'diamond') g.append(sv('polygon', { points: `${p.cx},${p.y - 6} ${p.x + W + 6},${p.cy} ${p.cx},${p.y + H + 6} ${p.x - 6},${p.cy}` }));
    else g.append(sv('rect', { x: p.x, y: p.y, width: W, height: H, rx: n.shape === 'pill' ? H / 2 : 10 }));
    const lines = wrapText(n.label, n.shape === 'diamond' ? 14 : 20);
    const t = sv('text', { x: p.cx, y: p.cy - (lines.length - 1) * 8.5 + 5, 'text-anchor': 'middle' });
    lines.forEach((l, i) => { const ts = sv('tspan', { x: p.cx, dy: i ? 17 : 0 }); ts.textContent = l; t.append(ts); });
    g.append(t);
    svg.append(g);
  }
  return svg;
}
export function editFlow(blk, editor) {
  const d = dataOf(blk);
  const ta = h('textarea.field', { rows: 8, style: { fontFamily: 'var(--font-mono)', fontSize: '14px' } });
  ta.value = d.src || '(Start) -> Gather data -> Is it valid? -> Analyse -> (End)\nIs it valid? -> Fix the data : no\nFix the data -> Gather data';
  let dir = d.dir || 'TB';
  const prev = h('div.vis-preview.blk-diagram');
  const draw = debounce(() => { prev.innerHTML = ''; try { prev.append(renderFlow({ src: ta.value, dir })); } catch (e) { prev.textContent = e.message; } }, 150);
  ta.addEventListener('input', draw);
  draw.flush();
  const s = sheet({ title: 'Flowchart', wide: true, body: h('div',
    h('p.muted', { style: { marginTop: 0, fontSize: '14px' } }, 'One arrow chain per line: A -> B -> C. Add “: label” to name the last arrow. A step ending in “?” becomes a decision; wrap a step in ( ) for start/end.'),
    ta, h('div', { style: { margin: '12px 0' } }, segmented([{ value: 'TB', label: 'Top to bottom' }, { value: 'LR', label: 'Left to right' }], dir, (v) => { dir = v; draw.flush(); })), prev),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
    h('button.btn.primary', { type: 'button', text: 'Done', on: { click: () => { setData(blk, { src: ta.value, dir }, editor); s.close(); } } })] });
}

/* ---------------- mind map ---------------- */
export function parseOutline(src) {
  const lines = String(src || '').split('\n').filter((l) => l.trim());
  if (!lines.length) return { label: 'Topic', children: [] };
  const indent = (l) => l.replace(/\t/g, '  ').match(/^\s*/)[0].length;
  const clean = (l) => l.trim().replace(/^[-*•]\s*/, '');
  const root = { label: clean(lines[0]), children: [] };
  const stack = [{ node: root, ind: -1 }];
  for (const l of lines.slice(1)) {
    const ind = indent(l);
    const n = { label: clean(l), children: [] };
    while (stack.length > 1 && stack[stack.length - 1].ind >= ind) stack.pop();
    stack[stack.length - 1].node.children.push(n);
    stack.push({ node: n, ind });
  }
  return root;
}
function renderMindmap(d) {
  const root = parseOutline(d.src);
  const leaves = (n) => (n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1);
  const kids = root.children;
  const left = [], right = [];
  let lw = 0, rw = 0;
  for (const c of kids) { if (rw <= lw) { right.push(c); rw += leaves(c); } else { left.push(c); lw += leaves(c); } }
  const ROW = 40, COL = 190;
  const rows = Math.max(lw, rw, 1);
  const height = rows * ROW + 40;
  const depth = (n) => 1 + Math.max(0, ...n.children.map(depth));
  const dl = Math.max(0, ...left.map(depth)), dr = Math.max(0, ...right.map(depth));
  const cx = dl * COL + 110, cy = height / 2;
  const width = cx + dr * COL + 110;
  const svg = sv('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Mind map: ' + root.label, style: `max-width:${Math.round(width)}px;margin:0 auto` });
  const palette = ['#C0584A', '#3F7CAC', '#5B8C5A', '#B5893A', '#7A5BA6', '#2E8A8A', '#B4567A'];
  const edgesG = sv('g'), nodesG = sv('g');
  const place = (list, side, total) => {
    let y = cy - (total * ROW) / 2;
    list.forEach((c, i) => {
      const color = palette[(kids.indexOf(c)) % palette.length];
      const lay = (n, x, top, lvl) => {
        const span = leaves(n) * ROW;
        const ny = top + span / 2;
        let tTop = top;
        for (const ch of n.children) { lay(ch, x + side * COL, tTop, lvl + 1); edge(x, ny, x + side * COL, tTop + (leaves(ch) * ROW) / 2, color, lvl + 1); tTop += leaves(ch) * ROW; }
        nodeAt(n.label, x, ny, color, lvl);
        return ny;
      };
      const span = leaves(c) * ROW;
      const x = cx + side * COL;
      lay(c, x, y, 1);
      edge(cx, cy, x, y + span / 2, color, 1);
      y += span;
    });
  };
  function edge(x1, y1, x2, y2, color, lvl) {
    const mx = (x1 + x2) / 2;
    edgesG.append(sv('path', { d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`, fill: 'none', stroke: color, 'stroke-width': Math.max(1.4, 4 - lvl), 'stroke-linecap': 'round', opacity: '.75' }));
  }
  function nodeAt(label, x, y, color, lvl) {
    const t = sv('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-weight': lvl === 1 ? '650' : '500', 'font-size': lvl === 1 ? 14.5 : 13, style: 'font-family: var(--font-ui); fill: var(--ink)' });
    t.textContent = label.length > 26 ? label.slice(0, 25) + '…' : label;
    const w = Math.min(176, Math.max(60, t.textContent.length * (lvl === 1 ? 8 : 7.2) + 22));
    nodesG.append(sv('rect', { x: x - w / 2, y: y - 14, width: w, height: 28, rx: 14, fill: 'var(--paper-c)', stroke: color, 'stroke-width': lvl === 1 ? 2 : 1.3 }), t);
  }
  place(right, 1, rw);
  place(left, -1, lw);
  const rt = sv('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', style: 'font: 650 16px var(--font-display); fill: var(--accent-ink)' });
  rt.textContent = root.label;
  const rwid = Math.min(210, root.label.length * 9 + 40);
  nodesG.append(sv('rect', { x: cx - rwid / 2, y: cy - 22, width: rwid, height: 44, rx: 22, style: 'fill: var(--accent)' }), rt);
  svg.append(edgesG, nodesG);
  return svg;
}
export function editMindmap(blk, editor) {
  const d = dataOf(blk);
  const ta = h('textarea.field', { rows: 10, style: { fontFamily: 'var(--font-mono)', fontSize: '14px' } });
  ta.value = d.src || 'Photosynthesis\n  Inputs\n    Light\n    Water\n    CO₂\n  Outputs\n    Glucose\n    Oxygen\n  Stages\n    Light reactions\n    Calvin cycle';
  const prev = h('div.vis-preview.blk-diagram');
  const draw = debounce(() => { prev.innerHTML = ''; prev.append(renderMindmap({ src: ta.value })); }, 150);
  ta.addEventListener('input', draw);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); draw(); } });
  draw.flush();
  const s = sheet({ title: 'Mind map', wide: true, body: h('div', h('p.muted', { style: { marginTop: 0, fontSize: '14px' } }, 'First line is the central topic. Indent lines (two spaces or Tab) to branch out.'), ta, h('div', { style: { height: '12px' } }), prev),
    actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
      h('button.btn.primary', { type: 'button', text: 'Done', on: { click: () => { setData(blk, { src: ta.value }, editor); s.close(); } } })] });
}

/* ---------------- map (Leaflet + OpenStreetMap) ---------------- */
let leafletP;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return leafletP ||= new Promise((res, rej) => {
    document.head.append(h('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' }));
    const s = h('script', { src: 'vendor/leaflet/leaflet.js' });
    s.onload = () => res(window.L);
    s.onerror = rej;
    document.head.append(s);
  });
}
function renderMap(host, d) {
  const box = h('div.map-host');
  if (d.height) box.style.height = d.height + 'px';
  host.append(box);
  loadLeaflet().then((L) => {
    if (!box.isConnected) return;
    L.Icon.Default.imagePath = 'vendor/leaflet/images/';
    const map = L.map(box, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: false }).setView(d.center || [20, 0], d.zoom || 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors', crossOrigin: true }).addTo(map);
    for (const m of d.markers || []) {
      if (!isFinite(m.lat) || !isFinite(m.lng)) continue;
      const mk = L.marker([m.lat, m.lng]).addTo(map);
      mk.bindTooltip(esc(m.label || ''), { permanent: true, direction: 'top', offset: [-15, -14], className: 'map-tip' });
      if (m.note) mk.bindPopup(`<b>${esc(m.label)}</b><br>${esc(m.note)}`);
    }
    if ((d.markers || []).length > 1 && !d.fixedView) map.fitBounds(d.markers.map((m) => [m.lat, m.lng]), { padding: [40, 40], maxZoom: 8 });
    box._map = map;
  }).catch(() => { box.textContent = 'The map needs an internet connection.'; });
}
export function editMap(blk, editor) {
  const d = structuredClone(dataOf(blk));
  d.markers ||= [];
  const list = h('div', { style: { display: 'grid', gap: '8px' } });
  const q = h('input.field', { type: 'search', placeholder: 'Find a place, e.g. “Carthage” or “Nile delta”' });
  const results = h('div', { style: { display: 'grid', gap: '4px', margin: '8px 0' } });
  const title = h('input.field', { type: 'text', value: d.title || '', placeholder: 'Map title' });
  const drawList = () => {
    list.innerHTML = '';
    d.markers.forEach((m, i) => list.append(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: '8px', alignItems: 'center' } },
      h('input.field.sm', { type: 'text', value: m.label, on: { input: (e) => { m.label = e.target.value; } } }),
      h('input.field.sm', { type: 'text', value: m.note || '', placeholder: 'Note', on: { input: (e) => { m.note = e.target.value; } } }),
      iconBtn('trash', 'Remove', () => { d.markers.splice(i, 1); drawList(); }, 'sm'))));
    if (!d.markers.length) list.append(h('p.muted', { style: { margin: 0 } }, 'No places yet. Search above to add them.'));
  };
  const search = async () => {
    if (!q.value.trim()) return;
    results.innerHTML = '<span class="thinking"><i></i><i></i><i></i></span>';
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q.value.trim()), { headers: { Accept: 'application/json' } });
      const arr = await r.json();
      results.innerHTML = '';
      if (!arr.length) results.append(h('p.muted', 'No places found.'));
      for (const p of arr) results.append(h('button.list-row', { type: 'button', style: { minHeight: '44px' }, on: { click: () => { d.markers.push({ lat: +p.lat, lng: +p.lon, label: p.display_name.split(',')[0], note: '' }); results.innerHTML = ''; q.value = ''; drawList(); } } },
        h('span', { html: ic('pin') }), h('div.lr-main', h('div.lr-title', p.display_name.split(',')[0]), h('div.lr-sub', p.display_name))));
    } catch { results.innerHTML = ''; results.append(h('p.muted', 'Search needs an internet connection.')); }
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  drawList();
  const s = sheet({ title: 'Map', wide: true, body: h('div', field('Title', title), h('div', { style: { display: 'flex', gap: '8px' } }, q, h('button.btn', { type: 'button', text: 'Search', on: { click: search } })), results, h('h4', { style: { margin: '14px 0 8px', fontSize: '13px', color: 'var(--text-2)' } }, 'Places'), list,
    h('p.faint', { style: { fontSize: '12px', marginTop: '14px' } }, 'Map data © OpenStreetMap contributors. Place search by Nominatim.')),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
    h('button.btn.primary', { type: 'button', text: 'Done', on: { click: () => { d.title = title.value; d.fixedView = false; setData(blk, d, editor); const cap = blk.querySelector('figcaption'); if (cap && !cap.textContent && d.title) cap.textContent = d.title; s.close(); } } })] });
}

/* ---------------- molecule (SmilesDrawer) ---------------- */
let smilesP;
function loadSmiles() {
  if (window.SmilesDrawer) return Promise.resolve(window.SmilesDrawer);
  return smilesP ||= new Promise((res, rej) => { const s = h('script', { src: 'vendor/smiles-drawer.min.js' }); s.onload = () => res(window.SmilesDrawer); s.onerror = rej; document.head.append(s); });
}
function renderMolecule(host, d) {
  const row = h('div.mol-row');
  host.append(row);
  const items = d.items || [];
  loadSmiles().then((SD) => {
    const dark = ['dark', 'navy', 'forest'].includes(document.documentElement.dataset.theme) && document.documentElement.dataset.paper !== 'light';
    items.forEach((it, i) => {
      if (i > 0) row.append(h('span.mol-arrow', d.reaction ? (it.arrow || '→') : '+'));
      const unit = h('div.mol-unit');
      const id = 'mol' + Math.random().toString(36).slice(2);
      const svgEl = document.createElementNS(SVGNS, 'svg');
      svgEl.id = id;
      svgEl.setAttribute('class', 'mol-svg');
      svgEl.setAttribute('width', '220');
      svgEl.setAttribute('height', '170');
      unit.append(svgEl, h('div.mol-name', it.name || ''));
      row.append(unit);
      try {
        if (SD.SvgDrawer) {
          const drawer = new SD.SvgDrawer({ width: 220, height: 170, bondThickness: 1.1, fontSizeLarge: 7, fontSizeSmall: 5, padding: 14 });
          SD.parse(it.smiles, (tree) => drawer.draw(tree, svgEl, dark ? 'dark' : 'light', false), (err) => { unit.prepend(h('p.eq-error', 'Invalid structure: ' + it.smiles)); svgEl.remove(); console.warn(err); });
        }
      } catch (e) { unit.prepend(h('p.eq-error', 'Could not draw ' + (it.name || it.smiles))); }
    });
    if (!items.length) row.append(h('p.muted', 'Tap edit to add a molecule.'));
  }).catch(() => row.append(h('p.eq-error', 'Molecule drawing could not load.')));
}
export function editMolecule(blk, editor) {
  const d = structuredClone(dataOf(blk));
  d.items ||= [{ smiles: 'CCO', name: 'Ethanol' }];
  const list = h('div', { style: { display: 'grid', gap: '8px' } });
  const prev = h('div.vis-preview.blk-mol');
  const redraw = debounce(() => { prev.innerHTML = ''; renderMolecule(prev, d); }, 300);
  const drawList = () => {
    list.innerHTML = '';
    d.items.forEach((it, i) => list.append(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1.3fr auto', gap: '8px' } },
      h('input.field.sm', { type: 'text', value: it.name || '', placeholder: 'Name', on: { input: (e) => { it.name = e.target.value; redraw(); } } }),
      h('input.field.sm', { type: 'text', value: it.smiles, placeholder: 'SMILES, e.g. c1ccccc1', style: { fontFamily: 'var(--font-mono)' }, on: { input: (e) => { it.smiles = e.target.value.trim(); redraw(); } } }),
      iconBtn('trash', 'Remove', () => { d.items.splice(i, 1); drawList(); redraw(); }, 'sm'))));
  };
  const nameQ = h('input.field', { type: 'text', placeholder: 'Type a compound name, e.g. “aspirin”' });
  const lookup = h('button.btn', { type: 'button', text: 'Look up', on: { click: async () => {
    if (!nameQ.value.trim()) return;
    lookup.disabled = true;
    try {
      const r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(nameQ.value.trim())}/property/IsomericSMILES,CanonicalSMILES/JSON`);
      if (!r.ok) throw new Error('not found');
      const j = await r.json();
      const p = j.PropertyTable.Properties[0];
      d.items.push({ name: nameQ.value.trim(), smiles: p.IsomericSMILES || p.CanonicalSMILES || p.SMILES || p.ConnectivitySMILES });
      nameQ.value = '';
      drawList(); redraw();
    } catch { toast('PubChem has no compound with that name.'); }
    lookup.disabled = false;
  } } });
  drawList(); redraw();
  const s = sheet({ title: 'Molecule', wide: true, body: h('div',
    h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } }, nameQ, lookup),
    list,
    h('div', { style: { display: 'flex', gap: '10px', margin: '12px 0', alignItems: 'center' } },
      h('button.btn.sm', { type: 'button', html: ic('plus') + '<span>Add molecule</span>', on: { click: () => { d.items.push({ smiles: '', name: '' }); drawList(); } } }),
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' } }, h('input', { type: 'checkbox', checked: !!d.reaction, on: { change: (e) => { d.reaction = e.target.checked; redraw(); } } }), 'Show as a reaction (arrows)')),
    prev, h('p.faint', { style: { fontSize: '12px' } }, 'Structures drawn from SMILES. Name look-up uses PubChem (NIH).')),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
    h('button.btn.primary', { type: 'button', text: 'Done', on: { click: () => { d.items = d.items.filter((x) => x.smiles); setData(blk, d, editor); s.close(); } } })] });
}

/* ---------------- function graph ---------------- */
const GRAPH_COLORS = ['#C0584A', '#3F7CAC', '#5B8C5A', '#B5893A', '#7A5BA6'];
function niceStep(range) { const raw = range / 8; const p = 10 ** Math.floor(Math.log10(raw)); const n = raw / p; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p; }
function renderGraph(host, d) {
  const W = 640, H = 400, P = 34;
  const [x0, x1] = [Number(d.xmin ?? -10), Number(d.xmax ?? 10)];
  const fns = (d.fns || []).map((f, i) => { try { return { ...f, f: compile(f.expr), color: f.color || GRAPH_COLORS[i % 5] }; } catch (e) { return { ...f, err: e.message }; } });
  let y0 = d.ymin, y1 = d.ymax;
  if (y0 == null || y1 == null || y0 === '' || y1 === '') {
    let lo = Infinity, hi = -Infinity;
    for (const f of fns) if (f.f) for (let i = 0; i <= 200; i++) { const y = f.f(x0 + (x1 - x0) * i / 200); if (isFinite(y) && Math.abs(y) < 1e6) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
    for (const p of d.points || []) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    if (!isFinite(lo)) { lo = -10; hi = 10; }
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.1;
    y0 = lo - pad; y1 = hi + pad;
  }
  y0 = Number(y0); y1 = Number(y1);
  const X = (x) => P + (x - x0) / (x1 - x0) * (W - 2 * P);
  const Y = (y) => H - P - (y - y0) / (y1 - y0) * (H - 2 * P);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Graph of ' + fns.map((f) => 'y = ' + f.expr).join(', ') });
  const sx = niceStep(x1 - x0), sy = niceStep(y1 - y0);
  for (let x = Math.ceil(x0 / sx) * sx; x <= x1 + 1e-9; x += sx) {
    svg.append(sv('line', { x1: X(x), x2: X(x), y1: P, y2: H - P, class: 'g-grid' }));
    if (Math.abs(x) > 1e-9) { const t = sv('text', { x: X(x), y: Math.min(H - P + 16, Math.max(P + 12, Y(0) + 16)), 'text-anchor': 'middle' }); t.textContent = +x.toFixed(6); svg.append(t); }
  }
  for (let y = Math.ceil(y0 / sy) * sy; y <= y1 + 1e-9; y += sy) {
    svg.append(sv('line', { x1: P, x2: W - P, y1: Y(y), y2: Y(y), class: 'g-grid' }));
    if (Math.abs(y) > 1e-9) { const t = sv('text', { x: Math.min(W - P - 4, Math.max(P + 4, X(0) - 6)), y: Y(y) + 4, 'text-anchor': 'end' }); t.textContent = +y.toFixed(6); svg.append(t); }
  }
  if (y0 <= 0 && y1 >= 0) svg.append(sv('line', { x1: P, x2: W - P, y1: Y(0), y2: Y(0), class: 'g-axis' }));
  if (x0 <= 0 && x1 >= 0) svg.append(sv('line', { x1: X(0), x2: X(0), y1: P, y2: H - P, class: 'g-axis' }));
  const ax = sv('text', { x: W - P + 6, y: (y0 <= 0 && y1 >= 0 ? Y(0) : H - P) + 4 }); ax.textContent = d.xlabel || 'x'; svg.append(ax);
  const ay = sv('text', { x: (x0 <= 0 && x1 >= 0 ? X(0) : P) + 6, y: P - 10 }); ay.textContent = d.ylabel || 'y'; svg.append(ay);
  const clip = sv('clipPath', { id: 'gc' + Math.random().toString(36).slice(2) }, sv('rect', { x: P, y: P, width: W - 2 * P, height: H - 2 * P }));
  svg.append(sv('defs', {}, clip));
  for (const f of fns) {
    if (!f.f) continue;
    let dpath = '';
    let pen = false, prevY = null;
    const N = 600;
    for (let i = 0; i <= N; i++) {
      const x = x0 + (x1 - x0) * i / N;
      const y = f.f(x);
      if (!isFinite(y) || (prevY != null && Math.abs(Y(y) - Y(prevY)) > H * 1.5)) { pen = false; prevY = isFinite(y) ? y : null; continue; }
      const py = Math.max(-H, Math.min(2 * H, Y(y)));
      dpath += (pen ? 'L' : 'M') + X(x).toFixed(2) + ' ' + py.toFixed(2);
      pen = true; prevY = y;
    }
    svg.append(sv('path', { d: dpath, class: 'g-fn', stroke: f.color, 'clip-path': `url(#${clip.id})` }));
  }
  for (const p of d.points || []) {
    svg.append(sv('circle', { cx: X(p.x), cy: Y(p.y), r: 4.5, style: 'fill: var(--ink)' }));
    if (p.label) { const t = sv('text', { x: X(p.x) + 8, y: Y(p.y) - 8, style: 'font-weight:600' }); t.textContent = p.label; svg.append(t); }
  }
  host.append(svg);
  const legend = h('div.g-legend');
  for (const f of fns) legend.append(h('span', f.err ? { style: { color: 'var(--danger)' } } : null, h('i', { style: { background: f.color } }), 'y = ' + f.expr + (f.err ? ` (${f.err})` : '')));
  host.append(legend);
}
export function editGraph(blk, editor) {
  const d = structuredClone(dataOf(blk));
  d.fns ||= [{ expr: 'x^2 - 4' }];
  const list = h('div', { style: { display: 'grid', gap: '8px' } });
  const prev = h('div.vis-preview.blk-graph');
  const redraw = debounce(() => { prev.innerHTML = ''; renderGraph(prev, d); }, 200);
  const num = (k, ph) => h('input.field.sm', { type: 'number', step: 'any', value: d[k] ?? '', placeholder: ph, on: { input: (e) => { d[k] = e.target.value === '' ? null : +e.target.value; redraw(); } } });
  const drawList = () => {
    list.innerHTML = '';
    d.fns.forEach((f, i) => list.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
      h('span', { style: { fontFamily: 'var(--font-mono)', color: 'var(--text-2)' } }, 'y ='),
      h('input.field.sm', { type: 'text', value: f.expr, style: { fontFamily: 'var(--font-mono)' }, on: { input: (e) => { f.expr = e.target.value; redraw(); } } }),
      h('input', { type: 'color', value: f.color || GRAPH_COLORS[i % 5], style: { width: '40px', height: '36px', border: 0, background: 'none' }, on: { input: (e) => { f.color = e.target.value; redraw(); } } }),
      iconBtn('trash', 'Remove', () => { d.fns.splice(i, 1); drawList(); redraw(); }, 'sm'))));
  };
  drawList(); redraw();
  const s = sheet({ title: 'Graph', wide: true, body: h('div',
    h('p.muted', { style: { marginTop: 0, fontSize: '14px' } }, 'Use x as the variable: 2x^2 - 3x + 1, sin(x), sqrt(x), e^(-x), ln(x), |x|.'),
    list,
    h('button.btn.sm', { type: 'button', style: { margin: '10px 0' }, html: ic('plus') + '<span>Add function</span>', on: { click: () => { d.fns.push({ expr: '' }); drawList(); } } }),
    h('div.form-grid', field('x from', num('xmin', '-10')), field('x to', num('xmax', '10')), field('y from', num('ymin', 'auto')), field('y to', num('ymax', 'auto'))),
    prev),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
    h('button.btn.primary', { type: 'button', text: 'Done', on: { click: () => { d.fns = d.fns.filter((f) => f.expr.trim()); setData(blk, d, editor); s.close(); } } })] });
}

/* ---------------- decorations ---------------- */
export const DECOS = {
  flourish: '<svg viewBox="0 0 400 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M40 20h120M240 20h120"/><path d="M200 8c-14 0-20 12-34 12 14 0 20 12 34 12s20-12 34-12c-14 0-20-12-34-12z"/><circle cx="200" cy="20" r="3" fill="currentColor"/></svg>',
  dots: '<svg viewBox="0 0 400 20" fill="currentColor"><circle cx="170" cy="10" r="2.5"/><circle cx="200" cy="10" r="3.5"/><circle cx="230" cy="10" r="2.5"/></svg>',
  wave: '<svg viewBox="0 0 400 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 12c20-10 40 10 60 0s40-10 60 0 40 10 60 0 40-10 60 0 40 10 60 0 40-10 60 0"/></svg>',
  laurel: '<svg viewBox="0 0 400 44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M120 22h160"/><path d="M110 22c-10-8-24-10-36-6M110 22c-10 8-24 10-36 6M92 22c-8-6-18-8-26-5M92 22c-8 6-18 8-26 5M290 22c10-8 24-10 36-6M290 22c10 8 24 10 36 6M308 22c8-6 18-8 26-5M308 22c8 6 18 8 26 5"/></svg>',
  stars: '<svg viewBox="0 0 400 30" fill="currentColor"><path d="M200 5l3 7 7 .6-5.4 4.6 1.7 7-6.3-3.8-6.3 3.8 1.7-7-5.4-4.6 7-.6z"/><path d="M160 11l1.8 4.2 4.2.4-3.2 2.8 1 4.2-3.8-2.3-3.8 2.3 1-4.2-3.2-2.8 4.2-.4z" opacity=".6"/><path d="M240 11l1.8 4.2 4.2.4-3.2 2.8 1 4.2-3.8-2.3-3.8 2.3 1-4.2-3.2-2.8 4.2-.4z" opacity=".6"/></svg>',
};
function renderDeco(host, d, blk) {
  blk.classList.toggle('washi', d.kind === 'washi');
  if (d.kind === 'washi') return;
  host.innerHTML = DECOS[d.kind] || DECOS.flourish;
}

/* ---------------- table of contents ---------------- */
function renderToc(host, editor) {
  const ctx = editor?.ctx;
  if (!ctx) return;
  const nb = S.notebooks.get(ctx.notebookId);
  if (!nb) return;
  const box = h('div', { style: { padding: '6px 4px' } }, h('h3', { style: { font: '600 24px var(--font-display)', margin: '0 0 12px' } }, nb.toc?.title || 'Contents'));
  const pages = pagesOf(nb.id, { includeArchived: false }).filter((p) => !(nb.toc?.hidden || []).includes(p.id));
  const byFolder = [{ id: null, name: '' }, ...(nb.folders || [])];
  let n = 0;
  for (const f of byFolder) {
    const ps = pages.filter((p) => (p.folderId || null) === f.id);
    if (!ps.length) continue;
    if (f.name) box.append(h('div', { style: { font: '700 12.5px var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', margin: '14px 0 4px' } }, f.name));
    for (const p of ps) {
      n++;
      box.append(h('a', { href: `#/nb/${nb.id}/${p.id}`, style: { display: 'flex', gap: '10px', textDecoration: 'none', color: 'inherit', padding: '3px 0', borderBottom: '1px dotted color-mix(in srgb, var(--ink) 25%, transparent)' } },
        h('span', { style: { flex: 1 } }, p.title || 'Untitled page'), h('span', { style: { color: 'color-mix(in srgb, var(--ink) 55%, transparent)', fontVariantNumeric: 'tabular-nums' } }, String(n))));
      if (nb.toc?.showHeadings !== false) for (const hd of headingsOf(p.html).filter((x) => x.level <= 2)) box.append(h('div', { style: { paddingLeft: '18px', fontSize: '.9em', color: 'color-mix(in srgb, var(--ink) 70%, transparent)' } }, hd.text));
    }
  }
  host.append(box);
}

/* ---------------- editing entry points ---------------- */
export const EDITORS = { equation: editEquation, timeline: editTimeline, flow: editFlow, mindmap: editMindmap, map: editMap, molecule: editMolecule, graph: editGraph };

export function insertDataBlock(type, editor, data) {
  const defaults = {
    equation: { latex: '' }, timeline: { layout: 'vertical', items: [] }, flow: { src: '', dir: 'TB' }, mindmap: { src: '' },
    map: { center: [20, 0], zoom: 2, markers: [] }, molecule: { items: [] }, graph: { fns: [{ expr: 'x^2' }], xmin: -5, xmax: 5 }, deco: { kind: 'flourish' }, toc: {},
  };
  const blk = makeBlock(type, data || defaults[type], { caption: !['deco', 'toc', 'equation'].includes(type) });
  editor.insertNode(blk);
  if (!data && EDITORS[type]) EDITORS[type](blk, editor);
  return blk;
}
