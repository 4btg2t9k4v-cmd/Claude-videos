// Read study material from files: PDFs and images go to Gemini as-is; Word/PowerPoint are unzipped to text here.
import { h, readFileAs, shrinkImage } from '../util.js';

let zipP;
function loadZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return zipP ||= new Promise((res, rej) => { const s = h('script', { src: 'vendor/jszip.min.js' }); s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error('Could not load the file reader.')); document.head.append(s); });
}

const xmlText = (xml, tag) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc;
};

export const ACCEPT = '.pdf,.pptx,.docx,.txt,.md,.markdown,.csv,.rtf,image/*,application/pdf';

/** Returns {name, kind, text?, part?:{mime,data}} */
export async function readMaterial(file) {
  const name = file.name;
  const ext = name.split('.').pop().toLowerCase();
  if (file.size > 19 * 1024 * 1024) throw new Error(`${name} is larger than 19 MB. Split it into smaller files.`);
  if (file.type === 'application/pdf' || ext === 'pdf') {
    const url = await readFileAs(file);
    return { name, kind: 'pdf', part: { mime: 'application/pdf', data: url.split(',')[1] } };
  }
  if (file.type.startsWith('image/')) {
    const url = await shrinkImage(file, 2000, 'image/jpeg', 0.9);
    return { name, kind: 'image', part: { mime: 'image/jpeg', data: url.split(',')[1] }, preview: url };
  }
  if (ext === 'pptx') return { name, kind: 'pptx', text: await pptxText(file) };
  if (ext === 'docx') return { name, kind: 'docx', text: await docxText(file) };
  if (['txt', 'md', 'markdown', 'csv', 'rtf'].includes(ext) || file.type.startsWith('text/')) return { name, kind: 'text', text: await readFileAs(file, 'text') };
  if (ext === 'ppt' || ext === 'doc') throw new Error(`${name} is an old Office format. Save it as .pptx/.docx or PDF first.`);
  throw new Error(`${name}: this file type isn’t supported. Use PDF, PowerPoint (.pptx), Word (.docx), text or images.`);
}

async function pptxText(file) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(await readFileAs(file, 'buffer'));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  let out = '';
  for (const [i, f] of slides.entries()) {
    const doc = xmlText(await zip.file(f).async('text'));
    const paras = [...doc.getElementsByTagNameNS('*', 'p')].map((p) => [...p.getElementsByTagNameNS('*', 't')].map((t) => t.textContent).join('')).filter((t) => t.trim());
    const notesFile = `ppt/notesSlides/notesSlide${f.match(/\d+/)[0]}.xml`;
    let notes = '';
    if (zip.file(notesFile)) {
      const nd = xmlText(await zip.file(notesFile).async('text'));
      notes = [...nd.getElementsByTagNameNS('*', 't')].map((t) => t.textContent).join(' ').trim();
    }
    out += `\n--- Slide ${i + 1} ---\n${paras.join('\n')}${notes ? `\n(Speaker notes: ${notes})` : ''}\n`;
  }
  if (!out.trim()) throw new Error('No text found in that presentation.');
  return out;
}

async function docxText(file) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(await readFileAs(file, 'buffer'));
  const xml = await zip.file('word/document.xml')?.async('text');
  if (!xml) throw new Error('That Word file looks empty or damaged.');
  const doc = xmlText(xml);
  const paras = [...doc.getElementsByTagNameNS('*', 'p')].map((p) => {
    const style = p.getElementsByTagNameNS('*', 'pStyle')[0]?.getAttribute('w:val') || '';
    const t = [...p.getElementsByTagNameNS('*', 't')].map((x) => x.textContent).join('');
    if (!t.trim()) return '';
    const hm = style.match(/Heading(\d)/i);
    return hm ? '#'.repeat(+hm[1]) + ' ' + t : (p.getElementsByTagNameNS('*', 'numPr').length ? '- ' + t : t);
  }).filter(Boolean);
  return paras.join('\n');
}
