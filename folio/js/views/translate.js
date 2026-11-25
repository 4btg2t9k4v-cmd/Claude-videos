import { h } from '../util.js';
import { menuButton } from '../main.js';
import { translatorPanel } from '../tools/translator.js';

export async function render(main) {
  const view = h('div.view');
  const pad = h('div.view-pad', { style: { maxWidth: '760px' } });
  view.append(pad);
  main.append(view);
  pad.append(h('div.topbar', menuButton(), h('h1', 'Translate & define')),
    h('p.muted', { style: { marginTop: '-12px' } }, 'Translations by Gemini (or MyMemory without a key). Definitions from the Free Dictionary API and Wiktionary. Select a word in any page for the same tools in a pop-up.'),
    h('div.panel', { style: { padding: '6px' } }, translatorPanel({ compact: false })));
}
