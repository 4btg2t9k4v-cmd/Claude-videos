// Colour palettes, the "Aa" text style popover and the element style inspector.
import { h, ic, popover, iconBtn, segmented, select, esc } from '../util.js';
import { BLOCK_STYLES } from './editor.js';

export const TEXT_COLORS = ['#1F1C17', '#7A2E3A', '#23395B', '#2F5D50', '#B03A2E', '#C76B1C', '#A8861A', '#4F7A3A', '#1F6F78', '#2F6DB5', '#5B4A9E', '#8E3E80', '#6B6B6B', '#F2C14E', '#8FD3C1', '#9EC5FF', '#F4A6A6', '#EDE6DA'];
export const SOFT_COLORS = ['rgba(247,224,122,.6)', 'rgba(182,227,161,.6)', 'rgba(169,211,245,.6)', 'rgba(246,184,200,.6)', 'rgba(248,201,154,.6)', 'rgba(211,194,242,.6)', 'rgba(122,46,58,.14)', 'rgba(35,57,91,.14)', 'rgba(47,93,80,.14)', 'rgba(0,0,0,.06)'];
export const FONTS = [
  { value: '', label: 'Page default' },
  { value: "'Newsreader', serif", label: 'Newsreader — reading serif' },
  { value: "'Zodiak', serif", label: 'Zodiak — display serif' },
  { value: "'Instrument Sans', sans-serif", label: 'Instrument Sans — clean sans' },
  { value: "'Caveat', cursive", label: 'Caveat — handwriting' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono — code' },
  { value: "Georgia, serif", label: 'Georgia' },
  { value: "'Times New Roman', serif", label: 'Times' },
  { value: "Helvetica, Arial, sans-serif", label: 'Helvetica' },
  { value: "'Noto Naskh Arabic', serif", label: 'Noto Naskh — Arabic' },
  { value: "'IBM Plex Sans Arabic', sans-serif", label: 'Plex Sans — Arabic' },
];

export function colorGrid(onPick, { none = false, soft = false, current = '' } = {}) {
  const wrap = h('div.swatches');
  const list = soft ? SOFT_COLORS : TEXT_COLORS;
  if (none) wrap.append(h('button.swatch.none', { type: 'button', title: 'None', 'aria-label': 'No colour', on: { click: () => onPick('') } }));
  for (const c of list) wrap.append(h('button.swatch', { type: 'button', title: c, 'aria-label': 'Colour ' + c, 'aria-pressed': String(current === c), style: { background: c }, on: { click: () => onPick(c) } }));
  wrap.append(h('label.swatch.custom', { title: 'Custom colour' }, h('input', { type: 'color', on: { input: (e) => onPick(e.target.value) } })));
  return wrap;
}

function range(label, { min, max, step = 1, value, unit = '', onInput }) {
  const out = h('output', value + unit);
  const r = h('input', { type: 'range', min, max, step, value, 'aria-label': label, on: { input: (e) => { out.textContent = e.target.value + unit; onInput(+e.target.value); } } });
  return h('div.insp-row', h('label', label), h('div.range', r, out));
}

/** Inline text styling for the current selection. */
export function textStylePopover(anchor, editor) {
  editor.restoreRange();
  const apply = (styles) => { editor.restoreRange(); editor.wrapStyle(styles); };
  const body = h('div.inspector',
    h('h4', 'Font'),
    select(FONTS, '', (v) => apply({ 'font-family': v || null }), 'sm'),
    h('div', { style: { height: '10px' } }),
    range('Size', { min: 10, max: 64, value: 18, unit: 'px', onInput: debounced((v) => apply({ 'font-size': v + 'px' })) }),
    range('Letter spacing', { min: -2, max: 8, step: 0.5, value: 0, unit: 'px', onInput: debounced((v) => apply({ 'letter-spacing': v ? v + 'px' : null })) }),
    range('Opacity', { min: 20, max: 100, step: 5, value: 100, unit: '%', onInput: debounced((v) => apply({ opacity: v === 100 ? null : String(v / 100) })) }),
    h('h4', 'Text colour'),
    colorGrid((c) => apply({ color: c || null }), { none: true }),
    h('h4', 'Background'),
    colorGrid((c) => apply({ 'background-color': c || null, padding: c ? '0 .15em' : null, 'border-radius': c ? '.2em' : null }), { none: true, soft: true }),
    h('h4', 'Border around text'),
    h('div.chips',
      h('button.chip', { type: 'button', text: 'None', on: { click: () => apply({ border: null, padding: null, 'border-radius': null }) } }),
      h('button.chip', { type: 'button', text: 'Box', on: { click: () => apply({ border: '1.5px solid currentColor', padding: '0 .25em', 'border-radius': '.25em' }) } }),
      h('button.chip', { type: 'button', text: 'Rounded', on: { click: () => apply({ border: '1.5px solid currentColor', padding: '0 .45em', 'border-radius': '1em' }) } }),
      h('button.chip', { type: 'button', text: 'Underline bar', on: { click: () => apply({ 'border-bottom': '3px solid currentColor', border: null }) } })),
    h('h4', 'Case & position'),
    h('div.chips',
      h('button.chip', { type: 'button', text: 'UPPERCASE', on: { click: () => apply({ 'text-transform': 'uppercase', 'letter-spacing': '.04em' }) } }),
      h('button.chip', { type: 'button', text: 'Small caps', on: { click: () => apply({ 'font-variant': 'small-caps' }) } }),
      h('button.chip', { type: 'button', html: 'x<sup>2</sup>', on: { click: () => editor.exec('superscript') } }),
      h('button.chip', { type: 'button', html: 'x<sub>2</sub>', on: { click: () => editor.exec('subscript') } }),
      h('button.chip', { type: 'button', text: 'Normal', on: { click: () => apply({ 'text-transform': null, 'font-variant': null, 'letter-spacing': null }) } })),
    h('div', { style: { marginTop: '14px' } }, h('button.btn.sm.block', { type: 'button', html: ic('eraser') + '<span>Clear formatting</span>', on: { click: () => editor.clearFormatting() } })),
  );
  return popover(anchor, body, { place: 'bottom' });
}

function debounced(fn) { let t; return (v) => { clearTimeout(t); t = setTimeout(() => fn(v), 120); }; }

/** Element inspector: style one block (or all blocks of that type on the page). */
export function blockInspector(anchor, editor) {
  const blocks = editor.blocksInRange();
  if (!blocks.length) { editor.el.focus(); return; }
  const first = blocks[0];
  const wrapper = first.closest('.callout, .definition, .summary-box');
  let target = 'block';
  let scope = 'this';
  const cs = getComputedStyle(first);
  const targets = () => {
    let list = blocks;
    if (scope === 'all') {
      const sel = first.tagName === 'LI' ? 'li' : first.matches('div.formula') ? 'div.formula' : first.tagName.toLowerCase() + (first.classList.contains('hl-block') ? '.hl-block' : '');
      list = [...editor.el.querySelectorAll(sel)].filter((b) => !b.closest('.blk'));
      if (target === 'box' && wrapper) list = [...editor.el.querySelectorAll('.' + wrapper.className.split(' ')[0])];
    } else if (target === 'box' && wrapper) list = [wrapper];
    return list;
  };
  const set = (styles) => {
    const list = targets();
    editor.record();
    for (const b of list) for (const [k, v] of Object.entries(styles)) b.style.setProperty(k, v ?? '');
    list.forEach((b) => { if (!b.getAttribute('style')) b.removeAttribute('style'); });
    editor.changed();
  };
  const cur = editor.currentStyleId();
  const typeGrid = h('div.style-grid', BLOCK_STYLES.map((s) => h('button.style-opt', {
    type: 'button', 'aria-pressed': String(s.id === cur), text: s.label,
    on: { click: (e) => { editor.restoreRange(); editor.setBlockStyle(s.id); typeGrid.querySelectorAll('.style-opt').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } },
  })));
  const px = (v) => parseFloat(v) || 0;
  const body = h('div.inspector',
    h('h4', 'Element type'), typeGrid,
    wrapper ? h('div', { style: { marginTop: '12px' } }, segmented([{ value: 'block', label: 'Text inside' }, { value: 'box', label: 'Whole box' }], 'block', (v) => { target = v; })) : null,
    h('div', { style: { marginTop: '10px' } }, segmented([{ value: 'this', label: 'Just this one' }, { value: 'all', label: 'All like it on this page' }], 'this', (v) => { scope = v; })),
    h('h4', 'Typography'),
    select(FONTS, first.style.fontFamily || '', (v) => set({ 'font-family': v || null }), 'sm'),
    h('div', { style: { height: '10px' } }),
    range('Size', { min: 10, max: 72, value: Math.round(px(cs.fontSize)), unit: 'px', onInput: debounced((v) => set({ 'font-size': v + 'px' })) }),
    h('div.insp-row', h('label', 'Weight'), segmented([{ value: '400', label: 'Regular' }, { value: '600', label: 'Semi' }, { value: '750', label: 'Bold' }], String(Math.round(+cs.fontWeight / 100) * 100), (v) => set({ 'font-weight': v }))),
    h('div.insp-row', h('label', 'Align'), segmented(['left', 'center', 'right', 'justify'].map((a) => ({ value: a, icon: 'align-' + a, title: a })), cs.textAlign === 'start' ? 'left' : cs.textAlign, (v) => set({ 'text-align': v }))),
    range('Line height', { min: 1, max: 2.6, step: 0.05, value: +(px(cs.lineHeight) / px(cs.fontSize) || 1.6).toFixed(2), onInput: debounced((v) => set({ 'line-height': String(v) })) }),
    range('Space above', { min: 0, max: 64, value: Math.round(px(cs.marginTop)), unit: 'px', onInput: debounced((v) => set({ 'margin-top': v + 'px' })) }),
    range('Space below', { min: 0, max: 64, value: Math.round(px(cs.marginBottom)), unit: 'px', onInput: debounced((v) => set({ 'margin-bottom': v + 'px' })) }),
    range('Letter spacing', { min: -2, max: 10, step: 0.5, value: Math.round(px(cs.letterSpacing) * 2) / 2, unit: 'px', onInput: debounced((v) => set({ 'letter-spacing': v + 'px' })) }),
    range('Opacity', { min: 20, max: 100, step: 5, value: Math.round(+cs.opacity * 100), unit: '%', onInput: debounced((v) => set({ opacity: v === 100 ? null : String(v / 100) })) }),
    h('h4', 'Colour'), colorGrid((c) => set({ color: c || null }), { none: true }),
    h('h4', 'Background'), colorGrid((c) => set({ 'background-color': c || null, padding: c ? '8px 12px' : null, 'border-radius': c ? '10px' : null }), { none: true, soft: true }),
    h('h4', 'Border'),
    h('div.chips',
      ...[['None', null], ['Thin', '1px solid currentColor'], ['Thick', '2.5px solid currentColor'], ['Dashed', '1.5px dashed currentColor'], ['Double', '3px double currentColor']].map(([l, v]) => h('button.chip', { type: 'button', text: l, on: { click: () => set({ border: v, padding: v ? '8px 12px' : null }) } })),
      h('button.chip', { type: 'button', text: 'Line under', on: { click: () => set({ border: null, 'border-bottom': '1.5px solid currentColor', 'padding-bottom': '4px' }) } })),
    h('div', { style: { height: '8px' } }),
    colorGrid((c) => set({ 'border-color': c || null }), {}),
    range('Corner radius', { min: 0, max: 28, value: Math.round(px(cs.borderTopLeftRadius)), unit: 'px', onInput: debounced((v) => set({ 'border-radius': v + 'px' })) }),
    h('h4', 'Direction & language'),
    h('div.insp-row', h('label', 'Direction'), segmented([{ value: 'auto', label: 'Auto' }, { value: 'ltr', label: 'LTR' }, { value: 'rtl', label: 'RTL' }], first.getAttribute('dir') || 'auto', (v) => { editor.record(); targets().forEach((b) => (v ? b.setAttribute('dir', v) : b.removeAttribute('dir'))); editor.changed(); })),
    h('div.insp-row', h('label', 'Spelling'), select([{ value: '', label: 'Notebook language' }, { value: 'en', label: 'English' }, { value: 'ar', label: 'Arabic' }, { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' }], first.getAttribute('lang') || '', (v) => { editor.record(); targets().forEach((b) => (v ? b.setAttribute('lang', v) : b.removeAttribute('lang'))); editor.changed(); }, 'sm')),
    h('div', { style: { marginTop: '14px' } }, h('button.btn.sm.block', { type: 'button', html: ic('refresh') + '<span>Reset element style</span>', on: { click: () => { editor.record(); targets().forEach((b) => { b.removeAttribute('style'); }); editor.changed(); } } })),
  );
  return popover(anchor, body, { place: 'bottom' });
}

/** Figure styling: border, background, corner radius, width and alignment. */
export function figureStylePopover(anchor, blk, editor) {
  const frame = blk.querySelector('.fig-frame') || blk.querySelector('.it-media') || blk.querySelector('.blk-render') || blk;
  const set = (styles, el = frame) => { editor.record(); for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v ?? ''); editor.changed(); };
  const cs = getComputedStyle(frame);
  const body = h('div.inspector',
    frame.classList.contains('fig-frame') && !blk.classList.contains('floating')
      ? range('Width', { min: 15, max: 100, value: Math.round(parseFloat(frame.style.width) || 70), unit: '%', onInput: (v) => { frame.style.width = v + '%'; editor.changed(); } }) : null,
    !blk.classList.contains('floating') ? h('div.insp-row', h('label', 'Position'), segmented([{ value: 'left', icon: 'align-left', title: 'Left' }, { value: 'center', icon: 'align-center', title: 'Centre' }, { value: 'right', icon: 'align-right', title: 'Right' }], blk.style.textAlign || 'center', (v) => set({ 'text-align': v }, blk))) : null,
    range('Rotate', { min: -180, max: 180, value: parseFloat(frame.dataset.rot || 0) > 180 ? parseFloat(frame.dataset.rot) - 360 : parseFloat(frame.dataset.rot || 0), unit: '°', onInput: (v) => { frame.dataset.rot = String((v + 360) % 360); frame.style.transform = v ? `rotate(${v}deg)` : ''; editor.changed(); } }),
    h('h4', 'Border'),
    h('div.chips', ...[['None', 'none'], ['Hairline', '1px solid'], ['Thin', '2px solid'], ['Thick', '5px solid'], ['Polaroid', 'polaroid'], ['Dashed', '2px dashed']].map(([l, v]) => h('button.chip', { type: 'button', text: l, on: { click: () => {
      if (v === 'polaroid') set({ border: '10px solid #fff', 'border-bottom-width': '34px', 'box-shadow': '0 6px 18px rgba(0,0,0,.18)' });
      else set({ border: v === 'none' ? null : v + ' ' + (frame.style.borderColor || 'currentColor'), 'border-bottom-width': null, 'box-shadow': null });
    } } }))),
    h('div', { style: { height: '8px' } }),
    colorGrid((c) => set({ 'border-color': c || null }), {}),
    range('Corner radius', { min: 0, max: 40, value: Math.round(parseFloat(cs.borderTopLeftRadius) || 0), unit: 'px', onInput: (v) => { frame.style.borderRadius = v + 'px'; frame.style.overflow = 'hidden'; editor.changed(); } }),
    range('Padding', { min: 0, max: 40, value: Math.round(parseFloat(cs.paddingTop) || 0), unit: 'px', onInput: (v) => { frame.style.padding = v + 'px'; editor.changed(); } }),
    h('h4', 'Background'),
    colorGrid((c) => set({ 'background-color': c || null }), { none: true, soft: true }),
    h('div.insp-row', { style: { marginTop: '12px' } }, h('label', 'Shadow'), segmented([{ value: '', label: 'None' }, { value: 's', label: 'Soft' }, { value: 'l', label: 'Lifted' }], '', (v) => set({ 'box-shadow': v === 's' ? '0 2px 10px rgba(0,0,0,.12)' : v === 'l' ? '0 14px 34px -8px rgba(0,0,0,.35)' : null }))),
  );
  return popover(anchor, body, { place: 'bottom' });
}

export function escAttr(s) { return esc(s); }
