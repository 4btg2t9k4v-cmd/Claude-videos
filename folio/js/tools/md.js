// Small, safe Markdown renderer for AI answers (escapes everything first), with KaTeX math.
import { esc } from '../util.js';

export function tex(src, display = false) {
  if (!window.katex) return `<code>${esc(src)}</code>`;
  try { return window.katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' }); }
  catch { return `<code>${esc(src)}</code>`; }
}

function inline(s) {
  const math = [];
  s = s.replace(/\$\$([^$]+)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => { math.push(tex(a || b, true)); return `\u0000${math.length - 1}\u0000`; });
  s = s.replace(/\$([^$\n]+?)\$|\\\((.+?)\\\)/g, (_, a, b) => { math.push(tex(a || b, false)); return `\u0000${math.length - 1}\u0000`; });
  const code = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { code.push(`<code>${esc(c)}</code>`); return `\u0001${code.length - 1}\u0001`; });
  s = s.replace(/_{3,}/g, (m) => `\u0001${code.push(m) - 1}\u0001`);
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>').replace(/==(.+?)==/g, '<mark>$1</mark>');
  s = s.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => code[i]);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => math[i]);
  return s;
}

export { inline as inlineMarkdown };

export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let out = '';
  let i = 0;
  const listStack = [];
  const closeLists = (depth = 0) => { while (listStack.length > depth) out += `</${listStack.pop()}>`; };
  while (i < lines.length) {
    let line = lines[i];
    if (/^```/.test(line)) {
      closeLists();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      closeLists();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<div class="formula-tex">${tex(buf.join('\n'), true)}</div>`;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      closeLists();
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = row(line);
      i += 2;
      let t = '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { t += '<tr>' + row(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>'; i++; }
      out += t + '</tbody></table>';
      continue;
    }
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) { closeLists(); const lv = Math.min(4, hm[1].length + 1); out += `<h${lv}>${inline(hm[2])}</h${lv}>`; i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { closeLists(); out += '<hr>'; i++; continue; }
    const lm = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (lm) {
      const depth = Math.floor(lm[1].replace(/\t/g, '  ').length / 2) + 1;
      const tag = /\d/.test(lm[2]) ? 'ol' : 'ul';
      while (listStack.length > depth) out += `</${listStack.pop()}>`;
      while (listStack.length < depth) { out += `<${tag}>`; listStack.push(tag); }
      let content = lm[3];
      const task = content.match(/^\[( |x|X)\]\s+(.*)$/);
      if (task) content = (task[1] === ' ' ? '☐ ' : '☑ ') + task[2];
      out += `<li>${inline(content)}</li>`;
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeLists();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out += `<blockquote>${inline(buf.join(' '))}</blockquote>`;
      continue;
    }
    if (!line.trim()) { closeLists(); i++; continue; }
    closeLists();
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|>|\s*\|)/.test(lines[i]) && !/^\s*\$\$\s*$/.test(lines[i])) buf.push(lines[i++]);
    out += `<p>${inline(buf.join(' '))}</p>`;
  }
  closeLists();
  return out;
}
