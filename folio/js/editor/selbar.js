// Floating toolbar that appears when text is selected.
import { h, ic, popover, menu, isTouch, closePopover } from '../util.js';
import { colorGrid, textStylePopover } from './inspector.js';

export function createSelectionBar(editor, actions) {
  const bar = h('div.sel-bar', { role: 'toolbar', 'aria-label': 'Text formatting' });
  const btn = (icon, label, fn, extra) => h('button.icon-btn', { type: 'button', title: label, 'aria-label': label, html: icon.startsWith('<') ? icon : ic(icon), on: { pointerdown: (e) => e.preventDefault(), click: fn } }, extra);
  const txt = (icon, label, fn) => h('button.txt-btn', { type: 'button', html: ic(icon) + `<span>${label}</span>`, on: { pointerdown: (e) => e.preventDefault(), click: fn } });
  const colorDot = h('span.color-dot', { style: { background: 'var(--accent)' } });
  let lastColor = '';
  bar.append(
    btn('bold', 'Bold', () => editor.exec('bold')),
    btn('italic', 'Italic', () => editor.exec('italic')),
    btn('underline', 'Underline', () => editor.exec('underline')),
    btn('strike', 'Strikethrough', () => editor.exec('strikeThrough')),
    h('span.sep'),
    h('button.icon-btn', { type: 'button', title: 'Text colour', 'aria-label': 'Text colour', on: { pointerdown: (e) => e.preventDefault(), click: (e) => {
      popover(e.currentTarget, h('div', { style: { padding: '12px', width: '250px' } }, colorGrid((c) => { lastColor = c; colorDot.style.background = c || 'var(--accent)'; editor.restoreRange(); editor.wrapStyle({ color: c || null }); closePopover(); }, { none: true })), { place: 'bottom' });
    } } }, colorDot),
    btn('highlighter', 'Highlight', (e) => {
      popover(e.currentTarget, h('div', { style: { padding: '12px', width: '250px' } }, colorGrid((c) => { editor.restoreRange(); editor.wrapStyle({ 'background-color': c || null, 'border-radius': c ? '.2em' : null, padding: c ? '0 .1em' : null }); closePopover(); }, { none: true, soft: true })), { place: 'bottom' });
    }),
    btn('type', 'More text styles', (e) => textStylePopover(e.currentTarget, editor)),
    h('span.sep'),
    txt('sparkles', 'AI', (e) => actions.aiMenu(e.currentTarget)),
    txt('languages', 'Translate', (e) => actions.translate(e.currentTarget)),
    txt('dict', 'Define', (e) => actions.define(e.currentTarget)),
    btn('cards', 'Make a flashcard from this', () => actions.flashcard()),
  );
  document.body.append(bar);

  let visible = false;
  let raf;
  const place = () => {
    const r = editor.range();
    if (!r || r.collapsed || !r.toString().trim()) return hide();
    const rects = r.getClientRects();
    const rect = rects.length ? rects[0] : r.getBoundingClientRect();
    const last = rects.length ? rects[rects.length - 1] : rect;
    if (!rect.width && !rect.height) return hide();
    bar.style.left = '0px';
    const w = bar.offsetWidth, hgt = bar.offsetHeight;
    const below = isTouch();
    let y = below ? last.bottom + 14 : rect.top - hgt - 10;
    if (!below && y < 70) y = last.bottom + 12;
    if (below && y + hgt > innerHeight - 10) y = rect.top - hgt - 54;
    const x = Math.min(innerWidth - w - 8, Math.max(8, (below ? last.left : rect.left) + (below ? last.width : rect.width) / 2 - w / 2));
    bar.style.left = x + 'px';
    bar.style.top = Math.max(8, y) + 'px';
    if (!visible) { visible = true; bar.classList.add('in'); }
  };
  const hide = () => { if (visible) { visible = false; bar.classList.remove('in'); } };
  const update = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  document.addEventListener('selectionchange', update);
  const scroller = editor.el.closest('.page-scroll');
  scroller?.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  return {
    hide,
    update,
    destroy() {
      document.removeEventListener('selectionchange', update);
      scroller?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      bar.remove();
    },
  };
}
