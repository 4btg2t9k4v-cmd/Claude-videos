import { S, createNotebook, updateNotebook, createPage, COVER_COLORS } from '../store.js';
import { h, ic, sheet, field, select, segmented, pickFile, shrinkImage, toast } from '../util.js';
import { go } from '../main.js';

export const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'English', 'Literature', 'Languages', 'Economics', 'Computer science', 'Psychology', 'Philosophy', 'Art', 'Music', 'Law', 'Medicine', 'Other'];
export const COVERS = [
  { id: 'cloth', label: 'Cloth' }, { id: 'linen', label: 'Linen' }, { id: 'leather', label: 'Leather' },
  { id: 'frame', label: 'Framed' }, { id: 'stripe', label: 'Stripes' }, { id: 'band', label: 'Band' },
  { id: 'grid', label: 'Grid' }, { id: 'dots', label: 'Dots' },
];
export const LANGS = [
  { value: 'auto', label: 'Detect automatically' }, { value: 'en', label: 'English' }, { value: 'ar', label: 'العربية (Arabic)' },
  { value: 'es', label: 'Español (Spanish)' }, { value: 'fr', label: 'Français (French)' },
];

export function coverEl(n, { elastic = true } = {}) {
  const c = h('div.cover', { style: { '--c': n.color }, dataset: { cover: n.coverImage ? 'image' : n.cover, label: n.labelStyle || 'plate' } });
  c.style.setProperty('--c', n.color);
  if (n.coverImage) c.style.backgroundImage = `url("${n.coverImage}")`;
  c.append(h('div.cover-label', h('div.cover-title', n.title || 'Untitled'), n.subject ? h('div.cover-sub', n.subject.toUpperCase()) : null));
  if (elastic) c.append(h('div.cover-elastic'));
  if (n.favorite) c.append(h('span.fav-star', { html: ic('star') }));
  return c;
}

export function notebookDialog(existing) {
  const n = existing ? structuredClone(existing) : {
    title: '', subject: '', description: '', color: COVER_COLORS[S.notebooks.size % COVER_COLORS.length], cover: 'cloth', labelStyle: 'plate', coverImage: '', lang: 'auto',
    paper: { type: 'lined', color: '', texture: 'none', margin: 56, spacing: 32, border: 'none', layout: 'single', bgImage: '' },
  };
  const preview = h('div', { style: { width: '170px', margin: '0 auto' } });
  const redraw = () => { preview.innerHTML = ''; preview.append(coverEl({ ...n, title: n.title || 'Untitled notebook' })); };

  const title = h('input.field', { type: 'text', placeholder: 'e.g. Organic Chemistry', value: n.title, autofocus: true, on: { input: (e) => { n.title = e.target.value; redraw(); } } });
  const desc = h('textarea.field', { rows: 2, placeholder: 'What this notebook is for (optional)', on: { input: (e) => { n.description = e.target.value; } } });
  desc.value = n.description;
  const subject = select([{ value: '', label: 'Choose a subject' }, ...SUBJECTS.map((s) => ({ value: s, label: s }))], n.subject, (v) => { n.subject = v; redraw(); });

  const swatches = h('div.swatches');
  const drawSw = () => {
    swatches.innerHTML = '';
    for (const c of COVER_COLORS) swatches.append(h('button.swatch', { type: 'button', title: c, 'aria-pressed': String(n.color === c), style: { background: c }, on: { click: () => { n.color = c; drawSw(); redraw(); } } }));
    const custom = h('label.swatch.custom', { title: 'Custom colour' }, h('input', { type: 'color', value: n.color, on: { input: (e) => { n.color = e.target.value; redraw(); } } }));
    swatches.append(custom);
  };
  drawSw();

  const coverSeg = segmented(COVERS.map((c) => ({ value: c.id, label: c.label })), n.cover, (v) => { n.cover = v; n.coverImage = ''; redraw(); });
  const labelSeg = segmented([{ value: 'plate', label: 'Label' }, { value: 'plain', label: 'Plain' }, { value: 'bottom', label: 'Bottom' }], n.labelStyle, (v) => { n.labelStyle = v; redraw(); });
  const imgBtn = h('button.btn.sm', { type: 'button', html: ic('image-plus') + '<span>Use a photo</span>', on: {
    click: async () => {
      const f = await pickFile('image/*');
      if (!f) return;
      n.coverImage = await shrinkImage(f, 900);
      redraw();
    },
  } });
  const lang = select(LANGS, n.lang, (v) => { n.lang = v; });

  const body = h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 190px', gap: '24px', alignItems: 'start' } },
    h('div',
      field('Name', title),
      field('Subject', subject, 'Helps the AI pick the right kind of diagrams and examples.'),
      field('Description', desc),
      field('Writing language', lang, 'Used for spell-check and autocorrect in this notebook.'),
    ),
    h('div', { style: { position: 'sticky', top: '0' } }, preview),
  );
  const look = h('div',
    h('h4', { style: { margin: '6px 0 10px', fontSize: '13px', color: 'var(--text-2)' } }, 'Cover'),
    h('div', { style: { display: 'grid', gap: '12px' } }, swatches, coverSeg, h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } }, labelSeg, imgBtn)),
  );
  redraw();

  const s = sheet({
    title: existing ? 'Notebook settings' : 'New notebook', wide: true,
    body: h('div', body, look),
    actions: [
      h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
      h('button.btn.primary', { type: 'button', text: existing ? 'Save' : 'Create notebook', on: { click: save } }),
    ],
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  function save() {
    if (!n.title.trim()) { title.focus(); toast('Give your notebook a name.'); return; }
    n.title = n.title.trim();
    if (existing) {
      updateNotebook(existing.id, { title: n.title, subject: n.subject, description: n.description, color: n.color, cover: n.cover, coverImage: n.coverImage, labelStyle: n.labelStyle, lang: n.lang });
      s.close();
    } else {
      const nb = createNotebook(n);
      const p = createPage(nb.id, { title: '' });
      s.close();
      go(`#/nb/${nb.id}/${p.id}`);
    }
  }
  if (window.innerWidth < 640) body.style.gridTemplateColumns = '1fr';
  return s;
}
