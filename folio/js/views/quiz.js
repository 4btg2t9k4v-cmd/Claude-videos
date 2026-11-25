// Quizzes: AI generation from notes, taking a quiz, AI marking of written answers, results and weak topics.
import { S, on, notebooks, pagesOf, saveQuiz, deleteQuiz, createDeck, createCard, updateDeck, logActivity } from '../store.js';
import { h, ic, iconBtn, sheet, field, select, segmented, toast, menu, confirmDialog, timeAgo, fmtDate, shuffle, pickFile, esc } from '../util.js';
import { go, menuButton } from '../main.js';
import { generateJSON, hasAI } from '../ai/gemini.js';
import { pageText } from '../editor/text.js';
import { readMaterial, ACCEPT } from '../tools/files.js';
import { inlineMarkdown, renderMarkdown } from '../tools/md.js';

const TYPES = {
  mcq: 'Multiple choice', tf: 'True or false', short: 'Short answer', fill: 'Fill in the blank',
  match: 'Matching', application: 'Application', exam: 'Exam-style',
};

export async function render(main, params) {
  const view = h('div.view');
  const pad = h('div.view-pad');
  view.append(pad);
  main.append(view);
  if (params.mode === 'take') return takeView(pad, params.id);
  const draw = () => { pad.innerHTML = ''; listView(pad); };
  const off = on('quizzes', draw);
  draw();
  return () => off();
}

function listView(pad) {
  const qs = [...S.quizzes.values()].sort((a, b) => (b.result?.at || b.createdAt) - (a.result?.at || a.createdAt));
  pad.append(h('div.topbar', menuButton(), h('h1', 'Quizzes'),
    h('button.btn.primary', { type: 'button', html: ic('sparkles') + '<span>New quiz</span>', on: { click: () => quizSetupDialog({}) } })));
  if (!qs.length) {
    pad.append(h('div.panel', h('div.empty',
      h('div.empty-art', { html: `<svg viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="32" y="12" width="56" height="72" rx="6" fill="currentColor" fill-opacity=".06"/><path d="M44 32l4 4 8-8M44 52l4 4 8-8M64 32h14M64 52h14M44 70h34"/></svg>` }),
      h('h3', 'Test yourself on your notes'), h('p', 'Pick a notebook, page or document. You get multiple choice, true/false, matching and exam-style questions, marked with explanations.'),
      h('button.btn.primary', { type: 'button', html: ic('sparkles') + '<span>Create a quiz</span>', on: { click: () => quizSetupDialog({}) } }))));
    return;
  }
  const done = qs.filter((q) => q.result);
  if (done.length) {
    const avg = Math.round(done.reduce((s, q) => s + q.result.pct, 0) / done.length);
    pad.append(h('div.panel', { style: { padding: '18px', marginBottom: '22px' } }, h('div.stat-row', { style: { marginTop: 0 } },
      h('div.stat', h('b', String(done.length)), h('span', 'quizzes taken')),
      h('div.stat', h('b', avg + '%'), h('span', 'average score')),
      h('div.stat', h('b', String(done.at(0)?.result.pct ?? '—') + '%'), h('span', 'last score')))));
  }
  pad.append(h('div.panel', { style: { padding: '6px' } }, qs.map((q) => h('div.list-row',
    h('span', { html: ic(q.result ? 'check-circle' : 'quiz'), style: { color: q.result ? (q.result.pct >= 70 ? 'var(--ok)' : 'var(--warn)') : 'var(--accent)' } }),
    h('a.lr-main', { href: '#/quiz/' + q.id, style: { textDecoration: 'none', color: 'inherit' } }, h('div.lr-title', q.title),
      h('div.lr-sub', `${q.questions.length} questions · ${q.difficulty} · ${q.result ? `${q.result.pct}% on ${fmtDate(q.result.at, { day: 'numeric', month: 'short' })}` : 'not taken yet'}`)),
    iconBtn('more', 'Quiz options', (e) => menu(e.currentTarget, [
      { label: q.result ? 'Retake' : 'Start', icon: 'play', run: () => { saveQuiz({ ...q, answers: {}, result: null }); go('#/quiz/' + q.id); } },
      { label: 'Delete', icon: 'trash', danger: true, run: async () => { if (await confirmDialog(`Delete “${q.title}”?`, { danger: true, okLabel: 'Delete' })) deleteQuiz(q.id); } },
    ]))))));
}

export function quizSetupDialog({ notebookId = '', folderId = '', pageId = '' } = {}) {
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.', { action: { label: 'Open', run: () => go('#/settings/ai') } }); return; }
  const nbs = notebooks();
  let source = pageId ? 'page' : folderId ? 'folder' : 'notebook';
  let nbId = notebookId || nbs[0]?.id || '';
  let difficulty = 'medium';
  let explain = true;
  let file = null;
  const types = new Set(['mcq', 'tf', 'short', 'fill', 'match', 'application']);
  const count = h('input.field', { type: 'number', min: 3, max: 40, value: 10 });
  const topic = h('input.field', { type: 'text', placeholder: 'Optional — e.g. “only enzymes”, “chapter 4”' });
  const pasted = h('textarea.field', { rows: 5, placeholder: 'Paste material to be quizzed on' });
  const srcHost = h('div');
  const nbSel = select(nbs.map((n) => ({ value: n.id, label: n.title })), nbId, (v) => { nbId = v; drawSrc(); });
  let pageSel, folderSel;
  function drawSrc() {
    srcHost.innerHTML = '';
    if (['notebook', 'page', 'folder'].includes(source)) srcHost.append(nbs.length ? field('Notebook', nbSel) : h('p.muted', 'Create a notebook first.'));
    if (source === 'page') { pageSel = select(pagesOf(nbId).map((p) => ({ value: p.id, label: p.title || 'Untitled page' })), pageId || pagesOf(nbId)[0]?.id, () => {}); srcHost.append(field('Page', pageSel)); }
    if (source === 'folder') { const fs = S.notebooks.get(nbId)?.folders || []; folderSel = select(fs.map((f) => ({ value: f.id, label: f.name })), folderId || fs[0]?.id, () => {}); srcHost.append(fs.length ? field('Section / chapter', folderSel) : h('p.muted', 'This notebook has no sections yet.')); }
    if (source === 'text') srcHost.append(pasted);
    if (source === 'file') srcHost.append(h('div.dropzone', file ? h('div.file-chip', h('span', file.name), iconBtn('x', 'Remove', () => { file = null; drawSrc(); }, 'sm')) : h('button.btn.sm', { type: 'button', html: ic('upload') + '<span>Choose a document</span>', on: { click: async () => { file = await pickFile(ACCEPT); drawSrc(); } } })));
  }
  drawSrc();
  const typeChk = (t) => h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' } }, h('input', { type: 'checkbox', checked: types.has(t), on: { change: (e) => (e.target.checked ? types.add(t) : types.delete(t)) } }), TYPES[t]);
  const status = h('div');
  const goBtn = h('button.btn.primary', { type: 'button', html: ic('sparkles') + '<span>Create quiz</span>', on: { click: run } });
  const s = sheet({ title: 'New quiz', wide: true, body: h('div',
    field('Quiz me on', segmented([{ value: 'notebook', label: 'Notebook' }, { value: 'folder', label: 'Chapter' }, { value: 'page', label: 'Page' }, { value: 'text', label: 'Text' }, { value: 'file', label: 'Document' }], source, (v) => { source = v; drawSrc(); })),
    srcHost,
    h('div.form-grid', field('Questions', count), field('Focus on', topic)),
    field('Difficulty', segmented([{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }, { value: 'exam', label: 'Exam level' }], difficulty, (v) => { difficulty = v; })),
    h('div.form-label', { style: { marginBottom: '8px' } }, 'Question types'),
    h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' } }, ...Object.keys(TYPES).map(typeChk)),
    h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', marginBottom: '12px' } }, h('input', { type: 'checkbox', checked: true, on: { change: (e) => { explain = e.target.checked; } } }), 'Include explanations'),
    status),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }), goBtn] });

  async function run() {
    if (!types.size) return toast('Pick at least one question type.');
    let material = '', title = '', files = [];
    try {
      if (source === 'text') { material = pasted.value.trim(); title = 'Quiz'; }
      else if (source === 'file') { if (!file) return toast('Choose a document first.'); const m = await readMaterial(file); if (m.part) files.push(m.part); material = m.text || ''; title = file.name.replace(/\.\w+$/, ''); }
      else {
        const nb = S.notebooks.get(nbId);
        if (!nb) return toast('Create a notebook first.');
        let ps = pagesOf(nbId, { includeArchived: false });
        if (source === 'page') ps = ps.filter((p) => p.id === pageSel.value);
        if (source === 'folder') ps = ps.filter((p) => p.folderId === folderSel?.value);
        material = ps.map((p) => pageText(p, { maxLen: 40000 })).join('\n\n').slice(0, 200000);
        title = source === 'page' ? ps[0]?.title || 'Page' : source === 'folder' ? nb.folders.find((f) => f.id === folderSel?.value)?.name || nb.title : nb.title;
      }
    } catch (e) { return toast(e.message, { kind: 'error' }); }
    if (!files.length && material.length < 60) return toast('There isn’t enough material there for a quiz.');
    goBtn.disabled = true;
    status.innerHTML = '';
    status.append(h('div.gen-status', h('span.spinner'), h('span', 'Writing questions…')));
    try {
      const n = Math.max(3, Math.min(40, +count.value || 10));
      const res = await generateJSON({
        system: 'You are an experienced examiner. Questions are clear, unambiguous, test understanding, and are answerable from the material. Never invent facts.',
        prompt: `Write a ${difficulty}-difficulty quiz of exactly ${n} questions from the material${topic.value.trim() ? `, focusing on: ${topic.value.trim()}` : ''}.
Use a mix of these types only: ${[...types].join(', ')}.
Formats:
- {"type":"mcq","q":"...","options":["A","B","C","D"],"answer":index,"topic":"...","explanation":"..."}
- {"type":"tf","q":"statement","answer":true|false,"topic":"...","explanation":"..."}
- {"type":"fill","q":"sentence with ____","answer":["accepted answer","other accepted spelling"],"topic":"...","explanation":"..."}
- {"type":"match","q":"Match each item","pairs":[{"left":"...","right":"..."}] (4–5 pairs),"topic":"...","explanation":"..."}
- {"type":"short","q":"...","answer":"model answer","points":2,"topic":"...","explanation":"..."}
- {"type":"application","q":"a scenario applying the concepts","answer":"model answer with key marking points","points":3,"topic":"...","explanation":"..."}
- {"type":"exam","q":"exam-style question","answer":"model answer with marking scheme","points":4,"topic":"...","explanation":"..."}
"topic" = 2–4 word topic label. ${explain ? 'Explanations: 1–3 sentences on why the answer is right.' : 'Keep explanations very short.'} Maths in LaTeX $...$. Write in the material's language.
Reply JSON: {"title":"short quiz title","questions":[...]}

Material:
${material}`,
        files, temperature: 0.45, maxTokens: 30000,
      });
      const qs = (res.questions || []).filter((q) => q.q && TYPES[q.type]);
      if (!qs.length) throw new Error('No questions came back. Try again.');
      const quiz = saveQuiz({ title: res.title || title, difficulty, notebookId: nbId, source, questions: qs, answers: {}, explain });
      s.close();
      go('#/quiz/' + quiz.id);
    } catch (e) { goBtn.disabled = false; status.innerHTML = ''; toast(e.message, { kind: 'error', ms: 6000 }); }
  }
}

function takeView(pad, id) {
  const quiz = S.quizzes.get(id);
  if (!quiz) { go('#/quiz'); return; }
  if (quiz.result) return resultsView(pad, quiz);
  const answers = quiz.answers || {};
  const started = Date.now();
  let i = 0;
  const matchOrder = {};
  const bar = h('i');
  const counter = h('span.muted.num');
  const stage = h('div');
  pad.append(h('div.quiz-wrap',
    h('div.study-top', { style: { marginBottom: '18px' } }, h('a.icon-btn', { href: '#/quiz', 'aria-label': 'Leave quiz', html: ic('x') }), h('div.progress', bar), counter),
    h('h2', { style: { margin: '0 0 16px', font: '600 22px var(--font-display)' } }, quiz.title), stage));
  draw();
  function draw() {
    const q = quiz.questions[i];
    bar.style.width = (Object.keys(answers).length / quiz.questions.length * 100) + '%';
    counter.textContent = `${i + 1} / ${quiz.questions.length}`;
    stage.innerHTML = '';
    const card = h('div.q-card', h('div.q-meta', h('span.badge', TYPES[q.type]), q.topic ? h('span', q.topic) : null, q.points ? h('span', `${q.points} marks`) : null), h('p.q-text', { html: inlineMarkdown(q.q).replace(/_{3,}/g, '<span class="cloze-gap">&nbsp;</span>') }));
    const save = (v) => { answers[i] = v; saveQuiz({ ...quiz, answers }); bar.style.width = (Object.keys(answers).length / quiz.questions.length * 100) + '%'; };
    if (q.type === 'mcq' || q.type === 'tf') {
      const opts = q.type === 'tf' ? ['True', 'False'] : q.options;
      card.append(h('div.q-opts', opts.map((o, k) => h('button.q-opt', { type: 'button', 'aria-pressed': String(answers[i] === k), on: { click: (e) => { save(k); e.currentTarget.parentElement.querySelectorAll('.q-opt').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } } },
        h('span.letter', q.type === 'tf' ? (k ? 'F' : 'T') : 'ABCDEFG'[k]), h('span', { html: inlineMarkdown(o) })))));
    } else if (q.type === 'match') {
      const pairs = q.pairs || [];
      matchOrder[i] ||= shuffle(pairs.map((_, k) => k));
      const cur = answers[i] || {};
      let selL = null;
      const L = h('div.match-l'), R = h('div.match-r');
      const redraw = () => {
        L.innerHTML = ''; R.innerHTML = '';
        pairs.forEach((p, k) => {
          const n = Object.keys(cur).indexOf(String(k));
          L.append(h('button.match-item' + (selL === k ? '.sel' : '') + (cur[k] != null ? '.paired' : ''), { type: 'button', on: { click: () => { selL = k; redraw(); } } }, p.left, cur[k] != null ? h('span.pair-n', String(n + 1)) : null));
        });
        matchOrder[i].forEach((k) => {
          const owner = Object.keys(cur).find((l) => cur[l] === k);
          const n = owner != null ? Object.keys(cur).indexOf(owner) : -1;
          R.append(h('button.match-item' + (owner != null ? '.paired' : ''), { type: 'button', on: { click: () => {
            if (selL == null) return toast('Tap an item on the left first.');
            for (const l of Object.keys(cur)) if (cur[l] === k) delete cur[l];
            cur[selL] = k; selL = null; save({ ...cur }); redraw();
          } } }, pairs[k].right, n >= 0 ? h('span.pair-n', String(n + 1)) : null));
        });
      };
      redraw();
      card.append(h('p.muted', { style: { marginTop: '-6px' } }, 'Tap an item on the left, then its match on the right.'), h('div.match', L, R));
    } else {
      const ta = h(q.type === 'fill' ? 'input.field' : 'textarea.field', { rows: q.type === 'short' ? 3 : 6, placeholder: q.type === 'fill' ? 'Your answer' : 'Write your answer…', on: { input: (e) => save(e.target.value) } });
      ta.value = answers[i] || '';
      card.append(ta);
      setTimeout(() => { if (!('ontouchstart' in window)) ta.focus(); }, 50);
    }
    const last = i === quiz.questions.length - 1;
    card.append(h('div.q-nav',
      h('button.btn.ghost', { type: 'button', disabled: i === 0, html: ic('chevron-left') + '<span>Back</span>', on: { click: () => { i--; draw(); } } }),
      h('div', { style: { flex: 1 } }),
      last ? h('button.btn.primary', { type: 'button', html: '<span>Finish & mark</span>' + ic('check'), on: { click: finish } })
        : h('button.btn.primary', { type: 'button', html: '<span>Next</span>' + ic('chevron-right'), on: { click: () => { i++; draw(); } } })));
    stage.append(card);
  }
  async function finish() {
    const missing = quiz.questions.filter((_, k) => answers[k] == null || answers[k] === '').length;
    if (missing && !(await confirmDialog(`${missing} question${missing === 1 ? ' is' : 's are'} unanswered. Mark the quiz anyway?`, { okLabel: 'Mark it', title: 'Finish quiz' }))) return;
    stage.innerHTML = '';
    stage.append(h('div.gen-status', h('span.spinner'), h('span', 'Marking your answers…')));
    const marks = [];
    const written = [];
    quiz.questions.forEach((q, k) => {
      const a = answers[k];
      const pts = q.points || 1;
      if (q.type === 'mcq') marks[k] = { got: a === q.answer ? 1 : 0, of: 1 };
      else if (q.type === 'tf') marks[k] = { got: (a === 0) === !!q.answer && a != null ? 1 : 0, of: 1 };
      else if (q.type === 'fill') {
        const ok = (Array.isArray(q.answer) ? q.answer : [q.answer]).some((x) => norm(x) === norm(a));
        marks[k] = { got: ok ? 1 : 0, of: 1 };
        if (!ok && a) written.push(k);
      } else if (q.type === 'match') {
        const pairs = q.pairs || [];
        const right = pairs.filter((_, l) => (a || {})[l] === l).length;
        marks[k] = { got: right / (pairs.length || 1), of: 1 };
      } else { marks[k] = { got: 0, of: pts }; if (a && String(a).trim()) written.push(k); }
    });
    if (written.length) {
      try {
        const res = await generateJSON({
          system: 'You are a fair examiner. Mark against the model answer; accept correct answers in different words; give partial credit for partly correct answers; be brief and specific in feedback.',
          prompt: `Mark these answers. Reply JSON {"marks":[{"id":number,"score":number,"feedback":"one or two sentences"}]}. Score is between 0 and the question's maximum.
${written.map((k) => { const q = quiz.questions[k]; return `id ${k} (max ${q.type === 'fill' ? 1 : q.points || 1}): Question: ${q.q}\nModel answer: ${Array.isArray(q.answer) ? q.answer.join(' / ') : q.answer}\nStudent answer: ${answers[k]}`; }).join('\n\n')}`,
          temperature: 0.1,
        });
        for (const m of res.marks || []) if (marks[m.id]) { marks[m.id].got = Math.max(0, Math.min(marks[m.id].of, +m.score || 0)); marks[m.id].feedback = m.feedback; }
      } catch (e) { toast('Written answers could not be marked automatically: ' + e.message, { kind: 'error', ms: 6000 }); }
    }
    const got = marks.reduce((s, m) => s + m.got, 0);
    const of = marks.reduce((s, m) => s + m.of, 0);
    const weak = [...new Set(quiz.questions.filter((q, k) => marks[k].got < marks[k].of * 0.6).map((q) => q.topic).filter(Boolean))];
    const result = { at: Date.now(), score: Math.round(got * 10) / 10, total: of, pct: Math.round(got / of * 100), marks, weakTopics: weak, seconds: Math.round((Date.now() - started) / 1000) };
    saveQuiz({ ...quiz, answers, result });
    logActivity('quiz');
    logActivity('min', Math.min(result.seconds / 60, 120));
    pad.innerHTML = '';
    resultsView(pad, S.quizzes.get(quiz.id));
  }
}
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function resultsView(pad, quiz) {
  const r = quiz.result;
  const C = 2 * Math.PI * 52;
  const color = r.pct >= 80 ? 'var(--ok)' : r.pct >= 55 ? 'var(--warn)' : 'var(--danger)';
  const byTopic = {}, byType = {};
  quiz.questions.forEach((q, k) => {
    const m = r.marks[k];
    for (const [map, key] of [[byTopic, q.topic || 'General'], [byType, TYPES[q.type]]]) { map[key] ||= { got: 0, of: 0 }; map[key].got += m.got; map[key].of += m.of; }
  });
  const bars = (map) => h('div.bars', Object.entries(map).sort((a, b) => a[1].got / a[1].of - b[1].got / b[1].of).map(([k, v]) => { const pct = Math.round(v.got / v.of * 100); return h('div.bar-row', h('span', k), h('div.track', h('i' + (pct < 60 ? '.low' : ''), { style: { width: pct + '%' } })), h('span.num', pct + '%')); }));
  pad.append(h('div.quiz-wrap',
    h('div.topbar', menuButton(), h('a.icon-btn', { href: '#/quiz', 'aria-label': 'All quizzes', html: ic('chevron-left') }), h('h1', quiz.title)),
    h('div.score-hero',
      h('div.score-ring', { html: `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--sunken)" stroke-width="10"/><circle cx="60" cy="60" r="52" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - r.pct / 100)}"/></svg><b>${r.pct}%</b>` }),
      h('div', h('h2', { style: { margin: '0 0 6px', font: '600 26px var(--font-display)' } }, r.pct >= 85 ? 'Excellent work' : r.pct >= 65 ? 'Good — a few gaps to close' : r.pct >= 40 ? 'Getting there' : 'Worth another look at your notes'),
        h('p.muted', { style: { margin: '0 0 14px' } }, `${r.score} / ${r.total} marks · ${Math.max(1, Math.round(r.seconds / 60))} min · ${fmtDate(r.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          r.weakTopics.length ? h('button.btn.primary.sm', { type: 'button', html: ic('cards') + '<span>Flashcards for weak topics</span>', on: { click: () => weakCards(quiz) } }) : null,
          h('button.btn.sm', { type: 'button', html: ic('repeat') + '<span>Retake</span>', on: { click: () => { saveQuiz({ ...quiz, answers: {}, result: null }); go('#/quiz/' + quiz.id); } } }),
          h('button.btn.sm', { type: 'button', html: ic('sparkles') + '<span>New quiz</span>', on: { click: () => quizSetupDialog({ notebookId: quiz.notebookId }) } })))),
    r.weakTopics.length ? h('div.banner', h('span', { html: ic('target') }), h('p', h('b', 'Revise: '), r.weakTopics.join(' · '))) : null,
    h('div.home-grid', { style: { marginBottom: '22px' } },
      h('section.hs.half', h('div.section-head', h('h2', 'By topic')), h('div.hs-body', bars(byTopic))),
      h('section.hs.half', h('div.section-head', h('h2', 'By question type')), h('div.hs-body', bars(byType)))),
    h('div.section-head', h('h2', 'Review answers')),
    h('div.panel', { style: { padding: '4px 20px' } }, quiz.questions.map((q, k) => {
      const m = r.marks[k];
      const ok = m.got >= m.of;
      const part = !ok && m.got > 0;
      const a = quiz.answers?.[k];
      const yours = q.type === 'mcq' ? q.options?.[a] : q.type === 'tf' ? (a == null ? '' : a === 0 ? 'True' : 'False') : q.type === 'match' ? (q.pairs || []).map((p, l) => `${p.left} → ${q.pairs[(a || {})[l]]?.right ?? '—'}`).join('; ') : a;
      const right = q.type === 'mcq' ? q.options?.[q.answer] : q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.type === 'match' ? (q.pairs || []).map((p) => `${p.left} → ${p.right}`).join('; ') : Array.isArray(q.answer) ? q.answer[0] : q.answer;
      return h('div.review-item',
        h('div.ri-q', h('span.ri-ic.' + (ok ? 'ok' : 'bad'), { html: ic(ok ? 'check-circle' : part ? 'circle-dot' : 'x-circle') }), h('span', { html: `${k + 1}. ${inlineMarkdown(q.q)}` })),
        h('div.ri-a', { html: `Your answer: <b>${yours ? inlineMarkdown(String(yours)) : '<i>no answer</i>'}</b>${m.of > 1 ? ` · ${Math.round(m.got * 10) / 10}/${m.of}` : ''}` }),
        !ok ? h('div.ri-a', { html: 'Correct: ' + inlineMarkdown(String(right ?? '')) }) : null,
        m.feedback ? h('div.ri-exp', { html: inlineMarkdown(m.feedback) }) : null,
        q.explanation && (!ok || quiz.explain) ? h('div.ri-exp', { html: inlineMarkdown(q.explanation) }) : null);
    }))));
}

function weakCards(quiz) {
  const r = quiz.result;
  const deck = createDeck({ name: `Revise: ${quiz.title}`, notebookId: quiz.notebookId });
  let n = 0;
  quiz.questions.forEach((q, k) => {
    if (r.marks[k].got >= r.marks[k].of) return;
    n++;
    if (q.type === 'mcq') createCard(deck.id, { type: 'mcq', front: q.q, options: q.options, answer: q.answer, back: q.explanation || '', topic: q.topic });
    else if (q.type === 'tf') createCard(deck.id, { type: 'qa', front: 'True or false: ' + q.q, back: (q.answer ? 'True' : 'False') + (q.explanation ? ' — ' + q.explanation : ''), topic: q.topic });
    else if (q.type === 'match') (q.pairs || []).forEach((p) => createCard(deck.id, { type: 'qa', front: p.left, back: p.right, topic: q.topic }));
    else createCard(deck.id, { type: q.type === 'fill' ? 'cloze' : 'qa', front: q.q, back: Array.isArray(q.answer) ? q.answer[0] : String(q.answer), topic: q.topic });
  });
  updateDeck(deck.id, {});
  toast(`${n} cards made from the questions you missed.`);
  go('#/cards/' + deck.id);
}
