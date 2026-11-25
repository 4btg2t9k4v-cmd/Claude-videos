// Bundles the npm libraries the browser app needs into vendor/ (Folio has no build step of its own).
// Run after changing versions:  node scripts/build-vendor.mjs
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const common = { bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true, legalComments: 'none', logLevel: 'info' };

// Fixes for Pawnote 1.6.2 against current Pronote servers. Each one must match exactly once,
// so a Pawnote upgrade that changes this code fails the build instead of silently skipping a fix.
const PAWNOTE_FIXES = [
  {
    why: 'Pronote 2026 writes "Start({...});}catch" (with a semicolon); Pawnote only finds "Start({...})}catch".',
    find: 'o.replace(/ /gu,"").replace(/\\n/gu,"")',
    replace: 'o.replace(/ /gu,"").replace(/\\n/gu,"").replace(/\\);\\}catch/gu,")}catch")',
  },
  {
    why: 'Pronote 2026 changed the login challenge: the client now AES-encrypts the challenge exactly as received '
      + '(checked against the official web client on 2026.2.8). Older servers sent a challenge to decrypt and keep every '
      + 'other character. We try the old way first and use the new one when the old decryption has invalid padding.',
    find: 'Se=(e,s,t)=>{const i=n.util.createBuffer(e.information.aesIV);try{const e=n.util.decodeUtf8(se.decrypt(s.challenge,t,i)),a=new Array(e.length);for(let s=0;s<e.length;s+=1)s%2==0&&a.push(e.charAt(s));const r=n.util.encodeUtf8(a.join(""));return se.encrypt(r,t,i)}catch{throw new c}}',
    replace: 'Se=(e,s,t)=>{const i=n.util.createBuffer(e.information.aesIV);try{'
      + 'const k=n.md.md5.create().update(t.bytes()).digest(),v=i.length()?n.md.md5.create().update(i.bytes()).digest():n.util.createBuffer().fillWithByte(0,16),d=n.cipher.createDecipher("AES-CBC",k);'
      + 'd.start({iv:v});d.update(n.util.createBuffer(n.util.hexToBytes(s.challenge)));'
      + 'if(d.finish()){const e=n.util.decodeUtf8(d.output.bytes()),a=[];for(let s=0;s<e.length;s+=2)a.push(e.charAt(s));return se.encrypt(n.util.encodeUtf8(a.join("")),t,i)}'
      + 'return se.encrypt(n.util.encodeUtf8(s.challenge),t,i)}catch{throw new c}}',
  },
  {
    why: 'Pronote 2026 file links carry {"N":id,"G":"Aucun","Actif":true} (checked by decrypting a link from the official '
      + 'web client); without "G" the server answers 404 for attachments.',
    find: 'o=JSON.stringify({N:a,Actif:!0,...t})',
    replace: 'o=JSON.stringify({N:a,G:"Aucun",Actif:!0,...t})',
  },
];

const patchPawnote = {
  name: 'patch-pawnote',
  setup(b) {
    b.onLoad({ filter: /pawnote[\\/]dist[\\/]index\.mjs$/ }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const fix of PAWNOTE_FIXES) {
        const n = src.split(fix.find).length - 1;
        if (n !== 1) throw new Error(`Pawnote fix no longer applies (${n} matches): ${fix.why}`);
        src = src.replace(fix.find, fix.replace);
      }
      return { contents: src, loader: 'js' };
    });
  },
};

await build({ ...common, stdin: { contents: "export * from 'pawnote';", resolveDir: process.cwd() }, plugins: [patchPawnote], outfile: 'vendor/pawnote.mjs' });
await build({ ...common, stdin: { contents: "export { default } from 'jsqr';", resolveDir: process.cwd() }, outfile: 'vendor/jsqr.mjs' });
