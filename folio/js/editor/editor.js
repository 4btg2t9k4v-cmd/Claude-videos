// Core rich-text editor: a contenteditable page with typed blocks, islands
// (tables, figures, diagrams), its own undo history, and autosave hooks.
import { h, ic, debounce, toast, readFileAs, shrinkImage } from '../util.js';
import { sanitizePaste } from './text.js';

export const TEXT_BLOCKS = 'p,h1,h2,h3,h4,blockquote,li,div.formula,pre';
export const BLOCK_STYLES = [
  { id: 'h1', label: 'Main title' },
  { id: 'h2', label: 'Heading' },
  { id: 'h3', label: 'Subheading' },
  { id: 'h4', label: 'Small heading' },
  { id: 'p', label: 'Paragraph' },
  { id: 'quote', label: 'Quote' },
  { id: 'hl', label: 'Highlighted' },
  { id: 'important', label: 'Important box' },
  { id: 'callout', label: 'Note box' },
  { id: 'tip', label: 'Tip box' },
  { id: 'example', label: 'Example box' },
  { id: 'warning', label: 'Warning box' },
  { id: 'definition', label: 'Definition' },
  { id: 'formula', label: 'Formula' },
  { id: 'summary', label: 'Key takeaways' },
  { id: 'ul', label: 'Bullet list' },
  { id: 'ol', label: 'Numbered list' },
  { id: 'check', label: 'Checklist' },
];
const CALLOUT_ICONS = { callout: 'info', important: 'alert', tip: 'bulb', example: 'flask', warning: 'alert', key: 'star' };

export class Editor {
  constructor({ el, onChange, onSelection, onBlockSelect, hydrate }) {
    this.el = el;
    this.onChange = onChange || (() => {});
    this.onSelection = onSelection || (() => {});
    this.onBlockSelect = onBlockSelect || (() => {});
    this.hydrateFn = hydrate || (() => {});
    this.undoStack = [];
    this.redoStack = [];
    this.burst = false;
    this.selectedBlock = null;
    this.lastRange = null;
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.setAttribute('autocapitalize', 'sentences');
    el.setAttribute('autocorrect', 'on');
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    el.dataset.placeholder = 'Start writing… type “/” for blocks';
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* old browsers */ }
    this.endBurst = debounce(() => { this.burst = false; }, 900);
    this._bind();
  }

  /* ---------------- content ---------------- */
  load(html) {
    this.el.innerHTML = html || '<p><br></p>';
    this.undoStack = [];
    this.redoStack = [];
    this.normalize();
    this.hydrateAll();
  }
  hydrateAll() { this.el.querySelectorAll('.blk').forEach((b) => this.hydrateFn(b, this)); }

  getHTML() {
    const c = this.el.cloneNode(true);
    c.querySelectorAll('.rt, .blk-ui').forEach((n) => n.remove());
    c.querySelectorAll('.blk-render').forEach((n) => { n.innerHTML = ''; });
    c.querySelectorAll('.selected, .cell-sel').forEach((n) => n.classList.remove('selected', 'cell-sel'));
    c.querySelectorAll('[data-block-sel]').forEach((n) => n.removeAttribute('data-block-sel'));
    const html = c.innerHTML;
    return html === '<p><br></p>' ? '' : html;
  }

  changed() { this.normalize(); this.onChange(); }

  normalize() {
    const el = this.el;
    if (!el.firstChild || (el.childNodes.length === 1 && el.firstChild.nodeName === 'BR')) { el.innerHTML = '<p><br></p>'; return; }
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3 && n.textContent.trim()) { const p = h('p'); n.replaceWith(p); p.append(n); }
      else if (n.nodeType === 1 && n.tagName === 'DIV' && !n.className) { const p = h('p'); while (n.firstChild) p.append(n.firstChild); n.replaceWith(p); }
      else if (n.nodeType === 1 && n.tagName === 'BR') n.remove();
    }
    for (const p of el.querySelectorAll(':scope > p:empty')) if (el.children.length > 1) p.remove();
    // Each paragraph picks its own direction (Arabic right-to-left, others left-to-right).
    for (const b of el.querySelectorAll(':is(p, h1, h2, h3, h4, li, blockquote, td, th, figcaption):not([dir])')) b.setAttribute('dir', 'auto');
    // Browsers sometimes nest lists inside paragraphs/headings; lift them out.
    for (const list of el.querySelectorAll(':is(p, h1, h2, h3, h4, blockquote) > :is(ul, ol)')) {
      const parent = list.parentElement;
      const others = [...parent.childNodes].filter((n) => n !== list && !(n.nodeType === 3 && !n.textContent.trim()) && n.nodeName !== 'BR');
      if (!others.length) {
        const caretIn = getSelection().rangeCount && parent.contains(getSelection().anchorNode);
        const r = caretIn ? getSelection().getRangeAt(0).cloneRange() : null;
        parent.replaceWith(list);
        if (r) { try { getSelection().removeAllRanges(); getSelection().addRange(r); } catch { /* ignore */ } }
      } else parent.after(list);
    }
    const last = el.lastElementChild;
    if (last && (last.classList.contains('blk') || last.classList.contains('callout') || last.classList.contains('definition') || last.classList.contains('summary-box') || last.tagName === 'UL' || last.tagName === 'OL' || last.tagName === 'HR')) el.append(h('p', h('br')));
    const first = el.firstElementChild;
    if (first && first.classList.contains('blk')) el.prepend(h('p', h('br')));
  }

  /* ---------------- history ---------------- */
  record() {
    const html = this.getHTML();
    const top = this.undoStack.at(-1);
    if (top && top.html === html) return;
    this.undoStack.push({ html, caret: this.getCaret() });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push({ html: this.getHTML(), caret: this.getCaret() });
    this._restore(this.undoStack.pop());
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push({ html: this.getHTML(), caret: this.getCaret() });
    this._restore(this.redoStack.pop());
    return true;
  }
  _restore(snap) {
    this.deselectBlock();
    this.el.innerHTML = snap.html || '<p><br></p>';
    this.normalize();
    this.hydrateAll();
    if (snap.caret != null) this.setCaret(snap.caret);
    this.burst = false;
    this.onChange();
  }

  getCaret() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!this.el.contains(r.startContainer)) return null;
    const pre = document.createRange();
    pre.selectNodeContents(this.el);
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  }
  setCaret(offset) {
    const w = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
    let n, left = offset;
    while ((n = w.nextNode())) {
      if (n.parentElement.closest('.blk:not(:has([contenteditable="true"]))')) continue;
      if (left <= n.length) {
        const r = document.createRange();
        r.setStart(n, left);
        r.collapse(true);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        return;
      }
      left -= n.length;
    }
  }

  /* ---------------- selection helpers ---------------- */
  range() {
    const sel = getSelection();
    if (sel.rangeCount && this.el.contains(sel.getRangeAt(0).commonAncestorContainer)) return sel.getRangeAt(0);
    return null;
  }
  restoreRange() {
    if (!this.lastRange) return false;
    const s = getSelection(); s.removeAllRanges(); s.addRange(this.lastRange);
    return true;
  }
  selectedText() { const r = this.range() || this.lastRange; return r ? r.toString() : ''; }
  topBlock(node) {
    let n = node?.nodeType === 3 ? node.parentNode : node;
    while (n && n.parentNode !== this.el) { n = n.parentNode; if (!n || n === document.body) return null; }
    return n;
  }
  textBlock(node) {
    const n = node?.nodeType === 3 ? node.parentElement : node;
    const b = n?.closest?.(TEXT_BLOCKS);
    return b && this.el.contains(b) && !b.closest('.blk') ? b : null;
  }
  currentBlock() { const r = this.range() || this.lastRange; return r ? this.textBlock(r.startContainer) : null; }
  blocksInRange(r = this.range() || this.lastRange) {
    if (!r) return [];
    const start = this.textBlock(r.startContainer);
    const end = this.textBlock(r.endContainer);
    if (!start) return [];
    if (start === end || !end) return [start];
    const all = [...this.el.querySelectorAll(TEXT_BLOCKS)].filter((b) => !b.closest('.blk') && !b.querySelector(TEXT_BLOCKS));
    const i = all.indexOf(start), j = all.indexOf(end);
    return i >= 0 && j >= i ? all.slice(i, j + 1) : [start];
  }
  currentStyleId() {
    const b = this.currentBlock();
    if (!b) return 'p';
    const co = b.closest('.callout');
    if (co) return co.dataset.kind === 'important' ? 'important' : co.dataset.kind === 'tip' ? 'tip' : co.dataset.kind === 'example' ? 'example' : co.dataset.kind === 'warning' ? 'warning' : 'callout';
    if (b.closest('.definition')) return 'definition';
    if (b.closest('.summary-box')) return 'summary';
    if (b.matches('div.formula')) return 'formula';
    if (b.tagName === 'LI') return b.parentElement.classList.contains('checklist') ? 'check' : b.parentElement.tagName === 'OL' ? 'ol' : 'ul';
    if (b.tagName === 'BLOCKQUOTE') return 'quote';
    if (b.classList.contains('hl-block')) return 'hl';
    return b.tagName.toLowerCase();
  }

  /* ---------------- inline formatting ---------------- */
  focus() { if (!this.range()) { this.restoreRange() || this.el.focus(); } }
  exec(cmd, val = null) {
    this.focus();
    this.record();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(cmd, false, val);
    this.changed();
  }

  /** Wrap each selected text run in a span carrying `styles` (an object of CSS props). */
  wrapStyle(styles) {
    this.focus();
    const r = this.range();
    if (!r || r.collapsed) { toast('Select some text first.'); return; }
    this.record();
    const nodes = [];
    const w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (r.intersectsNode(n) && n.textContent.length) nodes.push(n);
    if (r.commonAncestorContainer.nodeType === 3 && !nodes.includes(r.commonAncestorContainer)) nodes.push(r.commonAncestorContainer);
    let first = null, last = null;
    for (let node of nodes) {
      if (node.parentElement.closest('.co-ic, .blk:not(:has([contenteditable="true"]))')) continue;
      let s = node === r.startContainer ? r.startOffset : 0;
      let e = node === r.endContainer ? r.endOffset : node.length;
      if (s >= e) continue;
      if (e < node.length) node.splitText(e);
      if (s > 0) node = node.splitText(s);
      const parent = node.parentElement;
      let span;
      if (parent.tagName === 'SPAN' && parent.childNodes.length === 1 && !parent.className) span = parent;
      else { span = document.createElement('span'); node.replaceWith(span); span.append(node); }
      for (const [k, v] of Object.entries(styles)) {
        span.style.setProperty(k, v ?? '');
        span.querySelectorAll('span').forEach((inner) => inner.style.removeProperty(k));
      }
      if (!span.getAttribute('style')) { span.replaceWith(...span.childNodes); continue; }
      first ||= span;
      last = span;
    }
    if (first) {
      const nr = document.createRange();
      nr.setStartBefore(first);
      nr.setEndAfter(last);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(nr);
      this.lastRange = nr.cloneRange();
    }
    this.changed();
  }

  clearFormatting() {
    this.focus();
    const r = this.range();
    if (!r || r.collapsed) return;
    this.record();
    document.execCommand('removeFormat');
    const blocks = this.blocksInRange(r);
    for (const b of blocks) b.querySelectorAll('span[style]').forEach((s) => { if (r.intersectsNode(s)) s.replaceWith(...s.childNodes); });
    this.changed();
  }

  /* ---------------- block styling ---------------- */
  setBlockStyle(id) {
    this.focus();
    const blocks = this.blocksInRange();
    if (!blocks.length) return;
    this.record();
    // Remember the caret as (block index, text offset inside that block) so it survives re-tagging.
    const r0 = this.range() || this.lastRange;
    const startBlock = r0 ? this.textBlock(r0.startContainer) : blocks[0];
    const caretIdx = Math.max(0, blocks.indexOf(startBlock));
    const caretOff = r0 && startBlock ? textOffset(startBlock, r0.startContainer, r0.startOffset) : 0;
    if (['ul', 'ol', 'check'].includes(id)) {
      const cur = this.currentStyleId();
      if (cur === id) { document.execCommand(id === 'ol' ? 'insertOrderedList' : 'insertUnorderedList'); }
      else if (['ul', 'ol', 'check'].includes(cur)) {
        const list = blocks[0].closest('ul,ol');
        const want = id === 'ol' ? 'OL' : 'UL';
        let l2 = list;
        if (list.tagName !== want) { l2 = document.createElement(want); while (list.firstChild) l2.append(list.firstChild); list.replaceWith(l2); }
        l2.classList.toggle('checklist', id === 'check');
        placeCaret(blocks[caretIdx], caretOff);
      } else {
        const unwrapped = blocks.map((b) => this._unwrap(b));
        const el = unwrapped[caretIdx] || unwrapped[0];
        if (unwrapped.length === 1) placeCaret(el, caretOff);
        else { const r = document.createRange(); r.setStartBefore(unwrapped[0]); r.setEndAfter(unwrapped.at(-1)); getSelection().removeAllRanges(); getSelection().addRange(r); }
        document.execCommand(id === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
        const list = this.currentBlock()?.closest('ul,ol');
        if (list) list.classList.toggle('checklist', id === 'check');
      }
      this.changed();
      return;
    }
    let target = blocks.map((b) => (b.tagName === 'LI' ? this._liToP(b) : b));
    target = target.map((b) => this._unwrap(b));
    if (['h1', 'h2', 'h3', 'h4', 'p'].includes(id)) target = target.map((b) => this._retag(b, id));
    else if (id === 'quote') target = target.map((b) => this._retag(b, 'blockquote'));
    else if (id === 'hl') target = target.map((b) => { const p = this._retag(b, 'p'); p.classList.add('hl-block'); return p; });
    else if (id === 'formula') target = target.map((b) => { const d = this._retag(b, 'div'); d.className = 'formula'; return d; });
    else if (['important', 'callout', 'tip', 'example', 'warning'].includes(id)) {
      target = target.map((b) => this._retag(b, 'p'));
      const box = h('div.callout', { dataset: { kind: id === 'callout' ? 'info' : id } },
        h('span.co-ic', { contenteditable: 'false', html: ic(CALLOUT_ICONS[id] || 'info') }), h('div.co-body'));
      target[0].before(box);
      target.forEach((p) => box.lastChild.append(p));
    } else if (id === 'definition') {
      target = target.map((b) => this._retag(b, 'p'));
      const p = target[0];
      const box = h('div.definition');
      p.before(box);
      target.forEach((x) => box.append(x));
      const text = p.textContent;
      const m = text.match(/^\s*([^:—–-]{1,60})\s*[:—–-]\s*(.*)$/);
      if (m) { p.textContent = ''; p.append(h('span.def-term', m[1].trim()), m[2] || ''); }
      else if (text.trim()) p.prepend(h('span.def-term', 'Term'));
      else { p.textContent = ''; p.append(h('span.def-term', 'Term'), ' '); }
    } else if (id === 'summary') {
      target = target.map((b) => this._retag(b, 'p'));
      const box = h('div.summary-box', h('h4', 'Key takeaways'));
      target[0].before(box);
      target.forEach((p) => box.append(p));
    }
    this.normalize();
    const el = target[caretIdx] || target[0];
    if (id === 'definition' && el === target[0]) placeCaret(el, el.textContent.length);
    else placeCaret(el, caretOff);
    this.changed();
  }
  _retag(b, tag) {
    if (b.tagName.toLowerCase() === tag && !(tag === 'p' && b.classList.contains('hl-block'))) return b;
    const n = document.createElement(tag);
    for (const a of b.attributes) if (a.name !== 'class') n.setAttribute(a.name, a.value);
    while (b.firstChild) n.append(b.firstChild);
    b.replaceWith(n);
    return n;
  }
  _liToP(li) {
    const list = li.parentElement;
    const p = h('p');
    while (li.firstChild) p.append(li.firstChild);
    const after = [...list.children].slice([...list.children].indexOf(li) + 1);
    if (after.length) { const tail = document.createElement(list.tagName); tail.className = list.className; after.forEach((x) => tail.append(x)); list.after(tail); }
    list.after(p);
    li.remove();
    if (!list.children.length) list.remove();
    return p;
  }
  /** Move a block out of callout/definition/summary wrappers. */
  _unwrap(b) {
    const wrap = b.closest('.callout, .definition, .summary-box');
    if (!wrap || !this.el.contains(wrap)) return b;
    if (b.closest('.definition')) b.querySelectorAll('.def-term').forEach((t) => { t.after(': '); t.replaceWith(...t.childNodes); });
    const kids = [...(wrap.querySelector('.co-body') || wrap).children].filter((k) => !k.matches('.co-ic, .summary-box > h4:first-child'));
    for (const k of kids) wrap.before(k);
    wrap.remove();
    return b;
  }

  /** Apply inline CSS to the current text block(s) (element-level styling). */
  styleBlocks(styles, blocks = this.blocksInRange()) {
    if (!blocks.length) return;
    this.record();
    for (const b of blocks) {
      const target = b.closest('.callout, .definition, .summary-box, div.formula') && styles.__wrapper ? b.closest('.callout, .definition, .summary-box, div.formula') : b;
      for (const [k, v] of Object.entries(styles)) if (k !== '__wrapper') target.style.setProperty(k, v ?? '');
      if (!target.getAttribute('style')) target.removeAttribute('style');
    }
    this.changed();
  }

  /* ---------------- islands ---------------- */
  insertNode(node, { select = true } = {}) {
    this.record();
    const r = this.range() || this.lastRange;
    let anchor = r ? this.topBlock(r.startContainer) : null;
    if (!anchor || !this.el.contains(anchor)) anchor = this.el.lastElementChild;
    if (anchor && anchor.tagName === 'P' && !anchor.textContent.trim() && !anchor.querySelector('img')) anchor.replaceWith(node);
    else if (anchor) anchor.after(node);
    else this.el.append(node);
    if (!node.nextElementSibling) node.after(h('p', h('br')));
    this.normalize();
    if (node.classList?.contains('blk')) { this.hydrateFn(node, this); if (select) this.selectBlock(node); }
    this.changed();
    return node;
  }
  insertHTMLAfterCurrent(html) {
    this.record();
    const r = this.range() || this.lastRange;
    let anchor = r ? this.topBlock(r.startContainer) : this.el.lastElementChild;
    const tmp = h('div', { html });
    const nodes = [...tmp.childNodes];
    if (!anchor) { this.el.append(...nodes); }
    else if (anchor.tagName === 'P' && !anchor.textContent.trim()) anchor.replaceWith(...nodes);
    else anchor.after(...nodes);
    this.normalize();
    nodes.filter((n) => n.classList?.contains('blk')).forEach((b) => this.hydrateFn(b, this));
    this.changed();
  }
  replaceSelectionText(text) {
    this.restoreRange();
    this.record();
    document.execCommand('insertText', false, text);
    this.changed();
  }
  selectBlock(blk) {
    if (this.selectedBlock === blk) return;
    this.deselectBlock();
    this.selectedBlock = blk;
    blk.classList.add('selected');
    this.onBlockSelect(blk);
  }
  deselectBlock() {
    const b = this.selectedBlock;
    if (!b) return;
    b.classList.remove('selected');
    b.querySelectorAll(':scope > .blk-ui').forEach((u) => u.remove());
    this.selectedBlock = null;
    this.onBlockSelect(null);
  }
  removeBlock(blk) {
    this.record();
    if (this.selectedBlock === blk) this.deselectBlock();
    const next = blk.nextElementSibling;
    blk.remove();
    this.normalize();
    if (next) { const r = document.createRange(); r.selectNodeContents(next); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    this.changed();
  }
  moveBlock(blk, dir) {
    this.record();
    let sib = dir < 0 ? blk.previousElementSibling : blk.nextElementSibling;
    if (!sib) return;
    if (dir < 0) sib.before(blk); else sib.after(blk);
    this.normalize();
    blk.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    this.changed();
  }

  /* ---------------- events ---------------- */
  _bind() {
    const el = this.el;
    el.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'historyUndo') { e.preventDefault(); this.undo(); return; }
      if (e.inputType === 'historyRedo') { e.preventDefault(); this.redo(); return; }
      if (this.selectedBlock && !this.selectedBlock.contains(e.target) && /^(delete|insert)/.test(e.inputType)) {
        const sel = getSelection();
        const inside = sel.rangeCount && this.selectedBlock.contains(sel.getRangeAt(0).startContainer) && sel.getRangeAt(0).startContainer.parentElement.closest('[contenteditable="true"]') !== el;
        if (!inside && /^delete/.test(e.inputType)) { e.preventDefault(); this.removeBlock(this.selectedBlock); return; }
      }
      if (!this.burst || e.inputType === 'insertParagraph' || /^delete/.test(e.inputType) !== this._lastDelete) { this.record(); this.burst = true; }
      this._lastDelete = /^delete/.test(e.inputType);
      if (e.inputType === 'insertText' && /[\s.,;:!?]/.test(e.data || '')) this.burst = false;
      this.endBurst();
    });
    el.addEventListener('input', (e) => {
      this._autoformat(e);
      this.changed();
    });
    el.addEventListener('keydown', (e) => this._keydown(e));
    el.addEventListener('pointerdown', (e) => this._pointerdown(e));
    el.addEventListener('paste', (e) => this._paste(e));
    el.addEventListener('drop', (e) => this._drop(e));
    el.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
    this._selHandler = () => {
      const sel = getSelection();
      if (!sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (!el.contains(r.commonAncestorContainer)) return;
      this.lastRange = r.cloneRange();
      this.onSelection(r);
    };
    document.addEventListener('selectionchange', this._selHandler);
  }
  destroy() { document.removeEventListener('selectionchange', this._selHandler); }

  _pointerdown(e) {
    const blk = e.target.closest('.blk');
    if (blk && this.el.contains(blk)) {
      if (e.target.closest('.blk-ui')) return;
      if (!e.target.closest('[contenteditable="true"]') || e.target.closest('[contenteditable="true"]') === this.el) {
        this.selectBlock(blk);
        if (!e.target.closest('.fig-label, .resize-h, .col-resize, .row-resize, .map-host, .it-placeholder')) e.preventDefault();
        return;
      }
      this.selectBlock(blk);
      return;
    }
    this.deselectBlock();
    const li = e.target.closest('ul.checklist > li');
    if (li) {
      const rect = li.getBoundingClientRect();
      const rtl = getComputedStyle(li).direction === 'rtl';
      const x = rtl ? rect.right - e.clientX : e.clientX - rect.left;
      if (x >= 0 && x < 30) { e.preventDefault(); this.record(); li.classList.toggle('done'); this.changed(); }
    }
  }

  _keydown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if (this.selectedBlock && (e.key === 'Backspace' || e.key === 'Delete')) {
      const inEditable = e.target.closest?.('[contenteditable="true"]') && e.target !== this.el;
      const sel = getSelection();
      const inField = sel.rangeCount && sel.getRangeAt(0).startContainer.parentElement?.closest('.blk [contenteditable="true"]');
      if (!inEditable && !inField) { e.preventDefault(); this.removeBlock(this.selectedBlock); return; }
    }
    if (e.key === 'Escape' && this.selectedBlock) { this.deselectBlock(); return; }
    if (e.key === 'Tab') {
      const li = this.currentBlock()?.closest('li');
      if (li) { e.preventDefault(); this.record(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); this.changed(); return; }
      const cell = getSelection().anchorNode?.parentElement?.closest('td,th');
      if (cell) return; // handled by table module
      e.preventDefault();
      document.execCommand('insertText', false, ' ');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const b = this.currentBlock();
      if (!b) return;
      const box = b.closest('.callout .co-body, .definition, .summary-box');
      if (box && !b.textContent.trim() && b === (box.lastElementChild)) {
        e.preventDefault();
        this.record();
        const outer = b.closest('.callout, .definition, .summary-box');
        const p = h('p', h('br'));
        outer.after(p);
        b.remove();
        const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
        getSelection().removeAllRanges(); getSelection().addRange(r);
        this.changed();
        return;
      }
      if (b.matches('h1,h2,h3,h4')) {
        const r = this.range();
        const after = document.createRange(); after.selectNodeContents(b); after.setStart(r.endContainer, r.endOffset);
        if (!after.toString().length) {
          e.preventDefault();
          this.record();
          const p = h('p', h('br'));
          b.after(p);
          const nr = document.createRange(); nr.setStart(p, 0); nr.collapse(true);
          getSelection().removeAllRanges(); getSelection().addRange(nr);
          this.changed();
        }
      }
    }
  }

  _autoformat(e) {
    if (e.inputType !== 'insertText') return;
    const b = this.currentBlock();
    if (!b) return;
    if (e.data === '/' && b.textContent === '/' && this.onSlash) { this.onSlash(b); return; }
    if (e.data !== ' ' && e.data !== ' ') return;
    if (b.tagName !== 'P') return;
    const t = b.textContent.replace(/ /g, ' ');
    const map = { '# ': 'h1', '## ': 'h2', '### ': 'h3', '#### ': 'h4', '- ': 'ul', '* ': 'ul', '1. ': 'ol', '[] ': 'check', '[ ] ': 'check', '> ': 'quote', '!! ': 'important', ':: ': 'definition', '$$ ': 'formula' };
    const key = Object.keys(map).find((k) => t === k);
    if (!key) return;
    b.textContent = '';
    b.append(h('br'));
    const r = document.createRange(); r.setStart(b, 0); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    this.setBlockStyle(map[key]);
  }

  async _paste(e) {
    const dt = e.clipboardData;
    if (!dt) return;
    const inCell = e.target.closest?.('.blk [contenteditable="true"]');
    const files = [...dt.files].filter((f) => f.type.startsWith('image/'));
    if (files.length && !inCell) {
      e.preventDefault();
      for (const f of files) this.onImageFile?.(f);
      return;
    }
    const html = dt.getData('text/html');
    const text = dt.getData('text/plain');
    e.preventDefault();
    this.record();
    if (html && !inCell) document.execCommand('insertHTML', false, sanitizePaste(html));
    else document.execCommand('insertText', false, text);
    this.changed();
  }

  async _drop(e) {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const pos = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (pos) { getSelection().removeAllRanges(); getSelection().addRange(pos); this.lastRange = pos.cloneRange(); }
    for (const f of files) this.onImageFile?.(f);
  }
}

/** Text offset of (node, offset) inside block. */
function textOffset(block, node, offset) {
  try {
    const r = document.createRange();
    r.selectNodeContents(block);
    r.setEnd(node, offset);
    return r.toString().length;
  } catch { return 0; }
}
/** Put the caret `off` characters into `el` (or at its start when it has no text). */
function placeCaret(el, off = 0) {
  if (!el || !el.isConnected) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, left = off;
  const r = document.createRange();
  let placed = false;
  while ((n = w.nextNode())) {
    if (n.parentElement.closest('[contenteditable="false"]') && n.parentElement.closest('[contenteditable="false"]') !== el) continue;
    if (left <= n.length) { r.setStart(n, left); placed = true; break; }
    left -= n.length;
  }
  if (!placed) {
    const last = (() => { let t = null; const w2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let x; while ((x = w2.nextNode())) t = x; return t; })();
    if (last && off > 0) r.setStart(last, last.length); else r.setStart(el, 0);
  }
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

export async function fileToImageData(file) {
  if (file.type === 'image/svg+xml') return readFileAs(file);
  return shrinkImage(file, 1800, file.type === 'image/png' ? 'image/png' : 'image/jpeg');
}
