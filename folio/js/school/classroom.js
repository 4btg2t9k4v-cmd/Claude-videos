// Google Classroom connection: Google sign-in popup (OAuth, read-only scopes), then the Classroom
// API is called straight from the device. No server involved; the access token lasts about an hour
// and is renewed with the same popup (Google closes it by itself once the student has agreed).
import { getAuth, setAuth, saveSchool, schoolData } from './store.js';
import { GOOGLE_CLIENT_ID } from './config.js';
import { S } from '../store.js';

export const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/drive.readonly', // to read teachers' attached files for flashcards and quizzes
];
const API = 'https://classroom.googleapis.com/v1';
const DRIVE = 'https://www.googleapis.com/drive/v3';

export class ClassroomError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const clientId = () => (S.settings?.school?.googleClientId || GOOGLE_CLIENT_ID || '').trim();
export const isClassroomSetUp = () => !!clientId();
export const isClassroomConnected = () => !!getAuth().classroom;
const tokenValid = () => { const c = getAuth().classroom; return !!c?.token && c.expires > Date.now() + 60000; };
export const needsSignIn = () => isClassroomConnected() && !tokenValid();

/** Opens Google's sign-in popup. Must be called from a tap/click, or the browser blocks the popup. */
export function signIn({ hint } = {}) {
  if (!isClassroomSetUp()) return Promise.reject(new ClassroomError('setup', 'Google Classroom isn’t set up in this copy of the app yet (no Google client ID).'));
  const state = crypto.randomUUID();
  const redirect = new URL('oauth.html', location.href.split('#')[0]).href;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirect,
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
    ...(hint || getAuth().classroom?.email ? { login_hint: hint || getAuth().classroom.email } : {}),
  }).toString();
  const w = window.open(url.href, 'folio-google', 'popup,width=480,height=640');
  if (!w) return Promise.reject(new ClassroomError('popup', 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'));
  return new Promise((resolve, reject) => {
    const ch = new BroadcastChannel('folio-oauth');
    const done = (fn, v) => { clearInterval(watch); ch.close(); fn(v); };
    const watch = setInterval(() => { if (w.closed) done(reject, new ClassroomError('cancelled', 'Google sign-in was closed.')); }, 700);
    ch.onmessage = async ({ data }) => {
      if (data?.state !== state) return;
      if (data.error) return done(reject, new ClassroomError(data.error, data.error === 'access_denied' ? 'You didn’t allow access to Google Classroom.' : 'Google sign-in failed: ' + data.error));
      const granted = (data.scope || '').split(' ');
      const missing = SCOPES.filter((s) => !granted.includes(s));
      await setAuth({ classroom: { ...(getAuth().classroom || {}), token: data.access_token, expires: Date.now() + (+data.expires_in || 3600) * 1000, scopes: granted } });
      if (missing.some((s) => !s.endsWith('drive.readonly'))) return done(reject, new ClassroomError('scopes', 'Tick all the Google Classroom boxes on Google’s screen so the app can see your classes.'));
      done(resolve, true);
    };
  });
}

async function api(path, params = {}) {
  if (!tokenValid()) throw new ClassroomError('signin', 'Sign in to Google again to refresh Classroom.');
  const url = new URL(path.startsWith('http') ? path : API + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  let res;
  try { res = await fetch(url, { headers: { Authorization: 'Bearer ' + getAuth().classroom.token } }); }
  catch { throw new ClassroomError('network', 'No connection to Google. Check your internet.'); }
  if (res.status === 401) { await setAuth({ classroom: { ...getAuth().classroom, token: '' } }); throw new ClassroomError('signin', 'Sign in to Google again to refresh Classroom.'); }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.details?.[0]?.reason || body?.error?.status || '';
    if (/admin|policy|domain/i.test(JSON.stringify(body))) throw new ClassroomError('admin', 'Your school’s Google admin hasn’t allowed this app yet. Ask your teacher or the school’s IT to approve it.');
    throw new ClassroomError('forbidden', 'Google refused access to Classroom' + (reason ? ` (${reason})` : '') + '.');
  }
  if (!res.ok) throw new ClassroomError('api', `Google Classroom returned an error (${res.status}).`);
  return res.json();
}

async function all(path, key, params, maxPages = 3) {
  const out = [];
  let pageToken;
  for (let i = 0; i < maxPages; i++) {
    const r = await api(path, { pageSize: 50, ...params, pageToken });
    out.push(...(r[key] || []));
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

function dueOf(w) {
  if (!w.dueDate) return null;
  const { year, month, day } = w.dueDate;
  const t = w.dueTime || {};
  // Classroom gives due dates in UTC.
  return Date.UTC(year, month - 1, day, t.hours ?? 23, t.minutes ?? 59);
}

function filesOf(materials = []) {
  return materials.map((m) => {
    if (m.driveFile?.driveFile) { const f = m.driveFile.driveFile; return { kind: 'drive', id: f.id, name: f.title || 'File', link: f.alternateLink || '' }; }
    if (m.link) return { kind: 'link', name: m.link.title || m.link.url, link: m.link.url };
    if (m.youtubeVideo) return { kind: 'video', name: m.youtubeVideo.title || 'Video', link: m.youtubeVideo.alternateLink };
    if (m.form) return { kind: 'form', name: m.form.title || 'Form', link: m.form.formUrl };
    return null;
  }).filter(Boolean);
}

let syncing = null;
export function syncClassroom() {
  return (syncing ||= (async () => {
    const courses = await all('/courses', 'courses', { studentId: 'me', courseStates: 'ACTIVE' });
    const perCourse = await Promise.all(courses.map(async (c) => {
      const [work, subs, mats] = await Promise.all([
        all(`/courses/${c.id}/courseWork`, 'courseWork', { orderBy: 'updateTime desc' }, 2).catch(() => []),
        all(`/courses/${c.id}/courseWork/-/studentSubmissions`, 'studentSubmissions', { userId: 'me' }, 2).catch(() => []),
        all(`/courses/${c.id}/courseWorkMaterials`, 'courseWorkMaterial', { orderBy: 'updateTime desc' }, 1).catch(() => []),
      ]);
      const state = Object.fromEntries(subs.map((s) => [s.courseWorkId, s.state]));
      return {
        work: work.map((w) => ({
          id: w.id, courseId: c.id, course: c.name,
          title: w.title || 'Assignment', text: w.description || '',
          due: dueOf(w), created: Date.parse(w.creationTime) || 0,
          done: ['TURNED_IN', 'RETURNED'].includes(state[w.id]),
          link: w.alternateLink || '', files: filesOf(w.materials),
        })),
        materials: mats.map((m) => ({
          id: m.id, courseId: c.id, course: c.name,
          title: m.title || 'Material', text: m.description || '',
          date: Date.parse(m.updateTime || m.creationTime) || 0,
          link: m.alternateLink || '', files: filesOf(m.materials),
        })),
      };
    }));
    const data = {
      syncedAt: Date.now(),
      courses: courses.map((c) => ({ id: c.id, name: c.name, section: c.section || '', link: c.alternateLink || '' })),
      work: perCourse.flatMap((x) => x.work).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity)),
      materials: perCourse.flatMap((x) => x.materials).sort((a, b) => b.date - a.date),
    };
    await saveSchool({ classroom: data });
    return data;
  })().finally(() => { syncing = null; }));
}

export function disconnectClassroom() {
  const token = getAuth().classroom?.token;
  if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }).catch(() => {});
  setAuth({ classroom: null });
  saveSchool({ classroom: null });
}

const EXPORTS = {
  'application/vnd.google-apps.document': ['application/pdf', '.pdf'],
  'application/vnd.google-apps.presentation': ['application/pdf', '.pdf'],
  'application/vnd.google-apps.spreadsheet': ['text/csv', '.csv'],
};

/** Downloads a Drive attachment as a File the AI tools can read (Google Docs/Slides become PDFs). */
export async function downloadDriveFile(f) {
  if (!getAuth().classroom?.scopes?.some((s) => s.endsWith('drive.readonly'))) throw new ClassroomError('drive', 'To use teachers’ files, sign in to Google again and allow access to Google Drive files.');
  const meta = await api(`${DRIVE}/files/${encodeURIComponent(f.id)}`, { fields: 'name,mimeType,size', supportsAllDrives: 'true' });
  const exp = EXPORTS[meta.mimeType];
  if (meta.mimeType?.startsWith('application/vnd.google-apps.') && !exp) throw new ClassroomError('type', 'This kind of Google file can’t be read by the AI.');
  if (!exp && +meta.size > 19 * 1024 * 1024) throw new ClassroomError('size', 'This file is larger than 19 MB.');
  const url = exp ? `${DRIVE}/files/${encodeURIComponent(f.id)}/export?mimeType=${encodeURIComponent(exp[0])}` : `${DRIVE}/files/${encodeURIComponent(f.id)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + getAuth().classroom.token } });
  if (!res.ok) throw new ClassroomError('download', `Couldn’t download “${meta.name}” (${res.status}).`);
  const blob = await res.blob();
  const name = exp ? meta.name.replace(/\.\w+$/, '') + exp[1] : meta.name;
  return new File([blob], name, { type: exp ? exp[0] : meta.mimeType });
}

export const classroomData = () => schoolData().classroom;
