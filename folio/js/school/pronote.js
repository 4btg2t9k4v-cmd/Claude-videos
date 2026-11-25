// Pronote connection. Runs Pawnote on the device; network goes through the relay (see pronote-fetcher.js).
// We never keep the student's password: after the first login Pronote gives a token that is
// renewed on every sync and only works on this device.
import { relayFetcherFor, relayDownload, webPost } from './pronote-fetcher.js';
import { getAuth, setAuth, saveSchool, schoolData } from './store.js';

let lib;
const pawnote = () => (lib ||= import('../../vendor/pawnote.mjs'));
const fetcher = relayFetcherFor(webPost);

const DAY = 86400000;

/** Text from teacher-written HTML, parsed in an inert document (nothing loads, nothing runs). */
export function textOf(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll('script,style').forEach((n) => n.remove());
  doc.querySelectorAll('p,div,li,br,tr,h1,h2,h3,h4').forEach((n) => n.append('\n'));
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export class PronoteError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Plain-language messages for Pawnote's errors. */
function explain(e) {
  if (e instanceof PronoteError || e?.code === 'relay') return e;
  const name = e?.name || '';
  const msg = String(e?.message || '');
  if (name === 'BadCredentialsError' || name === 'AuthenticateError') return new PronoteError('credentials', 'Pronote says the username or password is wrong.');
  if (name === 'AccessDeniedError' || name === 'AccountDisabledError') return new PronoteError('denied', 'Pronote refused access to this account.');
  if (name === 'SuspendedIPError' || name === 'RateLimitedError') return new PronoteError('suspended', 'Pronote has temporarily blocked logins after too many attempts. Try again in a few minutes.');
  if (name === 'SecurityError') return new PronoteError('security', 'Your Pronote account asks for an extra security check on new devices. Folio can’t do that step yet: use the QR code login, or turn the check off in Pronote’s settings.');
  if (name === 'PageUnavailableError') return new PronoteError('url', 'That doesn’t look like a Pronote address. Copy it from your browser while you’re on your school’s Pronote page.');
  if (name === 'BusyPageError') return new PronoteError('busy', 'Your school’s Pronote is busy or closed right now. Try again later.');
  if (name === 'SessionExpiredError') return new PronoteError('expired', 'The Pronote session expired. Sync again.');
  if (/QR|jeton|pin/i.test(msg + name)) return new PronoteError('qr', 'The QR code or the 4-digit code didn’t work. Make a new QR code in Pronote and try again.');
  return new PronoteError('unknown', 'Pronote connection failed: ' + (msg || name || 'unknown error'));
}

function deviceUUID() {
  const a = getAuth();
  if (a.deviceUUID) return a.deviceUUID;
  const id = 'folio-' + crypto.randomUUID();
  setAuth({ deviceUUID: id });
  return id;
}

/** Accepts anything the student pastes (with eleve.html, ?login=true, no https…) and returns the instance root. */
export function normalizePronoteURL(input) {
  let s = String(input || '').trim();
  if (!s) throw new PronoteError('url', 'Paste your school’s Pronote address.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw new PronoteError('url', 'That doesn’t look like a web address.'); }
  u.protocol = 'https:';
  u.search = ''; u.hash = '';
  const m = u.pathname.match(/^(.*?\/pronote)(\/|$)/i);
  u.pathname = (m ? m[1] : u.pathname.replace(/\/[^/]*\.html$/i, '').replace(/\/$/, '')) + '/';
  return u.href;
}

/** Saves the renewable token. `saved` = {base, password} to keep, null to drop, undefined to keep what was there. */
async function remember(refresh, saved) {
  const prev = getAuth().pronote || {};
  const keep = saved === undefined ? { base: prev.base, password: prev.password } : saved || {};
  await setAuth({ pronote: { url: refresh.url, username: refresh.username, token: refresh.token, kind: refresh.kind, navigatorIdentifier: refresh.navigatorIdentifier, base: keep.base || '', password: keep.password || '' } });
}

/**
 * First login with username + password.
 * `stay` keeps the password on this device only, so the app can log in again by itself when
 * Pronote stops accepting the saved token (some servers make it single-use).
 */
export async function connectWithPassword({ url, username, password, stay = true }) {
  const p = await pawnote();
  const base = normalizePronoteURL(url);
  try {
    const info = await p.instance(base, fetcher);
    if (info.casURL) throw new PronoteError('ent', 'Your school logs in to Pronote through its ENT, so a password can’t be used here. Use the QR code instead: it works for every school.');
  } catch (e) { if (e instanceof PronoteError) throw e; /* the info page is optional; try logging in anyway */ }
  const session = p.createSessionHandle(fetcher);
  try {
    const refresh = await p.loginCredentials(session, { url: base + 'eleve.html', kind: p.AccountKind.STUDENT, username: username.trim(), password, deviceUUID: deviceUUID() });
    await remember(refresh, stay ? { base, password } : null);
  } catch (e) { throw explain(e); }
  return syncWith(session);
}

/** First login with the QR code Pronote shows under "Mobile app" (the student chooses a 4-digit code there). */
export async function connectWithQR({ qrText, pin }) {
  const p = await pawnote();
  let qr;
  try { qr = typeof qrText === 'string' ? JSON.parse(qrText) : qrText; } catch { throw new PronoteError('qr', 'This isn’t a Pronote QR code.'); }
  if (!qr?.jeton || !qr?.url) throw new PronoteError('qr', 'This isn’t a Pronote QR code.');
  if (!/^\d{4}$/.test(String(pin))) throw new PronoteError('pin', 'Enter the 4-digit code you chose in Pronote.');
  const session = p.createSessionHandle(fetcher);
  try {
    const refresh = await p.loginQrCode(session, { deviceUUID: deviceUUID(), pin: String(pin), qr });
    await remember(refresh, null);
  } catch (e) { throw explain(e); }
  return syncWith(session);
}

export const isPronoteConnected = () => !!(getAuth().pronote?.token || getAuth().pronote?.password);

export function disconnectPronote() {
  setAuth({ pronote: null });
  saveSchool({ pronote: null });
}

let syncing = null;
/** Reconnects with the saved token and refreshes everything. */
export function syncPronote() {
  return (syncing ||= (async () => {
    const p = await pawnote();
    const a = getAuth().pronote;
    if (!a?.token && !a?.password) throw new PronoteError('not_connected', 'Pronote isn’t connected.');
    let session = p.createSessionHandle(fetcher);
    try {
      if (!a.token) throw new PronoteError('credentials', 'No saved token');
      const refresh = await p.loginToken(session, { url: a.url, kind: a.kind, username: a.username, token: a.token, deviceUUID: deviceUUID(), navigatorIdentifier: a.navigatorIdentifier });
      await remember(refresh);
    } catch (e) {
      const err = explain(e);
      if (err.code !== 'credentials' && err.code !== 'denied') throw err;
      if (!a.password) {
        await setAuth({ pronote: { ...a, token: '' } });
        throw new PronoteError('relogin', 'Pronote wants you to connect again. Scan a new QR code from Pronote.');
      }
      // The token was refused: log in again with the password kept on this device.
      session = p.createSessionHandle(fetcher);
      try {
        const refresh = await p.loginCredentials(session, { url: a.base + 'eleve.html', kind: a.kind, username: a.username, password: a.password, deviceUUID: deviceUUID() });
        await remember(refresh);
      } catch (e2) {
        const err2 = explain(e2);
        if (err2.code === 'credentials') {
          await setAuth({ pronote: { ...a, token: '', password: '' } });
          throw new PronoteError('relogin', 'Your Pronote password changed. Connect Pronote again.');
        }
        throw err2;
      }
    }
    return syncWith(session);
  })().finally(() => { syncing = null; }));
}

const atMidnight = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const settle = (pr) => pr.then((v) => v, (e) => { console.warn('Pronote: part of the sync failed', e); return undefined; });
const fileOf = (f) => ({ name: f.name, url: f.url, link: f.kind === 0 });

async function syncWith(session) {
  const p = await pawnote();
  const today = atMidnight();
  const in3w = new Date(today.getTime() + 21 * DAY);
  const ago3w = new Date(today.getTime() - 21 * DAY);
  const res = session.userResource;

  const [assignments, timetable, contents, grades] = await Promise.all([
    settle(p.assignmentsFromIntervals(session, today, in3w)),
    settle(p.timetableFromIntervals(session, today, in3w)),
    settle(p.resourcesFromIntervals(session, ago3w, new Date(today.getTime() + DAY))),
    settle((async () => {
      const tab = res.tabs.get(p.TabLocation.Grades);
      if (!tab) return undefined;
      const now = Date.now();
      const period = tab.periods.find((x) => x.startDate <= now && now <= x.endDate) || tab.defaultPeriod || tab.periods[0];
      return period ? { period, overview: await p.gradesOverview(session, period) } : undefined;
    })()),
  ]);

  const prev = schoolData().pronote || {};
  const data = {
    syncedAt: Date.now(),
    student: { name: session.user.name, className: res.className || '', school: res.establishmentName || '' },
    homework: assignments ? assignments.map((a) => ({
      id: a.id,
      subject: a.subject.name,
      color: a.backgroundColor || '',
      text: textOf(a.description),
      due: +a.deadline,
      done: a.done,
      files: a.attachments.map(fileOf),
      minutes: a.length || 0,
    })).sort((x, y) => x.due - y.due) : prev.homework || [],
    lessons: [],
    contents: contents ? contents.flatMap((r) => r.contents.map((c) => ({
      id: r.id + ':' + c.id,
      subject: r.subject.name,
      color: r.backgroundColor || '',
      date: +r.startDate,
      title: c.title || '',
      kind: c.categoryText || '',
      text: textOf(c.description),
      files: c.files.map(fileOf),
    }))).filter((c) => c.title || c.text || c.files.length).sort((x, y) => y.date - x.date) : prev.contents || [],
    grades: grades ? {
      period: grades.period.name,
      overall: num(grades.overview.overallAverage),
      subjects: grades.overview.subjectsAverages.map((s) => ({ name: s.subject.name, color: s.backgroundColor || '', avg: num(s.student), classAvg: num(s.class_average), outOf: num(s.outOf) || 20 })),
      recent: grades.overview.grades.map((g) => ({ id: g.id, subject: g.subject.name, value: num(g.value), outOf: num(g.outOf), classAvg: num(g.average), date: +g.date, comment: g.comment || '', coef: g.coefficient })).sort((x, y) => y.date - x.date),
    } : prev.grades || null,
  };
  if (timetable) {
    try { p.parseTimetable(session, timetable, { withCanceledClasses: true, withSuperposedCanceledClasses: false, withPlannedClasses: true }); } catch (e) { console.warn(e); }
    data.lessons = timetable.classes.filter((c) => c.is === 'lesson').map((c) => ({
      id: c.id,
      subject: c.subject?.name || c.title || 'Lesson',
      color: c.backgroundColor || '',
      start: +c.startDate,
      end: +c.endDate,
      teacher: (c.teacherNames || []).join(', '),
      room: (c.classrooms || []).join(', '),
      test: !!c.test,
      canceled: !!c.canceled,
      status: c.status || '',
    })).sort((x, y) => x.start - y.start);
  } else data.lessons = prev.lessons || [];
  await saveSchool({ pronote: data });
  return data;
}

/** Pawnote grade values are {kind, points}; kinds other than a plain grade (absent, exempt…) have no number. */
function num(v) {
  if (!v || typeof v.points !== 'number' || Number.isNaN(v.points)) return null;
  return v.kind === 0 || v.kind === undefined ? v.points : null;
}

/** Downloads a homework or lesson attachment, as a File the AI tools can read. */
export async function downloadPronoteFile(f) {
  if (f.link) throw new PronoteError('link', 'This attachment is a web link, not a file.');
  const { bytes, type } = await relayDownload(webPost, f.url);
  return new File([bytes], f.name, { type });
}
