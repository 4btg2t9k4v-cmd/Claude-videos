import { S, setSetting, exportAll, importAll, saveKV } from '../store.js';
import { h, ic, iconBtn, toast, confirmDialog, downloadFile, pickFile, readFileAs, select, segmented, field, esc } from '../util.js';
import { menuButton, THEMES, applyTheme } from '../main.js';
import { connectKey, listModels, generate } from '../ai/gemini.js';
import { SHORTCUTS, bindingFor, comboOf, prettyCombo } from '../shortcuts.js';
import { LANGS } from './nbdialogs.js';
import { getAuth, schoolData } from '../school/store.js';
import { disconnectPronote } from '../school/pronote.js';
import { disconnectClassroom, isClassroomSetUp } from '../school/classroom.js';
import { GOOGLE_CLIENT_ID } from '../school/config.js';

/** Settings → School connections: who is connected, disconnect, and the Google client ID for Classroom. */
function schoolGroup(row) {
  const host = h('div.set-card');
  const draw = () => {
    const a = getAuth();
    const d = schoolData();
    host.innerHTML = '';
    const p = d.pronote?.student;
    host.append(
      row('Pronote', a.pronote ? `Connected${p ? ' as ' + p.name : ''}${a.pronote.password ? ' · stays signed in on this device' : ''}` : 'Not connected',
        a.pronote
          ? h('button.btn.sm', { type: 'button', text: 'Disconnect', on: { click: async () => { if (await confirmDialog('Disconnect Pronote? Your homework and grades will be removed from this device.', { okLabel: 'Disconnect', danger: true })) { disconnectPronote(); setTimeout(draw, 50); } } } })
          : h('a.btn.sm', { href: '#/school' }, 'Connect')),
      row('Google Classroom', a.classroom ? 'Connected' : isClassroomSetUp() ? 'Not connected' : 'Not available until a Google client ID is added below',
        a.classroom
          ? h('button.btn.sm', { type: 'button', text: 'Disconnect', on: { click: async () => { if (await confirmDialog('Disconnect Google Classroom?', { okLabel: 'Disconnect', danger: true })) { disconnectClassroom(); setTimeout(draw, 50); } } } })
          : isClassroomSetUp() ? h('a.btn.sm', { href: '#/school' }, 'Connect') : null),
      row('Google client ID (developer)', 'Needed once per copy of the app for Google Classroom. See SCHOOL.md.',
        h('input.field', { type: 'text', value: S.settings.school?.googleClientId || '', placeholder: GOOGLE_CLIENT_ID || '….apps.googleusercontent.com', style: { maxWidth: '300px' }, on: { change: (e) => { setSetting('school.googleClientId', e.target.value.trim()); draw(); } } })),
    );
  };
  draw();
  return h('section.set-group', { id: 'school' }, h('h2', 'School connections'),
    h('p.muted', { style: { marginTop: '-6px' } }, 'Your school data stays on this device. Pronote requests pass through the app’s relay because browsers can’t reach Pronote directly; it stores nothing.'),
    host);
}

const THEME_PREVIEW = {
  light: ['#F3EFE7', '#FAF7F1', '#FFFDF7', '#33506E'],
  dark: ['#141415', '#1C1C1E', '#212123', '#CDB78A'],
  navy: ['#0C1726', '#112035', '#142640', '#8DB4E8'],
  forest: ['#101C17', '#15251E', '#192C23', '#A9C6A2'],
  burgundy: ['#2A1015', '#36161D', '#F6EFE5', '#E3B5A8'],
};

export async function render(main, { section } = {}) {
  const view = h('div.view');
  const pad = h('div.view-pad.set-wrap');
  view.append(pad);
  main.append(view);
  const sw = (checked, onChange) => h('label.switch', h('input', { type: 'checkbox', checked, on: { change: (e) => onChange(e.target.checked) } }), h('span'));
  const row = (title, sub, control) => h('div.set-row', h('div.sr-t', h('b', title), sub ? h('span', sub) : null), control);

  /* Appearance */
  const themes = h('div.theme-picks', THEMES.map((t) => {
    const [bg, sf, paper, acc] = THEME_PREVIEW[t.id];
    return h('button.theme-pick', { type: 'button', 'aria-pressed': String(S.settings.theme === t.id), on: { click: (e) => { setSetting('theme', t.id); applyTheme(); themes.querySelectorAll('.theme-pick').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } } },
      h('span.tp-prev', { style: { background: bg } },
        h('i', { style: { left: 0, top: 0, bottom: 0, width: '26%', background: sf, borderRadius: 0 } }),
        h('i', { style: { left: '36%', top: '16%', right: '10%', bottom: 0, background: paper, borderRadius: '4px 4px 0 0' } }),
        h('i', { style: { left: '6%', top: '14%', width: '14%', height: '8%', background: acc } }),
        h('i', { style: { left: '44%', top: '30%', width: '30%', height: '5%', background: acc, opacity: '.7' } })),
      t.label);
  }));

  /* AI */
  const keyIn = h('input.field', { type: 'password', placeholder: 'Paste your Gemini API key (starts with AIza…)', value: S.settings.ai.key ? '••••••••••••••••' + S.settings.ai.key.slice(-4) : '', autocomplete: 'off', spellcheck: false });
  keyIn.addEventListener('focus', () => { if (keyIn.value.startsWith('••')) keyIn.value = ''; });
  const aiStatus = h('div');
  const modelHost = h('div');
  const drawModels = () => {
    modelHost.innerHTML = '';
    const ms = S.settings.ai.models || [];
    if (!ms.length) return;
    modelHost.append(field('Model', select(ms.map((m) => ({ value: m.id, label: `${m.label} (${m.id})` })), S.settings.ai.model, (v) => { setSetting('ai.model', v); toast('Model changed.'); }),
      '“Flash” models are fast and have generous free limits. “Pro” models think harder but allow fewer free requests per day.'));
  };
  const setStatus = (ok, msg) => { aiStatus.innerHTML = ''; aiStatus.append(h('p', { style: { margin: '8px 0 0', color: ok ? 'var(--ok)' : 'var(--danger)', fontWeight: 600, fontSize: '14px' } }, msg)); };
  const connect = h('button.btn.primary', { type: 'button', text: S.settings.ai.key ? 'Update key' : 'Connect', on: { click: async () => {
    const k = keyIn.value.trim();
    if (!k || k.startsWith('••')) return keyIn.focus();
    connect.disabled = true;
    try {
      const ms = await connectKey(k);
      keyIn.value = '••••••••••••••••' + k.slice(-4);
      setStatus(true, `Connected — ${ms.length} models available.`);
      drawModels();
      connect.textContent = 'Update key';
    } catch (e) { setStatus(false, e.message); }
    connect.disabled = false;
  } } });
  const test = h('button.btn', { type: 'button', text: 'Test', on: { click: async () => {
    test.disabled = true;
    try { const { text } = await generate({ prompt: 'Reply with exactly: Ready to study.', temperature: 0 }); setStatus(true, `Gemini says: “${text.trim().slice(0, 80)}”`); }
    catch (e) { setStatus(false, e.message); }
    test.disabled = false;
  } } });
  const remove = h('button.btn.ghost', { type: 'button', text: 'Remove key', on: { click: async () => { if (await confirmDialog('Remove your Gemini key from this device? AI features will stop working until you add one again.', { okLabel: 'Remove' })) { setSetting('ai.key', ''); setSetting('ai.models', []); keyIn.value = ''; modelHost.innerHTML = ''; setStatus(false, 'Key removed.'); } } } });
  drawModels();

  /* Shortcuts */
  const kbd = h('div.set-card');
  const drawKbd = () => {
    kbd.innerHTML = '';
    for (const s of SHORTCUTS) {
      const inp = h('input.field.sm.kbd-input', { type: 'text', readOnly: true, value: prettyCombo(bindingFor(s.id)), 'aria-label': 'Shortcut for ' + s.label });
      inp.addEventListener('keydown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') { inp.blur(); return; }
        if (e.key === 'Backspace') { setSetting('shortcuts', { ...S.settings.shortcuts, [s.id]: '' }); inp.value = ''; return; }
        const c = comboOf(e);
        if (!c.includes('+') || /\+(Shift|Alt|Mod|Ctrl)$/.test(c) || ['Mod', 'Alt', 'Shift'].includes(c)) return;
        const clash = SHORTCUTS.find((x) => x.id !== s.id && bindingFor(x.id) === c);
        if (clash) { toast(`${prettyCombo(c)} is already used for “${clash.label}”.`); return; }
        setSetting('shortcuts', { ...S.settings.shortcuts, [s.id]: c });
        inp.value = prettyCombo(c);
        inp.blur();
      });
      kbd.append(h('div.kbd-row', h('span', s.label), inp, iconBtn('rotate-ccw', 'Reset to default', () => { const sc = { ...S.settings.shortcuts }; delete sc[s.id]; setSetting('shortcuts', sc); drawKbd(); }, 'sm')));
    }
  };
  drawKbd();

  /* Personal dictionary */
  const dict = h('div', { style: { padding: '14px 18px' } });
  const drawDict = () => {
    dict.innerHTML = '';
    dict.append(S.personalDict.length ? h('div.chips', S.personalDict.map((w) => h('button.chip', { type: 'button', title: 'Remove', on: { click: () => { S.personalDict = S.personalDict.filter((x) => x !== w); saveKV('personalDict'); drawDict(); } } }, w, h('span', { html: ic('x') })))) : h('p.muted', { style: { margin: 0 } }, 'Words you add from the spelling menu appear here.'));
  };
  drawDict();

  /* Storage */
  const storageInfo = h('span', 'Checking…');
  navigator.storage?.estimate?.().then(async (e) => {
    const persisted = await navigator.storage.persisted?.();
    storageInfo.textContent = `${(e.usage / 1048576).toFixed(1)} MB used${e.quota ? ` of ${(e.quota / 1073741824).toFixed(1)} GB available` : ''}${persisted ? ' · protected from automatic clean-up' : ''}`;
  }).catch(() => { storageInfo.textContent = 'Stored on this device.'; });

  const nameIn = h('input.field', { type: 'text', value: S.settings.name, placeholder: 'Your first name', style: { maxWidth: '220px' }, on: { change: (e) => setSetting('name', e.target.value.trim()) } });

  pad.append(
    h('div.topbar', menuButton(), h('h1', 'Settings')),
    h('section.set-group', { id: 'appearance' }, h('h2', 'Appearance'), h('div.set-card', themes,
      row('Paper in dark themes', 'Keep pages cream-white even in Dark, Navy, Forest and Burgundy.', sw(!S.settings.paperFollowsTheme, (v) => { setSetting('paperFollowsTheme', !v); applyTheme(); })),
      row('Your name', 'Used in the greeting on the home screen.', nameIn),
      row('Translator look', 'Match the theme, tint it, or use paper colours.', segmented([{ value: 'theme', label: 'Theme' }, { value: 'accent', label: 'Tinted' }, { value: 'paper', label: 'Paper' }], S.settings.translator.tint || 'theme', (v) => setSetting('translator.tint', v))))),
    h('section.set-group', { id: 'ai' }, h('h2', 'AI (Google Gemini)'), h('div.set-card', { style: { padding: '18px' } },
      h('p', { style: { marginTop: 0 } }, 'Folio’s AI runs on Google Gemini using your own free API key. The key is stored only on this device and is sent only to Google.'),
      h('ol', { style: { margin: '0 0 16px', paddingLeft: '20px', color: 'var(--text-2)', fontSize: '14.5px', lineHeight: 1.7 } },
        h('li', 'Open ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener noreferrer' }, 'aistudio.google.com/apikey'), ' and sign in with a Google account.'),
        h('li', 'Tap “Create API key”, then copy it.'),
        h('li', 'Paste it below and tap Connect.')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, h('div', { style: { flex: '1 1 260px' } }, keyIn), connect, S.settings.ai.key ? test : null, S.settings.ai.key ? remove : null),
      aiStatus, h('div', { style: { marginTop: '14px' } }, modelHost),
      h('p.faint', { style: { fontSize: '12.5px', marginBottom: 0 } }, 'On Google’s free tier, requests may be used by Google to improve its products. Avoid sending anything private. Without a key, notes, handwriting, tables and the dictionary still work; translation falls back to MyMemory.'))),
    schoolGroup(row),
    h('section.set-group', { id: 'writing' }, h('h2', 'Writing & language'), h('div.set-card',
      row('Default writing language', 'Each notebook and page can override this.', select(LANGS, S.settings.writingLang, (v) => setSetting('writingLang', v), 'sm')),
      row('Autocorrect while typing', 'Fixes common misspellings and missing accents in English, Arabic, Spanish and French.', sw(S.settings.autocorrect, (v) => setSetting('autocorrect', v))),
      row('Check as I type (AI)', 'Underlines mistakes in the paragraph you are writing, a moment after you pause. Uses Gemini requests.', sw(S.settings.liveCheck, (v) => setSetting('liveCheck', v))),
      h('div.set-row', { style: { display: 'block' } }, h('div.sr-t', h('b', 'Personal dictionary'), h('span', 'Words the spell checker will never flag. Tap to remove.'))), dict)),
    h('section.set-group', { id: 'pencil' }, h('h2', 'Apple Pencil & handwriting'), h('div.set-card',
      row('Pencil always writes', 'Writing with Apple Pencil draws ink even when you are in typing mode.', sw(S.settings.pencilAlwaysDraws !== false, (v) => setSetting('pencilAlwaysDraws', v))),
      row('Only Pencil draws', 'In handwriting mode, fingers scroll instead of drawing (palm-friendly).', sw(S.settings.pencilOnly, (v) => setSetting('pencilOnly', v))))),
    h('section.set-group', { id: 'study' }, h('h2', 'Study'), h('div.set-card',
      row('Focus length', 'Minutes per focus session in the study timer.', h('input.field.sm', { type: 'number', min: 5, max: 120, value: S.settings.timer.focus, style: { width: '90px' }, on: { change: (e) => setSetting('timer.focus', Math.max(5, +e.target.value || 25)) } })),
      row('Short break', '', h('input.field.sm', { type: 'number', min: 1, max: 30, value: S.settings.timer.short, style: { width: '90px' }, on: { change: (e) => setSetting('timer.short', Math.max(1, +e.target.value || 5)) } })),
      row('Long break', 'After every fourth focus session.', h('input.field.sm', { type: 'number', min: 5, max: 60, value: S.settings.timer.long, style: { width: '90px' }, on: { change: (e) => setSetting('timer.long', Math.max(5, +e.target.value || 15)) } })),
      row('Shuffle flashcards', 'Study due cards in random order.', sw(!!S.settings.studyShuffle, (v) => setSetting('studyShuffle', v))))),
    h('section.set-group', { id: 'shortcuts' }, h('h2', 'Keyboard shortcuts'), h('p.muted', { style: { marginTop: '-6px' } }, 'Tap a shortcut and press the new key combination. Backspace clears it.'), kbd),
    h('section.set-group', { id: 'data' }, h('h2', 'Your data'), h('div.set-card',
      row('Storage', storageInfo, null),
      row('Back up everything', 'Saves one file with all notebooks, pages, images, flashcards, quizzes, templates and settings. Keep it in iCloud Drive or Files.', h('button.btn', { type: 'button', html: ic('download') + '<span>Back up</span>', on: { click: backup } })),
      row('Restore from a backup', 'Adds the backup’s contents to this device (existing items with the same ID are replaced).', h('button.btn', { type: 'button', html: ic('upload') + '<span>Restore</span>', on: { click: restore } })),
      row('Last backup', S.settings.lastBackup ? new Date(S.settings.lastBackup).toLocaleString() : 'Never', null))),
    h('section.set-group', h('h2', 'Install on your iPad'), h('div.set-card', { style: { padding: '18px' } },
      h('p', { style: { margin: 0, color: 'var(--text-2)' } }, 'In Safari, tap the Share button, then “Add to Home Screen”. Folio then opens full screen, works offline, and iPadOS keeps its storage safe from automatic clean-up.'))),
  );
  if (section) setTimeout(() => pad.querySelector('#' + section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);

  async function backup() {
    const data = await exportAll();
    const name = `folio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(name, JSON.stringify(data), 'application/json');
    setSetting('lastBackup', Date.now());
    toast('Backup saved as ' + name);
  }
  async function restore() {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const data = JSON.parse(await readFileAs(f, 'text'));
      const counts = `${data.notebooks?.length || 0} notebooks, ${data.pages?.length || 0} pages, ${data.cards?.length || 0} flashcards`;
      if (!(await confirmDialog(`Restore ${counts} from “${esc(f.name)}”?`, { okLabel: 'Restore', title: 'Restore backup' }))) return;
      await importAll(data);
      toast('Restored. Reloading…');
      setTimeout(() => location.reload(), 800);
    } catch (e) { toast(e.message || 'That file could not be read.', { kind: 'error' }); }
  }
  void listModels;
}
