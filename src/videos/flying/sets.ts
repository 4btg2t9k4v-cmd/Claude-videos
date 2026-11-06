// The flying-cars world pieces: toy-proportioned cars (one instanced fleet: rounded bodies with wheel arches, open
// cabins so the drivers' cards read through the windows, thruster glow), the Cessna and the airliners, the control
// tower, the airfield, the food-court plaza, the suburb, the rebuilt road in the sky with its pothole, the invisible
// lanes and the traffic-light drone. Every surface is a two-tone lam() material (shade.ts) so it takes the same
// light, ink and grade as the bridge short.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Batch, boxGeo, V, lam, quad, house, prop, Kit, setSight, Ray } from "./build";
import { ctex, grassHD, facadeHD } from "./paint";
import { twoTone } from "./shade";
import { NOINK } from "./ink";
import { CarP, PlaneP, HOUSE_X, HOUSE_Z, FOOD, FIELD, TOWER, ROAD_Y, HOLE, LANE_Y, LANES_X, LIGHT_AT, CONE6, DART, hh } from "./story";

const M4 = () => new THREE.Matrix4();
const at = (x: number, y: number, z: number) => M4().makeTranslation(x, y, z);
const beam = (a: THREE.Vector3, b: THREE.Vector3, th: number) => {
  const g = new THREE.BoxGeometry(th, a.distanceTo(b), th);
  return g.applyMatrix4(M4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()), V(1, 1, 1)));
};
const xf = (g: THREE.BufferGeometry, m: THREE.Matrix4) => g.applyMatrix4(m);
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute("uv"); return g; }), false)!;
const tone = (col: string) => lam("fc_" + col, () => ({ color: col }));
/** extrude a side profile drawn in (z, y) across x: width w centred on x = 0, rounded by bevel b */
const sideExtrude = (pts: [number, number][], w: number, b: number, holes: [number, number][][] = []) => {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: w - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 10 });
  // (X, Y, Z) -> (w/2 - b - Z, Y, X): shape X becomes forward z, the extrusion runs across x (a proper rotation)
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, w / 2 - b, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  g.computeVertexNormals();
  return g;
};
const HDR = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

// ---------------- painted textures ----------------
export const asphaltHD = () => ctex("asphaltHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#62666e"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 18; i++) {
    const x = r() * 1024, y = r() * 1024, rad = 80 + r() * 220, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const c = r() > 0.5 ? "90,94,102" : "112,116,124";
    gr.addColorStop(0, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() > 0.5 ? "rgba(150,152,158,0.35)" : "rgba(60,62,70,0.35)"; g.fillRect(r() * 1024, r() * 1024, 2, 2); }
  g.strokeStyle = "rgba(55,57,63,0.5)"; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { let x = r() * 1024, y = r() * 1024; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += r() * 40; g.lineTo(x, y); } g.stroke(); }
});
export const concreteHD = () => ctex("concreteHD", 512, 512, (g, r) => {
  g.fillStyle = "#d6d1c6"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) { g.fillStyle = r() > 0.5 ? "rgba(235,231,222,0.5)" : "rgba(180,174,163,0.4)"; g.fillRect(r() * 512, r() * 512, 2, 2); }
  g.fillStyle = "#a9a397"; g.fillRect(0, 0, 512, 4); g.fillRect(0, 256, 512, 3); g.fillRect(0, 0, 4, 512);
});
const tilesHD = () => ctex("plazaTiles", 512, 512, (g, r) => {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const base = (i + j) % 2 ? "#e8d6b2" : "#cf8a62";
    g.fillStyle = base; g.fillRect(i * 64, j * 64, 64, 64);
    g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; g.fillRect(i * 64 + 6, j * 64 + 6, 52, 20);
  }
  g.fillStyle = "#9c8c78"; for (let k = 0; k <= 8; k++) { g.fillRect(k * 64 - 2, 0, 4, 512); g.fillRect(0, k * 64 - 2, 512, 4); }
});
const awningTex = (col: string) => ctex("awning" + col, 256, 256, (g) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#f7f1e3" : col; g.fillRect(i * 32, 0, 32, 256); }
});
/** stall sign: a food pictogram, no text */
const stallSign = (k: number) => ctex("stallSign" + k, 512, 256, (g) => {
  const bg = ["#2f5f6a", "#8c3b4a", "#3f6fb5", "#5d7a3a"][k];
  g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, 496, 240, 28); g.fill();
  g.lineWidth = 8; g.strokeStyle = "#241726"; g.stroke();
  g.lineWidth = 7;
  const cx = 256, cy = 128;
  if (k === 0) { // burger
    g.fillStyle = "#e3a457"; g.beginPath(); g.ellipse(cx, cy - 22, 90, 50, 0, Math.PI, 0); g.fill(); g.stroke();
    g.fillStyle = "#6b3b22"; g.fillRect(cx - 92, cy - 18, 184, 26); g.strokeRect(cx - 92, cy - 18, 184, 26);
    g.fillStyle = "#4fae6a"; g.fillRect(cx - 98, cy + 8, 196, 12);
    g.fillStyle = "#e3a457"; g.beginPath(); g.roundRect(cx - 90, cy + 20, 180, 34, 16); g.fill(); g.stroke();
  } else if (k === 1) { // pizza slice
    g.fillStyle = "#f2c14e"; g.beginPath(); g.moveTo(cx - 100, cy - 60); g.lineTo(cx + 100, cy - 60); g.lineTo(cx, cy + 90); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#d4703a"; g.fillRect(cx - 104, cy - 74, 208, 20);
    g.fillStyle = "#c9373a"; for (const [x, y] of [[-40, -30], [30, -20], [0, 25]]) { g.beginPath(); g.arc(cx + x, cy + y, 15, 0, 6.3); g.fill(); }
  } else if (k === 2) { // noodle bowl
    g.fillStyle = "#f7f1e3"; g.beginPath(); g.ellipse(cx, cy, 110, 70, 0, 0, Math.PI); g.fill(); g.stroke();
    g.strokeStyle = "#f2c14e"; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(cx - 70 + i * 30, cy); g.quadraticCurveTo(cx - 60 + i * 30, cy - 50, cx - 40 + i * 30, cy - 10); g.stroke(); }
    g.strokeStyle = "#241726"; g.beginPath(); g.moveTo(cx + 40, cy - 90); g.lineTo(cx + 110, cy - 10); g.stroke();
  } else { // ice cream
    g.fillStyle = "#e0a35a"; g.beginPath(); g.moveTo(cx - 45, cy - 10); g.lineTo(cx + 45, cy - 10); g.lineTo(cx, cy + 100); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#f7c6d9"; g.beginPath(); g.arc(cx, cy - 30, 55, 0, 6.3); g.fill(); g.stroke();
  }
});

// ---------------- cars: one instanced fleet ----------------
const ARCH_R = 0.47, WZ = 1.35;
const carProfile = (): [number, number][] => {
  const b0 = 0.36, top: [number, number][] = [[-2.02, 0.93], [-1.7, 1.03], [-1.05, 1.06], [0.86, 1.06], [1.8, 0.96], [2.04, 0.78], [2.04, b0]];
  const arch = (cz: number): [number, number][] => Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI; return [cz + ARCH_R * Math.cos(a), b0 + (ARCH_R - 0.06) * Math.sin(a)]; });
  return [...top, ...arch(WZ), ...arch(-WZ), [-2.02, b0]];
};
const carParts = () => {
  const body: THREE.BufferGeometry[] = [sideExtrude(carProfile(), 1.84, 0.07)];
  body.push(new RoundedBoxGeometry(1.7, 0.12, 1.62, 3, 0.05).translate(0, 1.86, -0.16));
  for (const s of [-1, 1]) {
    body.push(beam(V(s * 0.79, 1.02, 0.84), V(s * 0.75, 1.83, 0.52), 0.1));
    body.push(beam(V(s * 0.81, 1.02, -0.22), V(s * 0.8, 1.83, -0.22), 0.1));
    body.push(beam(V(s * 0.79, 1.02, -1.04), V(s * 0.75, 1.83, -0.9), 0.1));
  }
  const dark: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    dark.push(new RoundedBoxGeometry(0.58, 0.95, 0.2, 2, 0.06).translate(s * 0.42, 1.08, -0.42)); // seat backs
    for (const z of [-WZ, WZ]) dark.push(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18).rotateZ(Math.PI / 2).translate(s * 0.84, 0.34, z));
  }
  dark.push(new RoundedBoxGeometry(1.5, 0.6, 0.2, 2, 0.06).translate(0, 0.98, -1.12)); // rear bench back
  dark.push(new RoundedBoxGeometry(1.64, 0.14, 0.36, 2, 0.05).translate(0, 1.08, 0.74)); // dashboard
  dark.push(new THREE.TorusGeometry(0.17, 0.035, 8, 18).rotateX(-1.05).translate(0.42, 1.16, 0.52)); // steering wheel
  dark.push(boxGeo(V(-0.55, 0.45, 2.075), V(0.55, 0.68, 2.11))); // grille
  const trim: THREE.BufferGeometry[] = [];
  for (const z of [2.12, -2.1]) trim.push(new RoundedBoxGeometry(1.94, 0.17, 0.16, 2, 0.05).translate(0, 0.44, z));
  for (const s of [-1, 1]) {
    for (const z of [-WZ, WZ]) trim.push(new THREE.CylinderGeometry(0.17, 0.17, 0.27, 14).rotateZ(Math.PI / 2).translate(s * 0.84, 0.34, z));
    trim.push(new RoundedBoxGeometry(0.16, 0.12, 0.2, 2, 0.04).translate(s * 0.99, 1.1, 0.72)); // mirrors
  }
  // lamps: vertex coloured, unlit
  const lamp = (g: THREE.BufferGeometry, c: [number, number, number]) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set(c, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g;
  };
  const lamps: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    lamps.push(lamp(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16).rotateX(Math.PI / 2).translate(s * 0.62, 0.8, 2.06), [1.0, 0.96, 0.8]));
    lamps.push(lamp(new RoundedBoxGeometry(0.34, 0.14, 0.05, 2, 0.02).translate(s * 0.64, 0.84, -2.07), [0.85, 0.12, 0.1]));
  }
  const jets: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) for (const z of [-1.0, 1.0]) {
    jets.push(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 18).translate(s * 0.48, 0.27, z));
    glow.push(new THREE.ConeGeometry(0.24, 1.0, 16, 1, true).rotateX(Math.PI).translate(s * 0.48, -0.25, z));
  }
  const bar = (s: number) => new RoundedBoxGeometry(0.42, 0.13, 0.26, 2, 0.04).translate(s * 0.23, 1.98, -0.12);
  return { body: mergeGeometries(body.map((g) => g.toNonIndexed()).map((g) => { if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; })
    .map((g) => { for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k); return g; }), false)!,
    dark: merge(dark), trim: merge(trim), lamps: mergeGeometries(lamps.map((g) => { const x = g.index ? g.toNonIndexed() : g; x.deleteAttribute("uv"); return x; }), false)!,
    jets: merge(jets), glow: merge(glow), barR: bar(1), barB: bar(-1) };
};

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, "YXZ"), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
export const poseMatrix = (p: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number }, out = tmpM, s = 1) =>
  out.compose(tmpV.set(p.x, p.y, p.z), tmpQ.setFromEuler(tmpE.set(p.pitch, p.yaw, p.roll, "YXZ")), tmpS.set(s, s, s));

export class Fleet {
  private meshes: Record<string, THREE.InstancedMesh> = {};
  private jetsM: THREE.InstancedMesh; private glowM: THREE.InstancedMesh; private barR: THREE.InstancedMesh; private barB: THREE.InstancedMesh;
  constructor(parent: THREE.Object3D, max = 1300) {
    const P = carParts();
    const im = (g: THREE.BufferGeometry, m: THREE.Material, n: number, cast = true) => {
      const x = new THREE.InstancedMesh(g, m, n); x.castShadow = cast; x.receiveShadow = true; x.frustumCulled = false; x.count = 0; parent.add(x); return x;
    };
    const bodyM = twoTone(new THREE.MeshLambertMaterial({ color: "#ffffff" }));
    bodyM.shadowSide = THREE.BackSide; // closed bodies: back faces in the shadow map, no self-shadow acne on the panels
    this.meshes.body = im(P.body, bodyM, max);
    this.meshes.body.setColorAt(0, tmpC.set("#ffffff"));
    this.meshes.dark = im(P.dark, tone("#34363f"), max);
    this.meshes.trim = im(P.trim, tone("#dfe2e8"), max);
    this.meshes.lamps = im(P.lamps, new THREE.MeshBasicMaterial({ vertexColors: true }), max, false);
    this.jetsM = im(P.jets, new THREE.MeshBasicMaterial({ color: HDR(0.7, 2.6, 3.4) }), max, false);
    this.glowM = im(P.glow, new THREE.MeshBasicMaterial({ color: HDR(0.25, 0.85, 1.5), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), max, false);
    this.glowM.layers.set(NOINK); this.glowM.renderOrder = 3;
    this.barR = im(P.barR, new THREE.MeshBasicMaterial({ color: "#ffffff" }), 64, false);
    this.barB = im(P.barB, new THREE.MeshBasicMaterial({ color: "#ffffff" }), 64, false);
    this.barR.setColorAt(0, tmpC.set("#ffffff")); this.barB.setColorAt(0, tmpC.set("#ffffff"));
  }
  set(cars: CarP[], f: number, cam: THREE.Camera, maxDist = 900) {
    let n = 0, nj = 0, np = 0;
    const flash = Math.floor(f / 4) % 2;
    for (const c of cars) {
      if (cam.position.distanceTo(tmpV.set(c.x, c.y, c.z)) > maxDist) continue;
      poseMatrix(c);
      for (const k of ["body", "dark", "trim", "lamps"]) this.meshes[k].setMatrixAt(n, tmpM);
      this.meshes.body.setColorAt(n, tmpC.set(c.col));
      n++;
      if (c.fly > 0.01) {
        const fl = c.fly * (0.92 + 0.08 * Math.sin(f * 2.3 + c.id));
        const base = tmpM.clone();
        this.jetsM.setMatrixAt(nj, base.clone().multiply(new THREE.Matrix4().makeScale(Math.min(1, c.fly), Math.min(1, c.fly), Math.min(1, c.fly))));
        this.glowM.setMatrixAt(nj, base.multiply(new THREE.Matrix4().compose(V(0, 0.27 * (1 - fl), 0), new THREE.Quaternion(), V(fl, fl * (0.8 + 0.25 * Math.sin(f * 1.9 + c.id * 3)), fl))));
        nj++;
      }
      if (c.kind === "police") {
        poseMatrix(c);
        this.barR.setMatrixAt(np, tmpM); this.barB.setMatrixAt(np, tmpM);
        this.barR.setColorAt(np, flash ? HDR(3.2, 0.25, 0.2) : HDR(0.35, 0.05, 0.05));
        this.barB.setColorAt(np, flash ? HDR(0.06, 0.12, 0.45) : HDR(0.3, 0.7, 3.4));
        np++;
      }
      if (n >= this.meshes.body.instanceMatrix.count) break;
    }
    for (const k of Object.keys(this.meshes)) { const m = this.meshes[k]; m.count = n; m.instanceMatrix.needsUpdate = true; }
    if (this.meshes.body.instanceColor) this.meshes.body.instanceColor.needsUpdate = true;
    for (const m of [this.jetsM, this.glowM]) { m.count = nj; m.instanceMatrix.needsUpdate = true; }
    for (const m of [this.barR, this.barB]) { m.count = np; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}

// ---------------- planes ----------------
export class Cessna {
  g = new THREE.Group(); private blades: THREE.Mesh;
  constructor() {
    const white = tone("#f4f1ea"), blue = tone("#3f6fb5"), red = tone("#d94a3a"), dark = tone("#34363f"), grey = tone("#9aa1ad");
    const hull = sideExtrude([[-5.0, 1.3], [-4.6, 1.62], [-1.0, 1.78], [-0.2, 2.02], [1.55, 2.02], [2.55, 1.55], [3.05, 1.25], [3.05, 0.85], [2.3, 0.55], [0.1, 0.45], [-1.8, 0.78], [-4.6, 1.18]],
      1.2, 0.06, [[[0.05, 1.32], [0.05, 1.9], [1.45, 1.9], [1.45, 1.32]]]);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material) => { const x = new THREE.Mesh(geo, m); x.castShadow = true; x.receiveShadow = true; this.g.add(x); return x; };
    add(hull, white);
    for (const s of [-1, 1]) add(boxGeo(V(s * 0.63 - 0.01, 1.02, -4.3), V(s * 0.63 + 0.01, 1.18, 2.4)), blue);
    add(new RoundedBoxGeometry(11, 0.14, 1.5, 2, 0.06).translate(0, 2.1, 0.6), white);
    for (const s of [-1, 1]) add(new RoundedBoxGeometry(0.5, 0.16, 1.52, 2, 0.06).translate(s * 5.3, 2.1, 0.6), red);
    for (const s of [-1, 1]) add(beam(V(s * 0.55, 0.95, 0.6), V(s * 2.7, 2.05, 0.6), 0.07), grey);
    add(new RoundedBoxGeometry(3.6, 0.1, 0.9, 2, 0.04).translate(0, 1.45, -4.55), white);
    add(sideExtrude([[-5.05, 1.45], [-4.0, 1.6], [-4.55, 2.9], [-5.1, 2.9]], 0.12, 0.03), blue);
    add(new RoundedBoxGeometry(0.9, 0.8, 0.25, 2, 0.08).translate(0.3, 1.0, 0.45), dark); // seats
    add(new RoundedBoxGeometry(1.0, 0.25, 0.3, 2, 0.06).translate(0, 1.4, 1.55), dark);   // panel
    add(new THREE.ConeGeometry(0.24, 0.45, 16).rotateX(Math.PI / 2).translate(0, 1.05, 3.28), dark);
    this.blades = add(boxGeo(V(-0.07, -0.95, -0.02), V(0.07, 0.95, 0.02)), dark);
    this.blades.position.set(0, 1.05, 3.32);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.98, 32), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    disc.position.set(0, 1.05, 3.34); disc.layers.set(NOINK); this.g.add(disc);
    for (const [x, z] of [[-1.1, 0.6], [1.1, 0.6], [0, 2.4]]) {
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 14).rotateZ(Math.PI / 2).translate(x, 0.22, z), dark);
      add(beam(V(x * 0.4, 0.62, z), V(x, 0.3, z), 0.06), grey);
    }
  }
  pose(p: PlaneP) {
    this.g.position.set(p.x, p.y, p.z); this.g.rotation.set(p.pitch, p.yaw, p.roll, "YXZ");
    this.blades.rotation.z = (p.prop ?? 0) * 0.93;
  }
}
export class Jet {
  g = new THREE.Group();
  constructor(tail = "#3f7fd0") {
    const white = tone("#f4f2ee"), dark = tone("#2e3240"), fin = tone(tail), grey = tone("#b9bec8");
    const add = (geo: THREE.BufferGeometry, m: THREE.Material) => { const x = new THREE.Mesh(geo, m); x.castShadow = true; x.receiveShadow = true; this.g.add(x); return x; };
    add(new THREE.CapsuleGeometry(2.0, 30, 8, 24).rotateX(Math.PI / 2), white);
    for (const s of [-1, 1]) add(boxGeo(V(s * 1.97 - 0.03, 0.42, -12.5), V(s * 1.97 + 0.03, 0.72, 12.5)), dark);
    for (const s of [-1, 1]) add(boxGeo(V(s * 1.93 - 0.03, -0.75, -14), V(s * 1.93 + 0.03, -0.45, 14)), fin);
    add(new RoundedBoxGeometry(2.4, 0.5, 1.0, 2, 0.15).rotateX(-0.45).translate(0, 1.0, 15.3), dark);
    const wing = (s: number) => {
      const sh = new THREE.Shape([new THREE.Vector2(0, 3), new THREE.Vector2(15.5 * s, -5), new THREE.Vector2(15.5 * s, -7), new THREE.Vector2(0, -3)]);
      return new THREE.ExtrudeGeometry(sh, { depth: 0.45, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, -0.6, 0);
    };
    for (const s of [-1, 1]) {
      const w = wing(s); w.computeVertexNormals(); add(w, white);
      add(new THREE.CylinderGeometry(0.85, 0.75, 3.2, 20).rotateX(Math.PI / 2).translate(s * 6.2, -1.9, 0.6), grey);
      add(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 20).rotateX(Math.PI / 2).translate(s * 6.2, -1.9, 2.22), dark);
      const st = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, -13.5), new THREE.Vector2(6.2 * s, -16.5), new THREE.Vector2(6.2 * s, -17.6), new THREE.Vector2(0, -17.2)]), { depth: 0.25, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.9, 0);
      st.computeVertexNormals(); add(st, white);
    }
    add(sideExtrude([[-16.5, 1.4], [-12.6, 1.4], [-16.3, 7.2], [-18.2, 7.2]], 0.4, 0.08), fin);
  }
  pose(p: PlaneP) { this.g.position.set(p.x, p.y, p.z); this.g.rotation.set(p.pitch, p.yaw, p.roll, "YXZ"); }
}

// ---------------- static sets ----------------
const quadUp = (x0: number, x1: number, z0: number, z1: number, u: number, v: number, y = 0) => quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), u, v);
const conc = () => lam("concreteHD", () => ({ map: concreteHD() }));
const asph = () => lam("asphaltHD", () => ({ map: asphaltHD() }));
const lineM = () => lam("roadLine", () => ({ color: "#f4f1e6" }));

/** the suburb: street along z, two rows of houses facing it, driveways, sidewalks, trees, back rows, hills */
export const buildSuburb = (root: THREE.Object3D, kit: Kit, rays: Ray[]) => {
  setSight(rays);
  const b = new Batch();
  b.add(quadUp(-1600, 1600, -1600, 1600, 3200 / 6, 3200 / 6), lam("grassHD", () => ({ map: grassHD() })));
  const street = (x: number, z0 = -430, z1 = 430) => {
    b.add(quadUp(x - 4, x + 4, z0, z1, 8 / 8, (z1 - z0) / 8, 0.012), asph());
    for (let z = z0; z < z1; z += 9) b.add(boxGeo(V(x - 0.08, 0.012, z), V(x + 0.08, 0.02, z + 3.5)), lineM());
    for (const s of [-1, 1]) b.add(boxGeo(V(x + s * 3.65 - 0.06, 0.012, z0), V(x + s * 3.65 + 0.06, 0.02, z1)), lineM());
  };
  street(0);
  for (const s of [-1, 1]) {
    b.add(boxGeo(V(s > 0 ? 4 : -5.8, 0, -430), V(s > 0 ? 5.8 : -4, 0.15, 430), 3), conc());
    for (const zc of HOUSE_Z) {
      const i = Math.round(zc / 15) + 20 + (s > 0 ? 0 : 40);
      house(b, s * HOUSE_X, zc, -s * Math.PI / 2, 9, 8, 5.6, Math.floor(hh(i, 9) * 8), 0);
      b.add(quadUp(s > 0 ? 5.8 : -11.8, s > 0 ? 11.8 : -5.8, zc + 5, zc + 8, 2, 1, 0.025), conc());
      b.add(quadUp(s > 0 ? 5.8 : -11.6, s > 0 ? 11.6 : -5.8, zc - 1.2, zc - 0.2, 2, 0.35, 0.022), conc()); // front path
      prop(b, kit, ["tree_oak", "tree_default", "tree_fat", "tree_detailed"][i % 4], s * 7.2, 0, zc - 4.6, 6.2 + hh(i, 3) * 2.2, i);
      prop(b, kit, "hedge", s * 13.4, 0, zc - 7.5, 0.95, 0);
      prop(b, kit, "plant_bush", s * 12.3, 0, zc - 2.4, 0.8, i);
      prop(b, kit, "plant_bush", s * 12.3, 0, zc + 2.6, 0.75, i + 1);
      prop(b, kit, ["tree_oak", "tree_cone", "tree_fat"][i % 3], s * (24 + hh(i, 4) * 4), 0, zc + hh(i, 5) * 8 - 4, 7 + hh(i, 6) * 3, i);
      // mailbox at the driveway end
      b.add(boxGeo(V(s * 5.55 - 0.05, 0, zc + 4.3), V(s * 5.55 + 0.05, 1.05, zc + 4.4)), tone("#5a3b2a"));
      b.add(new RoundedBoxGeometry(0.28, 0.24, 0.48, 2, 0.08).translate(s * 5.55, 1.15, zc + 4.35), tone(["#3f6fb5", "#d94a3a", "#2f6a43", "#efe8d8"][i % 4]));
    }
    for (let z = -420; z <= 420; z += 30) { // street lamps
      b.add(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 10).translate(s * 5.15, 2.3, z), tone("#2f4a3e"));
      b.add(beam(V(s * 5.15, 4.5, z), V(s * 4.3, 4.75, z), 0.08), tone("#2f4a3e"));
      b.add(new RoundedBoxGeometry(0.42, 0.22, 0.32, 2, 0.06).translate(s * 4.2, 4.65, z), tone("#2f4a3e"));
    }
    // back rows
    for (let k = 1; k <= 4; k++) {
      const hx = s * (HOUSE_X + 34 * k), sx = s * (HOUSE_X + 34 * k - 13);
      street(sx, -400, 400);
      for (const zc of HOUSE_Z) {
        const i = 500 + k * 50 + Math.round(zc / 15) + (s > 0 ? 0 : 1000);
        house(b, hx, zc, -s * Math.PI / 2, 9, 8, hh(i) > 0.6 ? 5.6 : 2.8 + 2.8 * Math.round(hh(i, 1)), Math.floor(hh(i, 9) * 8), 0);
        if (hh(i, 2) > 0.35) prop(b, kit, ["tree_oak", "tree_default", "tree_fat"][i % 3], hx - s * 9, 0, zc + 6.5, 6 + hh(i, 3) * 3, i);
      }
    }
  }
  // far hills and forests ring
  const hill = lam("hill", () => ({ color: "#6fae4c" }));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, d = 650 + hh(i, 1) * 250, r = 120 + hh(i, 2) * 140;
    b.add(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hill, M4().compose(V(Math.cos(a) * d, -2, Math.sin(a) * d), new THREE.Quaternion(), V(r, 30 + hh(i, 3) * 45, r)));
  }
  b.build(root);
};

/** airfield apron + runway + hangar + windsock, and the control tower (shots 16-17) */
export const buildField = (root: THREE.Object3D) => {
  const b = new Batch(), X = FIELD[0];
  b.add(quadUp(X - 22, X + 38, -150, 150, 60 / 8, 300 / 8, 0.015), asph());
  b.add(quadUp(X + 40, X + 64, -400, 400, 3, 100, 0.016), asph());
  for (let z = -390; z < 390; z += 30) b.add(boxGeo(V(X + 51.75, 0.016, z), V(X + 52.25, 0.024, z + 14)), lineM());
  for (const s of [-1, 1]) b.add(boxGeo(V(X + 52 + s * 11.2 - 0.2, 0.016, -400), V(X + 52 + s * 11.2 + 0.2, 0.024, 400)), lineM());
  for (let k = 0; k < 8; k++) b.add(boxGeo(V(X + 42 + k * 2.6, 0.016, -380), V(X + 43.4 + k * 2.6, 0.024, -350)), lineM());
  for (let z = -140; z < 140; z += 6) b.add(boxGeo(V(X + 7.9, 0.015, z), V(X + 8.1, 0.023, z + 3)), lam("taxiLine", () => ({ color: "#f2c14e" })));
  // hangar
  const hx = X - 10, hz = -32;
  b.add(boxGeo(V(hx - 12, 0, hz - 10), V(hx + 12, 7, hz + 10), 4), lam("hangarWall", () => ({ color: "#c7cfd8" })));
  b.add(new THREE.CylinderGeometry(12, 12, 20, 24, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(0).translate(hx, 7, hz), lam("hangarRoof", () => ({ color: "#d27a62", side: THREE.DoubleSide })));
  b.add(boxGeo(V(hx - 9, 0, hz + 10), V(hx + 9, 6, hz + 10.05)), tone("#5a6474"));
  // windsock
  b.add(new THREE.CylinderGeometry(0.08, 0.1, 6, 8).translate(X + 18, 3, -14), tone("#9aa1ad"));
  b.add(new THREE.CylinderGeometry(0.45, 0.2, 2.6, 12, 1, true).rotateZ(-Math.PI / 2 + 0.25).translate(X + 19.4, 5.6, -14), lam("sock", () => ({ color: "#f08a2c", side: THREE.DoubleSide })));
  // tower
  const [tx, , tz] = TOWER;
  b.add(boxGeo(V(tx - 6, 0, tz - 4.5), V(tx + 6, 4.5, tz + 4.5), 3), lam("towerBase", () => ({ map: facadeHD("towerBase", 12, 4.5, { wall: "#ddd2bf", shutter: "#3f6fb5" }) })));
  b.add(new THREE.CylinderGeometry(2.0, 2.6, 20, 24).translate(tx, 14, tz), lam("towerShaft", () => ({ color: "#e2dacb" })));
  b.add(new THREE.CylinderGeometry(4.3, 2.4, 1.6, 8).translate(tx, 24.2, tz), lam("towerCab", () => ({ color: "#d8cfbe" })));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.add(beam(V(tx + 4.15 * Math.cos(a), 25.0, tz + 4.15 * Math.sin(a)), V(tx + 4.45 * Math.cos(a), 27.6, tz + 4.45 * Math.sin(a)), 0.18), tone("#3a3d47"));
    const a2 = a + Math.PI / 8;
    b.add(boxGeo(V(tx + 3.3 * Math.cos(a2) - 0.5, 25.0, tz + 3.3 * Math.sin(a2) - 0.5), V(tx + 3.3 * Math.cos(a2) + 0.5, 25.95, tz + 3.3 * Math.sin(a2) + 0.5)), tone(i % 2 ? "#2f5f6a" : "#3a3d47"));
  }
  b.add(new THREE.CylinderGeometry(4.75, 4.6, 0.55, 8).translate(tx, 27.85, tz), lam("towerRoof", () => ({ color: "#efe8d8" })));
  b.add(new THREE.CylinderGeometry(4.0, 4.0, 0.12, 8).translate(tx, 25.0, tz), tone("#7d848c")); // cab floor
  b.add(new THREE.CylinderGeometry(0.08, 0.08, 4, 6).translate(tx + 1.5, 30.1, tz), tone("#9aa1ad"));
  b.add(new RoundedBoxGeometry(2.4, 0.5, 0.3, 2, 0.1).translate(tx - 1, 28.6, tz), tone("#efe8d8")); // radar
  b.build(root);
};

/** food-court plaza: tiles, mall wall, four stalls with striped awnings, tables with umbrellas, planters */
export const buildFood = (root: THREE.Object3D, kit: Kit) => {
  const b = new Batch(), [X, , Z] = FOOD;
  b.add(quadUp(X - 22, X + 22, Z - 20, Z + 18, 44 / 4.8, 38 / 4.8, 0.02), lam("plaza", () => ({ map: tilesHD() })));
  b.add(boxGeo(V(X - 24, 0, Z + 17), V(X + 24, 10, Z + 19), 6), lam("mallWall", () => ({ map: facadeHD("mallWall", 48, 10, { wall: "#e6d2ac", shutter: "#3f6fb5", door: true }) })));
  const cols = ["#d94a3a", "#f2c14e", "#3f7fd0", "#4fae6a"];
  [-12, -4, 4, 12].forEach((sx, k) => {
    const x = X + sx, col = cols[k];
    b.add(boxGeo(V(x - 3.2, 0, Z + 12), V(x + 3.2, 3.3, Z + 16.9), 3), lam("stall" + k, () => ({ color: ["#efe0c2", "#e3c99a", "#f0d9c4", "#e2d6b8"][k] })));
    b.add(new RoundedBoxGeometry(6.4, 1.1, 1.0, 2, 0.08).translate(x, 0.55, Z + 11.4), tone(col));
    b.add(new RoundedBoxGeometry(6.6, 0.1, 1.1, 2, 0.04).translate(x, 1.12, Z + 11.4), tone("#efe8d8"));
    b.add(quad(V(x - 3.4, 2.6, Z + 10.4), V(x + 3.4, 2.6, Z + 10.4), V(x + 3.4, 3.5, Z + 12.1), V(x - 3.4, 3.5, Z + 12.1)), lam("awn" + col, () => ({ map: awningTex(col), side: THREE.DoubleSide })));
    b.add(quad(V(x - 2.6, 3.55, Z + 11.99), V(x + 2.6, 3.55, Z + 11.99), V(x + 2.6, 5.2, Z + 11.99), V(x - 2.6, 5.2, Z + 11.99)), lam("sign" + k, () => ({ map: stallSign(k) })));
  });
  const tops = ["#d94a3a", "#3f7fd0", "#f2c14e", "#4fae6a"];
  for (const tx of [-9, -3, 3, 9]) for (const tz of [-5, 2.5]) {
    const x = X + tx, z = Z + tz, k = (tx + 9) / 6 + (tz > 0 ? 1 : 0);
    b.add(new THREE.CylinderGeometry(0.75, 0.75, 0.07, 24).translate(x, 0.76, z), tone("#f4efe6"));
    b.add(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 8).translate(x, 0.38, z), tone("#5b616c"));
    b.add(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8).translate(x, 1.6, z), tone("#5b616c"));
    b.add(new THREE.ConeGeometry(1.35, 0.55, 8, 1, true).translate(x, 2.75, z), lam("umb" + k, () => ({ color: tops[k % 4], side: THREE.DoubleSide })));
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2 + 0.4;
      b.add(new RoundedBoxGeometry(0.45, 0.45, 0.45, 2, 0.06).translate(x + 1.05 * Math.cos(a), 0.23, z + 1.05 * Math.sin(a)), tone("#7a8a96"));
    }
  }
  for (const [px, pz] of [[-19, -16], [19, -16], [-19, 8], [19, 8], [-7, -14], [7, -14]]) {
    b.add(new THREE.CylinderGeometry(0.9, 0.8, 0.7, 16).translate(X + px, 0.35, Z + pz), lam("planter", () => ({ color: "#b8684a" })));
    prop(b, kit, "plant_bushDetailed", X + px, 0.65, Z + pz, 1.3, px * 7 + pz);
  }
  for (const [lx, lz] of [[-15, -10], [15, -10], [-15, 6], [15, 6]]) {
    b.add(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 10).translate(X + lx, 2.1, Z + lz), tone("#2f4a3e"));
    b.add(new THREE.SphereGeometry(0.32, 14, 10).translate(X + lx, 4.35, Z + lz), tone("#f6efd8"));
  }
  b.build(root);
};

/** the rebuilt road in the sky (shots 23-24): deck with a pothole, lane lines, guardrails, lamps */
export const buildSkyRoad = (root: THREE.Object3D) => {
  const g = new THREE.Group(), b = new Batch(), Y = ROAD_Y, [hx, , hz] = HOLE, hw = 0.85, hd = 0.68;
  const top = asph(), side = conc();
  const deck = (x0: number, x1: number, z0: number, z1: number) => {
    b.add(quadUp(x0, x1, z0, z1, (x1 - x0) / 8, (z1 - z0) / 8, Y), top);
    b.add(boxGeo(V(x0, Y - 1.0, z0), V(x1, Y - 0.001, z1), 3, true), side);
  };
  deck(-6.6, hx - hw, -300, 300); deck(hx + hw, 6.6, -300, 300);
  deck(hx - hw, hx + hw, -300, hz - hd); deck(hx - hw, hx + hw, hz + hd, 300);
  // broken rim: chunks of asphalt around the hole, plus a darker crumb ring
  const rim = tone("#4c4f57");
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, rx = hx + (hw + 0.05) * Math.cos(a) * 1.02, rz = hz + (hd + 0.05) * Math.sin(a) * 1.02;
    b.add(new THREE.DodecahedronGeometry(0.11 + hh(i, 2) * 0.08, 0).translate(rx, Y + 0.02, rz), rim);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6, l = 0.8 + hh(i, 3) * 0.9;
    b.add(beam(V(hx + (hw + 0.1) * Math.cos(a), Y + 0.006, hz + (hd + 0.1) * Math.sin(a)), V(hx + (hw + 0.1 + l) * Math.cos(a), Y + 0.006, hz + (hd + 0.1 + l) * Math.sin(a)), 0.05).scale(1, 0.2, 1).translate(0, Y * 0.8, 0), rim);
  }
  for (let z = -296; z < 296; z += 7) for (const x of [-2.1, 2.1]) {
    if (Math.abs(z + 1.5 - hz) < 2.5 && Math.abs(x - hx) < 1.5) continue;
    b.add(boxGeo(V(x - 0.07, Y, z), V(x + 0.07, Y + 0.012, z + 3)), lineM());
  }
  for (const s of [-1, 1]) {
    b.add(boxGeo(V(s * 6.1 - 0.07, Y, -300), V(s * 6.1 + 0.07, Y + 0.012, 300)), lineM());
    for (let z = -300; z <= 300; z += 2.5) b.add(boxGeo(V(s * 6.42 - 0.06, Y, z - 0.06), V(s * 6.42 + 0.06, Y + 0.85, z + 0.06)), tone("#9aa1ad"));
    for (const y of [0.55, 0.82]) b.add(boxGeo(V(s * 6.42 - 0.05, Y + y - 0.07, -300), V(s * 6.42 + 0.05, Y + y + 0.07, 300)), tone("#c9ced6"));
    for (let z = -285; z <= 285; z += 30) {
      b.add(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 10).translate(s * 6.75, Y + 2.2, z), tone("#2f4a3e"));
      b.add(beam(V(s * 6.75, Y + 4.3, z), V(s * 5.7, Y + 4.55, z), 0.08), tone("#2f4a3e"));
      b.add(new RoundedBoxGeometry(0.42, 0.22, 0.32, 2, 0.06).translate(s * 5.6, Y + 4.45, z), tone("#2f4a3e"));
    }
  }
  b.build(g);
  root.add(g);
  return g;
};

/** the invisible lanes (shot 22): glowing dashes that draw on from near to far */
export class Lanes {
  mesh: THREE.InstancedMesh; private pts: { x: number; z: number }[] = [];
  constructor(root: THREE.Object3D) {
    for (const x of LANES_X) for (let z = -150; z < 330; z += 6) this.pts.push({ x, z });
    this.mesh = new THREE.InstancedMesh(new RoundedBoxGeometry(0.2, 0.05, 3, 2, 0.02), new THREE.MeshBasicMaterial({ color: HDR(1.6, 1.9, 2.2) }), this.pts.length);
    this.mesh.frustumCulled = false; this.mesh.layers.set(NOINK);
    root.add(this.mesh);
  }
  set(show: (z: number) => number) {
    const m = new THREE.Matrix4();
    this.pts.forEach((p, i) => { const k = show(p.z); this.mesh.setMatrixAt(i, m.compose(V(p.x, LANE_Y + 0.01, p.z + 1.5), new THREE.Quaternion(), V(k, k, Math.max(0.001, k)))); });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** traffic-light drone: housing with three lamps facing -z, four rotor arms */
export class TrafficLight {
  g = new THREE.Group(); lamps: THREE.MeshBasicMaterial[] = []; private rotors: THREE.Mesh[] = [];
  constructor() {
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.62, 1.7, 0.55, 3, 0.12), tone("#2f3a33")); body.castShadow = true; this.g.add(body);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(0.9, 2.0, 0.08, 2, 0.04), tone("#f2c14e")); plate.position.z = 0.3; this.g.add(plate);
    [0.52, 0, -0.52].forEach((y) => {
      const m = new THREE.MeshBasicMaterial({ color: "#333333" }); this.lamps.push(m);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 20).rotateX(Math.PI / 2), m); l.position.set(0, y, -0.3); this.g.add(l);
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.22, 20, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2 * 0), lam("hood", () => ({ color: "#2f3a33", side: THREE.DoubleSide })));
      hood.position.set(0, y + 0.02, -0.38); hood.rotation.z = Math.PI / 2 - Math.PI / 2; this.g.add(hood);
    });
    for (const [x, z] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) {
      const arm = new THREE.Mesh(beam(V(0, 0.9, 0), V(x, 1.05, z), 0.07), tone("#3a3d47")); this.g.add(arm);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), tone("#3a3d47")); hub.position.set(x, 1.1, z); this.g.add(hub);
      const r = new THREE.Mesh(boxGeo(V(-0.5, -0.01, -0.05), V(0.5, 0.01, 0.05)), tone("#cfd4dc")); r.position.set(x, 1.18, z); this.g.add(r); this.rotors.push(r);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18, depthWrite: false }));
      disc.position.set(x, 1.19, z); disc.layers.set(NOINK); this.g.add(disc);
    }
    this.g.position.set(...LIGHT_AT);
  }
  set(f: number, state: "green" | "amber" | "red") {
    const on = { red: 0, amber: 1, green: 2 }[state];
    const cols = [HDR(3.4, 0.35, 0.25), HDR(3.2, 1.9, 0.2), HDR(0.3, 2.8, 0.9)];
    this.lamps.forEach((m, i) => m.color.copy(i === on ? cols[i] : cols[i].clone().multiplyScalar(0.08)));
    this.rotors.forEach((r, i) => { r.rotation.y = f * 0.71 + i; });
    this.g.position.y = LIGHT_AT[1] + 0.06 * Math.sin(f * 0.13);
  }
}

/** traffic cones for the driving test; the knocked one is posed per frame */
export const cone = () => {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 18).translate(0, 0.37, 0), tone("#f08a2c"));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.15, 0.12, 18).translate(0, 0.38, 0), tone("#f7f3ea"));
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.06, 0.46, 2, 0.02).translate(0, 0.03, 0), tone("#f08a2c"));
  for (const m of [c, band, base]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
};
export const CONES: [number, number, number][] = [CONE6, [1.3, 0, 51.6], [5.4, 0, 43.0]];

/** the dent in the lawn where the dart landed (shot 21) */
export const dirtMound = () => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, 0.28, 1.0), tone("#7a5638"));
  m.position.set(DART[0], -0.02, DART[2] + 1.05); m.receiveShadow = true;
  g.add(m);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + hh(i, 4) * 0.1, 0), tone(i % 2 ? "#6b4b30" : "#4e8a3a"));
    c.position.set(DART[0] + 1.6 * Math.cos(a), 0.08, DART[2] + 1.05 + 1.3 * Math.sin(a)); c.castShadow = true; g.add(c);
  }
  return g;
};
