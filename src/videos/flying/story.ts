// Timeline of "The Day Everyone Got a Flying Car": shots timed to the voice words (words.json, forced-aligned and
// pause-tightened from the ElevenLabs read), the motion of every car / plane / bird, and the camera grammar of the
// bridge short (motion.md): continuous slow push-ins, symmetric smootherstep glides, big reframes are cuts,
// impacts are 7-frame kicks that flip sign every frame, no hand-held float. Everything is a pure function of the frame.
import WORDS from "./words.json";
import type { Expr } from "./toon";

export const FPS = 30;
export const D0 = 0; // ground level (build.ts houses sit on D0)
export type V3 = [number, number, number];

// ---------------- words ----------------
type Word = { w: string; s: number; e: number };
const WD = WORDS as Word[];
/** frame of the onset of word i */
export const wf = (i: number) => Math.round(WD[i].s * FPS);
/** shot starts sit 3 frames before their first word (reference: picture leads the voice by 0-3 f) */
const A = (i: number) => wf(i) - 3;
export const TOTAL = Math.round(WD[WD.length - 1].e * FPS) + 14;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// ---------------- shots ----------------
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light };
const STARTS: [number, Light][] = [
  [0, "day"],          // 1  hook: the jam in the sky (flash-forward)
  [A(16), "day"],      // 2  Monday morning, the street
  [A(19), "day"],      // 3  you press a button, the driveway drops away, so does everyone else's
  [A(32), "day"],      // 4  congratulations ... two hundred million licensed drivers
  [A(44), "day"],      // 5  to fly a plane: forty hours
  [A(56), "day"],      // 6  to drive: a short test and one parallel park
  [A(70), "day"],      // 7  the guy who never uses his turn signal
  [A(88), "day"],      // 8  road rage gets altitude
  [A(92), "day"],      // 9  honking from above
  [A(101), "day"],     // 10 the birds are furious
  [A(105), "day"],     // 11 planes already hit seventeen thousand
  [A(115), "day"],     // 12 cousin Kevin
  [A(122), "day"],     // 13 luckily: nobody parallel parks
  [A(129), "day"],     // 14 unluckily: in three dimensions
  [A(139), "day"],     // 15 wait, why does it work for planes?
  [A(148), "golden"],  // 16 you see: pilots are great
  [A(157), "golden"],  // 17 controllers, lanes and altitudes
  [A(172), "day"],     // 18 the food court at noon
  [A(180), "day"],     // 19 give every stranger a jetpack
  [A(186), "day"],     // 20 a car breaks down: the shoulder
  [A(197), "day"],     // 21 a flying car: a lawn dart
  [A(207), "day"],     // 22 the fix: invisible roads, limits, lights, fines
  [A(222), "golden"],  // 23 we rebuilt the road
  [A(237), "golden"],  // 24 the potholes are farther down
];
export const SHOTS: ShotDef[] = STARTS.map(([a, light], i) => ({ id: i + 1, a, b: i + 1 < STARTS.length ? STARTS[i + 1][0] : TOTAL, light }));
/** crossfades (frames) at place / time-of-day changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 16: 8, 18: 8, 23: 8 };
export const FLASH_AT = SHOTS[1].a;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- places ----------------
export const HOUSE_X = 16;            // house centres on both sides of the street (street along z, x in -4..4)
export const HOUSE_Z = Array.from({ length: 21 }, (_, k) => -150 + k * 15);
export const YOU_HOME: V3 = [9.5, 0, 6.5]; // your driveway (house at x 16, z 0)
export const FOOD: V3 = [-300, 0, 0];  // food court plaza
export const FIELD: V3 = [300, 0, 0];  // airfield
export const TOWER: V3 = [330, 0, 40]; // control tower
export const ROAD_Y = 90;              // the rebuilt road in the sky (deck top)
export const HOLE: V3 = [0.62, ROAD_Y, 9.45]; // the pothole, under your front-left wheel
export const LANE_Y = 30;              // the invisible lanes (shot 22)
export const LIGHT_AT: V3 = [2.1, 34.6, 240]; // floating traffic light (drone)
export const CUBE_Z = 120;             // the parking cube in the sky (shot 14)

// ---------------- vehicles ----------------
export type Pose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number };
/** local (x left, y up, z forward) -> world; yaw about y, pitch > 0 = nose down, roll about the forward axis */
export const local = (p: Pose, v: V3): V3 => {
  let [x, y, z] = v, c = Math.cos(p.roll), s = Math.sin(p.roll);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(p.pitch); s = Math.sin(p.pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(p.yaw); s = Math.sin(p.yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  return [p.x + x, p.y + y, p.z + z];
};
export const SEAT: V3 = [0.42, 0.62, 0.05]; // driver card base (left seat, raised cushion)
export const HEAD_Y = 0.79;                  // driver head centre above the seat base (card scale 0.92)
export type Kind = "car" | "police" | "old";
export type Drv = { i: number; expr: Expr; wave?: number; look?: number; outfit?: string; stars?: boolean };
export type CarP = Pose & { id: number; col: string; kind: Kind; fly: number; d?: Drv; honk?: number; smoke?: number; anger?: boolean };
export type PlaneP = Pose & { kind: "cessna" | "jet"; pilot?: Drv; prop?: number };
export type BirdP = { x: number; y: number; z: number; flap: number; mood: "angry" | "shock" | "dazed"; s: number; rot?: number; mirror?: boolean };

export const PALETTE = ["#d94a3a", "#3f7fd0", "#f2c14e", "#4fae6a", "#f08a2c", "#8a5ac9", "#efe8d8", "#2f8a8a", "#c2457a", "#5ab4c9", "#e07a5f", "#6a7fd0"];
export const YOU_COL = "#e8553a", KEVIN_COL = "#9bd13b", GUY_COL = "#7a2fa0", OLD_COL = "#9a7650", DART_COL = "#2fa59a";
const pal = (i: number) => PALETTE[Math.floor(hh(i, 4) * PALETTE.length) % PALETTE.length];
const MOODS: Expr[] = ["stern", "neutral", "nervous", "stern", "smile", "pained"];
const T = (f: number) => f / FPS;
const pose = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): Pose => ({ x, y, z, yaw, pitch, roll });
/** gentle hover bob for flying cars */
const bob = (i: number, f: number) => 0.05 * Math.sin(T(f) * 2.1 + i * 1.7);
const LEADF = 2;
/** expression helper: before / after a word (lands LEADF frames early) */
const at = (f: number, w: number) => f >= wf(w) - LEADF;
const YOU_I = 0; // your driver id (cast.ts outfit "you")

// shot 1 / 23: bumper-to-bumper jam. levels > 0 = in the air; on the rebuilt road everything sits on the deck
const JAM_X = [-7, -2.3, 2.3, 7], JAM_Y = [24, 30, 36];
const jamCars = (f: number, out: CarP[], road: boolean) => {
  const xs = road ? [-4.2, 0, 4.2] : JAM_X, ys = road ? [ROAD_Y] : JAM_Y, gap = road ? 5.9 : 6.3;
  let id = 1000;
  xs.forEach((x, li) => ys.forEach((y, lv) => {
    for (let k = -34; k <= 34; k++) {
      id++;
      const you = road ? li === 1 && k === 1 : li === 2 && lv === 1 && k === 0;
      if (you) continue;
      // stop-and-go creep: every car inches forward in a wave
      const creep = 0.5 * Math.max(0, Math.sin(T(f) * 0.9 - k * 0.35 + li));
      const z = k * gap + (hh(id) - 0.5) * 0.9 + creep;
      const yy = road ? y : y + bob(id, f) + (hh(id, 2) - 0.5) * 0.5;
      const honk = hh(id, 5) < 0.18 ? (T(f) * 0.8 + hh(id, 6)) % 1 : -1;
      out.push({ ...pose(x + (hh(id, 3) - 0.5) * 0.4, yy, z, (hh(id, 7) - 0.5) * 0.06), id, col: pal(id), kind: "car", fly: road ? 0 : 1, honk,
        d: { i: id, expr: MOODS[id % MOODS.length], look: 0 } });
    }
  }));
};
/** shot 1: your place in the jam */
export const youJam = (f: number): Pose => pose(2.3, 30 + bob(0, f), 0.4 * Math.max(0, Math.sin(T(f) * 0.9 + 2)));

/** free sky traffic in a block around a moving reference (shots 4, 7, 10, 12, 15, 22) */
const flow = (f: number, out: CarP[], o: { xs: number[]; ys: number[]; v: number; z0: number; z1: number; gap: number; seed: number; ref?: number; yaw?: number; skip?: (x: number, y: number, rz: number) => boolean; mood?: (id: number) => Expr }) => {
  let id = o.seed;
  const ref = o.ref ?? 0, dir = o.yaw ?? 0;
  for (const x of o.xs) for (const y of o.ys) {
    for (let rz = o.z0; rz <= o.z1; rz += o.gap) {
      id++;
      const jz = rz + (hh(id) - 0.5) * o.gap * 0.5;
      if (o.skip?.(x, y, jz)) continue;
      const along = jz + ref;
      const px = dir ? along * Math.sin(dir) + x * Math.cos(dir) : x + (hh(id, 3) - 0.5) * 0.6;
      const pz = dir ? along * Math.cos(dir) - x * Math.sin(dir) : along;
      out.push({ ...pose(px, y + bob(id, f) + (hh(id, 2) - 0.5) * 0.6, pz, dir + (hh(id, 7) - 0.5) * 0.08), id, col: pal(id), kind: "car", fly: 1,
        d: { i: id, expr: o.mood ? o.mood(id) : MOODS[id % MOODS.length] } });
    }
  }
};

/** shot 3: every driveway car lifts off (yours first, on "drops") */
export const liftY = (f: number, f0: number, h: number) => h * smooth((f - f0) / 62) + (f > f0 ? 0.25 * Math.sin(Math.min(1, (f - f0) / 62) * Math.PI) : 0);
const driveways = (f: number, out: CarP[], lift: boolean) => {
  let id = 200;
  for (const s of [-1, 1]) for (const zc of HOUSE_Z) {
    id++;
    const you = s === 1 && zc === 0;
    const f0 = you ? wf(25) - 2 : wf(28) + Math.floor(hh(id) * 14) - 4;
    const h = you ? 9 : 10 + hh(id, 2) * 6;
    const y = lift ? liftY(f, f0, h) : 0;
    const p = pose(s * 9.5, y, zc + 6.5, -s * Math.PI / 2, 0, lift && f > f0 ? 0.04 * Math.sin((f - f0) * 0.2) * (1 - smooth((f - f0) / 60)) : 0);
    out.push({ ...p, id: you ? 1 : id, col: you ? YOU_COL : pal(id), kind: "car", fly: lift ? smooth((f - f0 + 6) / 8) : 0,
      d: you ? youDrv(f) : { i: id, expr: lift && f > f0 ? (id % 3 ? "grin" : "shock") : "smile", wave: lift && f > f0 + 20 && id % 4 === 0 ? Math.sin(T(f) * 9 + id) : undefined } });
  }
};

// ---------------- your face ----------------
const youDrv = (f: number): Drv => {
  const s = shotAt(f).id;
  const d = (expr: Expr, extra: Partial<Drv> = {}): Drv => ({ i: YOU_I, outfit: "you", expr, ...extra });
  switch (s) {
    case 1: return d(at(f, 12) ? "pained" : "stern", { look: -1 });
    case 2: case 3: return d(at(f, 25) ? "grin" : at(f, 22) ? "smile_closed" : "smile");
    case 4: return d(at(f, 34) ? "grin" : "laugh");
    case 6: return d(at(f, 69) ? (f > wf(69) + 12 ? "relief_open" : "shock") : at(f, 64) ? "nervous" : "smile");
    case 13: return d(f >= wf(127) ? "smile_closed" : "whistle");
    case 14: return d(f >= wf(137) - 2 && f < wf(137) + 10 ? "shock" : f >= wf(134) - 2 && f < wf(134) + 10 ? "shock" : "nervous");
    case 15: return d(at(f, 145) ? "shock" : "nervous", { look: at(f, 141) ? 1 : -1 });
    case 22: return d(at(f, 221) ? "pained" : at(f, 216) ? "nervous" : "smile");
    case 23: return d("neutral", { look: 0 });
    case 24: return d(f >= wf(240) + 1 ? "shock" : "neutral");
    default: return d("smile");
  }
};

// shot 6: the driving test (on the ground: parked cars at the curb, you reverse into the gap)
export const P_REAR: V3 = [2.9, 0, 44.0], P_FRONT: V3 = [2.9, 0, 54.0];
export const BUMP6 = wf(69) - 3;
export const youPark = (f: number): Pose => {
  const f0 = wf(65) - 2, u = smooth((f - f0) / (BUMP6 - f0));
  const z = 56.5 - 8.35 * u + (f > BUMP6 ? 0.12 * Math.exp(-(f - BUMP6) / 4) : 0);
  const x = 0.4 + 2.5 * smooth((f - f0 - 6) / (BUMP6 - f0 - 4));
  const yaw = 0.5 * Math.sin(Math.PI * clamp01((f - f0 - 4) / (BUMP6 - f0 - 2)));
  return pose(x, 0, z, yaw);
};
export const CONE6: V3 = [1.45, 0, 47.4];

// shot 7: the guy who never signals, weaving inside a lane flow moving +z at 10 m/s
const F7 = A(70);
export const ref7 = (f: number) => 10 * T(f - F7);
const ramp = (f: number, w: number, d = 16) => smooth((f - wf(w) + LEADF) / d);
export const guy = (f: number): Pose => {
  const x = lerp(lerp(0, 4.2, ramp(f, 75, 18)), -4.2, ramp(f, 82, 20));
  const y = 26 + lerp(lerp(lerp(0, -4, ramp(f, 80, 14)), 4, ramp(f, 81, 14)), 0, ramp(f, 85, 16));
  const dx = 4.2 * (ramp(f + 1, 75, 18) - ramp(f, 75, 18)) - 8.4 * (ramp(f + 1, 82, 20) - ramp(f, 82, 20));
  const dy = -4 * (ramp(f + 1, 80, 14) - ramp(f, 80, 14)) + 8 * (ramp(f + 1, 81, 14) - ramp(f, 81, 14)) - 4 * (ramp(f + 1, 85, 16) - ramp(f, 85, 16));
  return pose(x, y, ref7(f), Math.atan2(dx * 3, 10), -dy * 1.2, -dx * 1.6);
};

// shot 8: road rage gets altitude
export const rageY = (f: number) => 26 + 8 * smooth((f - wf(89) + 4) / 40);

// shot 9: honking from above (a pedestrian with a coffee on the east sidewalk)
export const WALKER: V3 = [5.0, 0, -14];
const HONKERS: V3[] = [[-1.8, 8.6, -17.5], [2.6, 10.8, -11.2], [6.2, 7.4, -9.0], [0.6, 12.6, -20.4], [4.8, 9.6, -15.6], [-3.4, 11.4, -8.4]];

// shot 11: the airliner, flying +x through a flock
export const jet11 = (f: number): Pose => pose(-90 + 72 * T(f - A(105)), 160, 0, Math.PI / 2, 0, 0);
// shot 12: cousin Kevin
export const kevin = (f: number): Pose => pose(0, 24 + bob(3, f), 8 * T(f - A(115)), 0, 0, 0.03 * Math.sin(T(f) * 3));

// shot 13: landing straight down into a street spot
export const SPOT13: V3 = [-2.9, 0, -40];
export const land13 = (f: number) => 9 * (1 - smooth((f - A(122) - 6) / (wf(127) - A(122) - 6)));

// shot 14: the parking cube
export const CUBE_X = [-6.6, -2.2, 2.2, 6.6], CUBE_Y = [30, 32.4, 34.8];
export const youCube = (f: number): Pose => {
  const f0 = A(129) + 8, f1 = wf(138) + 8;
  const u = smooth((f - f0) / (f1 - f0));
  const x = lerp(10.5, 2.2, u);
  const b1 = Math.exp(-(((f - wf(134)) / 4) ** 2)), b2 = Math.exp(-(((f - wf(137)) / 4) ** 2));
  const y = 32.4 + 0.42 * b1 - 0.42 * b2 + 0.12 * Math.sin(T(f) * 5) * (1 - u);
  return pose(x, y, CUBE_Z + 0.15 * Math.sin(T(f) * 3.3) * (1 - u), 0.06 * Math.sin(T(f) * 4.1) * (1 - u), 0.05 * (b2 - b1), 0.08 * (b1 - b2));
};
// shot 15: hovering, wondering
export const YOU15: V3 = [0, 30, 0];

// shot 20: the old car that breaks down and rolls to the shoulder
export const old20 = (f: number): Pose => {
  const t = T(f - A(186)), stopT = T(wf(196) + 12 - A(186));
  const v = (tt: number) => 4.2 * (1 - smooth(tt / stopT) * 0.999);
  // distance = integral of v (midpoint sum on frames keeps it a pure function)
  let d = 0;
  for (let k = 0; k < Math.min(t, stopT + 1) * FPS; k++) d += v((k + 0.5) / FPS) / FPS;
  const sx = smooth((f - wf(193) + 2) / 26);
  return pose(lerp(-1.8, -3.05, sx), 0, -84 + d, -0.22 * Math.sin(Math.PI * sx));
};

// shot 21: the lawn dart
export const DART: V3 = [-9.0, 0, -28.5];
export const DART_FALL = wf(200);                         // engines out on "just"
export const DART_HIT = DART_FALL + 44;                   // 10.7 m fall
export const dart = (f: number): Pose => {
  const t = Math.max(0, T(f - DART_FALL)), tl = T(DART_HIT - DART_FALL);
  const sput = f > wf(199) && f < DART_FALL ? 0.12 * Math.sin(f * 1.7) : 0;
  if (f < DART_HIT) {
    const y = 12 - 4.9 * Math.min(t, tl) ** 2 + sput;
    return pose(DART[0], Math.max(1.3, y), DART[2] - 1.2 + 1.2 * clamp01(t / tl), 0, 1.25 * smooth(t / 1.2), 0.1 * Math.sin(t * 6) * smooth(t / 0.6));
  }
  const w = Math.exp(-(f - DART_HIT) / 7) * Math.sin((f - DART_HIT) * 1.3);
  return pose(DART[0], 1.3, DART[2], 0, 1.25 + 0.05 * w, 0.03 * w);
};

// shot 22: lanes appear; the police; the floating light; the ticket
export const LANES_X = [-6, -2, 2, 6], LANE_C = [-4, 0, 4];
export const laneShow = (f: number, z: number) => smooth((f - wf(211) + 2 - (z + 150) / 12) / 10); // draw-on from near to far
const F22 = A(207);
export const ref22 = (f: number) => 9 * T(f - F22);
export const LIGHT_RED = wf(219) - 2, LIGHT_AMBER = wf(218) + 4;
export const YOU22: V3 = [0, LANE_Y, LIGHT_AT[2] - 9];
export const TICKET = wf(221) - 3;

// shot 24: your front-left wheel finds the pothole
export const youRoad = (f: number): Pose => {
  const id = shotAt(f).id;
  if (id !== 24) return pose(0, ROAD_Y, 6 + 0.3 * Math.max(0, Math.sin(T(f) * 0.9 + 1)));
  const u = smooth((f - A(237)) / (wf(240) + 1 - A(237)));
  const dip = f >= wf(240) + 1 ? 1 - 0.25 * Math.exp(-(f - wf(240) - 1) / 5) * Math.cos((f - wf(240)) * 1.1) : 0;
  return pose(0, ROAD_Y - 0.1 * dip, 6 + 2.0 * u, 0, 0.07 * dip, -0.075 * dip);
};

/** every car in shot `id` at frame f */
export const carsAt = (id: number, f: number): CarP[] => {
  const out: CarP[] = [];
  const you = (p: Pose, extra: Partial<CarP> = {}): CarP => ({ ...p, id: 1, col: YOU_COL, kind: "car", fly: 1, d: youDrv(f), ...extra });
  switch (id) {
    case 1: jamCars(f, out, false); out.push(you(youJam(f), { honk: f >= wf(12) - 4 ? (T(f) * 1.6) % 1 : -1 })); break;
    case 2: driveways(f, out, false); break;
    case 3: driveways(f, out, true); break;
    case 4: {
      const p = pose(2, 22 + bob(1, f), 9 * T(f - A(32)));
      out.push(you(p));
      flow(f, out, { xs: [-14, -6, 9, 16], ys: [17, 22, 28, 34], v: 0, z0: -40, z1: 120, gap: 13, seed: 3000, ref: 4 * T(f - A(32)) });
      // the swarm: two hundred million licensed drivers
      let sid = 5000;
      for (let k = 0; k < 900; k++) {
        sid++;
        const yaw = (hh(sid, 1) - 0.5) * 1.4, sp = 6 + hh(sid, 2) * 8;
        const x = (hh(sid, 3) - 0.5) * 560 + Math.sin(yaw) * sp * T(f), z = -40 + hh(sid, 4) * 640 + Math.cos(yaw) * sp * T(f - 300);
        if (Math.abs(x) < 20 && z < 140) continue;
        out.push({ ...pose(x, 14 + hh(sid, 5) * 62, z, yaw), id: sid, col: pal(sid), kind: "car", fly: 1 });
      }
      break;
    }
    case 6: {
      out.push({ ...pose(...P_REAR, 0, 0, 0), id: 61, col: "#3f7fd0", kind: "car", fly: 0 });
      out.push({ ...pose(P_FRONT[0], 0, P_FRONT[2] + (f > BUMP6 ? 0 : 0), 0), id: 62, col: "#f2c14e", kind: "car", fly: 0 });
      const rb = f > BUMP6 ? 0.1 * Math.exp(-(f - BUMP6) / 5) : 0; // the rear car gets nudged
      out[0].z -= rb;
      out.push(you(youPark(f), { fly: 0 }));
      break;
    }
    case 7: {
      const g = guy(f);
      out.push({ ...g, id: 70, col: GUY_COL, kind: "car", fly: 1, d: { i: 70, outfit: "guy", expr: "whistle" } });
      flow(f, out, { xs: [-4.2, 0, 4.2], ys: [22, 26, 30], v: 10, z0: -58, z1: 76, gap: 9, seed: 7000, ref: ref7(f),
        skip: (x, y, rz) => Math.abs(rz) < 3.6, mood: (i) => (f > wf(75) && i % 2 ? "shock" : i % 3 ? "stern" : "nervous") });
      break;
    }
    case 8: {
      const y = rageY(f), shake = (i: number) => Math.sin(T(f) * 13 + i);
      out.push({ ...pose(-1.35, y + bob(4, f), 0, 0.05, 0, 0.02 * shake(1)), id: 81, col: "#3f7fd0", kind: "car", fly: 1, anger: true,
        d: { i: 81, outfit: "rageA", expr: "angry", wave: shake(2) } });
      out.push({ ...pose(1.35, y + bob(5, f), 0.4, -0.05, 0, 0.02 * shake(3)), id: 82, col: "#f2c14e", kind: "car", fly: 1, anger: true,
        d: { i: 82, outfit: "rageB", expr: "angry", wave: shake(4) } });
      flow(f, out, { xs: [-9, 9], ys: [22, 30, 38], v: 0, z0: -60, z1: 60, gap: 14, seed: 8000, ref: 6 * T(f) });
      break;
    }
    case 9: HONKERS.forEach((h, i) => {
      const ph = (T(f) * 1.3 + i * 0.37) % 1, top = i === 0 && f >= wf(100) - 6;
      out.push({ ...pose(h[0], h[1] + bob(90 + i, f), h[2], 0.8 + i * 0.9), id: 90 + i, col: pal(90 + i), kind: "car", fly: 1,
        honk: f >= wf(92) - 4 + i * 6 || top ? (top ? (T(f) * 2.2) % 1 : ph) : -1, d: { i: 90 + i, expr: i % 2 ? "stern" : "angry" } });
    }); break;
    case 10: flow(f, out, { xs: [14, 19], ys: [23, 26.5, 30], v: 10, z0: -60, z1: 60, gap: 11, seed: 10000, ref: 10 * T(f), yaw: Math.PI / 2 }); break;
    case 12: out.push({ ...kevin(f), id: 120, col: KEVIN_COL, kind: "car", fly: 1,
      d: { i: 120, outfit: "kevin", expr: at(f, 121) ? "laugh" : "grin", wave: Math.sin(T(f) * 10) } });
      flow(f, out, { xs: [-12, 12], ys: [20, 28], v: 8, z0: -30, z1: 90, gap: 16, seed: 12000, ref: 6 * T(f - A(115)) });
      break;
    case 13: {
      out.push({ ...pose(SPOT13[0], 0, SPOT13[2] - 6.2), id: 131, col: "#4fae6a", kind: "car", fly: 0 });
      out.push({ ...pose(SPOT13[0], 0, SPOT13[2] + 6.2), id: 132, col: "#efe8d8", kind: "car", fly: 0 });
      const y = land13(f);
      out.push(you(pose(SPOT13[0], y, SPOT13[2], 0, 0, 0.03 * Math.sin(T(f) * 4) * (y / 9)), { fly: y > 0.02 ? 1 : 0 }));
      break;
    }
    case 14: {
      let cid = 1400;
      for (const x of CUBE_X) for (const y of CUBE_Y) {
        cid++;
        if (x === 2.2 && y === 32.4) continue;
        const above = x === 2.2 && y === 34.8, below = x === 2.2 && y === 30;
        const jolt = above ? 0.25 * Math.exp(-(((f - wf(134) - 2) / 5) ** 2)) : below ? -0.25 * Math.exp(-(((f - wf(137) - 2) / 5) ** 2)) : 0;
        const hit = (above && f > wf(134) - 2 && f < wf(134) + 14) || (below && f > wf(137) - 2 && f < wf(137) + 14);
        out.push({ ...pose(x + (hh(cid) - 0.5) * 0.2, y + bob(cid, f) + jolt, CUBE_Z + (hh(cid, 2) - 0.5) * 0.4, (hh(cid, 3) - 0.5) * 0.06), id: cid,
          col: pal(cid), kind: "car", fly: 1, d: { i: cid, expr: hit ? "shock" : cid % 3 ? "stern" : "pained" } });
      }
      out.push(you(youCube(f)));
      break;
    }
    case 15: {
      out.push(you(pose(YOU15[0], YOU15[1] + bob(1, f), YOU15[2], 0.1 * Math.sin(T(f) * 0.7))));
      flow(f, out, { xs: [-14, 14], ys: [24, 34], v: 0, z0: -60, z1: 40, gap: 16, seed: 15000, ref: 2 * T(f) });
      break;
    }
    case 20: out.push({ ...old20(f), id: 200, col: OLD_COL, kind: "old", fly: 0, smoke: f >= wf(190) - 2 ? 1 : 0,
      d: { i: 200, outfit: "old", expr: f >= wf(196) ? "relief" : f >= wf(190) - 2 ? "nervous" : "smile" } }); break;
    case 21: {
      const p = dart(f), down = f >= DART_HIT;
      out.push({ ...p, id: 210, col: DART_COL, kind: "car", fly: f < DART_FALL ? (f > wf(199) ? (f % 4 < 2 ? 1 : 0.2) : 1) : 0, smoke: f >= wf(199) - 2 ? 1 : 0,
        d: { i: 210, outfit: "dart", expr: down ? "dazed" : f >= DART_FALL ? "shock" : f >= wf(199) ? "nervous" : "smile", stars: down } });
      break;
    }
    case 22: {
      const k = smooth((f - wf(211) - 6) / 30); // chaos -> lanes
      let lid = 22000;
      for (const lx of LANE_C) for (let rz = -60; rz <= 160; rz += 10) {
        lid++;
        const cx = lx + (hh(lid) - 0.5) * 7 * (1 - k), cy = LANE_Y + (hh(lid, 2) - 0.5) * 8 * (1 - k);
        const yaw = (hh(lid, 3) - 0.5) * 1.6 * (1 - k);
        const z = rz + ref22(f) + (hh(lid, 4) - 0.5) * 4 * (1 - k);
        if (z > LIGHT_AT[2] - 14) continue;
        out.push({ ...pose(cx, cy + bob(lid, f) * (1 - k), z, yaw), id: lid, col: pal(lid), kind: "car", fly: 1,
          d: { i: lid, expr: k < 0.5 ? "nervous" : "smile" } });
      }
      // queue behind the light (static, close to the stop line)
      let qid = 22500;
      for (const lx of LANE_C) for (let q = 0; q < 6; q++) {
        qid++;
        if (lx === 0 && q === 1) continue; // you sit here (YOU22)
        const brake = f >= LIGHT_RED ? 0.05 * Math.exp(-(f - LIGHT_RED) / 6) : 0;
        out.push({ ...pose(lx + (hh(qid) - 0.5) * 0.3, LANE_Y + bob(qid, f) * 0.5, LIGHT_AT[2] - 2.5 - q * 6.3, 0, brake), id: qid, col: pal(qid), kind: "car", fly: 1,
          d: { i: qid, expr: f >= LIGHT_RED ? "stern" : "neutral" } });
      }
      out.push(you(pose(YOU22[0], YOU22[1] + bob(1, f) * 0.5, YOU22[2])));
      out.push({ ...pose(-4, LANE_Y + bob(2, f), YOU22[2] - 0.3), id: 221, col: "#f4f4f4", kind: "police", fly: 1,
        d: { i: 221, outfit: "cop", expr: "stern", wave: f >= TICKET - 6 && f < TICKET + 10 ? 0.6 : undefined } });
      // and the lane-flow version of you + the cop for the "speed limits" beat (moving with the flow)
      const R = ref22(f);
      out.push(you(pose(0, LANE_Y + bob(1, f) * 0.4, R + 30), { id: 2 }));
      out.push({ ...pose(-4, LANE_Y + bob(3, f), R + 29.4), id: 222, col: "#f4f4f4", kind: "police", fly: 1, d: { i: 222, outfit: "cop", expr: "stern", wave: Math.sin(T(f) * 8) } });
      break;
    }
    case 23: case 24: {
      jamCars(f, out, true);
      out.push(you(youRoad(f), { fly: 0, honk: id === 23 && f > wf(230) - 4 ? (T(f) * 1.4) % 1 : -1 }));
      break;
    }
  }
  return out;
};

/** planes in shot `id` */
export const cessna5 = (f: number): Pose => pose(-40 + 22 * T(f - A(44)), 85 + 0.3 * Math.sin(T(f) * 1.3), 60, Math.PI / 2, 0, 0.03 * Math.sin(T(f) * 1.1));
export const PARKED_CESSNA: Pose = { x: FIELD[0], y: 0, z: 7.2, yaw: Math.PI + 0.35, pitch: 0, roll: 0 };
export const LANES17_Y = [52, 66, 80, 94];
export const lane17x = (i: number, f: number) => 220 + i * 70 + 55 * T(f - A(157)) + (i % 2) * 35;
export const planesAt = (id: number, f: number): PlaneP[] => {
  const out: PlaneP[] = [];
  switch (id) {
    case 5: out.push({ ...cessna5(f), kind: "cessna", prop: f, pilot: { i: 50, outfit: "student", expr: at(f, 55) ? "stern" : at(f, 52) ? "nervous" : "smile" } }); break;
    case 11: out.push({ ...jet11(f), kind: "jet" }); break;
    case 15: out.push({ ...pose(-260 + 62 * T(f - A(139)), 66, -95, Math.PI / 2), kind: "jet" }); break;
    case 16: out.push({ ...PARKED_CESSNA, kind: "cessna", prop: 0 }); break;
    case 17: {
      out.push({ ...PARKED_CESSNA, kind: "cessna", prop: 0 });
      LANES17_Y.forEach((y, i) => out.push({ ...pose(lane17x(i, f), y, 140, Math.PI / 2), kind: "jet" }));
      break;
    }
  }
  return out;
};

/** birds in shot `id` */
export const birdsAt = (id: number, f: number): BirdP[] => {
  const out: BirdP[] = [];
  const t = T(f), flap = (i: number, rate = 9) => Math.floor((t * rate + hh(i)) * 2) % 2;
  if (id === 10) {
    const furious = at(f, 104);
    const spots: V3[] = [[-0.15, 26.15, 0.3], [-1.05, 26.85, 1.4], [0.95, 26.95, 1.1], [-0.75, 25.35, 1.9], [1.15, 25.5, 2.3], [0.2, 27.7, 3.4], [-1.8, 27.6, 4.2]];
    spots.forEach(([x, y, z], i) => out.push({ x: x + 0.05 * Math.sin(t * 2 + i), y: y + 0.08 * Math.sin(t * 9 + i * 2), z, flap: flap(i, furious ? 14 : 8), mood: "angry", s: i === 0 ? 0.62 : 0.5, mirror: x > 0 }));
  }
  if (id === 11) {
    const j = jet11(f), hit = wf(107) - 1;
    // a flock just ahead of the nose; the plane flies into it
    for (let i = 0; i < 26; i++) {
      const bx = -90 + 72 * T(hit - A(105)) + 18.6 + 6 + i * 2.3, by = 160 + 0.6 + (hh(i, 2) - 0.5) * 9, bz = (hh(i, 3) - 0.5) * 22;
      const near = Math.abs(bx - (j.x + 18.6)) < 10;
      const scat = Math.max(0, j.x + 25 - bx) * 0.6;
      if (i === 0) {
        // the unlucky one: bonks off the nose on "hit"
        if (f < hit) out.push({ x: j.x + 18.4 + 0.15 * (hit - f), y: 160.5, z: 0, flap: flap(i, 12), mood: "shock", s: 0.7 });
        else { const u = T(f - hit); out.push({ x: j.x + 18.4 - 30 * u, y: 160.5 + 4 * u - 4.9 * u * u, z: -3 * u, flap: 0, mood: "dazed", s: 0.7, rot: u * 9 }); }
        continue;
      }
      out.push({ x: bx, y: by + scat * Math.sign(hh(i, 4) - 0.5), z: bz + scat * Math.sign(bz || 1) * 1.4, flap: flap(i, near ? 16 : 9), mood: near ? "shock" : "angry", s: 0.65, mirror: true });
    }
  }
  if (id === 12) {
    const k = kevin(f);
    // birds hang in the air ahead; the car flies through them and they scatter out of its way
    for (let i = 0; i < 9; i++) {
      const dz = 16 - ((T(f - A(115)) * 7 + i * 2.1 + hh(i, 5) * 1.5) % 22); // +16 ahead .. -6 behind, relative to the car
      const side = i % 2 ? 1 : -1, close = Math.max(0, 1 - Math.abs(dz - 1) / 5);
      out.push({ x: k.x + side * (1.3 + 2.2 * smooth(close * 1.4) + hh(i) * 0.8), y: k.y + 1.0 + (hh(i, 2) - 0.3) * 2.0 + close * 1.1, z: k.z + dz,
        flap: flap(i, 10 + 10 * close), mood: close > 0.2 ? "shock" : "angry", s: 0.5, mirror: side > 0, rot: side * 0.5 * close });
    }
  }
  return out;
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mixC = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mixC(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const P = (p: Pose): V3 => [p.x, p.y, p.z];
/** the driver's head of a car pose */
export const headOf = (p: Pose): V3 => local(p, [SEAT[0], SEAT[1] + HEAD_Y, SEAT[2]]);
/** camera relative to a moving car: offsets in world axes (not rotated with the car) */
const onCar = (p: (f: number) => Pose, off: V3, lookOff: V3, f0: number, rate: number, rest: Partial<Cam> = {}, punch = 0, n = 35) => (f: number): Shot => {
  const c = P(p(f));
  return dolly(add(c, off), add(c, lookOff), pushK(f, f0, rate, punch, n), rest);
};

const youHome: Pose = { x: YOU_HOME[0], y: 0, z: YOU_HOME[2], yaw: -Math.PI / 2, pitch: 0, roll: 0 };
const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: onCar(youJam, [3.25, 1.66, 1.45], [0.45, 1.42, 0.05], 0, 0.0028, { fov: 38 }) },
    { f: wf(7) - 2, cut: true, s: (f) => dolly([-1.5, 1.7, -27], [2.5, 25, 24], pushK(f, wf(7) - 2, 0.0022, 0.0065, 34), { fov: 52 }) },
    { f: wf(13) - 4, dur: 24, s: (f) => dolly([-1.5, 1.7, -27], [2.5, 25, 24], pushK(f, wf(7) - 2, 0.0022, 0.0065, 34), { fov: 52, roll: -0.05 }) },
  ],
  2: [{ f: A(16), s: (f) => dolly([-3.5, 7.2, -31], [5.5, 2.8, 8], pushK(f, A(16), 0.0022), { fov: 44 }) }],
  3: [
    { f: A(19), s: (f) => dolly([6.0, 1.74, 7.3], [9.4, 1.45, 6.95], pushK(f, A(19), 0.0026, 0.006, 24), { fov: 38 }) },
    { f: wf(25) - 2, cut: true, s: (f) => zoom([16.5, 0.45, 20.5], [9.5, 2.9, 6.5], 46, pushK(f, wf(25) - 2, 0.002)) },
    { f: wf(28) - 2, cut: true, s: (f) => dolly([-21, 24, -34], [4, 6, 22], pushK(f, wf(28) - 2, 0.0016), { fov: 44, roll: -0.03 }) },
  ],
  4: [
    { f: A(32), s: (f) => { const c: V3 = [2, 22 + bob(1, f), 9 * T(f - A(32))]; return dolly(add(c, [2.5, 1.2, 6.1]), add(c, [0.45, 1.42, 0]), pushK(f, A(32), 0.0026), { fov: 40 }); } },
    { f: A(39), cut: true, s: (f) => dolly([0, 72, -150], [0, 32, 120], pushK(f, A(39), 0.0018, 0.005, 30), { fov: 46 }) },
  ],
  5: [
    { f: A(44), s: onCar(cessna5, [-1.5, 2.2, -15.5], [0.5, 1.2, 0], A(44), 0.0022, { fov: 44 }) },
    { f: wf(52) - 3, cut: true, s: onCar(cessna5, [-0.35, 1.78, -4.4], [0.72, 1.62, -0.3], wf(52) - 3, 0.0025, { fov: 38, roll: 0.03 }, 0.006, 30) },
  ],
  6: [
    { f: A(56), s: (f) => dolly([-5.4, 2.4, 44.5], [2.6, 0.9, 51], pushK(f, A(56), 0.002), { fov: 44 }) },
    { f: wf(61) - 2, cut: true, s: (f) => dolly([3.0, 1.62, 47.6], [5.0, 1.58, 50.5], pushK(f, wf(61) - 2, 0.0025), { fov: 38 }) },
    { f: wf(64) - 3, cut: true, s: (f) => dolly([-3.6, 7.2, 61.5], [2.0, 0.6, 49.5], pushK(f, wf(64) - 3, 0.002), { fov: 44 }) },
  ],
  7: [
    { f: A(70), s: (f) => { const r = ref7(f); return dolly([-3.2, 28.4, r - 11], [0.2, 26.4, r + 1], pushK(f, A(70), 0.0018), { fov: 42 }); } },
    { f: wf(72) - 2, cut: true, s: (f) => { const g = guy(f), h = headOf(g); return dolly(add([g.x, g.y, g.z], [1.9, 1.55, 4.4]), h, pushK(f, wf(72) - 2, 0.0025), { fov: 38 }); } },
    { f: wf(80) - 3, cut: true, s: (f) => { const r = ref7(f); return dolly([15.5, 27.2, r + 4], [0, 26.2, r], pushK(f, wf(80) - 3, 0.0015), { fov: 48 }); } },
  ],
  8: [
    { f: A(88), s: (f) => dolly([0.2, 27.0, 8.2], [0, rageY(f) + 1.2, 0.2], pushK(f, A(88), 0.0025), { fov: 46 }) },
    { f: wf(91) - 4, dur: 22, s: (f) => dolly([0.2, 27.0, 8.2], [0, rageY(f) + 1.2, 0.2], pushK(f, A(88), 0.0025), { fov: 46, roll: 0.05 }) },
  ],
  9: [
    { f: A(92), s: (f) => dolly([3.0, 1.0, -18.8], [5.0, 4.6, -13.0], pushK(f, A(92), 0.0022), { fov: 48 }) },
    { f: wf(95) - 2, cut: true, s: (f) => dolly([6.0, 0.35, -12.4], [4.4, 9.2, -15.6], pushK(f, wf(95) - 2, 0.0022, 0.006, 30), { fov: 52, roll: 0.04 }) },
  ],
  10: [
    { f: A(101), s: (f) => dolly([0.1, 26.35, -4.3], [0, 26.2, 0.6], pushK(f, A(101), 0.0025, 0.0065, 30), { fov: 40 }) },
    { f: wf(104) - 3, dur: 20, s: (f) => dolly([0.1, 26.35, -4.3], [0, 26.2, 0.6], pushK(f, A(101), 0.0025, 0.0065, 30), { fov: 40, roll: -0.045 }) },
  ],
  11: [
    { f: A(105), s: onCar(jet11, [42, 5, -30], [6, 0, 0], A(105), 0.002, { fov: 44 }) },
    { f: wf(107) - 4, cut: true, s: onCar(jet11, [24.5, 1.8, -7.2], [18.2, 0.6, 0], wf(107) - 4, 0.0025, { fov: 38 }, 0.006, 26) },
    { f: wf(109) - 3, cut: true, s: onCar(jet11, [70, 14, -72], [8, 0, 0], wf(109) - 3, 0.0016, { fov: 46, roll: 0.03 }) },
  ],
  12: [{ f: A(115), s: onCar(kevin, [2.3, 1.3, 7.2], [0.4, 1.44, 0], A(115), 0.0025, { fov: 42 }, 0.0, 0) },
    { f: wf(121) - 3, dur: 20, s: onCar(kevin, [1.7, 1.4, 5.2], [0.42, 1.44, 0], A(115), 0.0025, { fov: 40, roll: 0.04 }) }],
  13: [
    { f: A(122), s: (f) => dolly([3.9, 1.9, -35.4], [-2.9, 2.3, -40], pushK(f, A(122), 0.002), { fov: 44 }) },
    { f: wf(128) - 3, dur: 22, s: (f) => dolly([0.6, 1.75, -37.4], [-2.48, 1.45, -39.95], pushK(f, wf(128) - 3, 0.0025), { fov: 38 }) },
  ],
  14: [
    { f: A(129), s: (f) => dolly([3.2, 33.6, CUBE_Z + 11.5], [1.4, 32.6, CUBE_Z], pushK(f, A(129), 0.002), { fov: 46 }) },
    { f: wf(137) - 3, cut: true, s: (f) => dolly([3.6, 33.5, CUBE_Z + 5.4], [2.4, 33.35, CUBE_Z], pushK(f, wf(137) - 3, 0.0025), { fov: 40, roll: -0.04 }) },
  ],
  15: [
    { f: A(139), s: (f) => dolly([1.9, 31.6, 4.6], [0.42, 31.42, 0.05], pushK(f, A(139), 0.0025), { fov: 38 }) },
    { f: wf(145) - 6, dur: 30, s: (f) => dolly([2.6, 30.9, 6.2], [-6, 40, -40], pushK(f, wf(145) - 6, 0.001), { fov: 46, roll: 0.03 }) },
  ],
  16: [
    { f: A(148), s: (f) => dolly([FIELD[0] + 0.3, 0.85, -5.6], [FIELD[0] + 1.0, 2.0, 2.4], pushK(f, A(148), 0.0025), { fov: 44 }) },
    { f: wf(154) - 3, cut: true, s: (f) => dolly([FIELD[0] + 0.9, 1.6, -1.9], [FIELD[0] + 1.2, 1.62, 1.5], pushK(f, wf(154) - 3, 0.0025, 0.006, 26), { fov: 38, roll: 0.04 }) },
  ],
  17: [
    { f: A(157), s: (f) => dolly([TOWER[0] - 6.6, 26.4, TOWER[2] - 8.8], [TOWER[0], 25.9, TOWER[2]], pushK(f, A(157), 0.0022, 0.006, 30), { fov: 40 }) },
    { f: wf(164) - 3, cut: true, s: (f) => dolly([290, 44, 10], [360, 76, 140], pushK(f, wf(164) - 3, 0.0018), { fov: 48 }) },
    { f: wf(171) - 8, dur: 30, s: (f) => dolly([284, 72, 22], [360, 78, 140], pushK(f, wf(164) - 3, 0.0018), { fov: 48, roll: -0.04 }) },
  ],
  18: [{ f: A(172), s: (f) => dolly([FOOD[0] + 2, 5.6, -17], [FOOD[0], 1.2, 4], pushK(f, A(172), 0.0022), { fov: 46 }) }],
  19: [{ f: A(180), s: (f) => dolly([FOOD[0] + 1, 2.0, -10.5], [FOOD[0], 3.6, 3], pushK(f, A(180), 0.003), { fov: 48, roll: -0.04 }) }],
  20: [{ f: A(186), s: (f) => { const o = old20(f); return zoom([4.2, 1.7, -63.5], [o.x - 0.6, 1.0, o.z + 1.0], 42, pushK(f, A(186), 0.002)); } }],
  21: [
    { f: A(197), s: (f) => { const d = dart(f); return zoom([-2.0, 2.0, -20.0], [DART[0], Math.max(1.6, d.y + 0.9), DART[2]], 46, pushK(f, A(197), 0.0015)); } },
    { f: DART_HIT, cut: true, s: (f) => dolly([-5.3, 1.45, -23.9], [DART[0], 1.7, DART[2] - 0.3], pushK(f, DART_HIT, 0.003), { fov: 40 }) },
  ],
  22: [
    { f: A(207), s: (f) => dolly([-17, 45, -44], [0, 29, 34], pushK(f, A(207), 0.0018), { fov: 46 }) },
    { f: wf(216) - 3, cut: true, s: (f) => { const r = ref22(f) + 30; return dolly([-1.4, 31.7, r + 8.2], [-1.9, 31.2, r], pushK(f, wf(216) - 3, 0.0025), { fov: 44 }); } },
    { f: wf(218) - 3, cut: true, s: (f) => dolly([4.6, 33.0, LIGHT_AT[2] + 8.5], [0.8, 33.3, LIGHT_AT[2] - 6], pushK(f, wf(218) - 3, 0.0022), { fov: 44 }) },
    { f: wf(221) - 3, cut: true, s: (f) => dolly(add(YOU22, [1.95, 1.62, 4.6]), add(YOU22, [0.3, 1.42, 0]), pushK(f, wf(221) - 3, 0.003), { fov: 38, roll: 0.03 }) },
  ],
  23: [
    { f: A(222), s: (f) => dolly([17, 98, -28], [0, 90.5, 32], pushK(f, A(222), 0.0018), { fov: 46 }) },
    { f: wf(230) - 3, cut: true, s: (f) => dolly([7.4, 92.2, -15], [0, 90.9, 22], pushK(f, wf(230) - 3, 0.002, 0.006, 30), { fov: 44 }) },
  ],
  24: [
    { f: A(237), s: (f) => dolly([2.7, 91.7, 14.2], [0.5, 89.8, 9.2], pushK(f, A(237), 0.003), { fov: 42 }) },
    { f: wf(243) - 3, cut: true, s: (f) => dolly([0.62, 94.4, 10.6], [0.62, 60, 4.6], pushK(f, wf(243) - 3, 0.009), { fov: 44, roll: 0.06 }) },
  ],
};
void youHome;

// impact kicks: image offset flips sign every frame, decays to 0 in 7 f (frame, gain)
const KICKS: [number, number][] = [[BUMP6, 1.0], [wf(134), 0.8], [wf(137), 0.8], [wf(183), 0.5], [wf(185), 0.6], [DART_HIT, 1.6], [wf(240) + 1, 0.7]];
export const kickAt = (f: number) => {
  let a = 0;
  for (const [f0, g] of KICKS) {
    const n = f - f0;
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(f);
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of CAMS[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

// ---------------- lens: depth of field + foreground framing ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const youHead = (p: (f: number) => Pose) => (f: number) => headOf(p(f));
export const DOF: Dof[] = [
  { f: 0, cInf: 14, focus: youHead(youJam) },
  { f: wf(7) - 2, cInf: 0 },
  { f: A(19), cInf: 13, focus: () => headOf(youHome) },
  { f: wf(25) - 2, cInf: 0 },
  { f: A(32), cInf: 12, focus: (f) => headOf(pose(2, 22, 9 * T(f - A(32)))) },
  { f: A(39), cInf: 0 },
  { f: wf(52) - 3, cInf: 12, focus: (f) => local(cessna5(f), [0.3, 1.64, 0.78]) },
  { f: A(56), cInf: 0 },
  { f: wf(61) - 2, cInf: 12, focus: () => [5.0, 1.62, 50.5] },
  { f: wf(64) - 3, cInf: 0 },
  { f: wf(72) - 2, cInf: 13, focus: (f) => headOf(guy(f)) },
  { f: wf(80) - 3, cInf: 0 },
  { f: A(88), cInf: 8 },
  { f: A(92), cInf: 6, focus: () => [WALKER[0], 1.6, WALKER[2]] },
  { f: wf(95) - 2, cInf: 0 },
  { f: A(101), cInf: 14, focus: () => [0, 26.2, 0.6] },
  { f: A(105), cInf: 0 },
  { f: wf(107) - 4, cInf: 10, focus: (f) => local(jet11(f), [0, 0.6, 18.2]) },
  { f: wf(109) - 3, cInf: 0 },
  { f: A(115), cInf: 12, focus: youHead(kevin) },
  { f: A(122), cInf: 5 },
  { f: wf(128) - 3, dur: 22, cInf: 12, focus: () => [-2.48, 1.45, -39.95] },
  { f: A(129), cInf: 6, focus: () => [2.2, 33.3, CUBE_Z] },
  { f: wf(137) - 3, cInf: 12, focus: (f) => headOf(youCube(f)) },
  { f: A(139), cInf: 12, focus: () => [0.42, 31.42, 0.05] },
  { f: wf(145) - 6, dur: 30, cInf: 4, focus: () => [0.42, 31.42, 0.05] },
  { f: A(148), cInf: 8, focus: () => [FIELD[0] + 1.2, 1.6, 1.5] },
  { f: wf(154) - 3, cInf: 13, focus: () => [FIELD[0] + 1.2, 1.62, 1.5] },
  { f: A(157), cInf: 10, focus: () => [TOWER[0] - 1.6, 25.8, TOWER[2] - 2.0] },
  { f: wf(164) - 3, cInf: 0 },
  { f: A(172), cInf: 0 },
  { f: A(180), cInf: 5 },
  { f: A(186), cInf: 6, focus: (f) => { const o = old20(f); return [o.x, 1.2, o.z]; } },
  { f: A(197), cInf: 0 },
  { f: DART_HIT, cInf: 10, focus: () => [DART[0], 1.6, DART[2]] },
  { f: A(207), cInf: 0 },
  { f: wf(216) - 3, cInf: 8 },
  { f: wf(218) - 3, cInf: 6, focus: () => LIGHT_AT },
  { f: wf(221) - 3, cInf: 12, focus: () => add(YOU22, [0.42, 1.42, 0.05]) },
  { f: A(222), cInf: 0 },
  { f: wf(230) - 3, cInf: 4 },
  { f: A(237), cInf: 6, focus: () => HOLE },
  { f: wf(243) - 3, cInf: 0 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};

/** near framing objects: visible while a <= f < b (inside one shot); kit = a GLB name accepted by build.ts kitClone() */
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [
  { a: A(56), b: wf(61) - 2, kit: "plant_bushDetailed", pos: [-4.5, 0, 42.6], s: 1.1, yaw: 0.3 },     // driving test wide: bush bottom-left
  { a: A(122), b: wf(128) - 3, kit: "plant_bushLarge", pos: [2.6, 0, -35.2], s: 0.9, yaw: 0.8 },     // landing wide: bush bottom-right
  { a: A(172), b: A(180), kit: "plant_bushDetailed", pos: [FOOD[0] + 3.4, 0, -12.8], s: 1.2, yaw: 0.2 }, // food court: planter bottom-right
  { a: A(197), b: DART_HIT, kit: "hedge", pos: [-4.2, 0, -21.6], s: 1.0, yaw: 1.2 },                 // lawn dart wide: hedge bottom
];
