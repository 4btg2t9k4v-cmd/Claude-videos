// The AI study assistant side panel. Works from the selection, the page or the whole notebook.
import { h, ic, iconBtn, segmented, toast } from '../util.js';
import { S, pagesOf } from '../store.js';
import { generate, hasAI } from './gemini.js';
import { renderMarkdown } from '../tools/md.js';
import { pageText } from '../editor/text.js';
import { go } from '../main.js';

export const ACTIONS = {
  explain: { label: 'Explain simply', icon: 'bulb', prompt: 'Explain this in simple, clear language for a student. Start with a one-sentence plain summary, then explain step by step, then give one everyday analogy.' },
  summarize: { label: 'Summarise', icon: 'list', prompt: 'Summarise this concisely as a short paragraph followed by 4–8 bullet points of the most important ideas.' },
  rewrite: { label: 'Rewrite clearly', icon: 'wand', prompt: 'Rewrite this explanation so it is clearer and better organised. Keep every fact and the original meaning; do not add new claims.' },
  expand: { label: 'Expand notes', icon: 'feather', prompt: 'Expand these short notes into a fuller explanation a student can learn from. Keep the same structure and headings. Mark anything you add that is not in the notes with “(added)”.' },
  examples: { label: 'Give examples', icon: 'flask', prompt: 'Give 3 clear, varied, worked examples that illustrate this. Keep each short.' },
  steps: { label: 'Solve step by step', icon: 'sigma', prompt: 'Work through the maths/problem here step by step. Number each step, show the working in LaTeX ($...$), explain why each step is valid, and box the final answer.' },
  keypoints: { label: 'Key points', icon: 'target', prompt: 'Identify the most important information: key terms with one-line definitions, key facts, formulas and anything likely to be examined.' },
  revision: { label: 'Revision summary', icon: 'repeat', prompt: 'Create a compact revision summary: headings, bullet points, key formulas/definitions, and 3 self-test questions at the end.' },
  connections: { label: 'Find connections', icon: 'mindmap', prompt: 'Find connections between the different topics in these notes. Explain how ideas relate, depend on, or contrast with each other. Use a short list of “A ↔ B: why” items.' },
  missing: { label: 'What’s missing?', icon: 'help', prompt: 'Review these notes like a tutor. Identify important information that seems missing, unclear or possibly incorrect for this topic. Be specific and say why each matters. Do not rewrite the notes.' },
  studyGuide: { label: 'Study guide', icon: 'grad', prompt: 'Create a study guide: learning objectives, a topic-by-topic outline with key ideas, definitions, common mistakes, and a suggested study order.' },
  practice: { label: 'Practice exercises', icon: 'quiz', prompt: 'Write 6 practice exercises of increasing difficulty based on this material, then give worked answers in a separate “Answers” section at the end.' },
};

export function createAIPanel(host, { getPage, editor, getNotebook }) {
  host.innerHTML = '';
  let scope = 'page';
  const turns = [];
  let ctl = null;
  const inner = h('div.ai-inner');
  host.append(inner);
  const msgs = h('div.ai-msgs', { 'aria-live': 'polite' });
  const quote = h('div.ai-quote.hidden');
  const input = h('textarea.field', { rows: 1, placeholder: 'Ask about your notes…', 'aria-label': 'Ask the AI' });
  const sendBtn = iconBtn('send', 'Send', () => send());
  sendBtn.classList.add('on');

  const scopeSeg = segmented([{ value: 'selection', label: 'Selection' }, { value: 'page', label: 'This page' }, { value: 'notebook', label: 'Notebook' }], scope, (v) => { scope = v; updateQuote(); });
  const actions = h('div.ai-actions', Object.entries(ACTIONS).map(([id, a]) => h('button.chip', { type: 'button', html: ic(a.icon) + `<span>${a.label}</span>`, on: { click: () => runAction(id) } })));

  inner.append(
    h('div.ai-head', h('h2', h('span', { html: ic('sparkles') }), 'Study assistant'),
      iconBtn('refresh', 'New conversation', () => { turns.length = 0; msgs.innerHTML = ''; welcome(); }),
      iconBtn('x', 'Close', () => host.dispatchEvent(new CustomEvent('ai-close')))),
    h('div.ai-ctx', scopeSeg), quote, actions, msgs,
    h('div.ai-compose', input, sendBtn));

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; });
  const selListener = () => { if (host.classList.contains('open')) updateQuote(); };
  document.addEventListener('selectionchange', selListener);

  function updateQuote() {
    const sel = editor.selectedText().trim();
    if (sel && scope !== 'notebook') { quote.classList.remove('hidden'); quote.textContent = '“' + sel.slice(0, 280) + (sel.length > 280 ? '…' : '') + '”'; if (scope === 'page' && sel.length > 3) { scope = 'selection'; scopeSeg.querySelectorAll('.seg-btn')[0].click(); } }
    else quote.classList.add('hidden');
  }

  function welcome() {
    if (!hasAI()) {
      msgs.append(h('div.ai-setup', h('h3', 'Connect Gemini to start'),
        h('p', 'The assistant runs on Google Gemini with your own free API key. It takes about a minute to set up.'),
        h('button.btn.primary.sm', { type: 'button', text: 'Set up AI', on: { click: () => go('#/settings/ai') } })));
      return;
    }
    msgs.append(h('div.msg.ai', h('div.md', { html: renderMarkdown(`Ask anything about **${esc2(getPage()?.title || 'this page')}**, or pick an action above. Select text on the page first to ask about just that part.`) })));
  }
  welcome();

  function context() {
    const page = getPage();
    const nb = getNotebook();
    const html = editor.getHTML();
    if (scope === 'selection') {
      const sel = editor.selectedText().trim();
      if (sel) return { label: 'the selected text', text: `Page: ${page.title || 'Untitled'}\n\nSelected text:\n"""${sel}"""\n\nSurrounding page (for context only):\n${pageText({ ...page, html }, { maxLen: 8000 })}` };
    }
    if (scope === 'notebook') {
      let text = '';
      for (const p of pagesOf(nb.id, { includeArchived: false })) {
        const t = pageText(p.id === page.id ? { ...p, html } : p, { maxLen: 30000 });
        if (text.length + t.length > 160000) break;
        text += `\n\n=== Page: ${p.title || 'Untitled'} ===\n${t}`;
      }
      return { label: 'the whole notebook', text };
    }
    return { label: 'this page', text: pageText({ ...page, html }) };
  }

  function system() {
    const nb = getNotebook();
    return `You are a careful, encouraging study assistant inside a student's notebook app. Notebook: "${nb.title}"${nb.subject ? `, subject: ${nb.subject}` : ''}.
Rules:
- Base your answer on the student's notes provided. If you add facts that are not in the notes, label them briefly ("Beyond your notes: …").
- Be accurate. If the notes contain a mistake, point it out gently. If you are not sure, say so instead of guessing.
- Use Markdown with short headings and bullets. Write maths in LaTeX between $...$ (inline) or $$...$$ (display).
- Reply in the same language as the notes unless the student asks otherwise.`;
  }

  async function runAction(id, forceScope) {
    if (forceScope && forceScope !== scope) {
      const i = ['selection', 'page', 'notebook'].indexOf(forceScope);
      scopeSeg.querySelectorAll('.seg-btn')[i]?.click();
      scope = forceScope;
    }
    editor.restoreRange();
    const a = ACTIONS[id];
    await ask(a.label, a.prompt);
  }

  function send() {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    input.style.height = 'auto';
    ask(q, `Answer the student's question: ${q}`);
  }

  async function ask(display, instruction) {
    if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.', { action: { label: 'Open', run: () => go('#/settings/ai') } }); return; }
    if (ctl) ctl.abort();
    const ctxt = context();
    if (!ctxt.text.trim() || ctxt.text.trim().length < 3) { toast(scope === 'selection' ? 'Select some text on the page first.' : 'This page is empty — write something first.'); return; }
    msgs.append(h('div.msg.user', display + (scope ? ` · ${ctxt.label}` : '')));
    const md = h('div.md', h('span.thinking', h('i'), h('i'), h('i'), ' Reading your notes…'));
    const stop = h('button.btn.sm.ghost', { type: 'button', html: ic('stop') + '<span>Stop</span>', on: { click: () => ctl?.abort() } });
    const tools = h('div.msg-tools', stop);
    const msg = h('div.msg.ai', md, tools);
    msgs.append(msg);
    msgs.scrollTop = msgs.scrollHeight;
    ctl = new AbortController();
    const prompt = `${instruction}\n\nMaterial (${ctxt.label}):\n${ctxt.text}`;
    let answer = '';
    try {
      const res = await generate({
        system: system(), history: turns.slice(-8), prompt, signal: ctl.signal, temperature: 0.35,
        onText: (t) => { answer = t; md.innerHTML = renderMarkdown(t); if (msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 160) msgs.scrollTop = msgs.scrollHeight; },
      });
      answer = res.text;
      md.innerHTML = renderMarkdown(answer);
      if (res.truncated) md.append(h('p.faint', 'The answer was cut short. Ask for less at a time.'));
      turns.push({ role: 'user', text: display }, { role: 'model', text: answer });
    } catch (e) {
      if (e.code === 'cancelled') { if (!answer) md.innerHTML = '<p class="faint">Stopped.</p>'; }
      else { md.innerHTML = ''; md.append(h('p', { style: { color: 'var(--danger)' } }, e.message)); if (e.code === 'bad_key' || e.code === 'no_key') md.append(h('button.btn.sm', { type: 'button', text: 'Open AI settings', on: { click: () => go('#/settings/ai') } })); }
    } finally {
      ctl = null;
      stop.remove();
      if (answer) {
        tools.append(
          h('button.btn.sm.ghost', { type: 'button', html: ic('plus') + '<span>Insert into page</span>', on: { click: () => { editor.restoreRange(); editor.insertHTMLAfterCurrent(renderMarkdown(answer)); toast('Added to your page.'); } } }),
          h('button.btn.sm.ghost', { type: 'button', html: ic('copy') + '<span>Copy</span>', on: { click: () => { navigator.clipboard?.writeText(answer).then(() => toast('Copied')); } } }),
          h('button.btn.sm.ghost', { type: 'button', html: ic('cards') + '<span>Flashcards</span>', on: { click: () => import('../views/cards.js').then((m) => m.generateDeckDialog({ notebookId: getNotebook().id, text: answer, name: (getPage().title || 'Notes') + ' — AI' })) } }));
      }
    }
  }

  return {
    focus() { updateQuote(); if (!('ontouchstart' in window)) input.focus(); },
    runAction,
    destroy() { document.removeEventListener('selectionchange', selListener); },
  };
}

function esc2(s) { return String(s).replace(/[*_`[\]]/g, ''); }
