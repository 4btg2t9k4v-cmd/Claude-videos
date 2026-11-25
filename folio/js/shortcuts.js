import { S } from './store.js';
import { isMac } from './util.js';

export const SHORTCUTS = [
  { id: 'search', label: 'Search everything', def: 'Mod+K' },
  { id: 'newPage', label: 'New page', def: 'Alt+N' },
  { id: 'newNotebook', label: 'New notebook', def: 'Alt+Shift+N' },
  { id: 'toggleAI', label: 'Open / close AI assistant', def: 'Mod+J' },
  { id: 'togglePen', label: 'Handwriting mode', def: 'Alt+D' },
  { id: 'toggleSidebar', label: 'Show / hide sidebar', def: 'Mod+\\' },
  { id: 'togglePages', label: 'Show / hide page list', def: 'Mod+Shift+\\' },
  { id: 'translator', label: 'Translator & dictionary', def: 'Alt+T' },
  { id: 'timer', label: 'Study timer', def: 'Alt+M' },
  { id: 'home', label: 'Go home', def: 'Alt+H' },
  { id: 'h1', label: 'Main title', def: 'Mod+Alt+1' },
  { id: 'h2', label: 'Heading', def: 'Mod+Alt+2' },
  { id: 'h3', label: 'Subheading', def: 'Mod+Alt+3' },
  { id: 'p', label: 'Paragraph', def: 'Mod+Alt+0' },
  { id: 'checklist', label: 'Checklist', def: 'Mod+Shift+C' },
  { id: 'highlight', label: 'Highlight selection', def: 'Mod+Shift+H' },
  { id: 'proofread', label: 'Check spelling & grammar', def: 'Mod+Shift+;' },
  { id: 'print', label: 'Export page as PDF', def: 'Mod+P' },
];

export function comboOf(e) {
  const parts = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (isMac && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let k = e.key;
  if (e.code && /^(Digit|Key)/.test(e.code)) k = e.code.replace(/^(Digit|Key)/, '');
  else if (e.code === 'Backslash') k = '\\';
  else if (e.code === 'Semicolon') k = ';';
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return parts.join('+');
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join('+');
}

export function bindingFor(id) {
  return S.settings.shortcuts[id] || SHORTCUTS.find((s) => s.id === id)?.def || '';
}

export function prettyCombo(c) {
  if (!c) return '';
  return c.split('+').map((p) => ({ Mod: isMac ? '⌘' : 'Ctrl', Alt: isMac ? '⌥' : 'Alt', Shift: '⇧', Ctrl: '⌃' }[p] || p)).join(isMac ? '' : '+');
}

const handlers = {};
export function onShortcut(id, fn) { (handlers[id] ||= []).push(fn); return () => { handlers[id] = handlers[id].filter((f) => f !== fn); }; }

export function installShortcuts() {
  window.addEventListener('keydown', (e) => {
    const c = comboOf(e);
    if (!c || !/\+/.test(c) && !/^F\d/.test(c)) return; // require a modifier
    for (const s of SHORTCUTS) {
      if (bindingFor(s.id) === c && handlers[s.id]?.length) {
        e.preventDefault();
        handlers[s.id].at(-1)(e);
        return;
      }
    }
  }, true);
}
