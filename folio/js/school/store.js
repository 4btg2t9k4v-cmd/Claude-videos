// School data (Pronote + Google Classroom), kept on this device in Folio's IndexedDB.
// Logins live in their own record ("schoolAuth") so they are never written into backup files.
import { idb } from '../db.js';
import { emit } from '../store.js';

let auth = { id: 'schoolAuth' };
let data = { id: 'school', pronote: null, classroom: null, hidden: [] };
let loaded = null;

export function initSchool() {
  return (loaded ||= Promise.all([idb.get('kv', 'schoolAuth'), idb.get('kv', 'school')]).then(([a, d]) => {
    if (a) auth = a;
    if (d) data = { ...data, ...d };
  }));
}

export const getAuth = () => auth;
export function setAuth(patch) {
  auth = { ...auth, ...patch, id: 'schoolAuth' };
  return idb.put('kv', auth);
}

export const schoolData = () => data;
export async function saveSchool(patch) {
  data = { ...data, ...patch, id: 'school' };
  await idb.put('kv', data);
  emit('school', data);
}

/** Lets the student hide an item (e.g. homework they already did elsewhere) from the school page. */
export function hideItem(key) {
  if (data.hidden.includes(key)) return;
  return saveSchool({ hidden: [...data.hidden, key].slice(-500) });
}
