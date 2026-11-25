// Multilingual spelling assistant: autocorrect while typing (EN/AR/ES/FR), repeated-word detection,
// and an AI proof-read that underlines issues and offers a correction menu. Nothing is changed without a tap.
import { h, ic, popover, closePopover, toast, debounce, sheet } from '../util.js';
import { S, saveKV } from '../store.js';
import { generateJSON, hasAI } from '../ai/gemini.js';
import { guessLang } from '../editor/text.js';

const AUTO = {
  en: { teh: 'the', adn: 'and', taht: 'that', recieve: 'receive', recieved: 'received', beleive: 'believe', definately: 'definitely', seperate: 'separate', occured: 'occurred', untill: 'until', wich: 'which', thier: 'their', alot: 'a lot', becuase: 'because', becasue: 'because', enviroment: 'environment', goverment: 'government', wierd: 'weird', acheive: 'achieve', accomodate: 'accommodate', arguement: 'argument', begining: 'beginning', calender: 'calendar', concious: 'conscious', embarass: 'embarrass', existance: 'existence', foriegn: 'foreign', freind: 'friend', grammer: 'grammar', independant: 'independent', knowlege: 'knowledge', neccessary: 'necessary', necesary: 'necessary', occassion: 'occasion', publically: 'publicly', recomend: 'recommend', refered: 'referred', relevent: 'relevant', succesful: 'successful', tommorow: 'tomorrow', tomorow: 'tomorrow', truely: 'truly', doesnt: "doesn't", isnt: "isn't", wasnt: "wasn't", didnt: "didn't", couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't", arent: "aren't", havent: "haven't", hte: 'the', fo: 'of', waht: 'what', thsi: 'this', i: 'I', im: "I'm", ive: "I've", photosynthesys: 'photosynthesis', mitocondria: 'mitochondria', equasion: 'equation', hypothesys: 'hypothesis', experiement: 'experiment', temprature: 'temperature', parliment: 'parliament', resistence: 'resistance', definitly: 'definitely', probaly: 'probably', basicly: 'basically', finaly: 'finally', realy: 'really', usualy: 'usually', mispell: 'misspell', occurence: 'occurrence', persue: 'pursue', posession: 'possession', reccomend: 'recommend', sieze: 'seize', supercede: 'supersede', threshhold: 'threshold' },
  es: { tambien: 'también', despues: 'después', aqui: 'aquí', ademas: 'además', articulo: 'artículo', economia: 'economía', biologia: 'biología', quimica: 'química', fisica: 'física', matematicas: 'matemáticas', pagina: 'página', ultimo: 'último', rapido: 'rápido', facil: 'fácil', dificil: 'difícil', numero: 'número', telefono: 'teléfono', analisis: 'análisis', sintesis: 'síntesis', energia: 'energía', informacion: 'información', educacion: 'educación', revolucion: 'revolución', funcion: 'función', ecuacion: 'ecuación', celula: 'célula', organico: 'orgánico', electron: 'electrón', proton: 'protón', neutron: 'neutrón', atomo: 'átomo', periodo: 'período', simbolo: 'símbolo', metodo: 'método', basico: 'básico', practica: 'práctica', teoria: 'teoría', geografia: 'geografía', musica: 'música', politica: 'política', republica: 'república', ingles: 'inglés', frances: 'francés', aleman: 'alemán', arabe: 'árabe', facilmente: 'fácilmente', segun: 'según', asi: 'así', tambièn: 'también', porfavor: 'por favor', ahi: 'ahí', tecnica: 'técnica', mayoria: 'mayoría' },
  fr: { ca: 'ça', deja: 'déjà', francais: 'français', ecole: 'école', etudiant: 'étudiant', etudiants: 'étudiants', eleve: 'élève', eleves: 'élèves', tres: 'très', apres: 'après', meme: 'même', etre: 'être', fenetre: 'fenêtre', foret: 'forêt', probleme: 'problème', systeme: 'système', energie: 'énergie', electron: 'électron', reaction: 'réaction', equation: 'équation', theorie: 'théorie', methode: 'méthode', periode: 'période', siecle: 'siècle', premiere: 'première', derniere: 'dernière', interessant: 'intéressant', reponse: 'réponse', question: 'question', definition: 'définition', element: 'élément', elements: 'éléments', economie: 'économie', ecologie: 'écologie', geographie: 'géographie', mathematiques: 'mathématiques', chimie: 'chimie', biologie: 'biologie', cellule: 'cellule', resume: 'résumé', reussir: 'réussir', etat: 'état', etats: 'états', egalite: 'égalité', liberte: 'liberté', societe: 'société', revolution: 'révolution', parceque: 'parce que', aujourdhui: "aujourd'hui", noel: 'Noël', pere: 'père', mere: 'mère', frere: 'frère', bientot: 'bientôt', plutot: 'plutôt', hopital: 'hôpital', ile: 'île', age: 'âge', gout: 'goût' },
  ar: { 'هاذا': 'هذا', 'هاذه': 'هذه', 'هاذي': 'هذي', 'لاكن': 'لكن', 'ذالك': 'ذلك', 'هاكذا': 'هكذا', 'انشاءالله': 'إن شاء الله', 'انشالله': 'إن شاء الله', 'إنشاءالله': 'إن شاء الله', 'الذى': 'الذي', 'التى': 'التي', 'مسؤل': 'مسؤول', 'شيئ': 'شيء', 'إلائ': 'إلا', 'لاكنه': 'لكنه', 'ذالكم': 'ذلكم', 'اللذي': 'الذي', 'اللتي': 'التي', 'إذن': 'إذن', 'ابتداءا': 'ابتداءً', 'جدا': 'جدًا', 'أيضا': 'أيضًا', 'شكرا': 'شكرًا' },
};

export function createSpell(editor, getLang) {
  let issues = [];          // {range, kind, text, suggestions, why, lang}
  const hl = 'highlights' in CSS;
  const ignored = new Set();

  function lang(text) {
    const l = getLang();
    return l && l !== 'auto' ? l : guessLang(text) || 'en';
  }

  /* ---------- autocorrect while typing ---------- */
  const onInput = (e) => {
    if (!S.settings.autocorrect || e.inputType !== 'insertText' || !/^[\s.,;:!?) ،؛؟]$/.test(e.data || '')) return;
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3) return;
    const before = node.textContent.slice(0, sel.anchorOffset - 1);
    const m = before.match(/([\p{L}\p{M}'’]+)$/u);
    if (!m) return;
    const word = m[1];
    const block = node.parentElement.closest('p,li,td,th,h1,h2,h3,h4,blockquote,div.formula');
    if (block?.matches('div.formula') || node.parentElement.closest('code')) return;
    const l = block?.closest('[lang]')?.getAttribute('lang') || lang(block?.textContent || word);
    const dict = AUTO[l] || {};
    const key = l === 'ar' ? word : word.toLowerCase();
    let fix = dict[key];
    if (!fix || S.personalDict.includes(word.toLowerCase())) return;
    if (l !== 'ar' && word[0] === word[0].toUpperCase() && word.length > 1) fix = fix[0].toUpperCase() + fix.slice(1);
    if (fix === word) return;
    const start = sel.anchorOffset - 1 - word.length;
    const root = block || editor.el;
    const want = textBefore(root, node, start) + fix.length + 1;
    editor.record();
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, start + word.length);
    r.deleteContents();
    r.insertNode(document.createTextNode(fix));
    root.normalize();
    // restore caret after the typed character
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n, offset = 0;
    while ((n = walker.nextNode())) { if (offset + n.length >= want) { const c = document.createRange(); c.setStart(n, want - offset); c.collapse(true); sel.removeAllRanges(); sel.addRange(c); break; } offset += n.length; }
    editor.changed();
  };
  function textBefore(block, node, idx) {
    const r = document.createRange();
    r.setStart(block, 0);
    try { r.setEnd(node, idx); } catch { return 0; }
    return r.toString().length;
  }
  editor.el.addEventListener('input', onInput);

  /* ---------- local checks ---------- */
  function localIssues(block, blockIdx) {
    const out = [];
    const text = block.textContent;
    const re = /\b([\p{L}]+)(\s+)\1\b/giu;
    let m;
    while ((m = re.exec(text))) out.push({ p: blockIdx, text: m[0], suggestions: [m[1]], type: 'repeated', why: `“${m[1]}” is repeated.` });
    return out;
  }

  /* ---------- AI proof-read ---------- */
  function blocks() {
    return [...editor.el.querySelectorAll('p,li,h1,h2,h3,h4,blockquote,td,th,figcaption,.it-text > *')].filter((b) => b.textContent.trim().length > 1 && !b.querySelector('p,li,td') && !b.closest('.blk-ui'));
  }

  async function checkPage({ only = null, quiet = false } = {}) {
    const list = only ? [only] : blocks();
    if (!list.length) { if (!quiet) toast('Nothing to check yet.'); return; }
    if (!only) clear();
    let found = [];
    list.forEach((b, i) => { found.push(...localIssues(b, i)); });
    if (hasAI()) {
      if (!quiet) toast('Checking spelling & grammar…', { ms: 1800 });
      const l = getLang();
      for (let start = 0; start < list.length; start += 60) {
        const chunk = list.slice(start, start + 60);
        const numbered = chunk.map((b, k) => `[${start + k}] ${b.textContent.replace(/\s+/g, ' ').trim()}`).join('\n');
        try {
          const res = await generateJSON({
            system: 'You are a meticulous proofreader for English, Arabic, Spanish and French. You flag real errors only, never stylistic preferences unless clearly better. You never rewrite whole sentences.',
            prompt: `Check these numbered paragraphs from a student's notes${l && l !== 'auto' ? ` (main language: ${l}; other languages may appear — check each in its own language)` : ' (detect each paragraph\'s language)'}.
Find: spelling mistakes, missing or wrong accents (Spanish/French), Arabic spelling conventions (hamza, taa marbuta, alif maqsura), basic grammar (agreement, tense), punctuation errors, repeated words, and clearly better word choices.
Do NOT flag technical terms, names, formulas or abbreviations that are correct. Keep "text" as the shortest exact substring containing the error, copied character-for-character.
Reply JSON: {"issues":[{"p":paragraph_number,"text":"exact erroneous substring","suggestions":["best fix","alternative"],"type":"spelling|grammar|accent|punctuation|repeated|style","why":"short reason in English"}]}

${numbered}`,
            temperature: 0,
          });
          found.push(...(res.issues || []).map((x) => ({ ...x, p: x.p - (only ? 0 : 0) })));
        } catch (e) { if (!quiet) toast(e.message, { kind: 'error' }); break; }
      }
    } else if (!quiet) toast('Showing basic checks only — add a Gemini key in Settings for full spelling & grammar.', { ms: 4500 });
    const fresh = [];
    for (const it of found) {
      const b = list[it.p];
      if (!b || !it.text || ignored.has(it.text) || S.personalDict.includes(String(it.text).toLowerCase())) continue;
      const range = findRange(b, it.text);
      if (!range) continue;
      fresh.push({ ...it, range, block: b });
    }
    if (only) issues = issues.filter((i) => i.block !== only);
    issues.push(...fresh);
    paint();
    if (!quiet) {
      if (!issues.length) toast('No problems found.');
      else if (hl) toast(`${issues.length} thing${issues.length === 1 ? '' : 's'} to look at — tap an underline.`);
      else listSheet();
    }
  }

  function findRange(block, needle) {
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n, full = '';
    while ((n = w.nextNode())) { nodes.push([n, full.length]); full += n.textContent; }
    const idx = full.indexOf(needle);
    if (idx < 0) return null;
    const at = (pos, end) => { for (const [node, off] of nodes) if (pos < off + node.length || (end && pos === off + node.length)) return [node, pos - off]; return null; };
    const s = at(idx), e = at(idx + needle.length, true);
    if (!s || !e) return null;
    const r = new Range();
    r.setStart(s[0], s[1]);
    r.setEnd(e[0], e[1]);
    return r;
  }

  function paint() {
    if (!hl) return;
    const groups = { 'spell-err': [], 'grammar-err': [], 'style-err': [] };
    for (const i of issues) {
      if (i.range.collapsed) continue;
      const g = ['spelling', 'accent'].includes(i.type) ? 'spell-err' : ['grammar', 'punctuation', 'repeated'].includes(i.type) ? 'grammar-err' : 'style-err';
      groups[g].push(i.range);
    }
    for (const [k, v] of Object.entries(groups)) CSS.highlights.set(k, new Highlight(...v));
  }

  function clear() {
    issues = [];
    if (hl) ['spell-err', 'grammar-err', 'style-err'].forEach((k) => CSS.highlights.delete(k));
  }

  function applyFix(issue, fix, everywhere = false) {
    editor.record();
    const targets = everywhere ? issues.filter((x) => x.text === issue.text) : [issue];
    if (everywhere) {
      for (const b of blocks()) {
        let r;
        let guard = 0;
        while ((r = findRange(b, issue.text)) && guard++ < 50) { r.deleteContents(); r.insertNode(document.createTextNode(fix)); b.normalize(); }
      }
    } else {
      issue.range.deleteContents();
      issue.range.insertNode(document.createTextNode(fix));
      issue.block.normalize();
    }
    issues = issues.filter((x) => !targets.includes(x));
    editor.changed();
    // ranges may have shifted: recompute positions for the rest
    issues = issues.map((x) => ({ ...x, range: findRange(x.block, x.text) })).filter((x) => x.range);
    paint();
  }

  /* ---------- correction menu ---------- */
  const onClick = (e) => {
    if (!issues.length) return;
    const pos = document.caretRangeFromPoint?.(e.clientX, e.clientY) || (document.caretPositionFromPoint && (() => { const p = document.caretPositionFromPoint(e.clientX, e.clientY); const r = document.createRange(); r.setStart(p.offsetNode, p.offset); return r; })());
    if (!pos) return;
    const hit = issues.find((i) => { try { return i.range.comparePoint(pos.startContainer, pos.startOffset) === 0; } catch { return false; } });
    if (!hit) return;
    showMenu(hit, hit.range.getBoundingClientRect());
  };
  editor.el.addEventListener('click', onClick);

  function showMenu(issue, rect) {
    const kind = { spelling: 'Spelling', accent: 'Missing accent', grammar: 'Grammar', punctuation: 'Punctuation', repeated: 'Repeated word', style: 'Better word choice' }[issue.type] || 'Suggestion';
    const box = h('div.spell-pop',
      h('div.sp-kind', kind),
      issue.why ? h('div.sp-why', issue.why) : null,
      h('div.sp-sugg', (issue.suggestions || []).filter(Boolean).slice(0, 4).map((s) => h('button', { type: 'button', text: s, dir: 'auto', on: { click: () => { closePopover(); applyFix(issue, s); } } }))),
      h('div.menu', { style: { padding: 0, minWidth: 0 } },
        issue.suggestions?.[0] && issues.filter((x) => x.text === issue.text).length > 1 || issue.suggestions?.[0] ? h('button.menu-item', { type: 'button', on: { click: () => { closePopover(); applyFix(issue, issue.suggestions[0], true); toast('Corrected everywhere on this page.'); } } }, h('span.mi-ic', { html: ic('replace') }), h('span.mi-label', 'Correct throughout the page')) : null,
        h('button.menu-item', { type: 'button', on: { click: () => { closePopover(); ignored.add(issue.text); issues = issues.filter((x) => x.text !== issue.text); paint(); } } }, h('span.mi-ic', { html: ic('eye-off') }), h('span.mi-label', 'Ignore')),
        h('button.menu-item', { type: 'button', on: { click: () => { closePopover(); S.personalDict.push(String(issue.text).toLowerCase()); saveKV('personalDict'); issues = issues.filter((x) => x.text !== issue.text); paint(); toast(`“${issue.text}” added to your dictionary.`); } } }, h('span.mi-ic', { html: ic('dict') }), h('span.mi-label', 'Add to personal dictionary'))));
    popover(rect, box, { place: 'bottom' });
  }

  function listSheet() {
    const s = sheet({ title: 'Spelling & grammar', body: h('div', issues.map((i) => h('div.list-row',
      h('div.lr-main', h('div.lr-title', { dir: 'auto' }, `${i.text} → ${i.suggestions?.[0] || ''}`), h('div.lr-sub', i.why || i.type)),
      i.suggestions?.[0] ? h('button.btn.sm', { type: 'button', text: 'Fix', on: { click: (e) => { applyFix(i, i.suggestions[0]); e.currentTarget.closest('.list-row').remove(); } } }) : null))) });
    return s;
  }

  /* ---------- live AI check of the paragraph being written ---------- */
  const live = debounce(() => {
    if (!S.settings.liveCheck || !hasAI()) return;
    const b = editor.currentBlock();
    if (b && b.textContent.trim().split(/\s+/).length >= 4) checkPage({ only: b, quiet: true });
  }, 2500);
  const onType = (e) => {
    if (issues.length) { issues = issues.filter((x) => x.block.isConnected && !x.range.collapsed && x.range.toString() === x.text); paint(); }
    live();
  };
  editor.el.addEventListener('input', onType);
  const onReplace = (e) => editor.replaceSelectionText(e.detail);
  document.addEventListener('folio-replace-selection', onReplace);

  return {
    checkPage: () => checkPage(),
    clear,
    destroy() {
      clear();
      editor.el.removeEventListener('input', onInput);
      editor.el.removeEventListener('input', onType);
      editor.el.removeEventListener('click', onClick);
      document.removeEventListener('folio-replace-selection', onReplace);
    },
  };
}
