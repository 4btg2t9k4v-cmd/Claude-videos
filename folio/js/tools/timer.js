// Study timer (focus / short break / long break) that survives reloads and logs study minutes.
import { h, ic, iconBtn, menu, toast } from '../util.js';
import { S, logActivity } from '../store.js';

let el, tick, state = null; // {mode, end, remaining, running, count}
const KEY = 'folio-timer';
const label = { focus: 'Focus', short: 'Break', long: 'Long break' };

function load() { try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { state = null; } }
function store() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }
const mins = (mode) => (S.settings.timer?.[mode] || { focus: 25, short: 5, long: 15 }[mode]);

export function restoreTimer() { load(); if (state?.visible) show(); }
export function toggleTimer() {
  load();
  if (el) { hide(); return; }
  if (!state) state = { mode: 'focus', remaining: mins('focus') * 60000, running: false, count: 0 };
  state.visible = true;
  store();
  show();
}

function show() {
  el?.remove();
  const time = h('span.tw-time.num');
  const mode = h('button.tw-mode', { type: 'button', style: { border: 0, background: 'none', cursor: 'pointer', padding: 0 }, on: { click: (e) => menu(e.currentTarget, Object.keys(label).map((m) => ({ label: `${label[m]} · ${mins(m)} min`, checked: state.mode === m, run: () => setMode(m) })), { place: 'top' }) } });
  const play = iconBtn('play', 'Start', () => (state.running ? pause() : start()));
  el = h('div.timer-w', { role: 'timer', 'aria-live': 'off' }, mode, time, play, iconBtn('rotate-ccw', 'Reset', () => setMode(state.mode)), iconBtn('x', 'Close timer', hide));
  document.body.append(el);
  const draw = () => {
    const left = state.running ? Math.max(0, state.end - Date.now()) : state.remaining;
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    time.textContent = `${m}:${String(s).padStart(2, '0')}`;
    mode.textContent = label[state.mode];
    play.innerHTML = ic(state.running ? 'pause' : 'play');
    play.setAttribute('aria-label', state.running ? 'Pause' : 'Start');
    document.title = state.running ? `${time.textContent} · ${label[state.mode]} — Folio` : 'Folio — study notebook';
    if (state.running && left <= 0) complete();
  };
  clearInterval(tick);
  tick = setInterval(draw, 500);
  draw();
}
function hide() { clearInterval(tick); el?.remove(); el = null; if (state) { state.visible = false; store(); } document.title = 'Folio — study notebook'; }
function start() { state.end = Date.now() + state.remaining; state.running = true; state.startedAt = Date.now(); store(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); }
function pause() { logFocus(); state.remaining = Math.max(0, state.end - Date.now()); state.running = false; store(); }
function setMode(m) { if (state.running) logFocus(); state = { ...state, mode: m, remaining: mins(m) * 60000, running: false }; store(); }
function logFocus() { if (state.mode === 'focus' && state.startedAt) { logActivity('min', Math.min(180, (Date.now() - state.startedAt) / 60000)); state.startedAt = 0; } }
function complete() {
  logFocus();
  const was = state.mode;
  if (was === 'focus') state.count = (state.count || 0) + 1;
  const next = was === 'focus' ? (state.count % 4 === 0 ? 'long' : 'short') : 'focus';
  state = { ...state, mode: next, remaining: mins(next) * 60000, running: false };
  store();
  chime();
  const msg = was === 'focus' ? 'Focus session done — take a break.' : 'Break over — ready for the next session?';
  toast(msg, { ms: 6000 });
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Folio', { body: msg, icon: 'icons/icon-192.png' }); } catch { /* not supported */ }
}
function chime() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 990].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, a.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(a.destination);
      o.start(a.currentTime + i * 0.18); o.stop(a.currentTime + i * 0.18 + 0.55);
    });
  } catch { /* audio unavailable */ }
}
