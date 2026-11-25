// Smart graphics: read the page, suggest only visuals that fit the content, then build them.
import { h, ic, sheet, toast } from '../util.js';
import { generate, generateJSON, hasAI } from './gemini.js';
import { pageText, sanitizeSVG } from '../editor/text.js';
import { makeBlock, renderBlock } from '../editor/blocks.js';
import { makeFigure } from '../editor/figure.js';
import { makeTable } from '../editor/table.js';
import { blocksToHTML } from './notes.js';
import { go } from '../main.js';

const KIND_ICON = { diagram: 'image', graph: 'graph', molecule: 'atom', reaction: 'flask', timeline: 'timeline', map: 'map', flowchart: 'flow', mindmap: 'mindmap', table: 'table' };

export async function visualizeDialog({ editor, page, nb }) {
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.', { action: { label: 'Open', run: () => go('#/settings/ai') } }); return; }
  const sel = editor.selectedText().trim();
  const text = sel || pageText({ ...page, html: editor.getHTML() }, { maxLen: 30000 });
  if (text.replace(/^#.*$/m, '').trim().length < 30) { toast('Write a few lines of notes first — visuals are based on what you write.'); return; }
  const body = h('div');
  const custom = h('input.field', { type: 'text', placeholder: 'Or describe one: “labelled diagram of a neuron”, “graph of y = sin x”…' });
  const s = sheet({ title: 'Visualise your notes', wide: true, body: h('div', body, h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px' } }, custom,
    h('button.btn', { type: 'button', text: 'Make it', on: { click: () => { if (custom.value.trim()) build({ kind: 'auto', title: custom.value.trim(), request: custom.value.trim() }); } } }))) });
  custom.addEventListener('keydown', (e) => { if (e.key === 'Enter' && custom.value.trim()) build({ kind: 'auto', title: custom.value.trim(), request: custom.value.trim() }); });
  status(body, 'Reading your notes to find what would help…');
  let suggestions = [];
  try {
    const res = await generateJSON({
      system: 'You choose visual aids for a student\'s notes. You never propose decorative or loosely related images.',
      prompt: `Subject: ${nb.subject || 'unknown'}. Notebook: "${nb.title}".
Read the notes and propose up to 5 visuals that would genuinely help understand THESE notes. Each must depict content that appears in the notes. If nothing fits, return {"items":[]}.
Allowed kinds:
- "diagram": a labelled scientific/technical illustration (cells, organs, circuits, forces, geometry, apparatus, processes). Give "request": a precise description of what to draw and every label, using only facts from the notes or standard textbook knowledge.
- "graph": mathematical function plot. Give "functions": ["x^2-4"] (use x), "xmin", "xmax".
- "molecule": give "molecules": [{"name":"common/IUPAC name","smiles":"SMILES"}].
- "reaction": give "molecules": reactants then products in order, and "arrowAt": index of first product.
- "timeline": give "items": [{"date","title","text"}] taken from the notes.
- "map": give "title" and "places": [{"name","lat","lng","note"}] for real places named in the notes.
- "flowchart": give "steps" in the arrow syntax "A -> B -> C" (one chain per line).
- "mindmap": give "outline": indented text, first line = central topic.
- "table": give "headers" and "rows" comparing things from the notes.
Reply JSON: {"items":[{"kind":"...","title":"short name","why":"one sentence on how it helps", ...kind fields}]}

Notes:
${text}`,
      temperature: 0.3,
    });
    suggestions = (res.items || []).filter((x) => KIND_ICON[x.kind]);
  } catch (e) { body.innerHTML = ''; body.append(h('p', { style: { color: 'var(--danger)' } }, e.message)); return; }
  showList();

  function showList() {
    body.innerHTML = '';
    if (!suggestions.length) { body.append(h('p.muted', 'Nothing in these notes needs a visual yet. Describe one below if you have something in mind.')); return; }
    body.append(h('p.muted', { style: { marginTop: 0 } }, sel ? 'Based on your selection:' : 'Based on this page:'),
      h('div.vis-sugg', suggestions.map((sg) => h('button.vis-opt', { type: 'button', on: { click: () => build(sg) } },
        h('span', { html: ic(KIND_ICON[sg.kind]) }), h('div', h('b', sg.title), h('span', sg.why || ''))))));
  }

  async function build(sg) {
    body.innerHTML = '';
    status(body, sg.kind === 'diagram' || sg.kind === 'auto' ? 'Drawing… diagrams take 10–40 seconds.' : 'Building…');
    try {
      if (sg.kind === 'auto') sg = await classify(sg.request, text, nb);
      const node = await makeNode(sg, nb, text);
      body.innerHTML = '';
      const prev = h('div.vis-preview.editor', { style: { minHeight: '0' } });
      const clone = node.cloneNode(true);
      prev.append(clone);
      if (clone.classList.contains('blk') && clone.dataset.json) renderBlock(clone, null);
      body.append(prev,
        h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' } },
          h('button.btn.primary', { type: 'button', html: ic('plus') + '<span>Insert into page</span>', on: { click: () => { editor.restoreRange(); editor.insertNode(node); s.close(); toast('Inserted. Tap it to resize, label, crop or restyle.'); } } }),
          h('button.btn', { type: 'button', html: ic('refresh') + '<span>Try again</span>', on: { click: () => build(sg) } }),
          suggestions.length ? h('button.btn.ghost', { type: 'button', text: 'Back to suggestions', on: { click: showList } }) : null),
        sg.kind === 'diagram' ? h('p.faint', { style: { fontSize: '12.5px' } }, 'AI drawings can contain mistakes — check labels against your course material.') : null);
    } catch (e) {
      body.innerHTML = '';
      body.append(h('p', { style: { color: 'var(--danger)' } }, e.message));
      if (suggestions.length) body.append(h('button.btn.sm', { type: 'button', text: 'Back to suggestions', on: { click: showList } }));
    }
  }
}

function status(el, t) { el.innerHTML = ''; el.append(h('div.gen-status', h('span.spinner'), h('span', t))); }

async function classify(request, text, nb) {
  const res = await generateJSON({
    prompt: `A student asks for this visual: "${request}". Subject: ${nb.subject || 'unknown'}. Pick the best kind and fill its fields, using the notes below only if relevant.
Kinds and fields: diagram{request}, graph{functions,xmin,xmax}, molecule{molecules:[{name,smiles}]}, reaction{molecules,arrowAt}, timeline{items:[{date,title,text}]}, map{title,places:[{name,lat,lng,note}]}, flowchart{steps}, mindmap{outline}, table{headers,rows}.
Reply JSON: {"kind":"...","title":"...", ...fields}
Notes (context):
${text.slice(0, 12000)}`,
    temperature: 0.2,
  });
  if (!KIND_ICON[res.kind]) res.kind = 'diagram';
  res.request ||= request;
  return res;
}

async function pubchemSmiles(name) {
  try {
    const r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/IsomericSMILES,CanonicalSMILES/JSON`);
    if (!r.ok) return null;
    const p = (await r.json()).PropertyTable.Properties[0];
    return p.IsomericSMILES || p.CanonicalSMILES || p.SMILES || p.ConnectivitySMILES || null;
  } catch { return null; }
}
async function geocode(name) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(name));
    const a = await r.json();
    return a[0] ? { lat: +a[0].lat, lng: +a[0].lon } : null;
  } catch { return null; }
}

async function makeNode(sg, nb, text) {
  switch (sg.kind) {
    case 'graph': return withCaption(makeBlock('graph', { fns: (sg.functions || []).map((e) => ({ expr: String(e).replace(/^y\s*=\s*/, '') })), xmin: sg.xmin ?? -10, xmax: sg.xmax ?? 10 }), sg.title);
    case 'molecule':
    case 'reaction': {
      const items = [];
      for (const m of sg.molecules || []) {
        const verified = await pubchemSmiles(m.name);
        items.push({ name: m.name, smiles: verified || m.smiles });
      }
      if (sg.kind === 'reaction' && sg.arrowAt > 0 && items[sg.arrowAt]) items[sg.arrowAt].arrow = '→';
      return withCaption(makeBlock('molecule', { items, reaction: sg.kind === 'reaction' }), sg.title);
    }
    case 'timeline': return withCaption(makeBlock('timeline', { layout: 'vertical', items: sg.items || [] }), sg.title);
    case 'flowchart': return withCaption(makeBlock('flow', { src: sg.steps || '', dir: 'TB' }), sg.title);
    case 'mindmap': return withCaption(makeBlock('mindmap', { src: sg.outline || '' }), sg.title);
    case 'table': {
      const rows = [sg.headers || [], ...(sg.rows || [])];
      const wrap = document.createElement('div');
      wrap.innerHTML = blocksToHTML([{ type: 'table', headers: sg.headers, rows: sg.rows, caption: sg.title }]);
      return wrap.firstElementChild || makeTable(rows.length, rows[0].length);
    }
    case 'map': {
      const markers = [];
      for (const p of sg.places || []) {
        let { lat, lng } = p;
        if (!isFinite(lat) || !isFinite(lng)) { const g = await geocode(p.name); if (!g) continue; ({ lat, lng } = g); }
        markers.push({ lat: +lat, lng: +lng, label: p.name, note: p.note || '' });
      }
      if (!markers.length) throw new Error('Couldn’t place those locations on a map.');
      return withCaption(makeBlock('map', { title: sg.title, markers, center: [markers[0].lat, markers[0].lng], zoom: 4 }), sg.title);
    }
    default: {
      const svg = await drawSVG(sg.request || sg.title, nb, text);
      const fig = makeFigure({ svg, caption: sg.title, width: 88 });
      fig.dataset.prompt = sg.request || sg.title;
      return fig;
    }
  }
}

function withCaption(blk, title) { const c = blk.querySelector('figcaption'); if (c && title) c.textContent = title; return blk; }

export async function drawSVG(request, nb, text = '') {
  const { text: out } = await generate({
    system: 'You are a scientific illustrator who writes clean, accurate SVG for textbooks.',
    prompt: `Draw: ${request}
Subject: ${nb?.subject || 'general'}.
Requirements:
- Output ONE complete <svg> element only, no explanation, no markdown fences.
- viewBox="0 0 800 520". No width/height attributes. No <script>, <image>, <foreignObject>, external links, or CSS @import.
- Flat textbook style: soft fills with darker outlines (stroke-width 2), a calm palette (e.g. #E9D8C4, #CFE1D2, #D6E2F0, #F2D0C9, #E8E1F2, outlines #3A3A3A).
- Every important part labelled with text (font-family="Helvetica, Arial, sans-serif", font-size 16–20, fill #222) and a thin leader line (#555) from the label to the part. Labels must not overlap each other or the drawing.
- Scientifically accurate shapes, proportions and label names. Include only parts that really exist; do not invent structures.
- Include a short title at the top (font-size 22, bold).
${text ? `The student's notes, so labels use their terminology:\n${text.slice(0, 6000)}` : ''}`,
    temperature: 0.35,
    maxTokens: 16000,
  });
  const el = sanitizeSVG(out);
  if (!el) throw new Error('The AI drawing was incomplete. Try again.');
  el.querySelectorAll('text').forEach((t) => { if (!t.getAttribute('font-family')) t.setAttribute('font-family', 'Helvetica, Arial, sans-serif'); });
  return el;
}

export async function redraw(blk, editor, { nb, page }) {
  const host = blk.querySelector('.svg-host');
  if (!host) return;
  toast('Redrawing…');
  try {
    const svg = await drawSVG(blk.dataset.prompt, nb, pageText(page, { maxLen: 6000 }));
    editor.record();
    host.innerHTML = '';
    host.append(svg);
    editor.changed();
    toast('Redrawn. Undo to get the previous version back.');
  } catch (e) { toast(e.message, { kind: 'error' }); }
}
