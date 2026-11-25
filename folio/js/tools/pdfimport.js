// Import a PDF: each PDF page becomes a notebook page with the PDF as its background, ready to annotate.
import { h, pickFile, toast, readFileAs, sheet } from '../util.js';
import { createPage, emit } from '../store.js';
import { go } from '../main.js';

let pdfP;
function loadPdf() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return pdfP ||= new Promise((res, rej) => {
    const s = h('script', { src: 'vendor/pdfjs/pdf.min.js' });
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => rej(new Error('The PDF reader could not load.'));
    document.head.append(s);
  });
}

export async function importPDF(notebookId) {
  const file = await pickFile('application/pdf,.pdf');
  if (!file) return;
  const status = h('div.gen-status', h('span.spinner'), h('span', 'Opening PDF…'));
  const s = sheet({ title: 'Importing ' + file.name, body: status });
  try {
    const pdfjs = await loadPdf();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await readFileAs(file, 'buffer')), isEvalSupported: false }).promise;
    const n = Math.min(pdf.numPages, 150);
    let first = null;
    for (let i = 1; i <= n; i++) {
      status.lastChild.textContent = `Rendering page ${i} of ${n}…`;
      const pg = await pdf.getPage(i);
      const vp1 = pg.getViewport({ scale: 1 });
      const scale = 1632 / vp1.width;
      const vp = pg.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      const img = c.toDataURL('image/jpeg', 0.82);
      const text = (await pg.getTextContent()).items.map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim();
      const p = createPage(notebookId, {
        title: `${file.name.replace(/\.pdf$/i, '')} — p. ${i}`,
        kind: 'pdf',
        html: text ? `<p hidden data-pdf-text="1">${text.replace(/[<&]/g, (ch) => (ch === '<' ? '&lt;' : '&amp;'))}</p><p><br></p>` : '',
        paper: { type: 'blank', color: '#ffffff', ink: '#1F1C17', texture: 'none', margin: 56, spacing: 32, border: 'none', layout: 'single', bgImage: img, bgOpacity: 1, bgFit: 'contain' },
      }, { quiet: true });
      first ||= p;
    }
    emit('pages', { notebookId });
    s.close();
    toast(`${n} page${n === 1 ? '' : 's'} imported. Use the pen to annotate them.`);
    go(`#/nb/${notebookId}/${first.id}`);
    if (pdf.numPages > n) toast(`Only the first ${n} pages were imported.`);
  } catch (e) {
    s.close();
    toast('Could not import that PDF: ' + (e.message || e), { kind: 'error', ms: 6000 });
  }
}
