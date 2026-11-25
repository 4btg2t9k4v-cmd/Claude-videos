// Image and AI-diagram figures: resize, crop, rotate, labels, captions, free placement.
import { h, ic, sheet, toast, pickFile, clamp, loadImage } from '../util.js';
import { sanitizeSVG } from './text.js';
import { fileToImageData } from './editor.js';

export function makeFigure({ src, svg, caption = '', width = 70 }) {
  const frame = h('div.fig-frame', { style: { width: width + '%' } });
  if (svg) {
    const el = typeof svg === 'string' ? sanitizeSVG(svg) : svg;
    const host = h('div.fig-media.svg-host');
    if (el) host.append(el); else host.textContent = 'Invalid drawing';
    frame.append(host);
  } else {
    frame.append(h('img.fig-media', { src, alt: caption || '', draggable: 'false' }));
  }
  return h('figure.blk.blk-figure', { contenteditable: 'false', dataset: { type: svg ? 'svg' : 'image' } }, frame, h('figcaption', { contenteditable: 'true' }, caption));
}

export function makeImageText({ src, svg, html = '<p>Write about this image…</p>' } = {}) {
  const media = h('div.it-media');
  if (src) media.append(h('img', { src, alt: '', draggable: 'false' }));
  else if (svg) { const el = sanitizeSVG(svg); if (el) media.append(el); }
  else media.append(h('div.it-placeholder', 'Tap to add an image'));
  return h('figure.blk.blk-imgtext', { contenteditable: 'false', dataset: { type: 'imgtext' } }, media, h('div.it-text', { contenteditable: 'true', html }));
}

export function hydrateFigure(blk, editor) {
  const frame = blk.querySelector(':scope > .fig-frame');
  if (blk.classList.contains('blk-imgtext')) {
    const ph = blk.querySelector('.it-placeholder');
    if (ph) ph.onclick = () => replaceImage(blk, editor);
    return;
  }
  if (!frame) return;
  if (!frame.querySelector(':scope > .resize-h')) frame.append(h('span.resize-h.rt', { title: 'Resize' }));
  frame.querySelector('.resize-h').onpointerdown = (e) => startResize(e, blk, frame, editor);
  frame.querySelectorAll('.fig-label').forEach((l) => bindLabel(l, frame, editor));
  blk.onpointerdown = (e) => {
    if (!blk.classList.contains('floating') || !blk.classList.contains('selected')) return;
    if (e.target.closest('.blk-ui, .resize-h, .fig-label, figcaption')) return;
    startMove(e, blk, editor);
  };
}

function startResize(e, blk, frame, editor) {
  e.preventDefault(); e.stopPropagation();
  editor.record();
  const scale = frame.getBoundingClientRect().width / frame.offsetWidth || 1;
  const startX = e.clientX;
  const floating = blk.classList.contains('floating');
  const startW = floating ? blk.offsetWidth : frame.offsetWidth;
  const parentW = (floating ? editor.el : blk).clientWidth;
  const move = (ev) => {
    const w = clamp(startW + (ev.clientX - startX) / scale, 80, parentW);
    if (floating) blk.style.width = Math.round(w) + 'px';
    else frame.style.width = Math.round((w / parentW) * 1000) / 10 + '%';
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); editor.changed(); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startMove(e, blk, editor) {
  e.preventDefault();
  editor.record();
  const scale = blk.getBoundingClientRect().width / blk.offsetWidth || 1;
  const sx = e.clientX, sy = e.clientY;
  const l0 = parseFloat(blk.style.left) || 0, t0 = parseFloat(blk.style.top) || 0;
  const maxL = editor.el.clientWidth - blk.offsetWidth;
  const move = (ev) => {
    blk.style.left = Math.round(clamp(l0 + (ev.clientX - sx) / scale, -40, maxL + 40)) + 'px';
    blk.style.top = Math.round(Math.max(-40, t0 + (ev.clientY - sy) / scale)) + 'px';
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); editor.changed(); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

export function toggleFloat(blk, editor) {
  editor.record();
  const frame = blk.querySelector('.fig-frame');
  if (blk.classList.contains('floating')) {
    blk.classList.remove('floating');
    blk.style.left = blk.style.top = blk.style.width = '';
    frame.style.width = '60%';
  } else {
    const er = editor.el.getBoundingClientRect();
    const br = frame.getBoundingClientRect();
    const scale = er.width / editor.el.offsetWidth || 1;
    blk.classList.add('floating');
    blk.style.left = Math.round((br.left - er.left) / scale) + 'px';
    blk.style.top = Math.round((br.top - er.top) / scale) + 'px';
    blk.style.width = Math.round(br.width / scale) + 'px';
    frame.style.width = '100%';
    toast('Drag the picture anywhere on the page.');
  }
  editor.changed();
}

export function rotate(blk, editor, deg = 90) {
  editor.record();
  const frame = blk.querySelector('.fig-frame') || blk.querySelector('.it-media');
  const cur = parseFloat(frame.dataset.rot || '0');
  const next = ((cur + deg) % 360 + 360) % 360;
  frame.dataset.rot = String(next);
  frame.style.transform = next ? `rotate(${next}deg)` : '';
  editor.changed();
}

export function addLabel(blk, editor) {
  editor.record();
  const frame = blk.querySelector('.fig-frame');
  const n = frame.querySelectorAll('.fig-label').length;
  const l = h('span.fig-label', { contenteditable: 'true', style: { left: (30 + (n % 4) * 14) + '%', top: (20 + Math.floor(n / 4) * 14 + (n % 2) * 10) + '%' } }, 'Label');
  frame.append(l);
  bindLabel(l, frame, editor);
  editor.changed();
  setTimeout(() => { l.focus(); const r = document.createRange(); r.selectNodeContents(l); getSelection().removeAllRanges(); getSelection().addRange(r); }, 30);
}

function bindLabel(l, frame, editor) {
  l.onpointerdown = (e) => {
    const sx = e.clientX, sy = e.clientY;
    const rect = frame.getBoundingClientRect();
    const x0 = parseFloat(l.style.left), y0 = parseFloat(l.style.top);
    let dragging = false;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!dragging && Math.hypot(dx, dy) > 6) { dragging = true; editor.record(); l.blur(); }
      if (!dragging) return;
      ev.preventDefault();
      l.style.left = clamp(x0 + (dx / rect.width) * 100, 0, 100).toFixed(1) + '%';
      l.style.top = clamp(y0 + (dy / rect.height) * 100, 0, 100).toFixed(1) + '%';
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (dragging) editor.changed(); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
  };
  l.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); l.blur(); }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !l.textContent) { e.preventDefault(); editor.record(); l.remove(); editor.changed(); }
  };
  l.ondblclick = () => { editor.record(); l.dataset.style = l.dataset.style === 'dot' ? '' : 'dot'; editor.changed(); };
}

export async function replaceImage(blk, editor) {
  const f = await pickFile('image/*');
  if (!f) return;
  const src = await fileToImageData(f);
  editor.record();
  if (blk.classList.contains('blk-imgtext')) {
    const media = blk.querySelector('.it-media');
    media.innerHTML = '';
    media.append(h('img', { src, alt: '', draggable: 'false' }));
  } else {
    const frame = blk.querySelector('.fig-frame');
    frame.querySelector('.fig-media').replaceWith(h('img.fig-media', { src, alt: '', draggable: 'false' }));
    blk.dataset.type = 'image';
  }
  editor.changed();
}

export async function cropImage(blk, editor) {
  const img = blk.querySelector('img.fig-media, .it-media img');
  if (!img) return toast('Only photos can be cropped.');
  const el = await loadImage(img.src);
  const stageImg = h('img', { src: img.src, draggable: 'false' });
  const box = h('div.crop-box', h('i', { dataset: { h: 'nw' } }), h('i', { dataset: { h: 'ne' } }), h('i', { dataset: { h: 'sw' } }), h('i', { dataset: { h: 'se' } }));
  const stage = h('div.crop-stage', stageImg, box);
  let c = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
  const place = () => Object.assign(box.style, { left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%' });
  place();
  box.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const handle = e.target.dataset.h;
    const r = stage.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const c0 = { ...c };
    const move = (ev) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      if (!handle) { c.x = clamp(c0.x + dx, 0, 1 - c0.w); c.y = clamp(c0.y + dy, 0, 1 - c0.h); }
      else {
        if (handle.includes('w')) { const nx = clamp(c0.x + dx, 0, c0.x + c0.w - 0.05); c.w = c0.w + (c0.x - nx); c.x = nx; }
        if (handle.includes('e')) c.w = clamp(c0.w + dx, 0.05, 1 - c0.x);
        if (handle.includes('n')) { const ny = clamp(c0.y + dy, 0, c0.y + c0.h - 0.05); c.h = c0.h + (c0.y - ny); c.y = ny; }
        if (handle.includes('s')) c.h = clamp(c0.h + dy, 0.05, 1 - c0.y);
      }
      place();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  const s = sheet({ title: 'Crop', wide: true, body: h('div', { style: { textAlign: 'center' } }, stage),
    actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
      h('button.btn.primary', { type: 'button', text: 'Crop', on: { click: () => {
        const cv = document.createElement('canvas');
        cv.width = Math.round(el.naturalWidth * c.w); cv.height = Math.round(el.naturalHeight * c.h);
        cv.getContext('2d').drawImage(el, el.naturalWidth * c.x, el.naturalHeight * c.y, cv.width, cv.height, 0, 0, cv.width, cv.height);
        editor.record();
        img.src = cv.toDataURL(img.src.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', 0.9);
        editor.changed();
        s.close();
      } } })] });
}

export function flipImageText(blk, editor) {
  editor.record();
  blk.dataset.flip = blk.dataset.flip === '1' ? '0' : '1';
  editor.changed();
}
