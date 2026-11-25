// Handwriting layer: pressure-sensitive pens, highlighter, eraser, shapes with recognition.
import { h, ic, menu, confirmDialog } from '../util.js';
import { S } from '../store.js';

export const PEN_COLORS = ['#1F1C17', '#23395B', '#7A2E3A', '#2F5D50', '#C0584A', '#2F6DB5', '#E8B931', '#FFFFFF'];
export const SIZES = [1.6, 3, 5.5];
const TOOL_DEFAULTS = {
  pen: { w: 2.6, o: 1 }, pencil: { w: 1.6, o: 0.75 }, marker: { w: 5, o: 1 }, hl: { w: 18, o: 0.32 },
  line: { w: 2.4, o: 1 }, arrow: { w: 2.4, o: 1 }, rect: { w: 2.4, o: 1 }, ellipse: { w: 2.4, o: 1 }, triangle: { w: 2.4, o: 1 },
};

export class Ink {
  constructor(sheet, { scroller, onChange, getScale }) {
    this.sheet = sheet;
    this.scroller = scroller;
    this.onChange = onChange;
    this.getScale = getScale || (() => 1);
    this.canvas = h('canvas.ink-layer');
    sheet.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.strokes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.active = false;
    this.tool = 'pen';
    this.color = PEN_COLORS[0];
    this.size = 1;
    this.snap = true;
    this.current = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(sheet);
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this.canvas.addEventListener('pointerdown', this._down);
    // Apple Pencil writes even in typing mode (like paper).
    this._sheetDown = (e) => {
      if (this.active || e.pointerType !== 'pen' || S.settings.pencilAlwaysDraws === false) return;
      if (e.target.closest('.blk-ui, .fig-label, .resize-h')) return;
      this.onPencil?.();
      this._down(e);
    };
    sheet.addEventListener('pointerdown', this._sheetDown, true);
  }
  load(strokes) {
    this.strokes = structuredClone(strokes || []);
    this.undoStack = [];
    this.redoStack = [];
    this.resize();
  }
  setActive(on) {
    this.active = on;
    this.canvas.classList.toggle('live', on);
    this.canvas.classList.toggle('erasing', on && this.tool === 'eraser');
  }
  setTool(t) { this.tool = t; this.canvas.classList.toggle('erasing', this.active && t === 'eraser'); }
  maxY() { let m = 0; for (const s of this.strokes) for (const p of s.pts) if (p[1] > m) m = p[1]; return m; }
  resize() {
    const w = this.sheet.offsetWidth, hgt = this.sheet.offsetHeight;
    if (!w || !hgt) return;
    const dpr = Math.min(3, (window.devicePixelRatio || 1) * Math.max(1, this.getScale()));
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(hgt * dpr)) {
      this.canvas.width = this.base.width = Math.round(w * dpr);
      this.canvas.height = this.base.height = Math.round(hgt * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = hgt + 'px';
      this.dpr = dpr;
    }
    this.renderBase();
    this.present();
  }
  renderBase() {
    const g = this.base.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.base.width, this.base.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ink = this._ink();
    for (const s of this.strokes) drawStroke(g, s, ink);
  }
  _ink() { return getComputedStyle(this.sheet).getPropertyValue('--ink').trim() || PEN_COLORS[0]; }
  present() {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.base, 0, 0);
    if (this.current && this.current.t !== 'eraser') { g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); drawStroke(g, this.current, this._ink()); }
  }
  _pt(e) {
    const r = this.sheet.getBoundingClientRect();
    const sc = r.width / this.sheet.offsetWidth || 1;
    const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : e.pointerType === 'touch' ? 0.55 : 0.5;
    return [Math.round(((e.clientX - r.left) / sc) * 10) / 10, Math.round(((e.clientY - r.top) / sc) * 10) / 10, Math.round(p * 100) / 100];
  }
  _down(e) {
    if (e.button && e.button !== 0) return;
    if (S.settings.pencilOnly && e.pointerType === 'touch') { this._panStart(e); return; }
    e.preventDefault();
    e.stopPropagation();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointerId = e.pointerId;
    const tool = this.active ? this.tool : 'pen';
    const d = TOOL_DEFAULTS[tool] || { w: 2.5, o: 1 };
    this.current = { t: tool, c: tool === 'hl' && this.color === PEN_COLORS[0] ? '#E8B931' : this.color, w: +(d.w * (SIZES[this.size] / SIZES[1])).toFixed(2), o: d.o, pts: [this._pt(e)] };
    if (tool === 'eraser') { this.current.erased = false; this._erase(this.current.pts[0]); }
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
  }
  _panStart(e) {
    let y = e.clientY, x = e.clientX;
    const mv = (ev) => { this.scroller.scrollTop -= ev.clientY - y; this.scroller.scrollLeft -= ev.clientX - x; y = ev.clientY; x = ev.clientX; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }
  _move(e) {
    if (!this.current || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const p = this._pt(ev);
      if (this.current.t === 'eraser') { this._erase(p); continue; }
      if (isShape(this.current.t)) { this.current.pts = [this.current.pts[0], p]; continue; }
      const last = this.current.pts[this.current.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) continue;
      this.current.pts.push(p);
    }
    clearTimeout(this.holdT);
    if (this.snap && ['pen', 'pencil', 'marker'].includes(this.current.t)) this.holdT = setTimeout(() => this._recognize(true), 550);
    this.present();
  }
  _up() {
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
    clearTimeout(this.holdT);
    const s = this.current;
    this.current = null;
    if (!s) return;
    if (s.t === 'eraser') { if (s.erased) this._commit(); this.present(); return; }
    if (s.pts.length === 1) s.pts.push([s.pts[0][0] + 0.3, s.pts[0][1] + 0.3, s.pts[0][2]]);
    if (isShape(s.t) && Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) < 4) { this.present(); return; }
    this._pushUndo();
    this.strokes.push(s);
    drawStroke(this._baseCtx(), s, this._ink());
    this.present();
    this.onChange(this.strokes);
  }
  _baseCtx() { const g = this.base.getContext('2d'); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); return g; }
  _recognize() {
    const s = this.current;
    if (!s || s.pts.length < 6) return;
    const shape = recognize(s.pts);
    if (!shape) return;
    s.t = shape.kind;
    s.pts = shape.pts;
    s.w = Math.max(2, s.w);
    this.present();
  }
  _erase(p) {
    const r = 10 * (SIZES[this.size] / SIZES[1]);
    const keep = [];
    let hit = false;
    for (const s of this.strokes) {
      if (strokeHit(s, p, r)) { hit = true; continue; }
      keep.push(s);
    }
    if (hit) {
      if (!this.current.erased) this._pushUndo();
      this.current.erased = true;
      this.strokes = keep;
      this.renderBase();
      this.present();
    }
  }
  _commit() { this.onChange(this.strokes); }
  _pushUndo() { this.undoStack.push(JSON.stringify(this.strokes)); if (this.undoStack.length > 100) this.undoStack.shift(); this.redoStack = []; }
  undo() { if (!this.undoStack.length) return false; this.redoStack.push(JSON.stringify(this.strokes)); this.strokes = JSON.parse(this.undoStack.pop()); this.renderBase(); this.present(); this.onChange(this.strokes); return true; }
  redo() { if (!this.redoStack.length) return false; this.undoStack.push(JSON.stringify(this.strokes)); this.strokes = JSON.parse(this.redoStack.pop()); this.renderBase(); this.present(); this.onChange(this.strokes); return true; }
  clear() { this._pushUndo(); this.strokes = []; this.renderBase(); this.present(); this.onChange(this.strokes); }

  /** PNG of the handwriting (optionally cropped to the ink) on white, for OCR. */
  snapshot({ pad = 24 } = {}) {
    if (!this.strokes.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of this.strokes) for (const p of s.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const scale = Math.min(2, 1600 / Math.max(1, x1 - x0));
    const c = document.createElement('canvas');
    c.width = Math.round((x1 - x0) * scale); c.height = Math.round((y1 - y0) * scale);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    for (const s of this.strokes) drawStroke(g, { ...s, c: s.t === 'hl' ? s.c : '#111' });
    return c.toDataURL('image/png');
  }
  /** Full-size transparent PNG for printing. */
  printImage() {
    if (!this.strokes.length) return null;
    return this.canvas.toDataURL('image/png');
  }
  destroy() { this.ro.disconnect(); this.sheet.removeEventListener('pointerdown', this._sheetDown, true); this.canvas.remove(); }
}

const isShape = (t) => ['line', 'arrow', 'rect', 'ellipse', 'triangle', 'poly'].includes(t);

export function drawStroke(g, s, defaultInk) {
  g.save();
  const col = defaultInk && s.c === PEN_COLORS[0] ? defaultInk : s.c;
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalAlpha = s.o ?? 1;
  if (s.t === 'hl') g.globalCompositeOperation = 'multiply';
  const pts = s.pts;
  if (isShape(s.t)) {
    g.lineWidth = s.w;
    const [a, b] = pts;
    g.beginPath();
    if (s.t === 'line' || s.t === 'arrow') {
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      if (s.t === 'arrow') {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 10 + s.w * 3;
        g.beginPath();
        g.moveTo(b[0], b[1]); g.lineTo(b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45));
        g.moveTo(b[0], b[1]); g.lineTo(b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45));
        g.stroke();
      }
    } else if (s.t === 'rect') { g.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
    else if (s.t === 'ellipse') { g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2); g.stroke(); }
    else if (s.t === 'triangle') { const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); g.moveTo((x0 + x1) / 2, y0); g.lineTo(x1, y1); g.lineTo(x0, y1); g.closePath(); g.stroke(); }
    else if (s.t === 'poly') { g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.stroke(); }
    g.restore();
    return;
  }
  if (s.t === 'pen') {
    // variable width from pressure
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const pr = (p0[2] + p1[2]) / 2;
      g.lineWidth = s.w * (0.45 + pr * 1.1);
      g.beginPath();
      if (i > 1) { const pm = pts[i - 2]; g.moveTo((pm[0] + p0[0]) / 2, (pm[1] + p0[1]) / 2); g.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); }
      else { g.moveTo(p0[0], p0[1]); g.lineTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); }
      g.stroke();
    }
    const l = pts[pts.length - 1], pl = pts[pts.length - 2];
    if (pl) { g.beginPath(); g.moveTo((pl[0] + l[0]) / 2, (pl[1] + l[1]) / 2); g.lineTo(l[0], l[1]); g.stroke(); }
  } else {
    g.lineWidth = s.w;
    if (s.t === 'hl') g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    const l = pts[pts.length - 1];
    g.lineTo(l[0], l[1]);
    g.stroke();
  }
  g.restore();
}

function strokeHit(s, p, r) {
  if (isShape(s.t)) {
    const [a, b] = s.pts;
    const segs = s.t === 'rect' ? [[a, [b[0], a[1]]], [[b[0], a[1]], b], [b, [a[0], b[1]]], [[a[0], b[1]], a]]
      : s.t === 'poly' ? s.pts.map((q, i) => [q, s.pts[(i + 1) % s.pts.length]])
      : s.t === 'ellipse' ? ellipsePts(a, b).map((q, i, arr) => [q, arr[(i + 1) % arr.length]])
      : s.t === 'triangle' ? (() => { const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); const t = [[(x0 + x1) / 2, y0], [x1, y1], [x0, y1]]; return t.map((q, i) => [q, t[(i + 1) % 3]]); })()
      : [[a, b]];
    return segs.some(([u, v]) => segDist(p, u, v) < r + s.w);
  }
  for (let i = 0; i < s.pts.length; i++) {
    const q = s.pts[i];
    if (Math.abs(q[0] - p[0]) > r + s.w + 40 && i % 8) continue;
    const nxt = s.pts[i + 1] || q;
    if (segDist(p, q, nxt) < r + s.w / 2) return true;
  }
  return false;
}
function ellipsePts(a, b) { const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rx = Math.abs(b[0] - a[0]) / 2, ry = Math.abs(b[1] - a[1]) / 2; return Array.from({ length: 24 }, (_, i) => [cx + rx * Math.cos(i / 24 * Math.PI * 2), cy + ry * Math.sin(i / 24 * Math.PI * 2)]); }
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
  return [pts[0], pts[pts.length - 1]];
}

/** Recognise a hand-drawn line, triangle, rectangle or ellipse. */
export function recognize(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
  pts.forEach((p, i) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); });
  const diag = Math.hypot(x1 - x0, y1 - y0);
  if (diag < 20) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const pr = first[2];
  if (gap > diag * 0.3) {
    const s = rdp(pts, diag * 0.06);
    if (s.length === 2) return { kind: 'line', pts: [[first[0], first[1], pr], [last[0], last[1], pr]] };
    return null;
  }
  const simp = rdp(pts, diag * 0.09);
  let corners = simp.length - 1;
  if (Math.hypot(simp[0][0] - simp[simp.length - 1][0], simp[0][1] - simp[simp.length - 1][1]) > diag * 0.15) corners = simp.length;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  let err = 0;
  for (const p of pts) err += Math.abs(Math.hypot((p[0] - cx) / (rx || 1), (p[1] - cy) / (ry || 1)) - 1);
  err /= pts.length;
  const tol = diag * 0.06;
  const nearEdge = pts.filter((p) => Math.min(Math.abs(p[0] - x0), Math.abs(p[0] - x1), Math.abs(p[1] - y0), Math.abs(p[1] - y1)) < tol).length / pts.length;
  if (nearEdge > 0.85 && corners >= 4) return { kind: 'rect', pts: [[x0, y0, pr], [x1, y1, pr]] };
  if (err < 0.14 && corners >= 4) return { kind: 'ellipse', pts: [[x0, y0, pr], [x1, y1, pr]] };
  if (corners === 3) return { kind: 'poly', pts: simp.slice(0, 3).map((p) => [p[0], p[1], pr]) };
  if (corners === 4) {
    const box = simp.slice(0, 4);
    const axisAligned = box.every((p) => (Math.abs(p[0] - x0) < diag * 0.12 || Math.abs(p[0] - x1) < diag * 0.12) && (Math.abs(p[1] - y0) < diag * 0.12 || Math.abs(p[1] - y1) < diag * 0.12));
    return axisAligned ? { kind: 'rect', pts: [[x0, y0, pr], [x1, y1, pr]] } : { kind: 'poly', pts: box.map((p) => [p[0], p[1], pr]) };
  }
  if (err < 0.2) return { kind: 'ellipse', pts: [[x0, y0, pr], [x1, y1, pr]] };
  return null;
}

/** The floating pen toolbar. */
export function penBar(ink, { onDone, onConvert }) {
  const bar = h('div.pen-bar', { role: 'toolbar', 'aria-label': 'Handwriting tools' });
  const tools = [['pen', 'pen', 'Pen'], ['pencil', 'pencil', 'Pencil'], ['marker', 'feather', 'Marker'], ['hl', 'highlighter', 'Highlighter'], ['eraser', 'eraser', 'Eraser']];
  const shapes = [['line', 'minus', 'Line'], ['arrow', 'arrow-up-right', 'Arrow'], ['rect', 'square', 'Rectangle'], ['ellipse', 'circle', 'Ellipse'], ['triangle', 'triangle', 'Triangle']];
  const toolBtns = [];
  const tb = (id, icon, label) => { const b = h('button.pen-tool', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(ink.tool === id), html: ic(icon), on: { click: () => pick(id) } }); b.dataset.tool = id; toolBtns.push(b); return b; };
  const shapeBtn = h('button.pen-tool', { type: 'button', title: 'Shapes', 'aria-label': 'Shapes', html: ic('shapes'), on: { click: (e) => menu(e.currentTarget, shapes.map(([id, icon, label]) => ({ label, icon, checked: ink.tool === id, run: () => pick(id) })), { place: 'top' }) } });
  const pick = (id) => { ink.setTool(id); toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === id))); shapeBtn.setAttribute('aria-pressed', String(shapes.some((s) => s[0] === id))); };
  const snapBtn = h('button.pen-tool', { type: 'button', title: 'Shape recognition: hold at the end of a stroke', 'aria-label': 'Shape recognition', 'aria-pressed': String(ink.snap), html: ic('wand'), on: { click: () => { ink.snap = !ink.snap; snapBtn.setAttribute('aria-pressed', String(ink.snap)); } } });
  const colorBtns = PEN_COLORS.map((c) => h('button.pen-color', { type: 'button', title: c, 'aria-label': 'Ink ' + c, 'aria-pressed': String(ink.color === c), style: { background: c }, on: { click: (e) => { ink.color = c; colorBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } } }));
  const custom = h('label.pen-color', { title: 'Custom colour', style: { background: 'conic-gradient(#d9534f, #f0ad4e, #5cb85c, #5bc0de, #6f42c1, #d9534f)', position: 'relative', overflow: 'hidden', cursor: 'pointer' } },
    h('input', { type: 'color', style: { position: 'absolute', inset: '-8px', opacity: 0, width: '50px', height: '50px' }, on: { input: (e) => { ink.color = e.target.value; colorBtns.forEach((b) => b.setAttribute('aria-pressed', 'false')); } } }));
  const sizeBtns = SIZES.map((s, i) => h('button.pen-size', { type: 'button', title: ['Fine', 'Medium', 'Bold'][i], 'aria-label': ['Fine', 'Medium', 'Bold'][i] + ' thickness', 'aria-pressed': String(ink.size === i), on: { click: (e) => { ink.size = i; sizeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } } }, h('i', { style: { width: (4 + i * 4) + 'px', height: (4 + i * 4) + 'px' } })));
  bar.append(...tools.map((t) => tb(...t)), shapeBtn, snapBtn, h('span.sep'), ...colorBtns, custom, h('span.sep'), ...sizeBtns, h('span.sep'),
    h('button.pen-tool', { type: 'button', title: 'Undo', 'aria-label': 'Undo ink', html: ic('undo'), on: { click: () => ink.undo() } }),
    h('button.pen-tool', { type: 'button', title: 'Redo', 'aria-label': 'Redo ink', html: ic('redo'), on: { click: () => ink.redo() } }),
    h('button.pen-tool', { type: 'button', title: 'Convert handwriting to text', 'aria-label': 'Convert handwriting to text', html: ic('scan'), on: { click: onConvert } }),
    h('button.pen-tool', { type: 'button', title: 'Clear all handwriting on this page', 'aria-label': 'Clear handwriting', html: ic('trash'), on: { click: async () => { if (await confirmDialog('Erase all handwriting on this page? You can undo this.', { okLabel: 'Erase', danger: true })) ink.clear(); } } }),
    h('button.pen-tool', { type: 'button', title: 'Done', 'aria-label': 'Done drawing', html: ic('check'), style: { color: 'var(--accent)' }, on: { click: onDone } }));
  return bar;
}
