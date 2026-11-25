# School connections (Pronote + Google Classroom)

Folio now has a **School** page (sidebar → School, and a summary on Home) that shows a student's
homework, upcoming tests, timetable, grades and lesson notes, and turns any of them into
flashcards or a quiz in one tap (✨ button). The AI still uses the student's own Gemini key
(Settings → AI); that part is unchanged for now.

## Run it locally

```bash
cd folio
npm install
node scripts/dev-server.mjs        # http://localhost:8888  (serves the app + the Pronote relay)
```

Try Pronote with Index Éducation's public demo school (password login):
address `demo.index-education.net/pronote/`, username `demonstration`, password `pronotevs`.

## Deploy (Netlify)

Deploy the `folio/` folder as the site (publish `.`, functions `netlify/functions`; `netlify.toml`
already says this). The Pronote relay is served at `/api/pronote`.

## How Pronote works here

Pronote has no public API. The app uses **Pawnote** (open-source, the library behind the Papillon
app), running **on the student's device**. Browsers can't talk to Pronote directly (no CORS, and
Pronote needs cookie headers browsers hide), so each raw request goes through a tiny relay function
(`netlify/functions/pronote-relay.mjs`). The relay:

- only forwards to Pronote addresses (`*.index-education.net`, or any `https://…/pronote/` path),
  checks every redirect hop, refuses IP addresses / localhost (tests: `npm test`);
- stores nothing and never logs in by itself; Pronote encrypts its own traffic after the
  handshake and never sends the password in clear.

In a native app (Capacitor), drop the relay and give Pawnote a fetcher that uses native HTTP
(see `js/school/pronote-fetcher.js`).

**Login options for students**

- **QR code** (works for every school, including ENT / EduConnect logins): in Pronote on a
  computer, click the QR-code icon ("application mobile"), choose a 4-digit code, scan it in the app.
- **Username & password**: only for schools where students log in to Pronote directly.
  "Stay signed in" keeps the password **on the device only** (IndexedDB, never in backups), so the
  app can log in again when Pronote stops accepting the saved token.

**Pawnote fixes for Pronote 2026.** Pawnote 1.6.2 (latest on npm, March 2026) can't log in to
current Pronote servers. `scripts/build-vendor.mjs` patches it while bundling (each fix must match
exactly once, so an upgrade that changes the code fails loudly):

1. the startup data is now written `Start({...});}catch` (extra semicolon);
2. the login challenge is now answered by AES-encrypting it as received (verified byte-for-byte
   against the official web client on Pronote 2026.2.8); older servers still work;
3. file links now carry `"G":"Aucun"` like the official client's.

Rebuild after changing versions: `node scripts/build-vendor.mjs`, then `node scripts/update-sw.mjs`.

**Known limits (tested on the demo school, 25 Nov 2026)**

- Re-login with the saved token was refused by the demo server every time; the app then falls back
  to the saved password, which works. Not yet checked on a real school.
- Lesson-content files download fine; the demo's only homework attachment returns 404 even though
  its link has exactly the same format as working ones (probably missing demo data; unconfirmed).
- QR-code login and the 2-step security check ("double authentification") couldn't be tested on the
  demo. Accounts with the security check get a clear message instead.
- This is unofficial access. Get a legal opinion and talk to Index Éducation about their partner
  programme before charging money.

## Google Classroom setup (once per copy of the app)

Classroom uses Google sign-in in a pop-up and calls the Classroom API straight from the device
(read-only scopes: courses, the student's own coursework and grades, course materials, and Drive
read-only for teachers' attached files).

1. Google Cloud Console → create a project → enable **Google Classroom API** and **Google Drive API**.
2. OAuth consent screen → External → add the four scopes listed in `js/school/classroom.js`.
   While "Testing", add up to 100 test users (Google accounts) who can sign in.
3. Credentials → Create OAuth client ID → **Web application**.
   - Authorised JavaScript origins: your site (e.g. `https://your-site.netlify.app`, `http://localhost:8888`)
   - Authorised redirect URIs: `https://your-site.netlify.app/oauth.html`, `http://localhost:8888/oauth.html`
4. Put the client ID in `js/school/config.js` (or paste it in Settings → School connections).

Notes: Drive read-only is a *restricted* scope, so going public needs Google's verification and a
security assessment; without it, Classroom still works but teachers' files can't be read. Students
under 18 with a school Google account can only sign in once their school's Google admin allows the
app (Google's rule).

## Files

| File | What it does |
|---|---|
| `js/views/school.js` | School page, connect dialogs, one-tap flashcards/quiz |
| `js/school/pronote.js` | Pronote login (QR / password), sync, attachments |
| `js/school/pronote-fetcher.js` | Sends Pawnote's requests through the relay |
| `js/school/classroom.js` | Google sign-in, Classroom sync, Drive downloads |
| `js/school/qr.js` | QR scanning (camera or picture) |
| `js/school/store.js` | School data + logins on the device (logins never go in backups) |
| `netlify/functions/pronote-relay.mjs` | The Pronote relay |
| `oauth.html`, `js/oauth-return.js` | Google sign-in return page |
| `vendor/pawnote.mjs`, `vendor/jsqr.mjs` | Bundled libraries (built by `scripts/build-vendor.mjs`) |
