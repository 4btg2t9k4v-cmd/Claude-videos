// The relay must only ever reach Pronote. Run:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import relay, { isPronoteURL } from '../netlify/functions/pronote-relay.mjs';

test('accepts Pronote addresses', () => {
  assert.ok(isPronoteURL('https://0123456a.index-education.net/pronote/eleve.html'));
  assert.ok(isPronoteURL('https://demo.index-education.net/pronote/appelfonction/6/1/abc'));
  assert.ok(isPronoteURL('https://pronote.mon-lycee.fr/pronote/mobile.eleve.html?fd=1'));
});

test('refuses everything else', () => {
  for (const u of [
    'http://0123456a.index-education.net/pronote/',      // not https
    'https://example.com/',                               // not Pronote
    'https://example.com/notpronote/',                    // only a /pronote/ path counts
  ]) assert.equal(isPronoteURL(u), false, u);
  assert.equal(isPronoteURL('https://127.0.0.1/pronote/'), false);
  assert.equal(isPronoteURL('https://localhost/pronote/'), false);
  assert.equal(isPronoteURL('https://169.254.169.254/pronote/'), false);
  assert.equal(isPronoteURL('https://user:pw@x.index-education.net/pronote/'), false);
  assert.equal(isPronoteURL('not a url'), false);
});

const call = (body, method = 'POST') => relay(new Request('http://local/api/pronote', { method, body: method === 'POST' ? JSON.stringify(body) : undefined }));

test('relay rejects non-Pronote targets and bad requests without fetching', async () => {
  assert.equal((await call({ url: 'https://example.com/' })).status, 403);
  assert.equal((await call({ url: 'https://x.index-education.net/pronote/', method: 'DELETE' })).status, 400);
  assert.equal((await call({}, 'GET')).status, 405);
  const bad = await relay(new Request('http://local/api/pronote', { method: 'POST', body: '{nope' }));
  assert.equal(bad.status, 400);
});
