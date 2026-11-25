// A sample notebook so a new student can see what the app does.
import { createNotebook, createPage, createDeck, createCard, updateDeck, emit, updateNotebook } from '../store.js';
import { blocksToHTML } from '../ai/notes.js';
import { go } from '../main.js';

export function createSample() {
  const nb = createNotebook({ title: 'Biology — Cells', subject: 'Biology', color: '#2F5D50', cover: 'linen', description: 'Sample notebook: try editing anything.', lang: 'en' });
  const fid = 'f_' + Date.now().toString(36);
  updateNotebook(nb.id, { folders: [{ id: fid, name: 'Unit 1 · The cell' }] }, true);
  const p1 = createPage(nb.id, {
    title: 'Cell structure',
    folderId: fid,
    html: blocksToHTML([
      { type: 'paragraph', text: 'Cells are the basic unit of life. Every living organism is made of one or more cells, and every cell comes from an existing cell.' },
      { type: 'definition', term: 'Organelle', text: 'A specialised structure inside a cell that carries out a particular job, such as the nucleus or a mitochondrion.' },
      { type: 'heading', level: 2, text: 'Prokaryotic vs eukaryotic cells' },
      { type: 'table', headers: ['', 'Prokaryotic', 'Eukaryotic'], headerColumn: true, rows: [['Nucleus', 'No — DNA in the nucleoid', 'Yes, membrane-bound'], ['Size', 'About 1–10 µm', 'About 10–100 µm'], ['Organelles', 'No membrane-bound organelles', 'Mitochondria, ER, Golgi…'], ['Examples', 'Bacteria, archaea', 'Animals, plants, fungi, protists']] },
      { type: 'callout', kind: 'important', text: 'Ribosomes are found in **both** prokaryotic and eukaryotic cells — they are not membrane-bound.' },
      { type: 'heading', level: 2, text: 'History of cell theory' },
      { type: 'timeline', items: [
        { date: '1665', title: 'Robert Hooke names “cells”', text: 'Observed cork under a microscope (Micrographia).' },
        { date: '1670s', title: 'Antonie van Leeuwenhoek', text: 'First to observe living single-celled organisms.' },
        { date: '1838', title: 'Matthias Schleiden', text: 'Plants are made of cells.' },
        { date: '1839', title: 'Theodor Schwann', text: 'Animals are made of cells too.' },
        { date: '1855', title: 'Rudolf Virchow', text: '“Omnis cellula e cellula” — all cells come from cells.' },
      ] },
      { type: 'heading', level: 2, text: 'From gene to protein' },
      { type: 'flowchart', steps: '(DNA in nucleus) -> Transcription -> mRNA leaves the nucleus\nmRNA leaves the nucleus -> Translation at a ribosome -> (Protein)' },
      { type: 'heading', level: 2, text: 'Photosynthesis in one line' },
      { type: 'formula', latex: '6\\,\\mathrm{CO_2} + 6\\,\\mathrm{H_2O} \\xrightarrow{\\text{light}} \\mathrm{C_6H_{12}O_6} + 6\\,\\mathrm{O_2}', caption: 'Carbon dioxide and water make glucose and oxygen, using light energy.' },
      { type: 'summary', items: ['All living things are made of cells.', 'Eukaryotic cells have a nucleus and membrane-bound organelles; prokaryotic cells do not.', 'Genes are transcribed into mRNA and translated into proteins at ribosomes.'] },
      { type: 'checklist', items: ['Learn the organelles and their functions', 'Draw and label an animal cell', 'Make flashcards from this page'] },
    ]),
    paper: { type: 'lined', marginLine: true, color: '', texture: 'grain', margin: 56, spacing: 32, border: 'none', layout: 'single', bgImage: '' },
    tags: ['cells', 'unit-1'],
  });
  const p2 = createPage(nb.id, {
    title: 'Organelles — overview',
    folderId: fid,
    html: blocksToHTML([
      { type: 'mindmap', outline: 'Eukaryotic cell\n  Nucleus\n    Contains DNA\n    Nucleolus makes ribosomes\n  Mitochondria\n    Aerobic respiration\n  Ribosomes\n    Protein synthesis\n  Endoplasmic reticulum\n    Rough ER: proteins\n    Smooth ER: lipids\n  Golgi apparatus\n    Packages proteins\n  Plant cells only\n    Chloroplasts\n    Cell wall\n    Large vacuole' },
      { type: 'paragraph', text: 'Tip: select any word and tap **Define** or **Translate**. Tap the ✦ button for the AI assistant, or the pen to write by hand.' },
    ]),
    paper: { type: 'dotted', color: '', texture: 'none', margin: 56, spacing: 32, border: 'none', layout: 'single', bgImage: '' },
  });
  const d = createDeck({ name: 'Cells — basics', notebookId: nb.id });
  [
    ['What is the basic unit of life?', 'The cell.'],
    ['Which organelle is the site of aerobic respiration?', 'The mitochondrion.'],
    ['Name two structures found in plant cells but not animal cells.', 'Any two of: cell wall, chloroplasts, large permanent vacuole.'],
  ].forEach(([f, b]) => createCard(d.id, { type: 'qa', front: f, back: b, topic: 'Cell structure' }));
  createCard(d.id, { type: 'cloze', front: 'Prokaryotic cells have no membrane-bound ____.', back: 'nucleus (or organelles)', topic: 'Cell types' });
  createCard(d.id, { type: 'mcq', front: 'Who stated “omnis cellula e cellula”?', options: ['Robert Hooke', 'Rudolf Virchow', 'Theodor Schwann', 'Matthias Schleiden'], answer: 1, back: 'Rudolf Virchow, 1855.', topic: 'Cell theory' });
  updateDeck(d.id, {});
  emit('pages', { notebookId: nb.id });
  void p2;
  go(`#/nb/${nb.id}/${p1.id}`);
}
