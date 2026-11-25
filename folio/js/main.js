import { S, initStore, on, notebooks, dueCards, setSetting, isSaving } from './store.js';
import { $, h, ic, esc, toast, closeTopSheet, closePopover } from './util.js';
import { installShortcuts, onShortcut, prettyCombo, bindingFor } from './shortcuts.js';
import { initSchool } from './school/store.js';

/* ---------------- theme ---------------- */
export const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'navy', label: 'Navy' },
  { id: 'forest', label: 'Forest' },
  { id: 'burgundy', label: 'Burgundy' },
];
export function applyTheme(theme = S.settings.theme) {
  const root = document.documentElement;
  root.classList.add('theming');
  root.dataset.theme = theme;
  const lightPaper = !S.settings.paperFollowsTheme && theme !== 'light';
  if (lightPaper) root.dataset.paper = 'light'; else delete root.dataset.paper;
  try { localStorage.setItem('folio-theme', theme); localStorage.setItem('folio-paper', lightPaper ? 'light' : ''); } catch { /* private mode */ }
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg);
}

/* ---------------- router ---------------- */
const routes = [
  [/^#?\/?$/, () => import('./views/home.js'), () => ({})],
  [/^#\/school$/, () => import('./views/school.js'), () => ({})],
  [/^#\/notebooks$/, () => import('./views/library.js'), () => ({})],
  [/^#\/nb\/([^/]+)(?:\/([^/]+))?$/, () => import('./views/notebook.js'), (m) => ({ id: m[1], pageId: m[2] })],
  [/^#\/cards$/, () => import('./views/cards.js'), () => ({ mode: 'list' })],
  [/^#\/cards\/([^/]+)$/, () => import('./views/cards.js'), (m) => ({ mode: 'deck', id: m[1] })],
  [/^#\/study\/([^/]+)$/, () => import('./views/cards.js'), (m) => ({ mode: 'study', id: m[1] })],
  [/^#\/quiz$/, () => import('./views/quiz.js'), () => ({ mode: 'list' })],
  [/^#\/quiz\/([^/]+)$/, () => import('./views/quiz.js'), (m) => ({ mode: 'take', id: m[1] })],
  [/^#\/translate$/, () => import('./views/translate.js'), () => ({})],
  [/^#\/progress$/, () => import('./views/progress.js'), () => ({})],
  [/^#\/trash$/, () => import('./views/trash.js'), () => ({})],
  [/^#\/settings(?:\/(\w+))?$/, () => import('./views/settings.js'), (m) => ({ section: m[1] })],
];

let cleanup = null;
let routeSeq = 0;
export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function route() {
  const seq = ++routeSeq;
  const hash = location.hash || '#/';
  closePopover();
  while (closeTopSheet()) { /* close all */ }
  setDrawer(false);
  const main = $('#main');
  for (const [re, load, params] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    try {
      const mod = await load();
      if (seq !== routeSeq) return;
      if (cleanup?.update && cleanup.module === mod && (await cleanup.update(params(m)))) { renderSidebar(); return; }
      if (cleanup) { try { await cleanup(); } catch (e) { console.error(e); } cleanup = null; }
      main.innerHTML = '';
      cleanup = (await mod.render(main, params(m))) || null;
      if (cleanup) cleanup.module = mod;
    } catch (e) {
      console.error(e);
      main.innerHTML = '';
      main.append(h('div.view', h('div.view-pad', h('div.empty', h('h3', 'Something went wrong'), h('p', String(e.message || e)), h('a.btn', { href: '#/' }, 'Go home')))));
    }
    renderSidebar();
    return;
  }
  go('#/');
}

/* ---------------- sidebar ---------------- */
export function setDrawer(open) {
  $('#app').classList.toggle('drawer', open);
  $('#scrim').classList.toggle('on', open && window.innerWidth <= 960);
}
export function toggleSidebar() {
  if (window.innerWidth <= 960) setDrawer(!$('#app').classList.contains('drawer'));
  else $('#app').classList.toggle('rail');
}
export function menuButton() {
  return h('button.icon-btn.menu-toggle', { type: 'button', title: 'Menu', 'aria-label': 'Open menu', html: ic('panel-left'), on: { click: () => setDrawer(true) } });
}

function renderSidebar() {
  const sb = $('#sidebar');
  const hash = location.hash || '#/';
  const due = dueCards().length;
  const item = (href, icon, label, extra) => h('a.sb-item' + (hash === href || (href !== '#/' && hash.startsWith(href + '/')) ? '.active' : ''), { href }, h('span', { html: ic(icon) }), h('span', label), extra || null);
  const nbs = notebooks();
  sb.innerHTML = '';
  sb.append(
    h('div.sb-brand', h('div.sb-mark', 'f'), h('div.sb-name', 'Folio'),
      h('button.icon-btn.sm', { type: 'button', title: 'Hide sidebar', 'aria-label': 'Hide sidebar', html: ic('panel-left'), on: { click: toggleSidebar } })),
    h('div.sb-scroll',
      item('#/', 'home', 'Home'),
      item('#/school', 'grad', 'School'),
      h('button.sb-item', { type: 'button', on: { click: () => openSearch() } }, h('span', { html: ic('search') }), h('span', 'Search'), h('kbd', prettyCombo(bindingFor('search')))),
      item('#/notebooks', 'library', 'All notebooks'),
      item('#/cards', 'cards', 'Flashcards', due ? h('span.count', String(due)) : null),
      item('#/quiz', 'quiz', 'Quizzes'),
      item('#/translate', 'languages', 'Translate & define'),
      item('#/progress', 'chart', 'Progress'),
      h('div.sb-section', h('span', 'Notebooks'),
        h('button.icon-btn.sm', { type: 'button', title: 'New notebook', 'aria-label': 'New notebook', html: ic('plus'), on: { click: () => import('./views/nbdialogs.js').then((m) => m.notebookDialog()) } })),
      nbs.length ? nbs.map((n) => h('a.sb-item' + (hash.startsWith('#/nb/' + n.id) ? '.active' : ''), { href: '#/nb/' + n.id },
        h('i.sb-dot', { style: { background: n.color } }), h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, n.title)))
        : h('p.faint', { style: { fontSize: '13px', padding: '0 10px' } }, 'Your notebooks will appear here.'),
    ),
    h('div.sb-foot',
      h('button.sb-item', { type: 'button', on: { click: () => import('./tools/timer.js').then((m) => m.toggleTimer()) } }, h('span', { html: ic('timer') }), h('span', 'Study timer')),
      item('#/trash', 'trash', 'Recently deleted'),
      item('#/settings', 'settings', 'Settings')),
  );
}

export function openSearch() { import('./tools/palette.js').then((m) => m.openPalette()); }

/* ---------------- save indicator (global) ---------------- */
export function savePill() {
  const pill = h('span.save-pill', { title: 'Everything is saved on this device' }, h('i'), h('span', 'Saved'));
  const set = ({ state }) => {
    pill.classList.toggle('saving', state === 'saving');
    pill.classList.toggle('error', state === 'error');
    pill.lastChild.textContent = state === 'saving' ? 'Saving…' : state === 'error' ? 'Not saved' : 'Saved';
    pill.title = state === 'error' ? 'Saving failed — storage may be full. Export a backup from Settings.' : 'Everything is saved on this device';
  };
  const off = on('save', set);
  pill._off = off;
  return pill;
}

/* ---------------- boot ---------------- */
async function boot() {
  try {
    await initStore();
    await initSchool();
  } catch (e) {
    document.body.innerHTML = `<div class="empty" style="height:100vh;align-content:center"><h3>Folio can’t open its storage</h3><p>${esc(e.message || e)}. Private browsing blocks storage on some devices.</p></div>`;
    return;
  }
  applyTheme();
  installShortcuts();
  onShortcut('search', openSearch);
  onShortcut('home', () => go('#/'));
  onShortcut('toggleSidebar', toggleSidebar);
  onShortcut('newNotebook', () => import('./views/nbdialogs.js').then((m) => m.notebookDialog()));
  onShortcut('translator', () => import('./tools/translator.js').then((m) => m.toggleTranslator()));
  onShortcut('timer', () => import('./tools/timer.js').then((m) => m.toggleTimer()));
  $('#scrim').addEventListener('click', () => setDrawer(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePopover(); closeTopSheet(); } });
  on('notebooks', renderSidebar);
  on('decks', renderSidebar);
  on('settings', ({ path }) => { if (path === 'theme' || path === 'paperFollowsTheme') applyTheme(); });
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (isSaving()) { e.preventDefault(); e.returnValue = ''; } });
  import('./tools/translator.js').then((m) => m.mountFab());
  import('./tools/timer.js').then((m) => m.restoreTimer());
  await route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
  if (!S.settings.onboarded) {
    setSetting('onboarded', true);
  }
  setInterval(() => import('./tools/reminders.js').then((m) => m.checkReminders()), 60000);
  import('./tools/reminders.js').then((m) => m.checkReminders());
}

window.addEventListener('error', (e) => { if (e.message?.includes('ResizeObserver')) return; console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  if (err?.code === 'cancelled') return;
  console.error(err);
  if (err?.name === 'QuotaExceededError') toast('Storage is full. Export a backup and delete unused images.', { kind: 'error', ms: 7000 });
});

boot();
