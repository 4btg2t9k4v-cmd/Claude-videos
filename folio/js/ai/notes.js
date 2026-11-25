// "Create notes with AI" plus handwriting / photo transcription.
import { h, ic, sheet, field, select, segmented, toast, pickFile, iconBtn, esc } from '../util.js';
import { S, notebooks, createPage, createNotebook } from '../store.js';
import { generate, generateJSON, hasAI } from './gemini.js';
import { readMaterial, ACCEPT } from '../tools/files.js';
import { renderMarkdown, inlineMarkdown, tex } from '../tools/md.js';
import { makeBlock } from '../editor/blocks.js';
import { makeTable } from '../editor/table.js';
import { go } from '../main.js';

const CALLOUT_ICON = { info: 'info', important: 'alert', tip: 'bulb', example: 'flask', warning: 'alert' };

export function blocksToHTML(blocks) {
  const md = (t) => inlineMarkdown(String(t ?? ''));
  const out = [];
  for (const b of blocks || []) {
    try {
      switch (b.type) {
        case 'heading': { const l = Math.min(4, Math.max(1, b.level || 2)); out.push(`<h${l}>${md(b.text)}</h${l}>`); break; }
        case 'paragraph': out.push(`<p>${md(b.text)}</p>`); break;
        case 'bullets': out.push('<ul>' + (b.items || []).map((i) => `<li>${md(i)}</li>`).join('') + '</ul>'); break;
        case 'numbered': out.push('<ol>' + (b.items || []).map((i) => `<li>${md(i)}</li>`).join('') + '</ol>'); break;
        case 'checklist': out.push('<ul class="checklist">' + (b.items || []).map((i) => `<li>${md(i)}</li>`).join('') + '</ul>'); break;
        case 'definition': out.push(`<div class="definition"><p><span class="def-term">${esc(b.term)}</span>${md(b.text)}</p></div>`); break;
        case 'callout': { const k = CALLOUT_ICON[b.kind] ? b.kind : 'info'; out.push(`<div class="callout" data-kind="${k}"><span class="co-ic" contenteditable="false">${ic(CALLOUT_ICON[k])}</span><div class="co-body"><p>${md(b.text)}</p></div></div>`); break; }
        case 'quote': out.push(`<blockquote>${md(b.text)}</blockquote>`); break;
        case 'formula':
          out.push(makeBlock('equation', { latex: b.latex || '' }, { caption: false }).outerHTML);
          if (b.caption) out.push(`<p style="text-align:center;font-size:.9em">${md(b.caption)}</p>`);
          break;
        case 'table': {
          const rows = [b.headers || [], ...(b.rows || [])];
          const cols = Math.max(...rows.map((r) => r.length), 1);
          const t = makeTable(rows.length, cols, { headerRow: !!(b.headers && b.headers.length), headerCol: !!b.headerColumn, style: b.style || 'grid' });
          [...t.querySelectorAll('tr')].forEach((tr, r) => [...tr.cells].forEach((c, ci) => { c.innerHTML = md(rows[r]?.[ci] ?? ''); }));
          if (b.caption) t.append(Object.assign(document.createElement('figcaption'), { contentEditable: 'true', textContent: b.caption }));
          out.push(t.outerHTML);
          break;
        }
        case 'timeline': out.push(makeBlock('timeline', { layout: 'vertical', items: (b.items || []).map((i) => ({ date: String(i.date || ''), title: String(i.title || ''), text: String(i.text || '') })) }).outerHTML); break;
        case 'flowchart': out.push(makeBlock('flow', { src: String(b.steps || b.src || ''), dir: b.direction === 'LR' ? 'LR' : 'TB' }).outerHTML); break;
        case 'mindmap': out.push(makeBlock('mindmap', { src: String(b.outline || '') }).outerHTML); break;
        case 'graph': out.push(makeBlock('graph', { fns: (b.functions || b.fns || []).map((f) => ({ expr: typeof f === 'string' ? f : f.expr })), xmin: b.xmin ?? -10, xmax: b.xmax ?? 10, ymin: b.ymin ?? null, ymax: b.ymax ?? null }).outerHTML); break;
        case 'summary': out.push('<div class="summary-box"><h4>' + esc(b.title || 'Key takeaways') + '</h4><ul>' + (b.items || []).map((i) => `<li>${md(i)}</li>`).join('') + '</ul></div>'); break;
        case 'divider': out.push('<hr>'); break;
        default: if (b.text) out.push(`<p>${md(b.text)}</p>`);
      }
    } catch (e) { console.warn('block skipped', b, e); }
  }
  return out.join('');
}

export const BLOCK_SPEC = `Each block is one of:
{"type":"heading","level":1|2|3,"text":"..."}
{"type":"paragraph","text":"... (inline **bold**, *italic*, $latex$ allowed)"}
{"type":"bullets","items":["..."]} | {"type":"numbered","items":["..."]}
{"type":"definition","term":"...","text":"..."}
{"type":"callout","kind":"info|important|tip|example|warning","text":"..."}
{"type":"formula","latex":"KaTeX LaTeX without $","caption":"what it means"}
{"type":"table","headers":["..."],"rows":[["..."]],"caption":"..."}
{"type":"timeline","items":[{"date":"...","title":"...","text":"..."}]}
{"type":"flowchart","steps":"Step A -> Step B -> Decision? -> Step C\\nDecision? -> Other : no"}
{"type":"mindmap","outline":"Central topic\\n  Branch\\n    Sub-branch"}
{"type":"graph","functions":["x^2-4"],"xmin":-5,"xmax":5}
{"type":"quote","text":"..."}
{"type":"summary","title":"Key takeaways","items":["..."]}`;

export function createNotesDialog({ notebookId = '', topic = '' } = {}) {
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.', { action: { label: 'Open', run: () => go('#/settings/ai') } }); return; }
  let mode = topic ? 'topic' : 'files';
  const files = [];
  const topicIn = h('input.field', { type: 'text', value: topic, placeholder: 'e.g. The causes of the French Revolution' });
  const levelSel = select(['High school', 'First-year university', 'Advanced university'], 'First-year university', () => {});
  const pasteIn = h('textarea.field', { rows: 8, placeholder: 'Paste a lesson, a chapter, lecture slides or rough notes…' });
  const fileList = h('div.file-list');
  const drop = h('div.dropzone', h('p', { style: { margin: '0 0 10px' } }, 'PDF, PowerPoint (.pptx), Word (.docx), text, or photos of handwritten notes'),
    h('button.btn.sm', { type: 'button', html: ic('upload') + '<span>Choose files</span>', on: { click: async () => { const fs = await pickFile(ACCEPT, true); fs && addFiles(fs); } } }));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  function addFiles(fs) { for (const f of fs) files.push(f); drawFiles(); }
  function drawFiles() {
    fileList.innerHTML = '';
    files.forEach((f, i) => fileList.append(h('div.file-chip', h('span', { html: ic(f.type.startsWith('image/') ? 'image' : 'file-text') }), h('span', f.name), h('small.faint', Math.round(f.size / 1024) + ' KB'), iconBtn('x', 'Remove', () => { files.splice(i, 1); drawFiles(); }, 'sm'))));
  }
  const panes = {
    topic: h('div', field('Topic', topicIn), field('Level', levelSel), h('p.faint', { style: { fontSize: '13px' } }, 'Notes from a topic alone come from the AI’s general knowledge. Check them against your course material.')),
    paste: h('div', pasteIn),
    files: h('div', drop, fileList),
  };
  const paneHost = h('div', panes[mode]);
  const srcBtn = (id, icon, label) => h('button.cn-src', { type: 'button', 'aria-pressed': String(mode === id), on: { click: (e) => { mode = id; paneHost.innerHTML = ''; paneHost.append(panes[id]); e.currentTarget.parentElement.querySelectorAll('.cn-src').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } } }, h('span', { html: ic(icon) }), label);
  const nbs = notebooks();
  const nbSel = select([{ value: '__new', label: '+ New notebook' }, ...nbs.map((n) => ({ value: n.id, label: n.title }))], notebookId || nbs[0]?.id || '__new', () => {});
  let detail = 'standard';
  let split = 'one';
  const opts = { examples: true, tables: true, diagrams: true, revision: true };
  const chk = (k, label) => h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' } }, h('input', { type: 'checkbox', checked: opts[k], on: { change: (e) => { opts[k] = e.target.checked; } } }), label);
  const status = h('div');
  const go_ = h('button.btn.primary', { type: 'button', html: ic('sparkles') + '<span>Create notes</span>', on: { click: run } });
  const s = sheet({ title: 'Create notes with AI', wide: true, body: h('div',
    h('div.cn-sources', srcBtn('files', 'file-up', 'Upload files'), srcBtn('paste', 'copy', 'Paste text'), srcBtn('topic', 'bulb', 'Enter a topic')),
    paneHost,
    h('div.form-grid', { style: { marginTop: '16px' } }, field('Save to', nbSel),
      field('Detail', segmented([{ value: 'concise', label: 'Concise' }, { value: 'standard', label: 'Standard' }, { value: 'detailed', label: 'Detailed' }], detail, (v) => { detail = v; }))),
    field('Pages', segmented([{ value: 'one', label: 'One page' }, { value: 'sections', label: 'A page per main section' }], split, (v) => { split = v; })),
    h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap', margin: '4px 0 14px' } }, chk('examples', 'Examples'), chk('tables', 'Tables'), chk('diagrams', 'Diagrams & timelines'), chk('revision', 'Revision summary')),
    status),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }), go_] });

  async function run() {
    let material = '';
    const parts = [];
    try {
      if (mode === 'topic') { if (!topicIn.value.trim()) return topicIn.focus(); }
      else if (mode === 'paste') { if (pasteIn.value.trim().length < 20) return pasteIn.focus(); material = pasteIn.value.trim(); }
      else {
        if (!files.length) { toast('Add at least one file.'); return; }
        setStatus('Reading your files…');
        for (const f of files) {
          const m = await readMaterial(f);
          if (m.part) parts.push(m.part);
          if (m.text) material += `\n\n=== ${m.name} ===\n${m.text}`;
        }
      }
    } catch (e) { setStatus(''); toast(e.message, { kind: 'error', ms: 6000 }); return; }
    go_.disabled = true;
    setStatus('Organising your notes… this can take up to a minute for long files.');
    const fromSource = mode !== 'topic';
    const prompt = `${fromSource
      ? 'Turn the study material provided (attached files and/or text below) into beautifully structured study notes. FACTUAL ACCURACY IS CRITICAL: use only information found in the material. Do not invent facts, numbers, dates, names or examples that are not supported by it. If the material is unclear or illegible, write "[unclear in source]". Handwritten images must be transcribed faithfully before organising.'
      : `Write accurate, well-established study notes on the topic "${topicIn.value.trim()}" for a ${levelSel.value} student. Only include widely accepted facts; leave out anything you are unsure of rather than guessing.`}
Structure: main title, short introduction, headings and subheadings, definitions of key terms, clear explanations${opts.examples ? ', worked examples' : ''}${opts.tables ? ', tables where comparing or classifying' : ''}${opts.diagrams ? ', a timeline for chronological content, a flowchart for processes, a mind map for overviews (only when they genuinely help)' : ''}, important-information callouts, formulas in LaTeX${opts.revision ? ', and finish with a "summary" block of key takeaways plus a short revision section (heading + numbered self-test questions)' : ''}.
Detail level: ${detail}. ${split === 'sections' ? 'Split into one page per main section (2–8 pages).' : 'Put everything on one page.'}
Write in the same language as the material${fromSource ? '' : ' requested (default English)'}.
Reply with JSON only: {"title":"notebook-friendly title","pages":[{"title":"...","blocks":[...]}]}
${BLOCK_SPEC}
${material ? `\nMaterial:\n${material.slice(0, 400000)}` : ''}`;
    try {
      let chars = 0;
      const { text } = await generate({ prompt, files: parts, json: true, temperature: 0.25, maxTokens: 60000, onText: (t) => { chars = t.length; setStatus(`Writing your notes… ${Math.round(chars / 100) / 10}k characters`); } });
      const data = (await import('./gemini.js')).parseJSON(text);
      const pages = (data.pages && data.pages.length ? data.pages : [{ title: data.title, blocks: data.blocks || [] }]);
      let nbId = nbSel.value;
      if (nbId === '__new') nbId = createNotebook({ title: data.title || topicIn.value || 'New notes' }).id;
      let first = null;
      for (const p of pages) {
        const html = blocksToHTML(p.blocks);
        const pg = createPage(nbId, { title: p.title || data.title || 'Notes', html }, { quiet: true });
        first ||= pg;
      }
      S.notebooks.get(nbId) && (await import('../store.js')).emit('pages', { notebookId: nbId });
      s.close();
      toast(`Created ${pages.length} page${pages.length === 1 ? '' : 's'}. Review them for accuracy.`);
      go(`#/nb/${nbId}/${first.id}`);
    } catch (e) {
      go_.disabled = false;
      setStatus('');
      toast(e.message, { kind: 'error', ms: 6000 });
    }
  }
  function setStatus(t) { status.innerHTML = ''; if (t) status.append(h('div.gen-status', h('span.spinner'), h('span', t))); }
}

/** Photo of notes (handwritten or printed) → editable text inserted into the page. */
export async function scanImageToText(editor) {
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.'); return; }
  const f = await pickFile('image/*');
  if (!f) return;
  const m = await readMaterial(f);
  transcribe(m.part, editor, m.preview);
}

export function handwritingToText(pngDataURL, editor, { onInserted } = {}) {
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.'); return; }
  transcribe({ mime: 'image/png', data: pngDataURL.split(',')[1] }, editor, pngDataURL, onInserted);
}

async function transcribe(part, editor, preview, onInserted) {
  const out = h('div.md', h('span.thinking', h('i'), h('i'), h('i'), ' Reading the handwriting…'));
  let md = '';
  const removeInk = h('input', { type: 'checkbox', checked: true });
  const ins = h('button.btn.primary', { type: 'button', text: 'Insert into page', disabled: true, on: { click: () => {
    editor.restoreRange();
    editor.insertHTMLAfterCurrent(renderMarkdown(md));
    s.close();
    onInserted?.(removeInk.checked);
    toast('Text added to your page.');
  } } });
  const s = sheet({ title: 'Handwriting to text', wide: true, body: h('div', { style: { display: 'grid', gap: '14px' } },
    preview ? h('img', { src: preview, alt: 'Your handwriting', style: { maxHeight: '220px', maxWidth: '100%', objectFit: 'contain', borderRadius: '10px', background: '#fff', justifySelf: 'center' } }) : null,
    h('div.vis-preview', out),
    onInserted ? h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' } }, removeInk, 'Remove the handwriting after inserting') : null),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }), ins] });
  try {
    const res = await generate({
      prompt: 'Transcribe the handwritten or printed notes in this image exactly as written. Keep the structure (headings, bullet points, numbering) as Markdown. Write maths in LaTeX ($...$). Do not add, correct or explain anything. Mark illegible words as [?]. Reply with only the transcription.',
      files: [part], temperature: 0,
      onText: (t) => { md = t; out.innerHTML = renderMarkdown(t); },
    });
    md = res.text;
    out.innerHTML = renderMarkdown(md);
    ins.disabled = false;
  } catch (e) { out.textContent = e.message; }
}

export { tex };
