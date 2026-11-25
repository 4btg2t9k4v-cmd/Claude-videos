// Fires in-app (and, if allowed, system) notifications for due study reminders while the app is open.
import { S, updateReminder } from '../store.js';
import { toast } from '../util.js';
import { go } from '../main.js';

export function checkReminders() {
  const now = Date.now();
  for (const r of S.reminders) {
    if (r.done || r.notified || r.due > now) continue;
    updateReminder(r.id, { notified: true });
    toast('Reminder: ' + r.title, { ms: 8000, action: r.notebookId ? { label: 'Open', run: () => go('#/nb/' + r.notebookId) } : null });
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Folio reminder', { body: r.title, icon: 'icons/icon-192.png' }); } catch { /* ignore */ }
  }
}
