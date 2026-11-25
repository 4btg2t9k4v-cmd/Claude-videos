// Text extraction and sanitising helpers shared by the editor, search and AI.

const ALLOWED = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'A', 'BR', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'SUB', 'SUP', 'CODE', 'PRE', 'MARK', 'SPAN', 'HR', 'DIV']);

/** Clean HTML pasted from other apps into a small, safe subset. */
export function sanitizePaste(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'svg', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'FORM', 'INPUT', 'BUTTON'].includes(child.tagName)) { child.remove(); continue; }
      walk(child);
      if (!ALLOWED.has(child.tagName)) {
        const frag = document.createDocumentFragment();
        while (child.firstChild) frag.append(child.firstChild);
        if (/^(SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|NAV|FIGURE)$/.test(child.tagName)) { const p = document.createElement('p'); p.append(frag); child.replaceWith(p); }
        else child.replaceWith(frag);
        continue;
      }
      for (const a of [...child.attributes]) {
        if (child.tagName === 'A' && a.name === 'href' && /^https?:/i.test(a.value)) continue;
        if (a.name === 'colspan' || a.name === 'rowspan') continue;
        child.removeAttribute(a.name);
      }
      if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
      if (child.tagName === 'DIV') { const p = document.createElement('p'); while (child.firstChild) p.append(child.firstChild); child.replaceWith(p); }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** Strip anything executable from stored page HTML (used when restoring backup files). */
export function sanitizeStoredHTML(html) {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll('script, iframe, object, embed, link, meta, base, form, foreignObject, svg use, svg a, svg image').forEach((n) => n.remove());
  for (const el of doc.body.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src' || n === 'xlink:href') && /^\s*(javascript|vbscript):/i.test(a.value)) el.removeAttribute(a.name);
      else if (n === 'src' && !/^(data:image\/|blob:|https:|\.?\/?[\w-])/i.test(a.value)) el.removeAttribute(a.name);
    }
  }
  return doc.body.innerHTML;
}

/** Make AI- or user-supplied SVG safe to inline. Returns an SVGElement or null. */
export function sanitizeSVG(src) {
  const m = String(src).match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return null;
  const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  const bad = ['script', 'foreignObject', 'iframe', 'image', 'use', 'animate', 'set', 'animateTransform', 'animateMotion', 'a', 'style'];
  svg.querySelectorAll(bad.join(',')).forEach((n) => n.remove());
  const all = [svg, ...svg.querySelectorAll('*')];
  for (const el of all) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'href' || n === 'xlink:href' || /javascript:|url\((?!#)/i.test(a.value)) el.removeAttribute(a.name);
    }
  }
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width')) || 600;
    const hgt = parseFloat(svg.getAttribute('height')) || 400;
    svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  }
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return document.importNode(svg, true);
}

/** Plain text of a page, including the data inside diagram blocks, for search and AI context. */
export function pageText(page, { maxLen = 60000 } = {}) {
  const d = document.createElement('div');
  d.innerHTML = page?.html || '';
  d.querySelectorAll('.blk-ui, script, style').forEach((n) => n.remove());
  d.querySelectorAll('[data-json]').forEach((blk) => {
    let data = {};
    try { data = JSON.parse(blk.dataset.json); } catch { /* ignore */ }
    const t = blk.dataset.type;
    let txt = '';
    if (t === 'timeline') txt = 'Timeline: ' + (data.items || []).map((i) => `${i.date} — ${i.title}${i.text ? ': ' + i.text : ''}`).join('; ');
    else if (t === 'flow') txt = 'Flowchart: ' + (data.src || '').replace(/\n/g, '; ');
    else if (t === 'mindmap') txt = 'Mind map: ' + (data.src || '').replace(/\n\s*/g, '; ');
    else if (t === 'equation') txt = 'Equation: ' + (data.latex || '');
    else if (t === 'map') txt = 'Map: ' + (data.title || '') + ' ' + (data.markers || []).map((m) => m.label).join(', ');
    else if (t === 'molecule') txt = 'Molecule: ' + (data.items || []).map((m) => m.name || m.smiles).join(' → ');
    else if (t === 'graph') txt = 'Graph: ' + (data.fns || []).map((f) => 'y = ' + f.expr).join(', ');
    const cap = blk.querySelector('figcaption')?.textContent || '';
    const p = document.createElement('p');
    p.textContent = '[' + txt + (cap ? ' — ' + cap : '') + ']';
    blk.replaceWith(p);
  });
  d.querySelectorAll('figure.blk-figure').forEach((f) => {
    const labels = [...f.querySelectorAll('.fig-label')].map((l) => l.textContent).join(', ');
    const cap = f.querySelector('figcaption')?.textContent || '';
    const p = document.createElement('p');
    p.textContent = `[Figure${cap ? ': ' + cap : ''}${labels ? ' (labels: ' + labels + ')' : ''}]`;
    f.replaceWith(p);
  });
  d.querySelectorAll('.def-term').forEach((n) => n.append(': '));
  d.querySelectorAll('p,div,h1,h2,h3,h4,li,tr,blockquote,figcaption,br,hr').forEach((n) => n.append('\n'));
  d.querySelectorAll('h1,h2,h3').forEach((n) => n.prepend('\n' + '#'.repeat(+n.tagName[1]) + ' '));
  d.querySelectorAll('td,th').forEach((n) => n.append(' | '));
  d.querySelectorAll('li').forEach((n) => n.prepend('- '));
  const title = page?.title ? `# ${page.title}\n` : '';
  return (title + d.textContent).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim().slice(0, maxLen);
}

export function headingsOf(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return [...d.querySelectorAll('h1,h2,h3')].map((el, i) => ({ level: +el.tagName[1], text: el.textContent.trim(), index: i })).filter((x) => x.text);
}

/** Detect the script of a text: 'ar' if mostly Arabic letters, otherwise null (Latin needs AI/heuristics). */
export function guessLang(text) {
  const s = (text || '').slice(0, 400);
  const ar = (s.match(/[؀-ۿ]/g) || []).length;
  const lat = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (ar > lat) return 'ar';
  if (!lat) return null;
  const lower = ' ' + s.toLowerCase() + ' ';
  const score = (words) => words.reduce((n, w) => n + (lower.split(' ' + w + ' ').length - 1), 0);
  const es = score(['el', 'la', 'los', 'las', 'de', 'que', 'y', 'es', 'en', 'por', 'una', 'con', 'para', 'del', 'como']) + (s.match(/[ñ¿¡áéíóú]/gi) || []).length * 2;
  const fr = score(['le', 'la', 'les', 'de', 'des', 'et', 'est', 'en', 'un', 'une', 'du', 'que', 'pour', 'dans', 'avec', 'pas']) + (s.match(/[çàèêëîïôûùœ]/gi) || []).length * 2;
  const en = score(['the', 'and', 'is', 'of', 'to', 'in', 'that', 'it', 'for', 'with', 'are', 'this', 'was', 'on']);
  const best = Math.max(es, fr, en);
  if (best < 2) return null;
  return best === en ? 'en' : best === es ? 'es' : 'fr';
}
