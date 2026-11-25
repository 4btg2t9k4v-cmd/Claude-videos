import { ICONS } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function uid(prefix = '') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36).slice(0, 4);
}

export function ic(name, cls = '') {
  const body = ICONS[name] || ICONS.circle;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Tiny element builder: h('div.cls#id', {attrs, on:{click}}, ...children) */
export function h(tag, attrs, ...kids) {
  let [t, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(t || 'div');
  for (const r of rest) {
    if (r[0] === '.') el.classList.add(r.slice(1));
    else if (r[0] === '#') el.id = r.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function iconBtn(name, label, onClick, cls = '') {
  return h('button.icon-btn' + (cls ? '.' + cls.split(' ').join('.') : ''), {
    type: 'button', title: label, 'aria-label': label, html: ic(name), on: onClick ? { click: onClick } : null,
  });
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export function timeAgo(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function fmtDate(ts, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(ts).toLocaleDateString(undefined, opts);
}

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  d.querySelectorAll('script,style,.blk-ui,svg text,[hidden]').forEach((n) => n.remove());
  d.querySelectorAll('.def-term').forEach((n) => n.append(' — '));
  d.querySelectorAll('p,div,h1,h2,h3,h4,li,tr,blockquote,figcaption,br').forEach((n) => n.append('\n'));
  d.querySelectorAll('td,th').forEach((n) => n.append(' | '));
  return d.textContent.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
}

export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function readFileAs(file, how = 'dataURL') {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    if (how === 'text') r.readAsText(file);
    else if (how === 'buffer') r.readAsArrayBuffer(file);
    else r.readAsDataURL(file);
  });
}

/** Downscale an image file/dataURL to a JPEG/PNG dataURL no larger than max px. */
export async function shrinkImage(src, max = 1600, type = 'image/jpeg', q = 0.86) {
  const url = typeof src === 'string' ? src : await readFileAs(src);
  const img = await loadImage(url);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && typeof src === 'string' && src.length < 900000) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const g = c.getContext('2d');
  if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, q);
}

export function loadImage(url) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
}

export function dataURLtoBlob(d) {
  const [head, b64] = d.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}

export function downloadFile(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

export function pickFile(accept = '*/*', multiple = false) {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    i.addEventListener('change', () => { res(multiple ? [...i.files] : i.files[0] || null); i.remove(); });
    document.body.append(i);
    i.click();
  });
}

/* ---------- Toasts ---------- */
export function toast(msg, opts = {}) {
  let host = $('#toasts');
  if (!host) { host = h('div#toasts', { role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div.toast' + (opts.kind ? '.' + opts.kind : ''), h('span', msg));
  if (opts.action) {
    t.append(h('button.toast-act', { type: 'button', text: opts.action.label, on: { click: () => { opts.action.run(); t.remove(); } } }));
  }
  host.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, opts.ms || 3200);
}

/* ---------- Overlay primitives: sheet (modal), popover, menu ---------- */
let openSheets = [];
export function sheet({ title, body, wide = false, onClose, actions, cls = '' }) {
  const backdrop = h('div.sheet-backdrop');
  const closeBtn = iconBtn('x', 'Close', () => close());
  const panel = h('div.sheet' + (wide ? '.wide' : '') + (cls ? '.' + cls : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    title ? h('header.sheet-head', h('h2', title), closeBtn) : null,
    h('div.sheet-body', body),
    actions ? h('footer.sheet-foot', actions) : null);
  backdrop.append(panel);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('in'));
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  const api = { el: panel, close, body: panel.querySelector('.sheet-body') };
  openSheets.push(api);
  function close() {
    if (!backdrop.isConnected) return;
    openSheets = openSheets.filter((s) => s !== api);
    backdrop.classList.remove('in');
    setTimeout(() => backdrop.remove(), 220);
    onClose && onClose();
  }
  setTimeout(() => { const f = panel.querySelector('[autofocus],input,textarea,select'); f && f.focus(); }, 60);
  return api;
}
export function closeTopSheet() { const s = openSheets[openSheets.length - 1]; if (s) { s.close(); return true; } return false; }

export function confirmDialog(message, { okLabel = 'Confirm', danger = false, title = 'Are you sure?' } = {}) {
  return new Promise((res) => {
    let done = false;
    const s = sheet({
      title, body: h('p.muted', message), onClose: () => !done && res(false),
      actions: [
        h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
        h('button.btn' + (danger ? '.danger' : '.primary'), { type: 'button', text: okLabel, on: { click: () => { done = true; s.close(); res(true); } } }),
      ],
    });
  });
}

export function promptDialog(title, value = '', { placeholder = '', okLabel = 'Save', multiline = false } = {}) {
  return new Promise((res) => {
    let done = false;
    const input = multiline
      ? h('textarea.field', { rows: 4, placeholder, autofocus: true })
      : h('input.field', { type: 'text', placeholder, autofocus: true });
    input.value = value;
    const ok = () => { done = true; s.close(); res(input.value.trim()); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) ok(); });
    const s = sheet({
      title, body: input, onClose: () => !done && res(null),
      actions: [
        h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
        h('button.btn.primary', { type: 'button', text: okLabel, on: { click: ok } }),
      ],
    });
    setTimeout(() => input.select(), 80);
  });
}

let openPop = null;
/** Anchored popover. content: Node. Returns {el, close}. */
export function popover(anchor, content, { place = 'bottom', cls = '', onClose, keepOpen = false } = {}) {
  closePopover();
  const el = h('div.popover' + (cls ? '.' + cls : ''), { role: 'dialog' }, content);
  document.body.append(el);
  position(el, anchor, place);
  requestAnimationFrame(() => el.classList.add('in'));
  const outside = (e) => {
    if (el.contains(e.target) || (anchor instanceof Element && anchor.contains(e.target))) return;
    if (keepOpen) return;
    close();
  };
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  function close() {
    document.removeEventListener('pointerdown', outside, true);
    if (openPop === api) openPop = null;
    el.remove();
    onClose && onClose();
  }
  const api = { el, close, reposition: () => position(el, anchor, place) };
  openPop = api;
  return api;
}
export function closePopover() { if (openPop) openPop.close(); }

export function position(el, anchor, place = 'bottom') {
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor; // DOMRect-like
  const vw = window.innerWidth, vh = window.innerHeight;
  el.style.left = '0px'; el.style.top = '0px';
  const w = el.offsetWidth, hgt = el.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  let y = place === 'top' ? r.top - hgt - 8 : r.bottom + 8;
  if (place === 'right') { x = r.right + 8; y = r.top; }
  if (place === 'left') { x = r.left - w - 8; y = r.top; }
  if (place === 'bottom-start') { x = r.left; }
  if (place === 'bottom-end') { x = r.right - w; }
  if (y + hgt > vh - 8) y = Math.max(8, (place === 'bottom' || place.startsWith('bottom') ? r.top - hgt - 8 : vh - hgt - 8));
  if (y < 8) y = Math.min(vh - hgt - 8, r.bottom + 8);
  x = clamp(x, 8, Math.max(8, vw - w - 8));
  el.style.left = x + 'px';
  el.style.top = Math.max(8, y) + 'px';
}

/** Menu of items: [{label, icon, run, danger, sep, checked, hint}] */
export function menu(anchor, items, opts = {}) {
  const list = h('div.menu', { role: 'menu' });
  let pop;
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { list.append(h('div.menu-sep')); continue; }
    if (it.heading) { list.append(h('div.menu-head', it.heading)); continue; }
    list.append(h('button.menu-item' + (it.danger ? '.danger' : ''), {
      type: 'button', role: 'menuitem', disabled: it.disabled,
      on: { click: () => { pop.close(); it.run && it.run(); } },
    },
    it.icon ? h('span.mi-ic', { html: ic(it.icon) }) : h('span.mi-ic'),
    h('span.mi-label', it.label),
    it.checked ? h('span.mi-check', { html: ic('check') }) : it.hint ? h('kbd.mi-hint', it.hint) : null));
  }
  pop = popover(anchor, list, { place: opts.place || 'bottom-start', cls: 'menu-pop' });
  return pop;
}

/** Segmented control */
export function segmented(options, value, onChange, cls = '') {
  const wrap = h('div.seg' + (cls ? '.' + cls : ''), { role: 'radiogroup' });
  for (const o of options) {
    const b = h('button.seg-btn', {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === value),
      title: o.title || o.label,
      html: (o.icon ? ic(o.icon) : '') + (o.label ? `<span>${esc(o.label)}</span>` : ''),
      on: { click: () => { $$('.seg-btn', wrap).forEach((x) => x.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); onChange(o.value); } },
    });
    wrap.append(b);
  }
  return wrap;
}

export function field(label, control, hint) {
  return h('label.form-row', h('span.form-label', label), control, hint ? h('span.form-hint', hint) : null);
}

export function select(options, value, onChange, cls = '') {
  const s = h('select.field' + (cls ? '.' + cls : ''), { on: { change: () => onChange(s.value) } });
  for (const o of options) {
    const opt = typeof o === 'string' ? { value: o, label: o } : o;
    s.append(h('option', { value: opt.value, text: opt.label, selected: opt.value === value }));
  }
  s.value = value;
  return s;
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
export const isMac = /Mac|iPad|iPhone/.test(navigator.platform) || /Mac/.test(navigator.userAgent);
