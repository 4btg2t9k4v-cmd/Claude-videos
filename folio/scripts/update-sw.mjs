// Rebuilds the offline file list and cache version in sw.js from the files on disk.
// Run after adding, removing or changing app files:  node scripts/update-sw.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const SKIP = /^(node_modules|netlify|scripts|tests|\.)|^(package(-lock)?\.json|sw\.js|SCHOOL\.md|README\.md)$/;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(root, p);
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(rel);
  }
  return out;
}

const files = (await walk(root)).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(await readFile(join(root, f)));
const sw = await readFile(join(root, 'sw.js'), 'utf8');
const next = sw
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${hash.digest('hex').slice(0, 10)}';`)
  .replace(/const ASSETS = \[.*?\];/s, `const ASSETS = ${JSON.stringify(['./', ...files])};`);
await writeFile(join(root, 'sw.js'), next);
console.log(`sw.js: ${files.length} files`);
