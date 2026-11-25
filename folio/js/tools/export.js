// Export: print-quality PDF (via the system print dialog → Save as PDF), Markdown and HTML.
import { h, $, downloadFile, toast } from '../util.js';
import { hydrate } from '../editor/insert.js';
import { effectivePaper, applyPaper } from '../editor/paper.js';
import { drawStroke } from '../editor/ink.js';
import { S } from '../store.js';

export async function printPages(pages, nb, { ink } = {}) {
  if (!pages.length) return toast('Nothing to export.');
  toast('Preparing PDF…', { ms: 1500 });
  const root = $('#print-root');
  root.innerHTML = '';
  const fake = { record() {}, changed() {}, ctx: { get notebookId() { return nb.id; } } };
  let slow = false;
  for (const p of pages) {
    const sheetEl = h('div.page-sheet', h('div.paper-img'), h('div.paper-bg'), h('div.paper-tex'));
    const ed = h('div.editor', { html: p.html || '' });
    sheetEl.append(h('div.page-inner', p.kind === 'pdf' ? null : h('div.page-title', { style: { marginBottom: '20px' } }, p.title || 'Untitled page'), ed));
    applyPaper(sheetEl, effectivePaper(p, nb));
    const wrap = h('div.print-page', sheetEl);
    root.append(wrap);
    ed.querySelectorAll('.blk').forEach((b) => { if (['map', 'molecule'].includes(b.dataset.type)) slow = true; hydrate(b, fake); });
    ed.querySelectorAll('.callout > .co-ic:empty').forEach((c) => c.remove());
    if (p.ink?.length) {
      // draw handwriting at page scale once layout is known
      requestAnimationFrame(() => {
        const w = 816, hgt = Math.max(sheetEl.scrollHeight, ...p.ink.flatMap((s) => s.pts.map((q) => q[1] + 20)));
        const c = h('canvas.ink-print', { width: w * 2, height: hgt * 2, style: { width: '100%' } });
        const g = c.getContext('2d');
        g.scale(2, 2);
        for (const s of p.ink) drawStroke(g, s);
        sheetEl.append(c);
      });
    }
  }
  root.style.setProperty('--page-w', '816px');
  await new Promise((r) => setTimeout(r, slow ? 2200 : 400));
  const done = () => { root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  void ink;
}

export function htmlToMarkdown(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  const walk = (n, ctx = {}) => {
    if (n.nodeType === 3) return n.textContent.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const kids = () => [...n.childNodes].map((c) => walk(c, ctx)).join('');
    const t = n.tagName;
    if (n.classList.contains('blk-ui') || n.classList.contains('rt') || n.classList.contains('co-ic') || n.hidden) return '';
    if (n.classList.contains('def-term')) return `**${kids().trim()}** — `;
    if (n.dataset?.json) {
      let data = {}; try { data = JSON.parse(n.dataset.json); } catch { /* ignore */ }
      const ty = n.dataset.type;
      if (ty === 'equation') return `\n$$\n${data.latex}\n$$\n\n`;
      if (ty === 'timeline') return '\n' + (data.items || []).map((i) => `- **${i.date}** — ${i.title}${i.text ? ': ' + i.text : ''}`).join('\n') + '\n\n';
      if (ty === 'flow' || ty === 'mindmap') return '\n```\n' + data.src + '\n```\n\n';
      if (ty === 'graph') return `\n*Graph: ${(data.fns || []).map((f) => 'y = ' + f.expr).join(', ')}*\n\n`;
      if (ty === 'map') return `\n*Map: ${(data.markers || []).map((m) => m.label).join(', ')}*\n\n`;
      if (ty === 'molecule') return `\n*Molecules: ${(data.items || []).map((m) => `${m.name} (${m.smiles})`).join(', ')}*\n\n`;
      return '';
    }
    switch (t) {
      case 'H1': return `\n# ${kids().trim()}\n\n`;
      case 'H2': return `\n## ${kids().trim()}\n\n`;
      case 'H3': return `\n### ${kids().trim()}\n\n`;
      case 'H4': return `\n#### ${kids().trim()}\n\n`;
      case 'P': return kids().trim() + '\n\n';
      case 'BR': return '  \n';
      case 'B': case 'STRONG': return `**${kids()}**`;
      case 'I': case 'EM': return `*${kids()}*`;
      case 'S': case 'DEL': case 'STRIKE': return `~~${kids()}~~`;
      case 'CODE': return '`' + kids() + '`';
      case 'MARK': return `==${kids()}==`;
      case 'A': return `[${kids()}](${n.getAttribute('href')})`;
      case 'BLOCKQUOTE': return '> ' + kids().trim() + '\n\n';
      case 'HR': return '\n---\n\n';
      case 'UL': case 'OL': return [...n.children].map((li, i) => (t === 'OL' ? `${i + 1}. ` : n.classList.contains('checklist') ? (li.classList.contains('done') ? '- [x] ' : '- [ ] ') : '- ') + walk(li).trim()).join('\n') + '\n\n';
      case 'TABLE': {
        const rows = [...n.rows].map((r) => [...r.cells].map((c) => walk(c).trim().replace(/\|/g, '\\|')));
        if (!rows.length) return '';
        const w = Math.max(...rows.map((r) => r.length));
        const line = (r) => '| ' + Array.from({ length: w }, (_, i) => r[i] || '').join(' | ') + ' |';
        return '\n' + [line(rows[0]), '| ' + Array(w).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n') + '\n\n';
      }
      case 'IMG': return '\n![image](embedded image)\n';
      case 'FIGCAPTION': return `\n*${kids().trim()}*\n\n`;
      case 'DIV':
        if (n.classList.contains('callout')) return '> **' + (n.dataset.kind || 'Note') + ':** ' + walk(n.querySelector('.co-body') || n).trim().replace(/\n+/g, ' ') + '\n\n';
        if (n.classList.contains('definition')) return '> ' + kids().trim() + '\n\n';
        if (n.classList.contains('formula')) return '`' + kids().trim() + '`\n\n';
        return kids();
      default: return kids();
    }
  };
  return [...d.childNodes].map((c) => walk(c)).join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const safeName = (s) => (s || 'page').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'page';

export function exportMarkdown(page) {
  downloadFile(safeName(page.title) + '.md', `# ${page.title || 'Untitled page'}\n\n` + htmlToMarkdown(page.html), 'text/markdown');
}

export async function exportHTML(page, nb) {
  const css = await fetch('css/app.css').then((r) => r.text()).catch(() => '');
  const theme = document.documentElement.dataset.theme;
  const doc = `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${(page.title || 'Page').replace(/</g, '&lt;')}</title>
<style>${css.replace(/@import[^;]+;/, '')}
body{overflow:auto;padding:24px;background:var(--bg)} .page-sheet{position:relative;margin:0 auto;max-width:816px;width:100%} .blk-ui,.resize-h,.col-resize,.row-resize{display:none}</style></head>
<body><div class="page-sheet" data-paper="${effectivePaper(page, nb).type}"><div class="paper-bg"></div><div class="page-inner"><h1 class="page-title">${(page.title || '').replace(/</g, '&lt;')}</h1><div class="editor">${page.html}</div></div></div></body></html>`;
  downloadFile(safeName(page.title) + '.html', doc, 'text/html');
}

export function noop() { return S; }
