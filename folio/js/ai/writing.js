// AI writing tools on a selection. Every rewrite is shown as a diff and only applied when accepted.
import { h, ic, menu, sheet, toast, esc } from '../util.js';
import { generate, hasAI } from './gemini.js';
import { go } from '../main.js';
import { renderMarkdown } from '../tools/md.js';

const REWRITES = {
  grammar: { label: 'Fix grammar & spelling', icon: 'spell', ask: 'Correct spelling, grammar, accents and punctuation only. Do not change wording, tone or meaning beyond what is needed.' },
  clearer: { label: 'Rewrite more clearly', icon: 'wand', ask: 'Rewrite to be clearer and easier to follow. Keep every fact and the meaning exactly.' },
  formal: { label: 'Make more formal', icon: 'grad', ask: 'Rewrite in a more formal, academic register. Keep the meaning exactly.' },
  simpler: { label: 'Make simpler', icon: 'feather', ask: 'Rewrite in simpler words and shorter sentences. Keep the meaning exactly.' },
  vocab: { label: 'Improve vocabulary', icon: 'dict', ask: 'Improve word choice with more precise vocabulary where it helps. Keep sentence structure and meaning.' },
  shorter: { label: 'Make shorter', icon: 'minus', ask: 'Make it more concise without losing any facts.' },
};

export function selectionAIMenu(anchor, editor, { openPanel, runAction }) {
  const text = editor.selectedText().trim();
  if (!text) { toast('Select some text first.'); return; }
  menu(anchor, [
    { heading: 'Understand' },
    { label: 'Explain this', icon: 'bulb', run: () => panel('explain') },
    { label: 'Give examples', icon: 'flask', run: () => panel('examples') },
    { label: 'Ask about this…', icon: 'message', run: () => { openPanel(); } },
    { heading: 'Improve writing (you approve every change)' },
    ...Object.entries(REWRITES).map(([id, r]) => ({ label: r.label, icon: r.icon, run: () => rewrite(editor, id, text) })),
    { label: 'Explain what’s wrong', icon: 'help', run: () => explainErrors(text) },
  ], { place: 'bottom' });
  function panel(action) { runAction(action); }
}

function needKey() {
  if (hasAI()) return false;
  toast('Add your Gemini key in Settings → AI first.', { action: { label: 'Open', run: () => go('#/settings/ai') } });
  return true;
}

async function rewrite(editor, id, text) {
  if (needKey()) return;
  const r = REWRITES[id];
  const out = h('div.diff', h('span.thinking', h('i'), h('i'), h('i'), ' Rewriting…'));
  let suggestion = '';
  const accept = h('button.btn.primary', { type: 'button', text: 'Replace my text', disabled: true, on: { click: () => { s.close(); editor.replaceSelectionText(suggestion); toast('Replaced. Undo with ⌘Z if you change your mind.'); } } });
  const s = sheet({ title: r.label, wide: true, body: h('div',
    h('p.muted', { style: { marginTop: 0, fontSize: '14px' } }, 'Red is removed, green is added. Nothing changes unless you press Replace.'), out),
  actions: [h('button.btn.ghost', { type: 'button', text: 'Keep mine', on: { click: () => s.close() } }), accept] });
  try {
    const res = await generate({
      system: 'You edit a student\'s notes. Preserve meaning, facts, language and formatting markers. Reply with ONLY the rewritten text — no quotes, no preface, no explanation.',
      prompt: `${r.ask}\n\nText:\n${text}`, temperature: 0.2,
    });
    suggestion = res.text.trim().replace(/^["“]|["”]$/g, '');
    out.innerHTML = diffHTML(text, suggestion);
    if (suggestion === text) out.prepend(h('p', { style: { margin: '0 0 8px', color: 'var(--ok)', fontWeight: 600 } }, 'No changes needed.'));
    accept.disabled = suggestion === text;
  } catch (e) { out.textContent = e.message; }
}

async function explainErrors(text) {
  if (needKey()) return;
  const out = h('div.md', h('span.thinking', h('i'), h('i'), h('i'), ' Checking…'));
  sheet({ title: 'What could be better', wide: true, body: out });
  try {
    await generate({
      system: 'You are a patient language tutor. Explain errors so a student learns. Never rewrite the whole text.',
      prompt: `List each spelling, grammar, accent, punctuation or word-choice problem in this text. For each: quote the problem, give the correction, and explain the rule in one sentence. If there are none, say so.\n\nText:\n${text}`,
      onText: (t) => { out.innerHTML = renderMarkdown(t); },
    });
  } catch (e) { out.textContent = e.message; }
}

/** Word-level diff (LCS) rendered with <del>/<ins>. */
export function diffHTML(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const n = A.length, m = B.length;
  if (n * m > 4e6) return `<del>${esc(a)}</del><ins>${esc(b)}</ins>`;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, out = '';
  while (i < n && j < m) {
    if (A[i] === B[j]) { out += esc(A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out += `<del>${esc(A[i])}</del>`; i++; }
    else { out += `<ins>${esc(B[j])}</ins>`; j++; }
  }
  while (i < n) out += `<del>${esc(A[i++])}</del>`;
  while (j < m) out += `<ins>${esc(B[j++])}</ins>`;
  return out;
}
