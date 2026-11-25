// Flashcards: decks, AI generation, manual cards, spaced-repetition study with flip animation.
import { S, on, notebooks, pagesOf, createDeck, updateDeck, deleteDeck, cardsOf, createCard, updateCard, deleteCard, gradeCard, dueCards, logActivity } from '../store.js';
import { h, ic, iconBtn, sheet, field, select, segmented, toast, menu, confirmDialog, promptDialog, shuffle as shuffleArr, pickFile, timeAgo, esc, shrinkImage } from '../util.js';
import { go, menuButton, savePill } from '../main.js';
import { generateJSON, hasAI } from '../ai/gemini.js';
import { pageText } from '../editor/text.js';
import { readMaterial, ACCEPT } from '../tools/files.js';
import { inlineMarkdown } from '../tools/md.js';

const TYPE_LABEL = { qa: 'Question', definition: 'Definition', cloze: 'Fill in the blank', mcq: 'Multiple choice', image: 'Image' };

export async function render(main, params) {
  const view = h('div.view');
  const pad = h('div.view-pad');
  view.append(pad);
  main.append(view);
  if (params.mode === 'study') return studyView(pad, params.id);
  const draw = () => { pad.innerHTML = ''; params.mode === 'deck' ? deckView(pad, params.id) : listView(pad); };
  const offs = [on('decks', draw), on('cards', () => { if (!pad.querySelector('textarea:focus, input:focus')) draw(); })];
  draw();
  return () => offs.forEach((f) => f());
}

function deckStats(id) {
  const cards = cardsOf(id);
  const now = Date.now();
  const due = cards.filter((c) => c.srs.due <= now).length;
  const learned = cards.filter((c) => c.srs.interval >= 7).length;
  const learning = cards.filter((c) => c.srs.reps > 0 && c.srs.interval < 7).length;
  const tot = cards.reduce((s, c) => s + c.stats.correct + c.stats.wrong, 0);
  const acc = tot ? Math.round(cards.reduce((s, c) => s + c.stats.correct, 0) / tot * 100) : null;
  return { total: cards.length, due, learned, learning, fresh: cards.length - learned - learning, acc };
}

function listView(pad) {
  const decks = [...S.decks.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const due = dueCards().length;
  pad.append(h('div.topbar', menuButton(), h('h1', 'Flashcards'), savePill(),
    h('button.btn', { type: 'button', html: ic('plus') + '<span>New deck</span>', on: { click: async () => { const n = await promptDialog('New deck', '', { placeholder: 'e.g. Cell biology terms', okLabel: 'Create' }); if (n) { const d = createDeck({ name: n }); go('#/cards/' + d.id); } } } }),
    h('button.btn.primary', { type: 'button', html: ic('sparkles') + '<span>Generate from notes</span>', on: { click: () => generateDeckDialog({}) } })));
  if (due) pad.append(h('div.banner', h('span', { html: ic('cards') }), h('p', `${due} card${due === 1 ? '' : 's'} due for review across your decks.`), h('a.btn.primary.sm', { href: '#/study/all' }, 'Review now')));
  if (!decks.length) {
    pad.append(h('div.panel', h('div.empty', h('div.empty-art', { html: `<svg viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="30" y="18" width="62" height="44" rx="6" transform="rotate(-8 61 40)" fill="currentColor" fill-opacity=".06"/><rect x="26" y="30" width="66" height="46" rx="6" fill="var(--surface)"/><path d="M38 46h40M38 56h26"/></svg>` }),
      h('h3', 'No flashcards yet'), h('p', 'Generate a deck from any notebook, page or document — or write cards yourself. Cards come back right before you would forget them.'),
      h('button.btn.primary', { type: 'button', html: ic('sparkles') + '<span>Generate from notes</span>', on: { click: () => generateDeckDialog({}) } }))));
    return;
  }
  pad.append(h('div.deck-grid', decks.map((d) => {
    const st = deckStats(d.id);
    const nb = S.notebooks.get(d.notebookId);
    return h('a.deck', { href: '#/cards/' + d.id },
      h('div', h('h3', d.name), h('div.deck-sub', [nb?.title, `${st.total} cards`].filter(Boolean).join(' · '))),
      h('div.deck-bar', { title: 'Learned / learning / new' }, h('i', { style: { width: (st.total ? st.learned / st.total * 100 : 0) + '%', background: 'var(--ok)' } }), h('i', { style: { width: (st.total ? st.learning / st.total * 100 : 0) + '%', background: 'var(--accent)' } })),
      h('div.deck-nums', h('span', h('b', String(st.due)), ' due'), h('span', h('b', String(st.learned)), ' learned'), st.acc != null ? h('span', h('b', st.acc + '%'), ' correct') : null));
  })));
}

function deckView(pad, id) {
  const d = S.decks.get(id);
  if (!d) { go('#/cards'); return; }
  const st = deckStats(id);
  const cards = cardsOf(id);
  pad.append(
    h('div.topbar', menuButton(), h('a.icon-btn', { href: '#/cards', 'aria-label': 'All decks', html: ic('chevron-left') }), h('h1', d.name), savePill(),
      iconBtn('more', 'Deck options', (e) => menu(e.currentTarget, [
        { label: 'Rename', icon: 'pencil', run: async () => { const n = await promptDialog('Rename deck', d.name); if (n) updateDeck(id, { name: n }); } },
        { label: 'Add cards with AI', icon: 'sparkles', run: () => generateDeckDialog({ deckId: id, notebookId: d.notebookId }) },
        { label: 'Reset progress', icon: 'refresh', run: async () => { if (await confirmDialog('Reset spaced-repetition progress and stats for every card in this deck?', { okLabel: 'Reset' })) cards.forEach((c) => updateCard(c.id, { srs: { due: Date.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0 }, stats: { correct: 0, wrong: 0, last: 0 } })); } },
        { sep: true },
        { label: 'Delete deck', icon: 'trash', danger: true, run: async () => { if (await confirmDialog(`Delete “${d.name}” and its ${cards.length} cards? This can’t be undone.`, { danger: true, okLabel: 'Delete' })) { deleteDeck(id); go('#/cards'); } } },
      ]))),
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '22px' } },
      h('a.btn.primary', { href: '#/study/' + id, html: ic('play') + `<span>Study ${st.due ? st.due + ' due' : ''}</span>` }),
      h('a.btn', { href: '#/study/' + id + '~all', html: ic('repeat') + '<span>Practise all</span>' }),
      h('a.btn', { href: '#/study/' + id + '~shuffle', html: ic('shuffle') + '<span>Shuffle all</span>' }),
      h('button.btn', { type: 'button', html: ic('plus') + '<span>Add card</span>', on: { click: () => editCardDialog(id) } }),
      h('button.btn', { type: 'button', html: ic('sparkles') + '<span>More with AI</span>', on: { click: () => generateDeckDialog({ deckId: id, notebookId: d.notebookId }) } })),
    h('div.panel', { style: { padding: '18px', marginBottom: '22px' } },
      h('div.stat-row', { style: { marginTop: 0 } },
        h('div.stat', h('b', String(st.total)), h('span', 'cards')),
        h('div.stat', h('b', String(st.due)), h('span', 'due now')),
        h('div.stat', h('b', String(st.fresh)), h('span', 'new')),
        h('div.stat', h('b', String(st.learning)), h('span', 'learning')),
        h('div.stat', h('b', String(st.learned)), h('span', 'learned')),
        h('div.stat', h('b', st.acc != null ? st.acc + '%' : '—'), h('span', 'correct answers')))),
    h('div.section-head', h('h2', 'Cards')),
    cards.length ? h('div.panel', { style: { padding: '4px 14px' } }, cards.map((c) => h('div.card-row',
      c.image ? h('img', { src: c.image, alt: '', style: { width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px' } }) : null,
      h('div.cr-main', h('div', { html: inlineMarkdown(c.front) }), h('div.muted', { html: c.type === 'mcq' ? inlineMarkdown(c.options?.[c.answer] || '') : inlineMarkdown(c.back) })),
      h('div', { style: { display: 'grid', justifyItems: 'end', gap: '6px' } },
        h('span.badge', TYPE_LABEL[c.type] || c.type),
        c.stats.correct + c.stats.wrong ? h('span.badge' + (c.stats.correct >= c.stats.wrong ? '.ok' : '.bad'), `${c.stats.correct}✓ ${c.stats.wrong}✗`) : null),
      iconBtn('pencil', 'Edit card', () => editCardDialog(id, c), 'sm'),
      iconBtn('trash', 'Delete card', () => { deleteCard(c.id); toast('Card deleted'); }, 'sm'))))
      : h('p.muted', 'No cards yet.'),
  );
}

export function editCardDialog(deckId, card = null, prefill = {}) {
  const c = card ? structuredClone(card) : { type: 'qa', front: '', back: '', options: ['', '', '', ''], answer: 0, image: '', ...prefill };
  const body = h('div');
  const draw = () => {
    body.innerHTML = '';
    const front = h('textarea.field', { rows: 3, placeholder: c.type === 'cloze' ? 'Sentence with ____ for the missing part' : c.type === 'definition' ? 'Term' : 'Question', on: { input: (e) => { c.front = e.target.value; } } });
    front.value = c.front;
    const back = h('textarea.field', { rows: 3, placeholder: c.type === 'cloze' ? 'The missing word(s)' : c.type === 'definition' ? 'Definition' : 'Answer', on: { input: (e) => { c.back = e.target.value; } } });
    back.value = c.back;
    body.append(field('Type', segmented(Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l })), c.type, (v) => { c.type = v; if (v === 'mcq' && !c.options?.length) c.options = ['', '', '', '']; draw(); })));
    body.append(field(c.type === 'definition' ? 'Term' : 'Front', front));
    if (c.type === 'mcq') {
      c.options ||= ['', '', '', ''];
      body.append(h('div.form-label', { style: { marginBottom: '6px' } }, 'Options (tick the right one)'),
        h('div', { style: { display: 'grid', gap: '6px', marginBottom: '16px' } }, c.options.map((o, i) => h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h('input', { type: 'radio', name: 'mcqans', checked: c.answer === i, on: { change: () => { c.answer = i; } } }),
          h('input.field.sm', { type: 'text', value: o, on: { input: (e) => { c.options[i] = e.target.value; } } })))));
      body.append(field('Explanation (optional)', back));
    } else body.append(field(c.type === 'definition' ? 'Definition' : 'Back', back));
    const img = h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
      c.image ? h('img', { src: c.image, alt: '', style: { height: '64px', borderRadius: '8px' } }) : null,
      h('button.btn.sm', { type: 'button', html: ic('image-plus') + `<span>${c.image ? 'Change' : 'Add'} image</span>`, on: { click: async () => { const f = await pickFile('image/*'); if (f) { c.image = await shrinkImage(f, 900); draw(); } } } }),
      c.image ? h('button.btn.sm.ghost', { type: 'button', text: 'Remove', on: { click: () => { c.image = ''; draw(); } } }) : null);
    body.append(field('Image on the front', img));
  };
  draw();
  const s = sheet({ title: card ? 'Edit card' : 'New card', wide: true, body,
    actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
      h('button.btn.primary', { type: 'button', text: 'Save', on: { click: () => {
        if (!c.front.trim()) { toast('The front can’t be empty.'); return; }
        if (c.type === 'mcq') c.options = c.options.filter((o) => o.trim());
        if (card) updateCard(card.id, c); else { createCard(deckId, c); updateDeck(deckId, {}); }
        s.close();
      } } })] });
}

/* ---------------- quick card from a selection ---------------- */
export function quickCardDialog({ text, notebookId, context = '' }) {
  let deck = [...S.decks.values()].find((d) => d.notebookId === notebookId) || null;
  const deckSel = select([{ value: '__new', label: '+ New deck for this notebook' }, ...[...S.decks.values()].map((d) => ({ value: d.id, label: d.name }))], deck?.id || '__new', () => {});
  const front = h('textarea.field', { rows: 2 });
  const back = h('textarea.field', { rows: 3 });
  front.value = text.length < 120 ? `What is ${text.replace(/[.?!]$/, '')}?` : '';
  back.value = text.length < 120 ? '' : text;
  const aiBtn = h('button.btn.sm', { type: 'button', html: ic('sparkles') + '<span>Write it for me</span>', on: { click: async () => {
    if (!hasAI()) return toast('Add your Gemini key in Settings → AI first.');
    aiBtn.disabled = true;
    try {
      const r = await generateJSON({ prompt: `Make ONE high-quality flashcard that tests the key idea in the selected text. Use only facts from the text. Reply JSON {"front":"question","back":"concise answer"}.\nSelected text:\n${text}\n\nContext:\n${context.slice(0, 3000)}`, temperature: 0.3 });
      front.value = r.front || front.value; back.value = r.back || back.value;
    } catch (e) { toast(e.message, { kind: 'error' }); }
    aiBtn.disabled = false;
  } } });
  const s = sheet({ title: 'New flashcard', body: h('div', field('Deck', deckSel), field('Front', front), field('Back', back), aiBtn),
    actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }),
      h('button.btn.primary', { type: 'button', text: 'Add card', on: { click: () => {
        if (!front.value.trim()) return front.focus();
        let id = deckSel.value;
        if (id === '__new') id = createDeck({ name: (S.notebooks.get(notebookId)?.title || 'Notes') + ' cards', notebookId }).id;
        createCard(id, { type: 'qa', front: front.value.trim(), back: back.value.trim() });
        updateDeck(id, {});
        s.close();
        toast('Card added', { action: { label: 'Open deck', run: () => go('#/cards/' + id) } });
      } } })] });
}

/* ---------------- AI generation ---------------- */
export function generateDeckDialog({ notebookId = '', folderId = '', pageId = '', text = '', name = '', deckId = '', files: attached = [] } = {}) {
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.', { action: { label: 'Open', run: () => go('#/settings/ai') } }); return; }
  const nbs = notebooks();
  let source = text ? 'text' : pageId ? 'page' : folderId ? 'folder' : 'notebook';
  let nbId = notebookId || nbs[0]?.id || '';
  const types = new Set(['qa', 'definition', 'cloze', 'mcq']);
  let difficulty = 'mixed';
  let file = null;
  const count = h('input.field', { type: 'number', min: 3, max: 80, value: 20 });
  const body = h('div');
  const srcHost = h('div');
  const nbSel = select(nbs.map((n) => ({ value: n.id, label: n.title })), nbId, (v) => { nbId = v; drawSrc(); });
  const textIn = h('textarea.field', { rows: 5, placeholder: 'Paste text to make cards from' });
  textIn.value = text;
  let pageSel, folderSel;
  function drawSrc() {
    srcHost.innerHTML = '';
    if (source === 'notebook' || source === 'page' || source === 'folder') srcHost.append(field('Notebook', nbSel));
    if (source === 'page') { pageSel = select(pagesOf(nbId).map((p) => ({ value: p.id, label: p.title || 'Untitled page' })), pageId || pagesOf(nbId)[0]?.id, () => {}); srcHost.append(field('Page', pageSel)); }
    if (source === 'folder') { const fs = S.notebooks.get(nbId)?.folders || []; folderSel = select(fs.map((f) => ({ value: f.id, label: f.name })), folderId || fs[0]?.id, () => {}); srcHost.append(fs.length ? field('Section / chapter', folderSel) : h('p.muted', 'This notebook has no sections yet.')); }
    if (source === 'text') srcHost.append(textIn, attachedNote());
    if (source === 'file') srcHost.append(h('div.dropzone', file ? h('div.file-chip', h('span', file.name), iconBtn('x', 'Remove', () => { file = null; drawSrc(); }, 'sm')) : h('button.btn.sm', { type: 'button', html: ic('upload') + '<span>Choose a document</span>', on: { click: async () => { file = await pickFile(ACCEPT); drawSrc(); } } })));
  }
  const attachedNote = () => (attached.length ? h('p.muted', { style: { margin: '6px 0 0', fontSize: '13px' } }, `+ ${attached.length} attached file${attached.length === 1 ? '' : 's'} from school`) : '');
  const deckSel = select([{ value: '__new', label: '+ New deck' }, ...[...S.decks.values()].map((d) => ({ value: d.id, label: d.name }))], deckId || '__new', () => {});
  const typeChk = (t) => h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' } }, h('input', { type: 'checkbox', checked: types.has(t), on: { change: (e) => (e.target.checked ? types.add(t) : types.delete(t)) } }), TYPE_LABEL[t]);
  const status = h('div');
  const goBtn = h('button.btn.primary', { type: 'button', html: ic('sparkles') + '<span>Generate cards</span>', on: { click: run } });
  body.append(
    field('Make cards from', segmented([{ value: 'notebook', label: 'Notebook' }, { value: 'folder', label: 'Chapter' }, { value: 'page', label: 'Page' }, { value: 'text', label: 'Text' }, { value: 'file', label: 'Document' }], source, (v) => { source = v; drawSrc(); })),
    srcHost,
    h('div.form-grid', field('How many', count), field('Add to', deckSel)),
    field('Difficulty', segmented([{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }, { value: 'mixed', label: 'Mixed' }], difficulty, (v) => { difficulty = v; })),
    h('div.form-label', { style: { marginBottom: '8px' } }, 'Card types'),
    h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' } }, ...['qa', 'definition', 'cloze', 'mcq'].map(typeChk)),
    status);
  drawSrc();
  const s = sheet({ title: 'Generate flashcards', wide: true, body, actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }), goBtn] });

  async function run() {
    if (!types.size) { toast('Pick at least one card type.'); return; }
    let material = '';
    const files = [];
    let label = name;
    try {
      if (source === 'text') { material = textIn.value.trim(); files.push(...attached); label ||= 'Cards from text'; }
      else if (source === 'file') { if (!file) return toast('Choose a document first.'); const m = await readMaterial(file); if (m.part) files.push(m.part); material = m.text || ''; label ||= file.name.replace(/\.\w+$/, ''); }
      else {
        const nb = S.notebooks.get(nbId);
        if (!nb) return toast('Create a notebook first.');
        let ps = pagesOf(nbId, { includeArchived: false });
        if (source === 'page') ps = ps.filter((p) => p.id === pageSel.value);
        if (source === 'folder') ps = ps.filter((p) => p.folderId === folderSel?.value);
        material = ps.map((p) => pageText(p, { maxLen: 40000 })).join('\n\n').slice(0, 200000);
        label ||= source === 'page' ? (ps[0]?.title || 'Page') : source === 'folder' ? (nb.folders.find((f) => f.id === folderSel?.value)?.name || nb.title) : nb.title;
      }
    } catch (e) { toast(e.message, { kind: 'error' }); return; }
    if (!files.length && material.length < 40) { toast('There isn’t enough text there to make cards from.'); return; }
    goBtn.disabled = true;
    status.innerHTML = '';
    status.append(h('div.gen-status', h('span.spinner'), h('span', 'Writing your cards…')));
    try {
      const n = Math.max(3, Math.min(80, +count.value || 20));
      const res = await generateJSON({
        system: 'You write excellent flashcards for active recall. Every card tests one idea, is unambiguous, and is answerable from the source material. Never invent facts.',
        prompt: `Create ${n} flashcards from the material. Difficulty: ${difficulty}. Use only these types: ${[...types].join(', ')}.
Types:
- "qa": {"type":"qa","front":"question","back":"concise answer"}
- "definition": {"type":"definition","front":"term","back":"definition"}
- "cloze": {"type":"cloze","front":"sentence with ____ replacing the key word(s)","back":"the missing word(s)"}
- "mcq": {"type":"mcq","front":"question","options":["4 plausible options"],"answer":index_of_correct,"back":"one-line explanation"}
Add "topic" (2–4 words) and "difficulty" ("easy"|"medium"|"hard") to every card. Math in LaTeX $...$.
Cover the most important ideas first, spread across the whole material. Write in the material's language.
Reply JSON: {"cards":[...]}

Material:
${material}`,
        files, temperature: 0.4, maxTokens: 30000,
      });
      const cards = (res.cards || []).filter((c) => c.front && (c.back || c.options?.length));
      if (!cards.length) throw new Error('No cards came back. Try again or use more text.');
      let id = deckSel.value;
      if (id === '__new') id = createDeck({ name: label, notebookId: source === 'notebook' || source === 'page' || source === 'folder' ? nbId : notebookId }).id;
      for (const c of cards) createCard(id, { type: TYPE_LABEL[c.type] ? c.type : 'qa', front: String(c.front), back: String(c.back || ''), options: (c.options || []).map(String), answer: +c.answer || 0, topic: c.topic || '', difficulty: c.difficulty || 'medium' });
      updateDeck(id, {});
      s.close();
      toast(`${cards.length} cards added. Edit any you’d phrase differently.`);
      go('#/cards/' + id);
    } catch (e) { goBtn.disabled = false; status.innerHTML = ''; toast(e.message, { kind: 'error', ms: 6000 }); }
  }
}

/* Image-based cards from a figure on the page. */
export async function cardsFromFigureDialog(blk, nb) {
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.'); return; }
  let dataURL;
  const img = blk.querySelector('img');
  const svg = blk.querySelector('svg');
  try {
    if (img) dataURL = await shrinkImage(img.src, 1200);
    else if (svg) {
      const xml = new XMLSerializer().serializeToString(svg);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas');
      c.width = 1200; c.height = Math.round(1200 * (el.naturalHeight || 520) / (el.naturalWidth || 800));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(el, 0, 0, c.width, c.height);
      dataURL = c.toDataURL('image/jpeg', 0.88);
    }
  } catch { toast('Could not read that picture.'); return; }
  toast('Making image cards…');
  try {
    const caption = blk.querySelector('figcaption')?.textContent || '';
    const res = await generateJSON({
      prompt: `This image is from a student's ${nb.subject || ''} notes${caption ? ` (caption: "${caption}")` : ''}. Write 4–8 flashcards that test understanding of what the image shows (structures, labels, relationships, functions). The image will be shown on the front of every card, so do not ask questions whose answer is printed right next to the thing asked about; ask about function, relationships or what a part is called by pointing to its position. Only use what is visible or standard knowledge about it. Reply JSON {"cards":[{"front":"question","back":"answer"}]}`,
      files: [{ mime: 'image/jpeg', data: dataURL.split(',')[1] }], temperature: 0.3,
    });
    let deck = [...S.decks.values()].find((d) => d.notebookId === nb.id);
    deck ||= createDeck({ name: nb.title + ' cards', notebookId: nb.id });
    for (const c of res.cards || []) createCard(deck.id, { type: 'image', front: c.front, back: c.back, image: dataURL });
    updateDeck(deck.id, {});
    toast(`${(res.cards || []).length} image cards added to “${deck.name}”.`, { action: { label: 'Open', run: () => go('#/cards/' + deck.id) } });
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

/* ---------------- study session ---------------- */
function studyView(pad, rawId) {
  const [id, mode] = rawId.split('~');
  const all = id === 'all';
  let queue = all ? dueCards() : mode ? cardsOf(id) : dueCards(id);
  if (mode === 'shuffle' || all || S.settings.studyShuffle) queue = shuffleArr(queue);
  else queue = queue.sort((a, b) => a.srs.due - b.srs.due);
  const deck = all ? { name: 'All due cards' } : S.decks.get(id);
  if (!deck) { go('#/cards'); return; }
  const started = Date.now();
  let i = 0, right = 0, wrong = 0;
  const total = queue.length;
  const bar = h('i', { style: { width: '0%' } });
  const counter = h('span.muted.num');
  const stage = h('div');
  pad.append(h('div.study',
    h('div.study-top', h('a.icon-btn', { href: all ? '#/cards' : '#/cards/' + id, 'aria-label': 'Back', html: ic('x') }), h('div.progress', bar), counter),
    h('h2', { style: { margin: 0, font: '600 18px var(--font-display)', color: 'var(--text-2)' } }, deck.name),
    stage));
  const keys = (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stage.querySelector('.flip')?.click(); }
    if (['1', '2', '3', '4'].includes(e.key)) stage.querySelectorAll('.grade')[+e.key - 1]?.click();
  };
  window.addEventListener('keydown', keys);
  next();
  function next() {
    bar.style.width = (total ? i / total * 100 : 100) + '%';
    counter.textContent = `${Math.min(i + 1, total)} / ${total}`;
    stage.innerHTML = '';
    if (i >= queue.length) return finish();
    const c = queue[i];
    const flip = h('div.flip', { role: 'button', tabindex: '0', 'aria-label': 'Card — tap to flip' });
    const inner = h('div.flip-inner');
    const front = h('div.face.front', h('span.kind', TYPE_LABEL[c.type] || 'Card'));
    const back = h('div.face.back', h('span.kind', 'Answer'));
    if (c.image) front.append(h('img', { src: c.image, alt: '' }));
    const frontHTML = c.type === 'cloze' ? inlineMarkdown(c.front).replace(/_{3,}/g, '<span class="cloze-gap">&nbsp;</span>') : inlineMarkdown(c.front);
    front.append(h('div.q', { html: frontHTML }));
    const grades = h('div.grades',
      ...[['again', 'Again', '< 1 min', 0], ['hard', 'Hard', '', 1], ['good', 'Good', '', 2], ['easy', 'Easy', '', 3]].map(([cls, label, sub, g]) =>
        h('button.grade.' + cls, { type: 'button', on: { click: () => { if (g === 0) { wrong++; queue.push(c); } else right++; gradeCard(c.id, g); i++; next(); } } }, label, h('small', sub || preview(c, g)))));
    grades.style.visibility = 'hidden';
    if (c.type === 'mcq') {
      const opts = h('div.mcq');
      const order = shuffleArr(c.options.map((o, k) => k));
      order.forEach((k) => opts.append(h('button', { type: 'button', html: inlineMarkdown(c.options[k]), on: { click: (e) => {
        e.stopPropagation();
        if (opts.dataset.done) return;
        opts.dataset.done = '1';
        const ok = k === c.answer;
        e.currentTarget.classList.add(ok ? 'right' : 'wrong');
        opts.children[order.indexOf(c.answer)].classList.add('right');
        grades.style.visibility = 'visible';
        grades.querySelectorAll('.grade')[ok ? 2 : 0].classList.add('suggest');
        if (c.back) front.append(h('div.hint-txt', { html: inlineMarkdown(c.back) }));
      } } })));
      front.append(opts);
      flip.append(front);
      flip.style.cursor = 'default';
    } else {
      back.append(h('div.a', { html: inlineMarkdown(c.type === 'cloze' ? c.front.replace(/_{3,}/, `**${c.back}**`) : c.back) }));
      inner.append(front, back);
      flip.append(inner);
      front.append(h('div.hint-txt', 'Tap to see the answer'));
      flip.addEventListener('click', () => { flip.classList.toggle('flipped'); grades.style.visibility = 'visible'; });
    }
    stage.append(flip, h('div', { style: { height: '18px' } }), grades);
    flip.focus({ preventScroll: true });
  }
  function preview(c, g) {
    if (g === 0) return '';
    const n = c.srs.reps + 1;
    const d = n === 1 ? (g === 3 ? 3 : 1) : n === 2 ? (g === 1 ? 2 : g === 3 ? 7 : 4) : Math.round(c.srs.interval * (g === 1 ? 1.2 : g === 3 ? c.srs.ease * 1.3 : c.srs.ease));
    return d + (d === 1 ? ' day' : ' days');
  }
  function finish() {
    const mins = (Date.now() - started) / 60000;
    logActivity('min', Math.min(mins, 120));
    const acc = right + wrong ? Math.round(right / (right + wrong) * 100) : 0;
    stage.append(h('div.panel', h('div.done-card',
      h('div.empty-art', { html: `<svg viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="60" cy="48" r="30" fill="currentColor" fill-opacity=".08"/><path d="M46 49l10 10 19-21"/></svg>` }),
      h('h2', total ? 'Session complete' : 'Nothing due right now'),
      h('p.muted', total ? `${total} cards · ${acc}% right first time · ${Math.max(1, Math.round(mins))} min` : 'Come back later, or practise the whole deck now.'),
      h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' } },
        !all ? h('a.btn', { href: '#/study/' + id + '~shuffle' }, 'Practise all cards') : null,
        h('a.btn.primary', { href: all ? '#/cards' : '#/cards/' + id }, 'Done')))));
  }
  return () => window.removeEventListener('keydown', keys);
}
