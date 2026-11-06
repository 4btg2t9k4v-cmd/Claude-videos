// Dumps the flying-cars picture timeline (shots, cuts, kicks, story events, word frames) to JSON for the sound
// scripts, straight from src/videos/flying/story.ts, so picture and sound can never drift apart.
// usage: node scripts/fly_events.mjs audio_work/flying-cars/events.json
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
const out = process.argv[2] || "audio_work/flying-cars/events.json";
const tmp = path.resolve("out/fly_story.cjs");
fs.mkdirSync("out", { recursive: true });
await build({ entryPoints: ["src/videos/flying/story.ts"], bundle: true, platform: "node", format: "cjs", outfile: tmp, logLevel: "error" });
const require = (await import("node:module")).createRequire(import.meta.url);
const S = require(tmp);
const cuts = [];
for (const s of S.SHOTS) {
  let prev = null;
  for (let f = s.a; f < s.b; f++) {
    const c = S.camAt(s.id, f);
    // tracking shots move lens and target together: a cut is a jump in the lens RELATIVE to its target
    const rel = [0, 1, 2].map((i) => c.pos[i] - c.look[i]);
    if (prev) { const d = Math.hypot(rel[0] - prev[0], rel[1] - prev[1], rel[2] - prev[2]); if (d > 1.0) cuts.push(f); }
    prev = rel;
  }
}
const kicks = [];
for (let f = 0; f < S.TOTAL; f++) if (S.kickAt(f) !== 0 && S.kickAt(f - 1) === 0) kicks.push(f);
const ev = {
  FPS: S.FPS, TOTAL: S.TOTAL, FLASH: S.FLASH_AT,
  shots: S.SHOTS.map((s) => ({ id: s.id, a: s.a, b: s.b, light: s.light })),
  cuts, kicks, xfade: S.XFADE,
  words: Array.from({ length: 246 }, (_, i) => S.wf(i)),
  BUMP6: S.BUMP6, DART_FALL: S.DART_FALL, DART_HIT: S.DART_HIT, LIGHT_RED: S.LIGHT_RED, LIGHT_AMBER: S.LIGHT_AMBER, TICKET: S.TICKET,
};
fs.writeFileSync(out, JSON.stringify(ev, null, 1));
console.log("wrote", out, "cuts", cuts.length, "kicks", kicks.length, "TOTAL", S.TOTAL);
