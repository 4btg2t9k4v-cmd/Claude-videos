// The flying-cars cast as lit flat sprites in the 3D world (the bridge short's card system): every frame each
// character asks for a drawing (key + draw call); the pool keeps one canvas per distinct drawing. Characters are
// yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward the sun); drivers sit in
// their cars' open cabins and roll with the car on screen; standing people get contact blobs; effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxBurst, fxStars, fxContact, fxShadow, fxPuff, fxBird, fxHonk, fxConfetti, fxAnger, fxSmoke, fxTicket, fxFeathers, fxDirt,
  fxSweat, fxCoffee, fxButton, Outfit, Expr, FrontOpts, SideOpts, SKINS, INK,
} from "./toon";
import {
  FPS, wf, hh, smooth, clamp01, V3, CarP, PlaneP, BirdP, Light, local, SEAT, HEAD_Y, YOU_HOME, WALKER, FIELD, TOWER, FOOD, BUMP6, SPOT13, CUBE_Z,
  DART, DART_HIT, YOU22, TICKET, shotAt,
} from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false;
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false;
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean; mirror?: boolean };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };
export type Stage = { places: Place[]; fx: FxPlace[] };

const q = (v: number, n = 120) => Math.round(v * n) / n;
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
let LNAME: Light = "day";
const tmp = new THREE.Vector3();
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57 && c > -0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks ----------------
const LID = [0.5, 1, 1, 0.5];
const lidAt = (f: number, i: number) => {
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 600; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
/** a blink across every expression change hides the swap (reference); keyed on the expression string */
const lastExpr = new Map<number, { e: string; f: number }>();
const blinkSwap = (i: number, f: number, e: string) => {
  const r = lastExpr.get(i);
  if (!r || r.e !== e) { lastExpr.set(i, { e, f }); return r && f - r.f > 0 && Math.abs(f - r.f) < 400 ? 1 : 0; }
  const k = f - r.f;
  return k >= 0 && k < 3 ? [1, 1, 0.5][k] : 0;
};

type Who = { i: number; o: Outfit; okey: string };
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2 * scale, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = (who.i * 5 + 3) % 7 + 1;
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return { key, x, y, z, scale, mirror, draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)), size: [w, h, k] };
};

// ground shadows (bridge review rounds 2-4): tight contact pool + a soft tail away from the sun by day
const CONTACT: Record<Light, [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h;
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c, w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc, w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};
/** a car's soft ground shadow pool (cars on the ground or hovering low) */
const carBlob = (out: Stage, c: CarP, ground = 0) => {
  const hgt = c.y - ground;
  if (hgt > 14) return;
  const k = Math.max(0.25, 1 - hgt / 14), cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: c.x, y: ground + 0.03, z: c.z, w: 2.6 + hgt * 0.12, h: 5.0 + hgt * 0.12, flat: true, rot: c.yaw });
};

// ---------------- outfits ----------------
const OUT: Record<string, Outfit> = {
  you: { jacket: "#2f8a8a", pants: "#3b3f52", boots: "#3a3d47", hat: "hair", hair: "#5a3b2a", skin: SKINS[0] },
  guy: { jacket: "#8a5ac9", pants: "#2e2a36", boots: INK, hat: "hair", hair: "#1f1a24", skin: SKINS[1], moustache: "#1f1a24" },
  kevin: { jacket: "#f08a2c", pants: "#3b5b9a", boots: "#f4f1ea", hat: "cap", cap: "#9bd13b", skin: SKINS[2] },
  rageA: { jacket: "#d94a3a", pants: "#3b3f52", boots: INK, hat: "hair", hair: "#2a201a", moustache: "#2a201a", skin: SKINS[0], build: "stout" },
  rageB: { jacket: "#3f6fb5", pants: "#3b3f52", boots: INK, hat: "cap", cap: "#f2c14e", skin: SKINS[3] },
  cop: { jacket: "#22305a", pants: "#22305a", boots: INK, hat: "cap", cap: "#22305a", badge: "#e8c45a", buttons: "#e8c45a", skin: SKINS[1] },
  student: { jacket: "#7fb3e0", pants: "#3b3f52", boots: "#5a3b2a", hat: "hair", hair: "#c9773a", headset: true, skin: SKINS[0] },
  pilot: { jacket: "#f4f1ea", pants: "#22305a", boots: INK, hat: "cap", cap: "#22305a", badge: "#e8c45a", buttons: "#e8c45a", moustache: "#4a3020", build: "stout", skin: SKINS[2] },
  examiner: { jacket: "#8a6a4a", pants: "#3b3f52", boots: "#5a3b2a", hat: "hair", hair: "#c4beb4", skin: SKINS[1] },
  walker: { jacket: "#e07a5f", pants: "#3b5b9a", boots: "#f4f1ea", hat: "hair", hair: "#e3c16f", skin: SKINS[0], dress: "#5ab4c9" },
  old: { jacket: "#7b5ac9", pants: "#4a4458", boots: "#4a3426", hat: "cap", cap: "#8a6a4a", moustache: "#d6d0c6", skin: SKINS[1], build: "stout" },
  dart: { jacket: "#c2457a", pants: "#3b3f52", boots: "#3a3d47", hat: "hair", hair: "#3b2a20", skin: SKINS[3] },
  neighbor: { jacket: "#5d7a3a", pants: "#3b5b9a", boots: "#5a3b2a", hat: "cap", cap: "#d94a3a", skin: SKINS[2] },
};
const JACKETS = ["#3f6fb5", "#d94a3a", "#5d7a3a", "#b5653f", "#2f5f6a", "#7b5ac9", "#e0a35a", "#c2457a", "#4fae6a", "#5ab4c9"];
const HAIRS = ["#2a201a", "#5a3b2a", "#c9773a", "#e3c16f", "#1f1a24", "#8a6a4a", "#c4beb4"];
const modern = (i: number, extra: Partial<Outfit> = {}): Outfit => {
  const o: Outfit = { jacket: JACKETS[i % JACKETS.length], pants: ["#3b3f52", "#3b5b9a", "#4a4458"][i % 3], boots: ["#3a3d47", "#5a3b2a", "#f4f1ea"][i % 3],
    hat: i % 3 === 0 ? "cap" : "hair", cap: JACKETS[(i + 4) % JACKETS.length], hair: HAIRS[i % HAIRS.length], skin: SKINS[i % 4] };
  if (i % 5 === 1) o.dress = ["#d9a441", "#c25a7a", "#5a8fc2"][i % 3];
  if (i % 7 === 3) o.moustache = o.hair;
  return { ...o, ...extra };
};
const outfitOf = (key: string | undefined, i: number): [Outfit, string] => (key && OUT[key] ? [OUT[key], key] : [modern(i), `m${i % 210}`]);

// ---------------- drivers, pilots, birds, car effects ----------------
const fwdH = (yaw: number) => [Math.sin(yaw), Math.cos(yaw)];
/** the card's on-screen roll for a seat in a pitched / banked vehicle */
const seatRoll = (cam: CamInfo, p: { yaw: number; pitch: number; roll: number }) => {
  const [fx, fz] = fwdH(p.yaw), rx = cam.right.x, rz = cam.right.z;
  const cfx = rz, cfz = -rx; // camera forward (horizontal) = up x right
  return -(p.pitch * (fx * rx + fz * rz) + p.roll * (fx * cfx + fz * cfz));
};
const drivers = (cam: CamInfo, f: number, cars: CarP[], out: Stage) => {
  for (const c of cars) {
    if (!c.d) continue;
    const d = cam.pos.distanceTo(tmp.set(c.x, c.y + 1.3, c.z));
    if (d > 70) continue;
    if (c.id === 210 && f >= DART_HIT) continue; // thrown clear of the lawn dart (placed by the shot)
    const [o, okey] = outfitOf(c.d.outfit, c.d.i);
    const s = local(c, SEAT);
    const lid = Math.max(lidAt(f, c.d.i), blinkSwap(c.d.i, f, c.d.expr));
    const fo: FrontOpts = { mode: "sit", expr: c.d.expr, look: c.d.look ?? 0, blink: lid, wave: c.d.wave === undefined ? undefined : q(c.d.wave, 24) };
    out.places.push({ ...person(cam, { i: c.d.i, o, okey }, s[0], s[1], s[2], { side: false, mirror: false }, fo, {}, 0.92), roll: seatRoll(cam, c) });
    if (c.d.stars) starsAt(out, local(c, [SEAT[0], SEAT[1] + HEAD_Y + 0.45, SEAT[2]]), f);
  }
};
const starsAt = (out: Stage, p: V3, f: number, w = 0.75) => {
  const u = q((f / FPS * 0.9) % 1, 30);
  out.fx.push({ key: `stars${u}`, cw: 420, ch: 210, draw: (pp) => fxStars(pp, u), x: p[0], y: p[1], z: p[2], w, h: w / 2 });
};
const carFx = (f: number, cars: CarP[], out: Stage) => {
  for (const c of cars) {
    if (c.honk !== undefined && c.honk >= 0) {
      const u = q(c.honk, 20), p = local(c, [0, 1.05, 2.55]);
      out.fx.push({ key: `honk${u}`, cw: 400, ch: 400, draw: (pp) => fxHonk(pp, u), x: p[0], y: p[1], z: p[2], w: 1.4, h: 1.4 });
    }
    if (c.anger) {
      const u = q((f / FPS * 1.8 + c.id * 0.3) % 1, 20), p = local(c, [SEAT[0] + 0.25, SEAT[1] + HEAD_Y + 0.62, SEAT[2]]);
      out.fx.push({ key: `anger${u}`, cw: 300, ch: 300, draw: (pp) => fxAnger(pp, u), x: p[0], y: p[1], z: p[2], w: 0.48, h: 0.48 });
    }
    if (c.smoke) {
      for (const k of [0, 0.5]) {
        const u = q((f / FPS * 0.9 + k) % 1, 30), p = local(c, [0, 1.1, 1.5]);
        out.fx.push({ key: `smoke${u}`, cw: 300, ch: 420, draw: (pp) => fxSmoke(pp, u), x: p[0] + 0.2 * k, y: p[1] + 0.6, z: p[2], w: 1.6, h: 2.24, soft: true });
      }
    }
  }
};
const pilots = (cam: CamInfo, f: number, planes: PlaneP[], out: Stage) => {
  for (const p of planes) {
    if (!p.pilot) continue;
    const s = local(p, [0.3, 0.86, 0.78]), [o, okey] = outfitOf(p.pilot.outfit, p.pilot.i);
    const fo: FrontOpts = { mode: "sit", expr: p.pilot.expr, blink: Math.max(lidAt(f, p.pilot.i), blinkSwap(p.pilot.i, f, p.pilot.expr)) };
    out.places.push({ ...person(cam, { i: p.pilot.i, o, okey }, s[0], s[1], s[2], { side: false, mirror: false }, fo, {}, 0.92), roll: seatRoll(cam, p) });
    if (p.pilot.expr === "nervous") sweat(out, local(p, [0.05, 0.86 + 1.2, 0.78]), f);
  }
};
const sweat = (out: Stage, p: V3, f: number) => {
  const u = q((f / FPS * 1.2) % 1, 20);
  out.fx.push({ key: `sweat${u}`, cw: 200, ch: 200, draw: (pp) => fxSweat(pp, u), x: p[0], y: p[1], z: p[2], w: 0.35, h: 0.35 });
};
const birds = (bs: BirdP[], out: Stage) => bs.forEach((b) => {
  out.fx.push({ key: `bird|${b.flap}|${b.mood}`, cw: 400, ch: 300, draw: (p) => fxBird(p, b.flap, b.mood), x: b.x, y: b.y, z: b.z, w: b.s * 1.333, h: b.s, rot: b.rot ?? 0, mirror: b.mirror });
});
const burstAt = (out: Stage, f: number, f0: number, p: V3, w = 1, n = 6, col?: string) => {
  if (f < f0 || f >= f0 + n) return;
  const u = q((f - f0) / n, 30);
  out.fx.push({ key: `burst${u}${col ?? ""}`, cw: 500, ch: 500, draw: (pp) => fxBurst(pp, u, col), x: p[0], y: p[1], z: p[2], w, h: w });
};
const puffAt = (out: Stage, f: number, f0: number, p: V3, w = 3, n = 24) => {
  if (f < f0 || f >= f0 + n) return;
  const u = q((f - f0) / n, 30);
  out.fx.push({ key: `puff${u}`, cw: 300, ch: 300, draw: (pp) => fxPuff(pp, u), x: p[0], y: p[1], z: p[2], w, h: w, soft: true });
};

// ---------------- people per shot ----------------
const stand = (out: Stage, cam: CamInfo, f: number, i: number, o: Outfit, okey: string, x: number, z: number, fo: FrontOpts, scale = 1, y = 0) => {
  const lid = Math.max(lidAt(f, i), blinkSwap(i, f, fo.expr ?? "neutral"));
  out.places.push(person(cam, { i, o, okey }, x, y, z, { side: false, mirror: false }, { mode: "stand", blink: lid, ...fo }, {}, scale));
  if (y < 0.5) blob(out, x, y, z, scale);
};
const stroll = (out: Stage, cam: CamInfo, f: number, i: number, o: Outfit, okey: string, x: number, z: number, dx: number, dz: number, sp: number, fo: FrontOpts) => {
  const phase = q((f / FPS * sp / 1.4 + hh(i, 5)) % 1, 120), view = viewOf(cam, x, z, dx, dz);
  const lid = lidAt(f, i);
  out.places.push(person(cam, { i, o, okey }, x, 0, z, view, { mode: "stroll", phase, blink: lid, ...fo }, { mode: "march", phase, expr: fo.expr, stomp: 0.55, stride: 0.875 * view.fs, blink: lid }));
  blob(out, x, 0, z);
};
const at = (f: number, w: number, lead = 2) => f >= wf(w) - lead;

const FOOD_SEATS: [number, number][] = [];
for (const tx of [-9, -3, 3, 9]) for (const tz of [-5, 2.5]) for (let c = 0; c < 3; c++) { const a = (c / 3) * Math.PI * 2 + 0.4 + Math.PI / 3; FOOD_SEATS.push([tx + 1.0 * Math.cos(a), tz + 1.0 * Math.sin(a)]); }

const people = (id: number, f: number, cam: CamInfo, out: Stage) => {
  const t = f / FPS;
  switch (id) {
    case 2: {
      stroll(out, cam, f, 300, modern(3), "m3", -4.9, -24 + 1.5 * (t - shotAt(f).a / FPS), 0, 1, 1.5, { expr: "smile", prop: "coffee" });
      stand(out, cam, f, 301, OUT.neighbor, "neighbor", 8.3, -11.5, { expr: "smile", wave: q(Math.sin(t * 8), 24) });
      break;
    }
    case 3: stand(out, cam, f, 302, OUT.neighbor, "neighbor", 13.2, 12.6, { expr: at(f, 25) ? "shock" : "smile", look: -1 }); break;
    case 6: {
      const ex: Expr = f >= BUMP6 ? (f > BUMP6 + 14 ? "pained" : "shock") : at(f, 61) ? "stern" : "neutral";
      stand(out, cam, f, 600, OUT.examiner, "examiner", 5.0, 50.5, { expr: ex, prop: "clipboard", facing: -1 });
      break;
    }
    case 9: {
      const shock = at(f, 100, 4);
      stand(out, cam, f, 900, OUT.walker, "walker", WALKER[0], WALKER[2], { expr: shock ? "shock" : at(f, 94) ? "stern" : "neutral", prop: "coffee", look: 0 });
      const c0 = wf(100) - 2;
      if (f >= c0 && f < c0 + 16) { const u = q((f - c0) / 16, 30); out.fx.push({ key: `coffee${u}`, cw: 400, ch: 400, draw: (p) => fxCoffee(p, u), x: WALKER[0] + 0.35, y: 1.55, z: WALKER[2] - 0.1, w: 0.9, h: 0.9 }); }
      stand(out, cam, f, 901, modern(11), "m11", 5.2, -4.5, { expr: "stern", look: 1 });
      stand(out, cam, f, 902, modern(14), "m14", -5.0, -21, { expr: at(f, 94) ? "pained" : "neutral" });
      break;
    }
    case 13: stand(out, cam, f, 1300, modern(8), "m8", -5.1, -36.2, { expr: f >= wf(127) ? "grin" : "smile", wave: f >= wf(127) ? q(Math.sin(t * 9), 24) : undefined }, 1, 0.15); break;
    case 16: {
      const proud = at(f, 154);
      stand(out, cam, f, 1600, OUT.pilot, "pilot", FIELD[0] + 1.2, 1.5, { expr: at(f, 156) ? "smile_closed" : proud ? "grin" : "smile", wave: proud && !at(f, 156) ? q(Math.sin(t * 7), 24) : undefined });
      break;
    }
    case 17: {
      [-0.65, 0, 0.62].forEach((da, k) => {
        const a = Math.atan2(-8.8, -6.6) + da, r = 2.45;
        const wave = k === 1 && at(f, 163) && f < wf(164) ? q(Math.sin(t * 9), 24) : undefined;
        stand(out, cam, f, 1700 + k, modern(20 + k, { headset: true, jacket: ["#3f6fb5", "#f4f1ea", "#5d7a3a"][k] }), `ctl${k}`, TOWER[0] + r * Math.cos(a), TOWER[2] + r * Math.sin(a),
          { expr: wave ? "grin" : k === 2 ? "nervous" : "stern", wave, look: k === 0 ? 1 : 0 }, 1, 25.06);
      });
      break;
    }
    case 18: case 19: foodCourt(id, f, cam, out); break;
    case 21: {
      const shock = f >= DART_HIT - 1;
      stand(out, cam, f, 2100, OUT.neighbor, "neighbor", -6.6, -33.4, { expr: shock ? "shock" : at(f, 199) ? "nervous" : "smile", look: -1 });
      if (f >= DART_HIT) {
        const s: V3 = [DART[0] + 1.25, 0, DART[2] + 1.6];
        out.places.push(person(cam, { i: 210, o: OUT.dart, okey: "dart" }, s[0], 0, s[2], { side: false, mirror: false }, { mode: "sit", expr: "dazed", blink: lidAt(f, 210) }, {}));
        blob(out, s[0], 0, s[2], 1.1);
        starsAt(out, [s[0], 1.42, s[2]], f, 0.6);
        const u = (f - DART_HIT) / 20;
        if (u < 1) out.fx.push({ key: `dirt${q(u, 30)}`, cw: 600, ch: 400, draw: (p) => fxDirt(p, q(u, 30)), x: DART[0], y: 1.0, z: DART[2] + 1.0, w: 4.2, h: 2.8 });
      }
      break;
    }
  }
};

const foodCourt = (id: number, f: number, cam: CamInfo, out: Stage) => {
  const t = f / FPS, [X, , Z] = FOOD, jet = id === 19;
  const exprs: Expr[] = ["smile", "grin", "lick", "smile_closed", "neutral", "laugh"];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const pid = 1800 + i, o = modern(i + 30, jet ? { jetpack: true } : {}), okey = `fc${i}${jet ? "j" : ""}`;
    // where they are at noon: seated (0-13), queueing (14-21), walking with trays (22-29)
    let x: number, z: number;
    if (i < 14) [x, z] = FOOD_SEATS[(i * 5) % FOOD_SEATS.length];
    else if (i < 22) { const k = i - 14; x = [-12, -4, 4, 12][k % 4] + (k > 3 ? 0.6 : -0.5); z = k > 3 ? 8.7 : 9.9; }
    else { const k = i - 22; x = -14 + k * 4 + 1.5 * Math.sin(t * 0.5 + k); z = -9 + (k % 3) * 4 + 1.2 * Math.cos(t * 0.4 + k); }
    if (!jet) {
      if (i < 14) {
        const lid = lidAt(f, pid);
        out.places.push(person(cam, { i: pid, o, okey }, X + x, 0.1, Z + z, { side: false, mirror: false }, { mode: "sit", expr: exprs[i % 6], blink: lid, look: Math.round(Math.sin(t * 0.7 + i)) }, {}));
      } else if (i < 22) stand(out, cam, f, pid, o, okey, X + x, Z + z, { expr: exprs[(i + 2) % 6], prop: i % 3 === 0 ? "coffee" : null, look: i % 2 ? 1 : 0 });
      else stroll(out, cam, f, pid, o, okey, X + x, Z + z, Math.cos(t * 0.5 + i), -Math.sin(t * 0.4 + i), 1.2, { expr: exprs[i % 6], prop: "tray" });
      continue;
    }
    // jetpacks: everybody lifts off in a ragged wave and loops around the plaza
    const f0 = wf(181) + Math.floor(hh(i, 3) * 26) - 8, up = smooth((f - f0) / 18);
    const r = 2 + hh(i, 4) * 5, w = (hh(i, 5) - 0.5) * 2.2, a0 = hh(i, 6) * 6.28, tt = Math.max(0, t - f0 / FPS);
    const fx = X + x + (r * Math.cos(a0 + w * tt) - r * Math.cos(a0)) * up, fz = Z + z + (r * Math.sin(a0 + w * tt) - r * Math.sin(a0)) * up;
    const fy = up * (1.6 + hh(i, 7) * 5.2) + 0.25 * Math.sin(t * 3 + i) * up + (i < 14 ? 0.1 : 0);
    const tilt = up * (0.25 * Math.sin(t * 2.3 + i * 1.3) + w * 0.1);
    const ex: Expr = up < 0.3 ? exprs[i % 6] : (["shock", "laugh", "nervous", "grin", "shock", "pained"] as Expr[])[i % 6];
    const lid = lidAt(f, pid), flame = q((t * 9 + i * 0.37) % 1, 6);
    out.places.push({ ...person(cam, { i: pid, o, okey }, fx, fy, fz, { side: false, mirror: false }, { mode: up > 0.5 ? "fall" : i < 14 ? "sit" : "stand", expr: ex, blink: lid, flame }, {}), roll: tilt });
    blob(out, fx, 0.02, fz, 1, Math.max(0.2, 1 - fy / 7));
    if (i % 5 === 2 && up > 0.6) { // a tray of food takes its own flight
      const u = q(((t - f0 / FPS) * 0.8) % 1, 30);
      out.fx.push({ key: `confetti${u}`, cw: 600, ch: 600, draw: (p) => fxConfetti(p, u), x: fx + 0.6, y: fy + 1.2, z: fz, w: 1.6, h: 1.6 });
    }
  }
  if (jet) for (const [w, k] of [[183, 0], [185, 1]] as const) burstAt(out, f, wf(w) - 1, [X - 2 + k * 5, 4.2 + k, Z + 1 - k * 3], 1.4, 7, "#ffd84a");
};

/** everything with a face, and every effect card, in shot `id` at frame f */
export const stage = (id: number, f: number, cam: CamInfo, cars: CarP[], planes: PlaneP[], bs: BirdP[], light: Light): Stage => {
  const out: Stage = { places: [], fx: [] };
  LNAME = light;
  if (cam.sun) SUN.copy(cam.sun).normalize();
  drivers(cam, f, cars, out);
  carFx(f, cars, out);
  pilots(cam, f, planes, out);
  birds(bs, out);
  people(id, f, cam, out);
  // cars near the ground get a soft contact pool (no real shadow from far above)
  for (const c of cars) if (cam.pos.distanceTo(tmp.set(c.x, c.y, c.z)) < 80 && (id === 3 || id === 9 || id === 13 || id === 20)) carBlob(out, c);
  // ---- one-off effects ----
  const you = cars.find((c) => c.id === 1);
  if (id === 3) {
    const b0 = wf(22) - 3;
    if (f >= b0 && f < b0 + 14) { const u = q((f - b0) / 14, 30), p = local({ x: YOU_HOME[0], y: 0, z: YOU_HOME[2], yaw: -Math.PI / 2, pitch: 0, roll: 0 }, [0.15, 1.24, 0.72]);
      out.fx.push({ key: `button${u}`, cw: 300, ch: 300, draw: (pp) => fxButton(pp, u), x: p[0], y: p[1], z: p[2], w: 0.32, h: 0.32 }); }
    puffAt(out, f, wf(25) - 2, [YOU_HOME[0], 0.6, YOU_HOME[2]], 4.0, 30);
  }
  if (id === 4 && you) {
    const c0 = wf(32) - 2;
    if (f >= c0 && f < c0 + 45) { const u = q((f - c0) / 45, 30), p = local(you, [0, 2.2, 0.6]);
      out.fx.push({ key: `confetti${u}`, cw: 600, ch: 600, draw: (pp) => fxConfetti(pp, u), x: p[0], y: p[1], z: p[2], w: 4.2, h: 4.2 }); }
  }
  if (id === 5 && planes[0]) void 0;
  if (id === 6 && you) burstAt(out, f, BUMP6, local(you, [0, 0.6, -2.3]), 1.0, 7);
  if (id === 10 && f >= wf(104) - 2) bs.slice(0, 3).forEach((b, k) => {
    const u = q((f / FPS * 2 + k * 0.3) % 1, 20);
    out.fx.push({ key: `anger${u}`, cw: 300, ch: 300, draw: (pp) => fxAnger(pp, u), x: b.x + 0.25 * b.s, y: b.y + 0.55 * b.s, z: b.z - 0.05, w: 0.28, h: 0.28 });
  });
  if (id === 11) {
    const hit = wf(107) - 1, jet = planes[0];
    if (jet && f >= hit) {
      const p = local(jet, [0, 0.6, 17.4]);
      burstAt(out, f, hit, p, 2.6, 8, "#ffd84a");
      const u = (f - hit) / 30;
      if (u < 1) out.fx.push({ key: `feathers${q(u, 30)}`, cw: 400, ch: 400, draw: (pp) => fxFeathers(pp, q(u, 30)), x: p[0] - 10 * u, y: p[1], z: p[2] - 1.2, w: 3.2, h: 3.2 });
      const b = bs[0];
      if (b) starsAt(out, [b.x, b.y + 0.6, b.z], f, 0.9);
    }
  }
  if (id === 12 && you === undefined) {
    const k = cars.find((c) => c.id === 120);
    if (k) bs.forEach((b, i) => {
      if (b.mood !== "shock" || i % 3) return;
      const u = q((f / FPS * 1.1 + i * 0.2) % 1, 30);
      out.fx.push({ key: `feathers${u}`, cw: 400, ch: 400, draw: (pp) => fxFeathers(pp, u), x: b.x, y: b.y, z: b.z - 0.4, w: 1.2, h: 1.2 });
    });
  }
  if (id === 13) puffAt(out, f, wf(127) - 1, [SPOT13[0], 0.5, SPOT13[2]], 4.2, 26);
  if (id === 14) {
    burstAt(out, f, wf(134) - 1, [2.2, 32.4 + 1.85, CUBE_Z + 0.6], 1.1, 7);
    burstAt(out, f, wf(137) - 1, [2.2, 32.4 + 0.05, CUBE_Z + 0.6], 1.1, 7);
  }
  if (id === 15 && you && at(f, 145)) sweat(out, local(you, [SEAT[0] - 0.3, SEAT[1] + HEAD_Y + 0.35, SEAT[2]]), f);
  if (id === 22) {
    // the ticket: flies from the cop's window into yours and sticks to the door
    const u = clamp01((f - TICKET) / 10), a: V3 = [-4 + 0.95, 31.45, YOU22[2] - 0.3], b: V3 = [YOU22[0] + 0.15, 31.62, YOU22[2] + 0.66];
    if (f >= TICKET) out.fx.push({ key: "ticket", cw: 200, ch: 260, draw: fxTicket, x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u + 0.5 * Math.sin(u * Math.PI), z: a[2] + (b[2] - a[2]) * u,
      w: 0.32, h: 0.42, rot: (1 - u) * 5 + 0.15 });
  }
  return out;
};
