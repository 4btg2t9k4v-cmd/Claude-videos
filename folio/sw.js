// Offline support: precache the app, serve it cache-first, refresh in the background.
const VERSION = 'e3e2bf84a2';
const ASSETS = ["./","css/app.css","css/fonts.css","fonts/caveat-400-normal-latin-95b77c08.woff2","fonts/caveat-400-normal-latin-ext-c938c82c.woff2","fonts/caveat-700-normal-latin-e25ad33c.woff2","fonts/caveat-700-normal-latin-ext-1819e4a3.woff2","fonts/ibm-plex-sans-arabic-400-normal-arabic-a9cefdca.woff2","fonts/ibm-plex-sans-arabic-400-normal-latin-653bfd52.woff2","fonts/ibm-plex-sans-arabic-600-normal-arabic-9e5c019d.woff2","fonts/ibm-plex-sans-arabic-600-normal-latin-ee160f53.woff2","fonts/instrument-sans-400-700-italic-latin-a6c8baf4.woff2","fonts/instrument-sans-400-700-italic-latin-ext-8a9dff5e.woff2","fonts/instrument-sans-400-700-normal-latin-72c72cc0.woff2","fonts/instrument-sans-400-700-normal-latin-ext-3265280d.woff2","fonts/jetbrains-mono-400-normal-4488b140.woff2","fonts/jetbrains-mono-700-normal-0c7ad2ad.woff2","fonts/newsreader-200-800-italic-latin-3e7cd790.woff2","fonts/newsreader-200-800-italic-latin-ext-ee0be582.woff2","fonts/newsreader-200-800-normal-latin-5d70b133.woff2","fonts/newsreader-200-800-normal-latin-ext-a40c6200.woff2","fonts/noto-naskh-arabic-400-normal-arabic-422f7270.woff2","fonts/noto-naskh-arabic-700-normal-arabic-bc612297.woff2","fonts/zodiak-100-900-italic-1cd291f0.woff2","fonts/zodiak-100-900-normal-186f29de.woff2","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","index.html","js/ai/gemini.js","js/ai/notes.js","js/ai/panel.js","js/ai/visuals.js","js/ai/writing.js","js/db.js","js/editor/blocks.js","js/editor/editor.js","js/editor/figure.js","js/editor/ink.js","js/editor/insert.js","js/editor/inspector.js","js/editor/mathexpr.js","js/editor/paper.js","js/editor/selbar.js","js/editor/table.js","js/editor/text.js","js/icons.js","js/main.js","js/shortcuts.js","js/store.js","js/theme-boot.js","js/tools/export.js","js/tools/files.js","js/tools/md.js","js/tools/palette.js","js/tools/pdfimport.js","js/tools/reminders.js","js/tools/seed.js","js/tools/spell.js","js/tools/timer.js","js/tools/translator.js","js/tools/versions.js","js/util.js","js/views/cards.js","js/views/home.js","js/views/library.js","js/views/nbdialogs.js","js/views/notebook.js","js/views/progress.js","js/views/quiz.js","js/views/settings.js","js/views/translate.js","js/views/trash.js","manifest.webmanifest","vendor/jszip.min.js","vendor/katex/fonts/KaTeX_AMS-Regular.woff2","vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2","vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2","vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2","vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2","vendor/katex/fonts/KaTeX_Main-Bold.woff2","vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2","vendor/katex/fonts/KaTeX_Main-Italic.woff2","vendor/katex/fonts/KaTeX_Main-Regular.woff2","vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2","vendor/katex/fonts/KaTeX_Math-Italic.woff2","vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2","vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2","vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2","vendor/katex/fonts/KaTeX_Script-Regular.woff2","vendor/katex/fonts/KaTeX_Size1-Regular.woff2","vendor/katex/fonts/KaTeX_Size2-Regular.woff2","vendor/katex/fonts/KaTeX_Size3-Regular.woff2","vendor/katex/fonts/KaTeX_Size4-Regular.woff2","vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2","vendor/katex/katex.min.css","vendor/katex/katex.min.js","vendor/leaflet/images/layers-2x.png","vendor/leaflet/images/layers.png","vendor/leaflet/images/marker-icon-2x.png","vendor/leaflet/images/marker-icon.png","vendor/leaflet/images/marker-shadow.png","vendor/leaflet/leaflet.css","vendor/leaflet/leaflet.js","vendor/pdfjs/pdf.min.js","vendor/pdfjs/pdf.worker.min.js","vendor/smiles-drawer.min.js"];
const CACHE = 'folio-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('folio-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit || caches.match('./'));
      return hit || net;
    }));
    return;
  }
  // Map tiles: cache what you have seen so maps work offline.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open('folio-tiles').then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
  }
});
