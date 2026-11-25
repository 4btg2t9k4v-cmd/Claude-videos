// School: Pronote + Google Classroom in one place, with one-tap flashcards and quizzes.
import { h, ic, toast, menu, sheet, field, fmtDate, segmented } from '../util.js';
import { on } from '../store.js';
import { menuButton } from '../main.js';
import { schoolData, hideItem } from '../school/store.js';
import * as pronote from '../school/pronote.js';
import * as classroom from '../school/classroom.js';

const DAY = 86400000;
const STALE = 20 * 60000;

const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
export function dayLabel(t) {
  const diff = Math.round((startOfDay(t) - startOfDay()) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return fmtDate(t, { weekday: 'long' });
  return fmtDate(t, { weekday: 'short', day: 'numeric', month: 'short' });
}
const lowerRel = (s) => (/^(Today|Tomorrow|Yesterday)$/.test(s) ? s.toLowerCase() : s);
const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const cap = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s); // Pronote subjects are often in CAPITALS
const subjectName = (s) => (s && s === s.toUpperCase() ? cap(s) : s || '');
const dot = (color) => h('i.sb-dot', { style: { background: color || 'var(--accent)', flex: '0 0 auto' } });

/* ------------------------------------------------------------------ */
/* What's on the page                                                  */
/* ------------------------------------------------------------------ */

/** Everything due, from both services, oldest first. Done or hidden items are left out. */
export function homeworkList(data = schoolData()) {
  const hidden = new Set(data.hidden || []);
  const from = startOfDay() - DAY;
  const items = [];
  for (const a of data.pronote?.homework || []) {
    if (a.done || hidden.has('p:' + a.id) || a.due < from) continue;
    items.push({ key: 'p:' + a.id, src: 'pronote', subject: subjectName(a.subject), color: a.color, title: a.text || 'Homework', due: a.due, files: a.files.map((f) => ({ ...f, src: 'pronote' })) });
  }
  for (const w of data.classroom?.work || []) {
    if (w.done || hidden.has('c:' + w.id) || (w.due && w.due < from) || (!w.due && Date.now() - w.created > 21 * DAY)) continue;
    items.push({ key: 'c:' + w.id, src: 'classroom', subject: w.course, title: w.title, detail: w.text, due: w.due, link: w.link, files: w.files.map((f) => ({ ...f, src: 'classroom' })) });
  }
  return items.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
}

/** Tests Pronote has marked in the timetable over the next two weeks. */
export function upcomingTests(data = schoolData()) {
  const now = Date.now();
  return (data.pronote?.lessons || []).filter((l) => l.test && !l.canceled && l.end > now && l.start < now + 14 * DAY);
}

/** Recent lesson content and class materials (newest first). */
function materialsList(data) {
  const items = [];
  for (const c of data.pronote?.contents || []) items.push({ key: 'pc:' + c.id, src: 'pronote', subject: subjectName(c.subject), color: c.color, title: c.title || c.kind || 'Lesson', detail: c.text, date: c.date, files: c.files.map((f) => ({ ...f, src: 'pronote' })) });
  for (const m of data.classroom?.materials || []) items.push({ key: 'cm:' + m.id, src: 'classroom', subject: m.course, title: m.title, detail: m.text, date: m.date, link: m.link, files: m.files.map((f) => ({ ...f, src: 'classroom' })) });
  return items.sort((a, b) => b.date - a.date);
}

/** The lessons of today, or of the next day with lessons. */
function dayOfLessons(data) {
  const lessons = data.pronote?.lessons || [];
  const today = startOfDay();
  const next = lessons.find((l) => l.end > Date.now() || startOfDay(l.start) > today);
  if (!next) return { day: null, list: [] };
  const day = startOfDay(next.start);
  return { day, list: lessons.filter((l) => startOfDay(l.start) === day) };
}

/** Material to revise for a subject: the teacher's lesson notes and homework from the last 3 weeks. */
export function subjectMaterial(subject, data = schoolData()) {
  const same = (s) => (s || '').toLowerCase() === (subject || '').toLowerCase();
  const parts = [];
  for (const c of (data.pronote?.contents || []).filter((c) => same(c.subject)).slice(0, 12)) parts.push(`Lesson (${fmtDate(c.date)}): ${c.title}\n${c.text}`);
  for (const a of (data.pronote?.homework || []).filter((a) => same(a.subject))) parts.push(`Homework: ${a.text}`);
  const files = (data.pronote?.contents || []).filter((c) => same(c.subject)).slice(0, 4).flatMap((c) => c.files.filter((f) => !f.link).map((f) => ({ ...f, src: 'pronote' })));
  return { text: parts.join('\n\n'), files: files.slice(0, 3) };
}

/* ------------------------------------------------------------------ */
/* One-tap study                                                       */
/* ------------------------------------------------------------------ */

/** Turns a homework, lesson or material into flashcards or a quiz. */
export function studyMenu(anchor, item) {
  menu(anchor, [
    { label: 'Make flashcards', icon: 'cards', run: () => study('cards', item) },
    { label: 'Quiz me', icon: 'quiz', run: () => study('quiz', item) },
  ]);
}

async function study(kind, item) {
  const { hasAI } = await import('../ai/gemini.js');
  if (!hasAI()) { toast('Add your Gemini key in Settings → AI first.', { action: { label: 'Open', run: () => { location.hash = '#/settings/ai'; } } }); return; }
  const text = [item.subject && `Subject: ${item.subject}`, item.title, item.detail].filter(Boolean).join('\n\n');
  const files = [];
  const readable = (item.files || []).filter((f) => (f.src === 'pronote' && !f.link) || (f.src === 'classroom' && f.kind === 'drive')).slice(0, 3);
  if (readable.length) {
    toast(`Getting ${readable.length === 1 ? 'the attached file' : readable.length + ' attached files'}…`, { ms: 2500 });
    const { readMaterial } = await import('../tools/files.js');
    for (const f of readable) {
      try {
        const file = f.src === 'pronote' ? await pronote.downloadPronoteFile(f) : await classroom.downloadDriveFile(f);
        const m = await readMaterial(file);
        files.push({ name: f.name, part: m.part, text: m.text });
      } catch (e) { toast(`${f.name}: ${e.message}`, { kind: 'error', ms: 5000 }); }
    }
  }
  const name = item.subject ? `${item.subject} — ${item.title}`.slice(0, 80) : item.title.slice(0, 80);
  const material = [text, ...files.filter((f) => f.text).map((f) => `From ${f.name}:\n${f.text}`)].join('\n\n');
  const parts = files.filter((f) => f.part).map((f) => f.part);
  if (kind === 'cards') (await import('./cards.js')).generateDeckDialog({ text: material, name, files: parts });
  else (await import('./quiz.js')).quizSetupDialog({ text: material, name, files: parts });
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

let lastErrors = {};
/** Refreshes whatever is connected. `interactive` = started by a tap, so a Google popup is allowed. */
export async function syncAll({ interactive = false, quiet = false } = {}) {
  const jobs = [];
  if (pronote.isPronoteConnected()) jobs.push(['Pronote', pronote.syncPronote()]);
  if (classroom.isClassroomConnected()) {
    if (classroom.needsSignIn()) {
      if (interactive) jobs.push(['Google Classroom', classroom.signIn().then(() => classroom.syncClassroom())]);
    } else jobs.push(['Google Classroom', classroom.syncClassroom()]);
  }
  lastErrors = {};
  const results = await Promise.allSettled(jobs.map((j) => j[1]));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      lastErrors[jobs[i][0]] = r.reason;
      if (!quiet) toast(`${jobs[i][0]}: ${r.reason?.message || r.reason}`, { kind: 'error', ms: 6000 });
    }
  });
  return results.every((r) => r.status === 'fulfilled');
}

/* ------------------------------------------------------------------ */
/* Connect dialogs                                                     */
/* ------------------------------------------------------------------ */

export function connectPronoteDialog(onDone) {
  let mode = 'qr';
  let qrText = '';
  const body = h('div');
  const status = h('div');
  const pin = h('input.field', { type: 'text', inputmode: 'numeric', maxlength: 4, placeholder: '4-digit code', autocomplete: 'off', style: { maxWidth: '160px', letterSpacing: '4px', fontSize: '20px' } });
  const url = h('input.field', { type: 'url', placeholder: 'https://0123456a.index-education.net/pronote/', autocomplete: 'url' });
  const user = h('input.field', { type: 'text', autocomplete: 'username', autocapitalize: 'none' });
  const pass = h('input.field', { type: 'password', autocomplete: 'current-password' });
  const stay = h('input', { type: 'checkbox', checked: true });
  const goBtn = h('button.btn.primary', { type: 'button', text: 'Connect', on: { click: connect } });

  function draw() {
    body.innerHTML = '';
    const tabs = segmented([{ value: 'qr', label: 'QR code' }, { value: 'password', label: 'Username & password' }], mode, (v) => { mode = v; draw(); });
    tabs.style.marginBottom = '16px';
    body.append(tabs);
    if (mode === 'qr') {
      body.append(
        h('ol', { style: { margin: '0 0 14px', paddingLeft: '20px', lineHeight: 1.6 } },
          h('li', 'Open Pronote on a computer and log in as usual.'),
          h('li', 'Click the QR code icon at the top of the page (“application mobile”).'),
          h('li', 'Choose a 4-digit code. Pronote then shows a QR code.'),
          h('li', 'Scan it here and type the same 4-digit code.')),
        qrText
          ? h('div.banner', { style: { margin: '0 0 14px' } }, h('span', { html: ic('check-circle') }), h('p', 'QR code scanned.'), h('button.btn.sm', { type: 'button', text: 'Scan again', on: { click: () => { qrText = ''; draw(); } } }))
          : h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' } },
            h('button.btn', { type: 'button', html: ic('scan') + '<span>Scan with camera</span>', on: { click: scan } }),
            h('button.btn', { type: 'button', html: ic('image') + '<span>Use a photo or screenshot</span>', on: { click: fromImage } })),
        field('4-digit code', pin));
    } else {
      body.append(
        h('p.muted', { style: { marginTop: 0 } }, 'Works if you log in to Pronote with a Pronote username. If your school uses an ENT (like EduConnect or your region’s portal), use the QR code instead.'),
        field('Your school’s Pronote address', url, 'Copy it from your browser when you are on Pronote.'),
        h('div.form-grid', field('Username', user), field('Password', pass)),
        h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' } }, stay, 'Stay signed in (the password stays on this device only)'));
    }
    body.append(status);
  }

  async function scan() {
    const { scanQR } = await import('../school/qr.js');
    try { qrText = await scanQR(); draw(); pin.focus(); } catch (e) { if (e.code !== 'cancelled') toast(e.message, { kind: 'error' }); }
  }
  async function fromImage() {
    const { qrFromImage } = await import('../school/qr.js');
    try { qrText = await qrFromImage(); draw(); pin.focus(); } catch (e) { if (e.code !== 'cancelled') toast(e.message, { kind: 'error' }); }
  }

  async function connect() {
    goBtn.disabled = true;
    status.innerHTML = '';
    status.append(h('div.gen-status', h('span.spinner'), h('span', 'Connecting to Pronote…')));
    try {
      if (mode === 'qr') {
        if (!qrText) throw new Error('Scan the QR code first.');
        await pronote.connectWithQR({ qrText, pin: pin.value.trim() });
      } else {
        if (!url.value.trim() || !user.value.trim() || !pass.value) throw new Error('Fill in the address, username and password.');
        await pronote.connectWithPassword({ url: url.value, username: user.value, password: pass.value, stay: stay.checked });
      }
      s.close();
      toast('Pronote connected.');
      onDone?.();
    } catch (e) {
      goBtn.disabled = false;
      status.innerHTML = '';
      status.append(h('p', { style: { color: 'var(--danger, #b42318)', margin: '10px 0 0' } }, e.message));
    }
  }

  draw();
  import('../school/pronote-fetcher.js').then(async (m) => {
    if (await m.relayAvailable()) return;
    goBtn.disabled = true;
    status.innerHTML = '';
    status.append(h('p', { style: { color: 'var(--danger, #b42318)', margin: '10px 0 0' } }, m.RELAY_MISSING));
  });
  const s = sheet({ title: 'Connect Pronote', body, actions: [h('button.btn.ghost', { type: 'button', text: 'Cancel', on: { click: () => s.close() } }), goBtn] });
}

export async function connectClassroom(onDone) {
  if (!classroom.isClassroomSetUp()) {
    sheet({ title: 'Google Classroom', body: h('div', h('p', 'Google Classroom isn’t switched on in this version of the app yet.'), h('p.muted', 'Developer: add a Google OAuth client ID in Settings → School connections (see SCHOOL.md).')) });
    return;
  }
  try {
    await classroom.signIn();
    toast('Connected. Getting your classes…');
    await classroom.syncClassroom();
    onDone?.();
  } catch (e) {
    if (e.code !== 'cancelled') toast(e.message, { kind: 'error', ms: 7000 });
  }
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export async function render(main) {
  const view = h('div.view');
  const pad = h('div.view-pad');
  view.append(pad);
  main.append(view);
  let busy = false;

  const syncBtn = h('button.btn.sm', { type: 'button', html: ic('refresh') + '<span>Sync</span>', on: { click: () => doSync(true) } });
  async function doSync(interactive) {
    if (busy) return;
    busy = true;
    syncBtn.disabled = true;
    syncBtn.lastChild.textContent = 'Syncing…';
    try { await syncAll({ interactive, quiet: !interactive }); } finally {
      busy = false;
      syncBtn.disabled = false;
      syncBtn.lastChild.textContent = 'Sync';
      draw();
    }
  }

  function draw() {
    const data = schoolData();
    const p = !!data.pronote && pronote.isPronoteConnected();
    const c = !!data.classroom && classroom.isClassroomConnected();
    pad.innerHTML = '';
    const synced = Math.max(data.pronote?.syncedAt || 0, data.classroom?.syncedAt || 0);
    pad.append(h('div.topbar', { style: { marginBottom: '8px' } }, menuButton(), h('div', { style: { flex: 1 } }),
      synced ? h('span.faint', { style: { fontSize: '13px' } }, 'Updated ' + time(synced)) : null,
      (p || c) ? syncBtn : null));
    const who = data.pronote?.student;
    pad.append(h('div.home-head', h('div.greet', h('h1', 'School'), h('p', who ? [who.name, who.className, who.school].filter(Boolean).join(' · ') : 'Your homework, tests and lessons in one place'))));

    if (!p && !c) { pad.append(connectCards(true)); return; }

    const relogin = Object.values(lastErrors).find((e) => e?.code === 'relogin');
    if (relogin) pad.append(h('div.banner', h('span', { html: ic('alert') }), h('p', relogin.message), h('button.btn.sm', { type: 'button', text: 'Connect again', on: { click: () => connectPronoteDialog(() => doSync(false)) } })));
    if (c && classroom.needsSignIn()) pad.append(h('div.banner', h('span', { html: ic('refresh') }), h('p', 'Google Classroom needs a quick sign-in to refresh.'), h('button.btn.sm', { type: 'button', text: 'Refresh Classroom', on: { click: () => doSync(true) } })));

    const grid = h('div.home-grid');
    const tests = upcomingTests(data);
    if (tests.length) grid.append(section('Tests coming up', 'full', testsBody(tests, data)));
    grid.append(section('Homework', 'half', homeworkBody(homeworkList(data))));
    if (p) grid.append(section('Timetable', 'half', timetableBody(data)));
    if (data.pronote?.grades) grid.append(section('Grades', 'half', gradesBody(data.pronote.grades)));
    grid.append(section('Lessons & class materials', 'half', materialsBody(materialsList(data))));
    pad.append(grid);
    if (!p || !c) pad.append(h('section.hs', { style: { marginTop: '20px' } }, h('div.section-head', h('h2', 'Connect more')), connectCards(false)));
  }

  function connectCards(big) {
    const data = schoolData();
    const wrap = h('div', { style: { display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: big ? '8px' : 0 } });
    if (!data.pronote) wrap.append(card('Pronote', 'Homework, timetable, tests, grades and lesson notes.', 'Connect Pronote', () => connectPronoteDialog(() => draw())));
    if (!data.classroom) wrap.append(card('Google Classroom', 'Assignments and your teachers’ files.', 'Connect Google Classroom', () => connectClassroom(() => draw())));
    return wrap;
  }
  function card(title, text, label, run) {
    return h('div.set-card', { style: { padding: '18px' } },
      h('h3', { style: { margin: '0 0 6px' } }, title), h('p.muted', { style: { margin: '0 0 14px' } }, text),
      h('button.btn.primary', { type: 'button', text: label, on: { click: run } }));
  }

  function section(title, size, body) {
    return h('section.hs' + (size === 'half' ? '.half' : ''), h('div.section-head', h('h2', title)), body);
  }

  const studyBtn = (item) => h('button.icon-btn.sm', { type: 'button', title: 'Flashcards or quiz', 'aria-label': 'Study this', html: ic('sparkles'), on: { click: (e) => { e.stopPropagation(); studyMenu(e.currentTarget, item); } } });
  const filesRow = (item) => (item.files?.length || item.link) ? h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
    ...(item.files || []).map((f) => fileChip(f)),
    item.link ? h('a.chip', { href: item.link, target: '_blank', rel: 'noopener' }, h('span', { html: ic('external') }), h('span', 'Open in Classroom')) : null) : null;

  function fileChip(f) {
    const label = h('span', f.name.length > 34 ? f.name.slice(0, 32) + '…' : f.name);
    if (f.src === 'classroom' || f.link) return h('a.chip', { href: f.link || f.url, target: '_blank', rel: 'noopener' }, h('span', { html: ic(f.link && f.src === 'pronote' ? 'link' : 'paperclip') }), label);
    return h('button.chip', { type: 'button', on: { click: async () => {
      try {
        const file = await pronote.downloadPronoteFile(f);
        const u = URL.createObjectURL(file);
        window.open(u, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(u), 60000);
      } catch (e) { toast(e.message, { kind: 'error' }); }
    } } }, h('span', { html: ic('paperclip') }), label);
  }

  function testsBody(tests, data) {
    const body = h('div.hs-body');
    for (const t of tests) {
      const subject = subjectName(t.subject);
      const m = subjectMaterial(t.subject, data);
      body.append(h('div.list-row', { style: { padding: '10px 4px' } },
        h('span', { html: ic('flag'), style: { color: 'var(--accent)' } }),
        h('div.lr-main', h('div.lr-title', subject), h('div.lr-sub', `${dayLabel(t.start)} · ${time(t.start)}${t.room ? ' · ' + t.room : ''}`)),
        h('button.btn.sm.primary', { type: 'button', html: ic('sparkles') + '<span>Revise</span>', on: { click: (e) => studyMenu(e.currentTarget, { subject, title: 'Test revision', detail: m.text || `Revise the main topics of ${subject}.`, files: m.files }) } })));
    }
    return body;
  }

  function homeworkBody(list) {
    const body = h('div.hs-body');
    if (!list.length) { body.append(h('p.muted', { style: { margin: '0 0 10px' } }, 'No homework due. 🎉')); return body; }
    let shown = 6;
    const rows = h('div');
    const more = h('button.btn.sm.ghost', { type: 'button', style: { marginTop: '6px' }, on: { click: () => { shown += 10; fill(); } } });
    const fill = () => {
      rows.innerHTML = '';
      list.slice(0, shown).forEach((it) => rows.append(homeworkRow(it)));
      more.textContent = `Show ${Math.min(10, list.length - shown)} more`;
      more.hidden = shown >= list.length;
    };
    fill();
    body.append(rows, more);
    return body;
  }

  function homeworkRow(it) {
    const late = it.due && it.due < startOfDay();
    return h('div.list-row', { style: { padding: '10px 4px', alignItems: 'flex-start' } },
      dot(it.color),
      h('div.lr-main',
        h('div.lr-sub', { style: { color: late ? 'var(--danger, #b42318)' : undefined } }, `${it.subject}${it.due ? ' · ' + (late ? 'Late — ' : 'Due ') + lowerRel(dayLabel(it.due)) : ''}`),
        h('div.lr-title', { style: { whiteSpace: 'pre-wrap' } }, it.title.length > 220 ? it.title.slice(0, 220) + '…' : it.title),
        filesRow(it)),
      studyBtn(it),
      h('button.icon-btn.sm', { type: 'button', title: 'Done — hide it', 'aria-label': 'Mark as done', html: ic('check'), on: { click: () => { hideItem(it.key); toast('Hidden. Nice work!'); } } }));
  }

  function timetableBody(data) {
    const body = h('div.hs-body');
    const { day, list } = dayOfLessons(data);
    if (!day) { body.append(h('p.muted', { style: { margin: '0 0 10px' } }, 'No lessons in the next three weeks.')); return body; }
    body.append(h('div.lr-sub', { style: { margin: '0 0 6px 4px', fontWeight: 600 } }, dayLabel(day)));
    for (const l of list) {
      body.append(h('div.list-row', { style: { padding: '6px 4px', opacity: l.canceled ? 0.5 : 1 } },
        h('span', { style: { width: '48px', fontVariantNumeric: 'tabular-nums', fontSize: '13px' } }, time(l.start)),
        dot(l.color),
        h('div.lr-main',
          h('div.lr-title', { style: { textDecoration: l.canceled ? 'line-through' : 'none' } }, subjectName(l.subject) + (l.test ? ' · Test' : '')),
          h('div.lr-sub', [l.room, l.status || (l.canceled ? 'Cancelled' : '')].filter(Boolean).join(' · ')))));
    }
    return body;
  }

  function gradesBody(g) {
    const body = h('div.hs-body');
    if (g.overall != null) body.append(h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', margin: '0 4px 10px' } }, h('b', { style: { fontSize: '28px' } }, fmtNum(g.overall)), h('span.muted', `/20 overall · ${g.period}`)));
    const subjects = g.subjects.filter((s) => s.avg != null).sort((a, b) => (a.avg - (a.classAvg ?? a.avg)) - (b.avg - (b.classAvg ?? b.avg)));
    for (const s of subjects.slice(0, 8)) {
      const pct = Math.max(0, Math.min(1, s.avg / (s.outOf || 20)));
      const below = s.classAvg != null && s.avg < s.classAvg;
      body.append(h('div', { style: { margin: '0 4px 8px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '14px' } },
          h('span', subjectName(s.name) + (below ? ' · below class average' : '')), h('b', fmtNum(s.avg))),
        h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--line, #e5e0d6)', overflow: 'hidden' } },
          h('div', { style: { width: (pct * 100).toFixed(0) + '%', height: '100%', background: below ? 'var(--danger, #b42318)' : (s.color || 'var(--accent)') } }))));
    }
    const recent = g.recent.filter((r) => r.value != null).slice(0, 4);
    if (recent.length) {
      body.append(h('div.lr-sub', { style: { margin: '12px 4px 4px', fontWeight: 600 } }, 'Latest grades'));
      for (const r of recent) body.append(h('div.list-row', { style: { padding: '4px' } }, h('div.lr-main', h('div.lr-title', subjectName(r.subject)), h('div.lr-sub', [fmtDate(r.date), r.comment].filter(Boolean).join(' · '))), h('b', `${fmtNum(r.value)}/${fmtNum(r.outOf)}`)));
    }
    return body;
  }

  function materialsBody(list) {
    const body = h('div.hs-body');
    if (!list.length) { body.append(h('p.muted', { style: { margin: '0 0 10px' } }, 'Nothing yet.')); return body; }
    for (const it of list.slice(0, 15)) {
      body.append(h('div.list-row', { style: { padding: '10px 4px', alignItems: 'flex-start' } },
        dot(it.color),
        h('div.lr-main',
          h('div.lr-sub', `${it.subject} · ${dayLabel(it.date)}`),
          h('div.lr-title', it.title.length > 160 ? it.title.slice(0, 160) + '…' : it.title),
          filesRow(it)),
        studyBtn(it)));
    }
    return body;
  }

  draw();
  const off = on('school', () => { if (!busy) draw(); });
  const stale = Date.now() - Math.max(schoolData().pronote?.syncedAt || 0, schoolData().classroom?.syncedAt || 0) > STALE;
  if (stale && (pronote.isPronoteConnected() || classroom.isClassroomConnected())) doSync(false);
  return () => off();
}

const fmtNum = (n) => (n == null ? '–' : (Math.round(n * 100) / 100).toLocaleString());
