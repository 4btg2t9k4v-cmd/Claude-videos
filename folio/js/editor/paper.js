// Page paper: type, colour, texture, margins, spacing, borders, layouts, background images, templates.
import { h, ic, popover, segmented, pickFile, shrinkImage, toast, sheet, field, closePopover, confirmDialog } from '../util.js';
import { S, saveTemplate, deleteTemplate, updatePage, updateNotebook } from '../store.js';

export const PAPERS = [
  { id: 'blank', label: 'Blank' }, { id: 'lined', label: 'Lined' }, { id: 'grid', label: 'Grid' }, { id: 'dotted', label: 'Dotted' },
  { id: 'cornell', label: 'Cornell' }, { id: 'isometric', label: 'Isometric' }, { id: 'music', label: 'Staff' },
];
export const TEXTURES = [{ id: 'none', label: 'Smooth' }, { id: 'grain', label: 'Grain' }, { id: 'laid', label: 'Laid' }, { id: 'linen', label: 'Linen' }, { id: 'recycled', label: 'Recycled' }, { id: 'vellum', label: 'Vellum' }];
export const BORDERS = [{ id: 'none', label: 'None' }, { id: 'thin', label: 'Thin' }, { id: 'frame', label: 'Frame' }, { id: 'double', label: 'Double' }, { id: 'dashed', label: 'Dashed' }, { id: 'corners', label: 'Corners' }];
export const LAYOUTS = [{ id: 'single', label: 'Single column' }, { id: 'two-col', label: 'Two columns' }, { id: 'wide-margin', label: 'Wide margin' }, { id: 'centered', label: 'Narrow centred' }];
export const PAPER_COLORS = ['', '#FFFDF7', '#FFFFFF', '#F6EFE2', '#F1EADB', '#EEF2E8', '#EAF0F6', '#F7ECEC', '#F3EEF8', '#FFF6D9', '#232325', '#1B2638', '#1C2B23', '#2C1A1E'];
export const DEFAULT_PAPER = { type: 'lined', color: '', ink: '', texture: 'none', margin: 56, spacing: 32, border: 'none', layout: 'single', bgImage: '', marginLine: false, bgOpacity: 0.35 };

export function effectivePaper(page, nb) {
  return { ...DEFAULT_PAPER, ...(nb?.paper || {}), ...(page?.paper || {}) };
}

function isDark(hex) {
  if (!hex || !hex.startsWith('#')) return false;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 110;
}

export function applyPaper(sheetEl, p) {
  sheetEl.dataset.paper = p.type;
  sheetEl.dataset.texture = p.texture;
  sheetEl.dataset.border = p.border;
  sheetEl.dataset.layout = p.layout;
  sheetEl.dataset.marginLine = p.marginLine ? 'on' : 'off';
  sheetEl.style.setProperty('--spacing', p.spacing + 'px');
  sheetEl.style.setProperty('--margin', p.margin + 'px');
  if (p.color) {
    sheetEl.style.setProperty('--paper-c', p.color);
    const dark = isDark(p.color);
    sheetEl.style.setProperty('--ink', p.ink || (dark ? '#ECE8E0' : '#1F1C17'));
    sheetEl.style.setProperty('--rule', dark ? 'rgba(255,255,255,.13)' : 'rgba(51,80,110,.17)');
    sheetEl.style.setProperty('--paper-accent', dark ? 'var(--accent-on-dark)' : 'var(--accent-on-light)');
    sheetEl.style.setProperty('--paper-accent-ink', dark ? '#141414' : '#FFFFFF');
  } else {
    sheetEl.style.removeProperty('--paper-c');
    sheetEl.style.removeProperty('--rule');
    sheetEl.style.removeProperty('--paper-accent');
    sheetEl.style.removeProperty('--paper-accent-ink');
    if (p.ink) sheetEl.style.setProperty('--ink', p.ink); else sheetEl.style.removeProperty('--ink');
  }
  const img = sheetEl.querySelector('.paper-img');
  if (img) {
    img.style.backgroundImage = p.bgImage ? `url("${p.bgImage}")` : '';
    img.style.opacity = p.bgImage ? String(p.bgOpacity ?? 0.35) : '0';
    img.style.backgroundSize = p.bgFit === 'contain' ? 'contain' : 'cover';
    img.style.backgroundRepeat = 'no-repeat';
    img.style.backgroundPosition = p.bgFit === 'contain' ? 'top center' : 'center';
  }
}

/** Popover with all page options. ctx: {page, nb, apply(paper), onTemplate(tpl)} */
export function paperPopover(anchor, ctx) {
  const p = effectivePaper(ctx.page, ctx.nb);
  let scope = 'page';
  const commit = (patch) => {
    Object.assign(p, patch);
    if (scope === 'page') updatePage(ctx.page.id, { paper: { ...(ctx.page.paper || {}), ...patch } }, { quiet: true });
    else { updateNotebook(ctx.nb.id, { paper: { ...(ctx.nb.paper || {}), ...patch } }, true); updatePage(ctx.page.id, { paper: null }, { quiet: true }); }
    ctx.apply();
  };
  const opt = (list, key, prevAttr) => h('div.paper-opts', list.map((o) => h('button.paper-opt', {
    type: 'button', 'aria-pressed': String(p[key] === o.id),
    on: { click: (e) => { commit({ [key]: o.id }); e.currentTarget.parentElement.querySelectorAll('.paper-opt').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } },
  }, prevAttr ? h('span.po-prev', { dataset: { p: o.id } }) : null, h('span', o.label))));
  const colors = h('div.swatches', PAPER_COLORS.map((c) => h('button.swatch' + (c ? '' : '.none'), {
    type: 'button', title: c || 'Theme paper', 'aria-pressed': String((p.color || '') === c), style: c ? { background: c } : {},
    on: { click: (e) => { commit({ color: c }); colors.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } },
  })), h('label.swatch.custom', { title: 'Custom' }, h('input', { type: 'color', on: { input: (e) => commit({ color: e.target.value }) } })));
  const rng = (label, key, min, max, step, unit) => {
    const out = h('output', p[key] + unit);
    return h('div.insp-row', h('label', label), h('div.range', h('input', { type: 'range', min, max, step, value: p[key], on: { input: (e) => { out.textContent = e.target.value + unit; commit({ [key]: +e.target.value }); } } }), out));
  };
  const body = h('div.inspector', { style: { width: '360px' } },
    segmented([{ value: 'page', label: 'This page' }, { value: 'notebook', label: 'Whole notebook' }], 'page', (v) => { scope = v; }),
    h('h4', 'Paper'), opt(PAPERS, 'type', true),
    h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', fontSize: '14px' } }, h('input', { type: 'checkbox', checked: !!p.marginLine, on: { change: (e) => commit({ marginLine: e.target.checked }) } }), 'Red margin line (lined paper)'),
    h('h4', 'Paper colour'), colors,
    h('h4', 'Texture'), h('div.chips', TEXTURES.map((t) => h('button.chip', { type: 'button', 'aria-pressed': String(p.texture === t.id), text: t.label, on: { click: (e) => { commit({ texture: t.id }); e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } } }))),
    h('h4', 'Spacing'),
    rng('Line spacing', 'spacing', 22, 52, 1, 'px'),
    rng('Margins', 'margin', 20, 120, 2, 'px'),
    h('h4', 'Border'), h('div.chips', BORDERS.map((t) => h('button.chip', { type: 'button', 'aria-pressed': String(p.border === t.id), text: t.label, on: { click: (e) => { commit({ border: t.id }); e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } } }))),
    h('h4', 'Layout'), h('div.chips', LAYOUTS.map((t) => h('button.chip', { type: 'button', 'aria-pressed': String(p.layout === t.id), text: t.label, on: { click: (e) => { commit({ layout: t.id }); e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } } }))),
    h('h4', 'Background image'),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button.btn.sm', { type: 'button', html: ic('image-plus') + '<span>Choose image</span>', on: { click: async () => { const f = await pickFile('image/*'); if (!f) return; commit({ bgImage: await shrinkImage(f, 1600) }); } } }),
      h('button.btn.sm.ghost', { type: 'button', text: 'Remove', on: { click: () => commit({ bgImage: '' }) } })),
    rng('Image strength', 'bgOpacity', 0.05, 1, 0.05, ''),
    h('h4', 'Templates'),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button.btn.sm', { type: 'button', html: ic('save') + '<span>Save as template</span>', on: { click: () => { closePopover(); saveTemplateDialog(ctx); } } }),
      h('button.btn.sm', { type: 'button', html: ic('template') + '<span>Apply template</span>', on: { click: () => { closePopover(); templatePicker((tpl) => ctx.onTemplate(tpl)); } } })),
    h('button.btn.sm.ghost.block', { type: 'button', style: { marginTop: '12px' }, text: 'Reset this page to notebook paper', on: { click: () => { updatePage(ctx.page.id, { paper: null }, { quiet: true }); ctx.apply(); closePopover(); } } }),
  );
  return popover(anchor, body, { place: 'bottom-end' });
}

function saveTemplateDialog(ctx) {
  const name = h('input.field', { type: 'text', placeholder: 'e.g. Lab report, Cornell lecture notes', autofocus: true });
  const withContent = h('input', { type: 'checkbox', checked: true });
  const s = sheet({ title: 'Save as template', body: h('div', field('Template name', name),
    h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, withContent, 'Include the page’s content (headings, tables, boxes)')),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
    h('button.btn.primary', { type: 'button', text: 'Save template', on: { click: () => {
      if (!name.value.trim()) return name.focus();
      saveTemplate({ name: name.value.trim(), paper: effectivePaper(ctx.page, ctx.nb), html: withContent.checked ? ctx.getHTML() : '' });
      toast('Template saved. Use it from “New page” in any notebook.');
      s.close();
    } } })] });
}

export const BUILTIN_TEMPLATES = [
  { id: 'b_cornell', name: 'Cornell notes', builtin: true, paper: { ...DEFAULT_PAPER, type: 'cornell' }, html: '<h2>Topic</h2><p>Cues & questions go in the left column; notes on the right.</p><p><br></p><div class="summary-box"><h4>Summary</h4><p>Sum up the page in 2–3 sentences.</p></div>' },
  { id: 'b_lecture', name: 'Lecture notes', builtin: true, paper: { ...DEFAULT_PAPER, type: 'lined', marginLine: true }, html: '<h2>Lecture topic</h2><h4>Date · Lecturer</h4><h3>Main ideas</h3><ul><li><br></li></ul><h3>Details & examples</h3><p><br></p><div class="callout" data-kind="info"><span class="co-ic" contenteditable="false"></span><div class="co-body"><p>Questions to ask</p></div></div><div class="summary-box"><h4>Key takeaways</h4><p><br></p></div>' },
  { id: 'b_lab', name: 'Lab report', builtin: true, paper: { ...DEFAULT_PAPER, type: 'grid' }, html: '<h1>Experiment title</h1><h2>Aim</h2><p><br></p><h2>Hypothesis</h2><p><br></p><h2>Materials</h2><ul><li><br></li></ul><h2>Method</h2><ol><li><br></li></ol><h2>Results</h2><p><br></p><h2>Conclusion</h2><p><br></p>' },
  { id: 'b_math', name: 'Problem set', builtin: true, paper: { ...DEFAULT_PAPER, type: 'grid', spacing: 30 }, html: '<h2>Problem 1</h2><p><br></p><div class="formula">Write the working here</div><div class="callout" data-kind="tip"><span class="co-ic" contenteditable="false"></span><div class="co-body"><p>Answer:</p></div></div>' },
  { id: 'b_vocab', name: 'Vocabulary list', builtin: true, paper: { ...DEFAULT_PAPER, type: 'lined' }, html: '<h2>Vocabulary</h2><figure class="blk blk-table" contenteditable="false" data-type="table" data-style="zebra"><table><colgroup><col style="width:30%"><col style="width:40%"><col style="width:30%"></colgroup><tbody><tr><th contenteditable="true">Word</th><th contenteditable="true">Meaning</th><th contenteditable="true">Example</th></tr><tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr><tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr></tbody></table></figure>' },
  { id: 'b_revision', name: 'Revision sheet', builtin: true, paper: { ...DEFAULT_PAPER, type: 'dotted', layout: 'two-col' }, html: '<h1>Revision: topic</h1><h3>Must know</h3><ul><li><br></li></ul><h3>Formulas</h3><div class="formula"><br></div><h3>Common mistakes</h3><ul><li><br></li></ul>' },
];

export function templatePicker(onPick) {
  const draw = () => {
    body.innerHTML = '';
    const all = [...BUILTIN_TEMPLATES, ...S.templates.values()];
    for (const t of all) {
      body.append(h('div.list-row', { style: { cursor: 'pointer' }, on: { click: (e) => { if (e.target.closest('.icon-btn')) return; s.close(); onPick(t); } } },
        h('span.po-prev', { dataset: { p: t.paper?.type || 'blank' }, style: { width: '34px', height: '44px', borderRadius: '5px', display: 'block', flex: 'none' } }),
        h('div.lr-main', h('div.lr-title', t.name), h('div.lr-sub', t.builtin ? 'Built in' : 'Your template')),
        t.builtin ? null : h('button.icon-btn.sm', { type: 'button', html: ic('trash'), 'aria-label': 'Delete template', on: { click: async () => { if (await confirmDialog(`Delete the template “${t.name}”?`, { danger: true, okLabel: 'Delete' })) { deleteTemplate(t.id); draw(); } } } })));
    }
  };
  const body = h('div', { style: { display: 'grid', gap: '2px' } });
  const s = sheet({ title: 'Templates', body });
  draw();
}
