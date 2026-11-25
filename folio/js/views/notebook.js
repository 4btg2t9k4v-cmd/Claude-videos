// The notebook workspace: page list, toolbar, paper page with editor + ink, AI panel.
import {
  S, on, pagesOf, createPage, updatePage, touchPage, touchNotebook, trashPage, restorePage, duplicatePage, normalizeOrder,
  updateNotebook, snapshotVersion, logActivity, setSetting,
} from '../store.js';
import { $, h, ic, iconBtn, menu, popover, toast, promptDialog, confirmDialog, sheet, debounce, timeAgo, fmtDate, select, segmented, field, closePopover, isTouch, esc } from '../util.js';
import { go, savePill, toggleSidebar } from '../main.js';
import { Editor, BLOCK_STYLES } from '../editor/editor.js';
import { hydrate, insertMenu, blockToolbar, insertImageFile } from '../editor/insert.js';
import { createSelectionBar } from '../editor/selbar.js';
import { blockInspector } from '../editor/inspector.js';
import { paperPopover, effectivePaper, applyPaper, templatePicker } from '../editor/paper.js';
import { Ink, penBar } from '../editor/ink.js';
import { headingsOf, pageText } from '../editor/text.js';
import { onShortcut, prettyCombo, bindingFor } from '../shortcuts.js';
import { coverEl, notebookDialog, LANGS } from './nbdialogs.js';

const PAGE_W = 816;

export async function render(main, params) {
  let nb = S.notebooks.get(params.id);
  if (!nb || nb.deletedAt) { toast('That notebook no longer exists.'); go('#/'); return; }
  touchNotebook(nb.id);
  const app = $('#app');
  const hadRail = app.classList.contains('rail');
  if (window.innerWidth > 960) app.classList.add('rail');

  let page = null;
  let dirty = false;
  let penMode = false;
  let zoom = S.settings.zoom || 'fit';
  let filter = '';
  const offs = [];

  /* ---------------- DOM ---------------- */
  const pagesPanel = h('aside.nb-pages', { 'aria-label': 'Pages' });
  const tree = h('div.np-tree');
  const search = h('input.field', { type: 'search', placeholder: 'Find a page', 'aria-label': 'Find a page', on: { input: (e) => { filter = e.target.value.toLowerCase(); drawTree(); } } });
  const npHead = h('div.np-head');
  pagesPanel.append(npHead, h('div.np-search', search), tree,
    h('div.np-foot',
      h('button.btn.sm', { type: 'button', html: ic('plus') + '<span>Page</span>', on: { click: (e) => addPageMenu(e.currentTarget) } }),
      h('button.btn.sm.ghost', { type: 'button', html: ic('folder-plus') + '<span>Section</span>', on: { click: addFolder } })));

  const sheetEl = h('div.page-sheet', h('div.paper-img'), h('div.paper-bg'), h('div.paper-tex'));
  const titleEl = h('textarea.page-title', { rows: 1, placeholder: 'Untitled page', 'aria-label': 'Page title', spellcheck: true });
  const metaEl = h('div.page-meta');
  const editorEl = h('div.editor');
  const inner = h('div.page-inner', titleEl, metaEl, editorEl);
  sheetEl.append(inner);
  const fit = h('div.page-fit', sheetEl);
  const stage = h('div.page-stage', fit);
  const scroller = h('div.page-scroll', stage);
  const toolbar = h('div.toolbar', { role: 'toolbar', 'aria-label': 'Page tools' });
  const nbMain = h('div.nb-main', toolbar, scroller);
  const aiPanel = h('aside.ai-panel', { 'aria-label': 'AI assistant' });
  const view = h('div.nb-view' + (S.settings.pagesHidden ? '.pages-hidden' : ''), pagesPanel, nbMain, aiPanel);
  main.append(view);

  /* ---------------- editor ---------------- */
  const editor = new Editor({
    el: editorEl,
    onChange: () => { dirty = true; saveSoon(); refreshMetaSoon(); },
    hydrate: (blk, ed) => hydrate(blk, ed),
    onBlockSelect: (blk) => { if (blk) blockToolbar(blk, editor, ctx); },
  });
  editor.onImageFile = (f) => insertImageFile(f, editor);
  editor.onSlash = (b) => {
    b.textContent = '';
    b.append(h('br'));
    const r = document.createRange(); r.setStart(b, 0); getSelection().removeAllRanges(); getSelection().addRange(r);
    editor.lastRange = r.cloneRange();
    insertMenu(b, editor, ctx);
  };

  const ink = new Ink(sheetEl, {
    scroller,
    getScale: () => currentScale,
    onChange: (strokes) => { if (!page) return; updatePage(page.id, { ink: strokes }, { quiet: true }); logActivity('edits'); growSheet(); },
  });
  ink.onPencil = () => { if (!penMode) { /* pencil wrote in text mode: keep text mode */ } };
  const pen = penBar(ink, { onDone: () => setPen(false), onConvert: () => convertInk() });
  nbMain.append(pen);

  // lazy modules
  let ai = null;
  const aiMod = () => import('../ai/panel.js');
  let spell = null;
  import('../tools/spell.js').then((m) => { spell = m.createSpell(editor, () => writingLang()); });

  const ctx = {
    get notebook() { return nb; },
    get page() { return page; },
    editor,
    visualize: () => import('../ai/visuals.js').then((m) => m.visualizeDialog({ editor, page, nb })),
    redrawVisual: (blk) => import('../ai/visuals.js').then((m) => m.redraw(blk, editor, { page, nb })),
    scanHandwriting: () => import('../ai/notes.js').then((m) => m.scanImageToText(editor)),
    cardsFromFigure: (blk) => import('./cards.js').then((m) => m.cardsFromFigureDialog(blk, nb)),
  };
  editor.ctx = { get notebookId() { return nb.id; } };

  const selbar = createSelectionBar(editor, {
    aiMenu: (anchor) => import('../ai/writing.js').then((m) => m.selectionAIMenu(anchor, editor, { openPanel: openAI, runAction: (id) => { openAI(); ai.then((p) => p.runAction(id, 'selection')); } })),
    translate: (anchor) => import('../tools/translator.js').then((m) => m.wordPopover(anchor, editor.selectedText(), 'translate', insertAfterSelection)),
    define: (anchor) => import('../tools/translator.js').then((m) => m.wordPopover(anchor, editor.selectedText(), 'define', insertAfterSelection)),
    flashcard: () => import('./cards.js').then((m) => m.quickCardDialog({ text: editor.selectedText(), notebookId: nb.id, context: pageText(page).slice(0, 4000) })),
  });
  function insertAfterSelection(text) {
    editor.restoreRange();
    const r = editor.range();
    if (r) { r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }
    editor.record();
    document.execCommand('insertText', false, ' (' + text + ')');
    editor.changed();
  }

  /* ---------------- scale-to-fit ---------------- */
  let currentScale = 1;
  const layout = () => {
    const avail = scroller.clientWidth - (window.innerWidth < 700 ? 12 : 40);
    const fitScale = Math.min(1.12, Math.max(0.35, avail / PAGE_W));
    currentScale = zoom === 'fit' ? fitScale : +zoom;
    sheetEl.style.transform = `scale(${currentScale})`;
    fit.style.width = PAGE_W * currentScale + 'px';
    fit.style.height = sheetEl.offsetHeight * currentScale + 'px';
  };
  const growSheet = () => {
    const need = Math.max(1056, ink.maxY() + 160);
    sheetEl.style.minHeight = need + 'px';
  };
  const ro = new ResizeObserver(() => { layout(); if (window.innerWidth > 960) app.classList.add('rail'); });
  ro.observe(scroller);
  ro.observe(sheetEl);

  /* ---------------- toolbar ---------------- */
  const styleSel = select(BLOCK_STYLES.map((s) => ({ value: s.id, label: s.label })), 'p', (v) => { editor.restoreRange(); editor.setBlockStyle(v); }, 'tb-select');
  styleSel.setAttribute('aria-label', 'Text style');
  styleSel.addEventListener('pointerdown', () => editor.restoreRange());
  const undoBtn = iconBtn('undo', 'Undo', () => (penMode ? ink.undo() : editor.undo()));
  const redoBtn = iconBtn('redo', 'Redo', () => (penMode ? ink.redo() : editor.redo()));
  const penBtn = iconBtn('pen', 'Handwriting (' + prettyCombo(bindingFor('togglePen')) + ')', () => setPen(!penMode));
  const aiBtn = iconBtn('sparkles', 'AI assistant (' + prettyCombo(bindingFor('toggleAI')) + ')', () => toggleAI());
  const langBtn = h('button.lang-btn', { type: 'button', title: 'Writing language', on: { click: (e) => langMenu(e.currentTarget) } });
  const spellBtn = iconBtn('spell', 'Check spelling & grammar', () => spell?.checkPage());
  const pill = savePill();
  const keepFocus = (b) => { b.addEventListener('pointerdown', (e) => e.preventDefault()); return b; };
  toolbar.append(
    h('div.tb-group',
      iconBtn('panel-left', 'Pages', () => togglePages()),
      iconBtn('home', 'Home', () => go('#/'), 'tb-hide-sm')),
    h('div.tb-group', styleSel),
    h('div.tb-group',
      keepFocus(iconBtn('sliders', 'Style this element (font, colour, spacing, border…)', (e) => blockInspector(e.currentTarget, editor))),
      keepFocus(iconBtn('list', 'Lists & alignment', (e) => menu(e.currentTarget, [
        { label: 'Bullet list', icon: 'list', run: () => { editor.restoreRange(); editor.setBlockStyle('ul'); } },
        { label: 'Numbered list', icon: 'list-ordered', run: () => { editor.restoreRange(); editor.setBlockStyle('ol'); } },
        { label: 'Checklist', icon: 'list-checks', run: () => { editor.restoreRange(); editor.setBlockStyle('check'); } },
        { sep: true },
        ...['left', 'center', 'right', 'justify'].map((a) => ({ label: 'Align ' + a, icon: 'align-' + a, run: () => { editor.restoreRange(); editor.styleBlocks({ 'text-align': a }); } })),
      ])))),
    h('div.tb-group',
      keepFocus(iconBtn('plus', 'Insert', (e) => insertMenu(e.currentTarget, editor, ctx))),
      penBtn,
      iconBtn('template', 'Paper & page design', (e) => paperPopover(e.currentTarget, { page, nb, apply: () => { applyPaper(sheetEl, effectivePaper(page, nb)); layout(); ink.resize(); }, getHTML: () => editor.getHTML(), onTemplate: applyTemplate }))),
    h('div.tb-group', langBtn, spellBtn),
    h('div.tb-group', undoBtn, redoBtn),
    h('div.tb-spacer'),
    h('div.tb-group', pill, aiBtn, iconBtn('more', 'More', (e) => moreMenu(e.currentTarget))),
  );

  /* ---------------- page list ---------------- */
  function drawHead() {
    npHead.innerHTML = '';
    npHead.append(coverEl(nb, { elastic: false }),
      h('div.np-title', h('b', nb.title), h('span', `${pagesOf(nb.id).length} pages${nb.subject ? ' · ' + nb.subject : ''}`)),
      iconBtn('more', 'Notebook options', (e) => nbMenu(e.currentTarget)));
  }
  function drawTree() {
    tree.innerHTML = '';
    const all = pagesOf(nb.id);
    const match = (p) => !filter || (p.title || '').toLowerCase().includes(filter) || pageText(p, { maxLen: 20000 }).toLowerCase().includes(filter);
    const groups = [{ id: null, name: '' }, ...(nb.folders || [])];
    for (const f of groups) {
      const ps = all.filter((p) => (p.folderId || null) === f.id && match(p));
      if (f.id === null) {
        tree.append(h('div.np-list', { dataset: { folder: '' } }, ps.map(pageRow)));
        continue;
      }
      if (filter && !ps.length) continue;
      const closed = (S.settings.closedFolders || []).includes(f.id);
      const folder = h('div.np-folder' + (closed ? '.closed' : ''),
        h('div.np-folder-head', { dataset: { folderHead: f.id } },
          h('button.icon-btn.sm.twisty', { type: 'button', 'aria-label': closed ? 'Expand section' : 'Collapse section', html: ic('chevron-down'), on: { click: () => toggleFolder(f.id) } }),
          h('span', f.name),
          iconBtn('plus', 'New page in ' + f.name, () => newPage({ folderId: f.id }), 'sm'),
          iconBtn('more', 'Section options', (e) => folderMenu(e.currentTarget, f), 'sm')),
        h('div.np-list', { dataset: { folder: f.id } }, ps.map(pageRow)));
      tree.append(folder);
    }
    if (!all.length) tree.append(h('p.faint', { style: { padding: '12px', fontSize: '14px' } }, 'No pages yet.'));
  }
  function pageRow(p) {
    const active = page && p.id === page.id;
    const due = p.review?.next && p.review.next <= Date.now();
    const row = h('a.np-page' + (active ? '.active' : '') + (p.archived ? '.archived' : ''), { href: `#/nb/${nb.id}/${p.id}`, dataset: { id: p.id }, draggable: 'false' },
      h('span.thumb'),
      h('span.pt', h('b', p.title || 'Untitled page'), h('span', timeAgo(p.updatedAt))),
      h('span.flags', p.bookmarked ? h('span', { html: ic('bookmark') }) : null, due ? h('span', { html: ic('repeat'), title: 'Due for revision' }) : null, p.archived ? h('span', { html: ic('archive') }) : null),
      iconBtn('more', 'Page options', (e) => { e.preventDefault(); e.stopPropagation(); pageMenu(e.currentTarget, p); }, 'sm'));
    row.querySelector('.icon-btn').style.opacity = '.6';
    enableDrag(row, p);
    const frag = [row];
    if (active && nb.toc?.showHeadings !== false) {
      const hs = headingsOf(page.html).filter((x) => x.level <= 3);
      if (hs.length) frag.push(h('div.np-headings', hs.map((x) => h('a.' + 'h' + x.level, { href: '#', on: { click: (e) => { e.preventDefault(); scrollToHeading(x.index); } } }, x.text))));
    }
    return frag;
  }
  function scrollToHeading(i) {
    const el = editorEl.querySelectorAll('h1,h2,h3')[i];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.innerWidth <= 960) view.classList.remove('pages-open');
  }

  /* Pointer-based drag to reorder pages and move them between sections. */
  function enableDrag(row, p) {
    let timer, start, dragging = false, ghostY = 0, target = null, where = null;
    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.icon-btn') || e.button) return;
      start = { x: e.clientX, y: e.clientY };
      const begin = () => { dragging = true; row.classList.add('dragging'); row.setPointerCapture?.(e.pointerId); navigator.vibrate?.(10); };
      if (e.pointerType === 'mouse') timer = null; else timer = setTimeout(begin, 380);
      const move = (ev) => {
        const dy = ev.clientY - start.y, dx = ev.clientX - start.x;
        if (!dragging) {
          if (e.pointerType === 'mouse' && Math.abs(dy) > 6) begin();
          else if (Math.hypot(dx, dy) > 8) { clearTimeout(timer); cleanup(); return; }
          if (!dragging) return;
        }
        ev.preventDefault();
        ghostY = dy;
        row.style.transform = `translateY(${ghostY}px)`;
        tree.querySelectorAll('.drop-before,.drop-after,.drop').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop'));
        row.style.pointerEvents = 'none';
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        row.style.pointerEvents = '';
        const over = el?.closest('.np-page');
        const fh = el?.closest('.np-folder-head');
        if (over && over !== row) { const r = over.getBoundingClientRect(); where = ev.clientY < r.top + r.height / 2 ? 'before' : 'after'; over.classList.add('drop-' + where); target = { page: over.dataset.id }; }
        else if (fh) { fh.classList.add('drop'); target = { folder: fh.dataset.folderHead }; }
        else target = null;
      };
      const up = () => {
        clearTimeout(timer);
        if (dragging) {
          row.addEventListener('click', (ev) => ev.preventDefault(), { once: true, capture: true });
          applyDrop();
        }
        cleanup();
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        row.classList.remove('dragging');
        row.style.transform = '';
        tree.querySelectorAll('.drop-before,.drop-after,.drop').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop'));
        dragging = false;
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); pageMenu({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }, p); });
    function applyDrop() {
      if (!target) return;
      const list = pagesOf(nb.id).filter((x) => x.id !== p.id);
      if (target.folder) {
        updatePage(p.id, { folderId: target.folder }, { quiet: true });
        p.order = Math.max(0, ...list.map((x) => x.order)) + 1;
      } else {
        const t = S.pages.get(target.page);
        updatePage(p.id, { folderId: t.folderId || null }, { quiet: true });
        const idx = list.findIndex((x) => x.id === t.id) + (where === 'after' ? 1 : 0);
        list.splice(idx, 0, p);
        list.forEach((x, i) => { x.order = i + 1; });
      }
      normalizeOrder(nb.id);
    }
  }

  function toggleFolder(id) {
    const set = new Set(S.settings.closedFolders || []);
    set.has(id) ? set.delete(id) : set.add(id);
    setSetting('closedFolders', [...set]);
    drawTree();
  }
  async function addFolder() {
    const name = await promptDialog('New section', '', { placeholder: 'e.g. Chapter 3 — Thermodynamics', okLabel: 'Add section' });
    if (!name) return;
    updateNotebook(nb.id, { folders: [...(nb.folders || []), { id: 'f_' + Date.now().toString(36), name }] });
  }
  function folderMenu(anchor, f) {
    const idx = nb.folders.findIndex((x) => x.id === f.id);
    menu(anchor, [
      { label: 'Rename section', icon: 'pencil', run: async () => { const n = await promptDialog('Rename section', f.name); if (n) updateNotebook(nb.id, { folders: nb.folders.map((x) => (x.id === f.id ? { ...x, name: n } : x)) }); } },
      { label: 'Move up', icon: 'chevron-up', disabled: idx === 0, run: () => { const fs = [...nb.folders]; [fs[idx - 1], fs[idx]] = [fs[idx], fs[idx - 1]]; updateNotebook(nb.id, { folders: fs }); } },
      { label: 'Move down', icon: 'chevron-down', disabled: idx === nb.folders.length - 1, run: () => { const fs = [...nb.folders]; [fs[idx + 1], fs[idx]] = [fs[idx], fs[idx + 1]]; updateNotebook(nb.id, { folders: fs }); } },
      { label: 'Flashcards from this section', icon: 'cards', run: () => import('./cards.js').then((m) => m.generateDeckDialog({ notebookId: nb.id, folderId: f.id })) },
      { label: 'Quiz on this section', icon: 'quiz', run: () => import('./quiz.js').then((m) => m.quizSetupDialog({ notebookId: nb.id, folderId: f.id })) },
      { sep: true },
      { label: 'Delete section (keeps pages)', icon: 'trash', danger: true, run: () => {
        pagesOf(nb.id).filter((p) => p.folderId === f.id).forEach((p) => updatePage(p.id, { folderId: null }, { quiet: true }));
        updateNotebook(nb.id, { folders: nb.folders.filter((x) => x.id !== f.id) });
      } },
    ]);
  }
  function addPageMenu(anchor) {
    menu(anchor, [
      { label: 'Blank page', icon: 'file-plus', run: () => newPage() },
      { label: 'From a template', icon: 'template', run: () => templatePicker((tpl) => newPage({ html: tpl.html, paper: tpl.paper, title: tpl.html ? '' : '' })) },
      { label: 'Create notes with AI', icon: 'sparkles', run: () => import('../ai/notes.js').then((m) => m.createNotesDialog({ notebookId: nb.id })) },
      { label: 'Import a PDF as pages', icon: 'file-up', run: () => import('../tools/pdfimport.js').then((m) => m.importPDF(nb.id)) },
    ]);
  }
  function newPage(data = {}) {
    const p = createPage(nb.id, { folderId: data.folderId ?? page?.folderId ?? null, ...data });
    go(`#/nb/${nb.id}/${p.id}`);
    setTimeout(() => titleEl.focus(), 120);
  }
  function pageMenu(anchor, p) {
    menu(anchor, [
      { label: 'Rename', icon: 'pencil', run: async () => { const t = await promptDialog('Rename page', p.title); if (t != null) { updatePage(p.id, { title: t }); if (p.id === page?.id) titleEl.value = t; } } },
      { label: 'Duplicate', icon: 'copy', run: () => { flush(); const c = duplicatePage(p.id); toast('Page duplicated'); go(`#/nb/${nb.id}/${c.id}`); } },
      { label: p.bookmarked ? 'Remove bookmark' : 'Bookmark', icon: 'bookmark', run: () => updatePage(p.id, { bookmarked: !p.bookmarked }) },
      { label: 'Move to section…', icon: 'folder', run: () => moveToSection(p) },
      { label: p.archived ? 'Unarchive' : 'Archive', icon: 'archive', run: () => { updatePage(p.id, { archived: !p.archived }); toast(p.archived ? 'Page archived' : 'Page restored'); } },
      { label: 'Version history', icon: 'history', run: () => { flush(); import('../tools/versions.js').then((m) => m.versionsDialog(p, () => { if (p.id === page?.id) loadPage(S.pages.get(p.id)); })); } },
      { label: 'Export as PDF', icon: 'printer', run: () => { flush(); import('../tools/export.js').then((m) => m.printPages([p], nb)); } },
      { sep: true },
      { label: 'Delete', icon: 'trash', danger: true, run: () => deletePage(p) },
    ]);
  }
  function moveToSection(p) {
    const opts = [{ value: '', label: 'No section' }, ...(nb.folders || []).map((f) => ({ value: f.id, label: f.name }))];
    const sel = select(opts, p.folderId || '', () => {});
    const s = sheet({ title: 'Move page', body: field('Section', sel), actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }), h('button.btn.primary', { type: 'button', text: 'Move', on: { click: () => { updatePage(p.id, { folderId: sel.value || null }); s.close(); } } })] });
  }
  function deletePage(p) {
    const list = pagesOf(nb.id);
    trashPage(p.id);
    toast(`“${p.title || 'Untitled page'}” moved to Recently deleted`, { action: { label: 'Undo', run: () => { restorePage(p.id); go(`#/nb/${nb.id}/${p.id}`); } } });
    if (p.id === page?.id) {
      const rest = list.filter((x) => x.id !== p.id);
      const next = rest[Math.max(0, list.findIndex((x) => x.id === p.id) - 1)] || rest[0];
      if (next) go(`#/nb/${nb.id}/${next.id}`);
      else { const np = createPage(nb.id); go(`#/nb/${nb.id}/${np.id}`); }
    }
  }
  function nbMenu(anchor) {
    menu(anchor, [
      { label: 'Cover & details', icon: 'palette', run: () => notebookDialog(nb) },
      { label: 'Contents page settings', icon: 'list-tree', run: tocDialog },
      { label: nb.favorite ? 'Remove from favorites' : 'Add to favorites', icon: 'star', run: () => updateNotebook(nb.id, { favorite: !nb.favorite }) },
      { sep: true },
      { label: 'Flashcards from this notebook', icon: 'cards', run: () => import('./cards.js').then((m) => m.generateDeckDialog({ notebookId: nb.id })) },
      { label: 'Quiz me on this notebook', icon: 'quiz', run: () => import('./quiz.js').then((m) => m.quizSetupDialog({ notebookId: nb.id })) },
      { label: 'Study guide (AI)', icon: 'grad', run: () => { openAI(); ai?.then((p) => p.runAction('studyGuide', 'notebook')); } },
      { sep: true },
      { label: 'Export notebook as PDF', icon: 'printer', run: () => { flush(); import('../tools/export.js').then((m) => m.printPages(pagesOf(nb.id, { includeArchived: false }), nb)); } },
      { label: 'Import PDF as pages', icon: 'file-up', run: () => import('../tools/pdfimport.js').then((m) => m.importPDF(nb.id)) },
    ]);
  }
  function tocDialog() {
    const title = h('input.field', { type: 'text', value: nb.toc?.title || 'Contents' });
    const showH = h('input', { type: 'checkbox', checked: nb.toc?.showHeadings !== false });
    const hidden = new Set(nb.toc?.hidden || []);
    const list = h('div', { style: { display: 'grid', gap: '2px', maxHeight: '40vh', overflow: 'auto' } }, pagesOf(nb.id).map((p) => h('label.list-row', { style: { minHeight: '44px' } },
      h('input', { type: 'checkbox', checked: !hidden.has(p.id), on: { change: (e) => (e.target.checked ? hidden.delete(p.id) : hidden.add(p.id)) } }), h('span', p.title || 'Untitled page'))));
    const s = sheet({ title: 'Table of contents', body: h('div', field('Title', title), h('label', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' } }, showH, 'Show headings under each page'),
      h('div.form-label', { style: { marginBottom: '6px' } }, 'Pages included (drag pages in the list to reorder)'), list),
    actions: [h('button.btn', { type: 'button', html: ic('list-tree') + '<span>Insert contents on this page</span>', on: { click: () => { save(); s.close(); import('../editor/blocks.js').then((m) => m.insertDataBlock('toc', editor, {})); } } }),
      h('button.btn.primary', { type: 'button', text: 'Save', on: { click: () => { save(); s.close(); } } })] });
    function save() { updateNotebook(nb.id, { toc: { title: title.value || 'Contents', showHeadings: showH.checked, hidden: [...hidden] } }); editorEl.querySelectorAll('[data-type="toc"]').forEach((b) => hydrate(b, editor)); }
  }

  /* ---------------- page meta line (tags, revision) ---------------- */
  const refreshMetaSoon = debounce(() => drawMeta(), 800);
  function drawMeta() {
    if (!page) return;
    metaEl.innerHTML = '';
    const words = (editorEl.innerText || '').trim().split(/\s+/).filter(Boolean).length;
    metaEl.append(h('span', fmtDate(page.createdAt)), h('span', '·'), h('span', `${words} words`));
    for (const t of page.tags || []) metaEl.append(h('button.tag', { type: 'button', title: 'Remove tag', on: { click: () => { updatePage(page.id, { tags: page.tags.filter((x) => x !== t) }, { quiet: true }); drawMeta(); } } }, '#' + t));
    metaEl.append(h('button.tag.add', { type: 'button', on: { click: addTag } }, '+ tag'));
    const rv = page.review?.next;
    metaEl.append(h('button.tag' + (rv ? '' : '.add'), { type: 'button', title: 'Spaced revision for this page', on: { click: (e) => reviewMenu(e.currentTarget) } },
      rv ? (rv <= Date.now() ? 'Revise now' : 'Revise ' + fmtDate(rv, { day: 'numeric', month: 'short' })) : '+ revision'));
  }
  async function addTag() {
    const t = await promptDialog('Add tag', '', { placeholder: 'e.g. exam, chapter-2', okLabel: 'Add' });
    if (!t) return;
    const tags = [...new Set([...(page.tags || []), ...t.split(/[,\s]+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean)])];
    updatePage(page.id, { tags }, { quiet: true });
    drawMeta();
  }
  function reviewMenu(anchor) {
    const steps = [1, 3, 7, 14, 30, 60];
    const cur = page.review;
    menu(anchor, [
      { label: cur ? 'Mark revised — schedule next' : 'Schedule revision (1, 3, 7, 14, 30 days…)', icon: 'repeat', run: () => {
        const step = cur ? Math.min(steps.length - 1, (cur.step ?? -1) + 1) : 0;
        updatePage(page.id, { review: { step, next: Date.now() + steps[step] * 86400000 } }, { quiet: true });
        logActivity('pages', 0); drawMeta();
        toast(`Next revision in ${steps[step]} day${steps[step] === 1 ? '' : 's'}.`);
      } },
      cur ? { label: 'Stop revising this page', icon: 'x', run: () => { updatePage(page.id, { review: null }, { quiet: true }); drawMeta(); } } : null,
    ]);
  }

  /* ---------------- language ---------------- */
  function writingLang() {
    const l = page?.lang || nb.lang || S.settings.writingLang || 'auto';
    return l;
  }
  function applyLang() {
    const l = writingLang();
    editorEl.lang = l === 'auto' ? '' : l;
    titleEl.lang = editorEl.lang;
    langBtn.innerHTML = ic('globe') + `<b>${l === 'auto' ? 'Auto' : l.toUpperCase()}</b>`;
  }
  function langMenu(anchor) {
    const l = writingLang();
    menu(anchor, [
      { heading: 'Writing language' },
      ...LANGS.map((o) => ({ label: o.label, checked: (page?.lang || nb.lang || 'auto') === o.value, run: () => { updatePage(page.id, { lang: o.value === 'auto' ? '' : o.value }, { quiet: true }); applyLang(); spell?.clear(); } })),
      { sep: true },
      { label: 'Use for the whole notebook', icon: 'book', run: () => { updateNotebook(nb.id, { lang: l }, true); updatePage(page.id, { lang: '' }, { quiet: true }); applyLang(); toast('Notebook language updated.'); } },
      { label: S.settings.autocorrect ? 'Autocorrect: on' : 'Autocorrect: off', icon: 'spell', checked: S.settings.autocorrect, run: () => { setSetting('autocorrect', !S.settings.autocorrect); toast('Autocorrect ' + (S.settings.autocorrect ? 'on' : 'off')); } },
      { label: S.settings.liveCheck ? 'Check as I type (AI): on' : 'Check as I type (AI): off', icon: 'sparkles', checked: S.settings.liveCheck, run: () => setSetting('liveCheck', !S.settings.liveCheck) },
      { label: 'Personal dictionary', icon: 'dict', run: () => go('#/settings/writing') },
    ]);
  }

  /* ---------------- pen ---------------- */
  function setPen(on) {
    penMode = on;
    ink.setActive(on);
    pen.classList.toggle('in', on);
    penBtn.setAttribute('aria-pressed', String(on));
    scroller.classList.toggle('drawing', on);
    document.body.classList.toggle('pen-mode', on);
    if (on) { closePopover(); selbar.hide(); editor.deselectBlock(); getSelection().removeAllRanges(); }
  }
  async function convertInk() {
    const png = ink.snapshot();
    if (!png) return toast('Write something first.');
    const m = await import('../ai/notes.js');
    m.handwritingToText(png, editor, { onInserted: (remove) => { if (remove) ink.clear(); setPen(false); } });
  }

  /* ---------------- AI panel ---------------- */
  function openAI() {
    if (!ai) ai = aiMod().then((m) => m.createAIPanel(aiPanel, { nb, getPage: () => page, editor, getNotebook: () => nb }));
    if (!aiPanel.classList.contains('open') && window.innerWidth > 960 && window.innerWidth < 1400 && !view.classList.contains('pages-hidden')) { view.classList.add('pages-hidden'); autoHidPages = true; }
    aiPanel.classList.add('open');
    document.body.classList.add('ai-open');
    aiBtn.setAttribute('aria-pressed', 'true');
    ai.then((p) => p.focus());
    setTimeout(layout, 380);
  }
  let autoHidPages = false;
  function toggleAI() {
    if (aiPanel.classList.contains('open')) {
      aiPanel.classList.remove('open');
      document.body.classList.remove('ai-open');
      aiBtn.setAttribute('aria-pressed', 'false');
      if (autoHidPages) { view.classList.remove('pages-hidden'); autoHidPages = false; }
      setTimeout(layout, 380);
    } else openAI();
  }
  aiPanel.addEventListener('ai-close', () => toggleAI());
  ctx.openAI = openAI;

  function togglePages() {
    if (window.innerWidth <= 960) view.classList.toggle('pages-open');
    else { view.classList.toggle('pages-hidden'); setSetting('pagesHidden', view.classList.contains('pages-hidden')); setTimeout(layout, 380); }
  }

  /* ---------------- more menu ---------------- */
  function moreMenu(anchor) {
    menu(anchor, [
      { label: page.bookmarked ? 'Remove bookmark' : 'Bookmark this page', icon: 'bookmark', run: () => updatePage(page.id, { bookmarked: !page.bookmarked }) },
      { label: 'Add tag', icon: 'tag', run: addTag },
      { label: 'Version history', icon: 'history', run: () => { flush(); import('../tools/versions.js').then((m) => m.versionsDialog(page, () => loadPage(S.pages.get(page.id)))); } },
      { label: 'Find connections & visuals (AI)', icon: 'sparkles', run: () => ctx.visualize() },
      { sep: true },
      { heading: 'Zoom' },
      ...[['fit', 'Fit to screen'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%']].map(([v, l]) => ({ label: l, checked: String(zoom) === v, run: () => { zoom = v; setSetting('zoom', v); layout(); } })),
      { sep: true },
      { label: 'Export page as PDF', icon: 'printer', hint: prettyCombo(bindingFor('print')), run: () => { flush(); import('../tools/export.js').then((m) => m.printPages([page], nb, { ink: ink.printImage() })); } },
      { label: 'Export page as Markdown', icon: 'download', run: () => { flush(); import('../tools/export.js').then((m) => m.exportMarkdown(page)); } },
      { label: 'Export page as HTML', icon: 'download', run: () => { flush(); import('../tools/export.js').then((m) => m.exportHTML(page, nb)); } },
      { sep: true },
      { label: 'Duplicate page', icon: 'copy', run: () => { flush(); const c = duplicatePage(page.id); go(`#/nb/${nb.id}/${c.id}`); } },
      { label: 'Delete page', icon: 'trash', danger: true, run: () => deletePage(page) },
    ]);
  }

  async function applyTemplate(tpl) {
    if (editor.getHTML() && tpl.html && !(await confirmDialog('Add the template’s content below what is already on this page?', { okLabel: 'Add it', title: 'Apply template' }))) return;
    updatePage(page.id, { paper: tpl.paper ? { ...tpl.paper } : page.paper }, { quiet: true });
    applyPaper(sheetEl, effectivePaper(page, nb));
    if (tpl.html) { editor.record(); editorEl.insertAdjacentHTML('beforeend', tpl.html); editor.normalize(); editor.hydrateAll(); fillCalloutIcons(); editor.changed(); }
  }
  function fillCalloutIcons() {
    editorEl.querySelectorAll('.callout > .co-ic').forEach((c) => { if (!c.firstElementChild) c.innerHTML = ic({ important: 'alert', tip: 'bulb', example: 'flask', warning: 'alert', key: 'star' }[c.parentElement.dataset.kind] || 'info'); });
  }

  /* ---------------- load / save ---------------- */
  const saveSoon = debounce(() => save(), 600);
  function save() {
    if (!page || !dirty) return;
    dirty = false;
    const html = editor.getHTML();
    updatePage(page.id, { html, title: titleEl.value.trim() }, { quiet: true });
    logActivity('edits');
    snapshotVersion(page);
    const row = tree.querySelector(`.np-page[data-id="${page.id}"] b`);
    if (row) row.textContent = titleEl.value.trim() || 'Untitled page';
    if (row && headingsChanged()) drawTree();
  }
  let lastHeads = '';
  function headingsChanged() { const s = JSON.stringify(headingsOf(page.html)); const c = s !== lastHeads; lastHeads = s; return c; }
  function flush() { saveSoon.cancel(); save(); }

  function loadPage(p) {
    if (page && page.id !== p.id) { flush(); snapshotVersion(page, true); }
    page = p;
    touchPage(p.id);
    titleEl.value = p.title || '';
    autoSizeTitle();
    editor.load(p.html);
    fillCalloutIcons();
    ink.load(p.ink);
    applyPaper(sheetEl, effectivePaper(p, nb));
    sheetEl.dataset.kind = p.kind || (p.html?.includes('data-pdf-text') ? 'pdf' : '');
    applyLang();
    growSheet();
    drawMeta();
    lastHeads = JSON.stringify(headingsOf(p.html));
    drawTree();
    scroller.scrollTop = 0;
    dirty = false;
    spell?.clear();
    layout();
    const active = tree.querySelector('.np-page.active');
    active?.scrollIntoView({ block: 'nearest' });
    if (window.innerWidth <= 960) view.classList.remove('pages-open');
    if (!p.html && !p.title && !isTouch()) setTimeout(() => titleEl.focus(), 80);
  }
  function autoSizeTitle() { titleEl.style.height = 'auto'; titleEl.style.height = titleEl.scrollHeight + 'px'; }
  titleEl.addEventListener('input', () => { autoSizeTitle(); dirty = true; saveSoon(); });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const first = editorEl.firstElementChild; editorEl.focus(); if (first) { const r = document.createRange(); r.selectNodeContents(first); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); } }
  });

  function pick(params) {
    const all = pagesOf(nb.id);
    let p = params.pageId && S.pages.get(params.pageId);
    if (!p || p.notebookId !== nb.id || p.deletedAt) p = [...all].sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0))[0];
    if (!p) p = createPage(nb.id);
    if (params.pageId !== p.id) history.replaceState(null, '', `#/nb/${nb.id}/${p.id}`);
    return p;
  }

  /* ---------------- subscriptions & shortcuts ---------------- */
  offs.push(on('notebooks', () => { nb = S.notebooks.get(nb.id); if (!nb || nb.deletedAt) return go('#/'); drawHead(); drawTree(); applyPaper(sheetEl, effectivePaper(page, nb)); }));
  offs.push(on('pages', (d) => { if (!d || d.notebookId === nb.id || !d.notebookId) { if (page && S.pages.get(page.id)?.deletedAt) return; drawHead(); drawTree(); } }));
  offs.push(on('settings', ({ path }) => { if (path === 'theme' || path === 'paperFollowsTheme') setTimeout(() => ink.resize(), 60); }));
  offs.push(onShortcut('newPage', () => newPage()));
  offs.push(onShortcut('togglePen', () => setPen(!penMode)));
  offs.push(onShortcut('toggleAI', () => toggleAI()));
  offs.push(onShortcut('togglePages', () => togglePages()));
  offs.push(onShortcut('print', () => { flush(); import('../tools/export.js').then((m) => m.printPages([page], nb, { ink: ink.printImage() })); }));
  offs.push(onShortcut('h1', () => editor.setBlockStyle('h1')));
  offs.push(onShortcut('h2', () => editor.setBlockStyle('h2')));
  offs.push(onShortcut('h3', () => editor.setBlockStyle('h3')));
  offs.push(onShortcut('p', () => editor.setBlockStyle('p')));
  offs.push(onShortcut('checklist', () => editor.setBlockStyle('check')));
  offs.push(onShortcut('highlight', () => editor.wrapStyle({ 'background-color': 'rgba(247,224,122,.6)', 'border-radius': '.2em', padding: '0 .1em' })));
  offs.push(onShortcut('proofread', () => spell?.checkPage()));
  const onSelChange = () => {
    const id = editor.range() ? editor.currentStyleId() : null;
    if (id && styleSel.value !== id) styleSel.value = id;
  };
  document.addEventListener('selectionchange', onSelChange);
  const onHide = () => { if (document.visibilityState === 'hidden') { flush(); if (page) snapshotVersion(page, true); } };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
  scroller.addEventListener('pointerdown', (e) => { if (!e.target.closest('.page-sheet')) { editor.deselectBlock(); } });
  view.addEventListener('click', (e) => { if (window.innerWidth <= 960 && view.classList.contains('pages-open') && !e.target.closest('.nb-pages') && !e.target.closest('[aria-label="Pages"]')) view.classList.remove('pages-open'); });

  drawHead();
  loadPage(pick(params));

  const cleanupFn = async () => {
    flush();
    if (page) await snapshotVersion(page, dirty);
    offs.forEach((f) => f());
    document.removeEventListener('selectionchange', onSelChange);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
    selbar.destroy();
    editor.destroy();
    ink.destroy();
    ro.disconnect();
    pill._off?.();
    spell?.destroy();
    ai?.then((p) => p.destroy());
    document.body.classList.remove('ai-open', 'pen-mode');
    if (!hadRail) app.classList.remove('rail');
  };
  cleanupFn.update = (p) => {
    if (p.id !== nb.id) return false;
    const next = pick(p);
    if (next.id !== page?.id) loadPage(next);
    return true;
  };
  return cleanupFn;
}
