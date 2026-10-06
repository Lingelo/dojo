// The mountain of the Kaizen video: a fujizuka, the small replica of Mount Fuji that shrines build so the
// faithful can make the pilgrimage in a few minutes. A concave cone, a trail zigzagging up its front face
// (one leg between two stations of the cycle, like the numbered stations of the real Fuji trails), a steep
// stone stair to the summit, the shrine on a small plateau at the top.
// Pure math, no Three.js: the HTML and node share it (node can check the geometry).

// Fuji's profile as the prints draw it: a truncated cone, steep near the top (~33°), flaring into a long skirt
export const HM = 13.5, RB = 23.0, RT = 3.4, P = 2.1;  // summit height, foot radius, summit plateau radius, concavity
export const LEDGE = 1.3;                             // width of the trail (holds both pillars of a torii)
export const LEGS = 5, S_END = LEGS;                  // one leg per step of the cycle (brainstorm → ship), then the summit
const HS = 0.55, AC = -Math.PI / 2;                   // half angular span of a leg; the front face looks at -z
const D = 2.1;                                        // radial gap between two legs = diameter of a turn (ledge + bank)
const R_START = 20.2, R_STAIR = 7.6; // the switchbacks climb the skirt; a long stair takes the steep cone                  // radius where the trail starts / where the summit stair starts
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

/** Height of the bare cone at radius r; radius where the cone reaches height y. */
const RIM = 1.6; // past RT the flat top rolls over into the cone across this width: a rounded shoulder, no cake edge
const cone = (r) => (r <= RT ? HM : HM * Math.pow(clamp01(1 - (r - RT) / (RB - RT)), P));
export const profile = (r) => {
  if (r <= RT) return HM;
  const r1 = RT + RIM;
  if (r >= r1) return cone(r);
  // cubic Hermite from (RT, HM, slope 0) to (r1, cone, slope of the cone): continuous height and slope
  const m1 = (cone(r1 + 1e-3) - cone(r1 - 1e-3)) / 2e-3 * RIM, u = (r - RT) / RIM, h1 = cone(r1);
  return (2 * u ** 3 - 3 * u ** 2 + 1) * HM + (-2 * u ** 3 + 3 * u ** 2) * h1 + (u ** 3 - u ** 2) * m1;
};
// (the summit plateau stays flat: it is the courtyard of the shrine, behind a low stone fence)
export const rAt = (y) => RT + (RB - RT) * (1 - Math.pow(clamp01(y / HM), 1 / P));

// The trail, like the switchbacks of a mountain shrine: each leg runs across the face, almost level, gaining
// only DROP of radius; at each end a stone stair turns back in a half circle (diameter D) up to the next leg.
// Consecutive legs stay at least D apart, so their ledges never overlap.
// Pieces: { kind: 'leg' | 'turn' | 'stair', from: [a, r], to: [a, r], len }; s maps to the legs.
const DROP = (R_START - R_STAIR - (LEGS - 1) * D) / LEGS;
const PIECES = [];
{
  let r = R_START;
  for (let k = 0; k < LEGS; k++) {
    const a0 = AC + (k % 2 ? HS : -HS), a1 = AC + (k % 2 ? -HS : HS);
    PIECES.push({ kind: 'leg', k, a0, a1, r0: r, r1: r - DROP });
    r -= DROP;
    if (k < LEGS - 1) {
      const rc = r - D / 2; // centre of the half circle: the eye of the turn, every step of the stair is around it
      PIECES.push({ kind: 'turn', k, a: a1, r0: r, r1: r - D, dir: Math.sign(a1 - a0), cx: rc * Math.cos(a1), cz: rc * Math.sin(a1), cy: (profile(r) + profile(r - D)) / 2 });
      r -= D;
    }
  }
  PIECES.push({ kind: 'stair', a: PIECES.at(-1).a1, r0: r, r1: RT - 0.2 });
}
// a point of a piece at u ∈ [0, 1] → { x, z, r, y, stair }
function pieceAt(pc, u) {
  let a, r, y, stair = false;
  if (pc.kind === 'leg') {
    a = lerp(pc.a0, pc.a1, u); r = lerp(pc.r0, pc.r1, u); y = profile(r);
  } else if (pc.kind === 'turn') {
    // half circle in the horizontal plane, bulging past the end of the leg; climbs from one leg to the next
    const rc = (pc.r0 + pc.r1) / 2, th = Math.PI * u, bulge = (D / 2) * Math.sin(th);
    r = rc + (D / 2) * Math.cos(th);
    a = pc.a + (pc.dir * bulge) / r;
    y = lerp(profile(pc.r0), profile(pc.r1), u); stair = true;
  } else {
    a = pc.a; r = lerp(pc.r0, pc.r1, u); y = lerp(profile(pc.r0), HM, sstep(u * 1.15)); stair = true;
  }
  return { x: r * Math.cos(a), z: r * Math.sin(a), r, y, stair };
}

/**
 * Point of the trail at s ∈ [0, S_END]: [k, k + 1] walks leg k for its first LEG_SHARE, then the turn after
 * it (the summit stair after the last leg). The station of step k is the middle of its leg, on the axis of the face.
 */
const LEG_SHARE = 0.84;
function locate(s) {
  s = Math.min(S_END, Math.max(0, s));
  const k = Math.min(LEGS - 1, Math.floor(s)), u = s - k;
  const leg = PIECES[2 * k], after = PIECES[2 * k + 1];
  if (u < LEG_SHARE) return pieceAt(leg, u / LEG_SHARE);
  return pieceAt(after, (u - LEG_SHARE) / (1 - LEG_SHARE));
}
export function pathAt(s, out) {
  const p = locate(s);
  return out ? out.set(p.x, p.y, p.z) : { x: p.x, y: p.y, z: p.z };
}
/** s of the station of step k (the middle of its leg, on the axis of the face); step 5 = the summit. */
export const stationS = (k) => (k >= LEGS ? S_END : k + 0.5 * LEG_SHARE);

// value noise (deterministic, no dependency)
const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------- trail samples + spatial grid
// Every 5 cm of trail: position, arc length (m), piece index, stair flag, horizontal tangent.
const SAMPLES = [];
{
  let m = 0, prev = null;
  PIECES.forEach((pc, n) => {
    for (let u = 0; u <= 1 + 1e-9; u += 0.0005) {
      const p = pieceAt(pc, u);
      if (prev) m += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      prev = p;
      if (!SAMPLES.length || m - SAMPLES.at(-1).m >= 0.05) SAMPLES.push({ ...p, m, leg: n, turn: pc.kind === 'turn' ? pc : null });
    }
  });
  SAMPLES.forEach((p, i) => {
    const a = SAMPLES[Math.max(0, i - 1)], b = SAMPLES[Math.min(SAMPLES.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    p.tx = tx / l; p.tz = tz / l;
  });
}
export const TRAIL_LENGTH = SAMPLES.at(-1).m;
const CELL = 1, REACH = LEDGE / 2 + 2.6, grid = new Map();
const key = (i, j) => i * 4096 + j;
SAMPLES.forEach((p, n) => {
  const i = Math.floor(p.x / CELL), j = Math.floor(p.z / CELL), k = key(i, j);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(n);
});
/** Nearest trail sample per piece within REACH: [{ d, p }] indexed by piece (undefined when out of reach). */
function nearestPerLeg(x, z) {
  const out = [], i0 = Math.floor(x / CELL), j0 = Math.floor(z / CELL), R = Math.ceil(REACH / CELL);
  for (let i = i0 - R; i <= i0 + R; i++) for (let j = j0 - R; j <= j0 + R; j++) {
    const list = grid.get(key(i, j));
    if (list) for (const n of list) {
      const p = SAMPLES[n], d = Math.hypot(x - p.x, z - p.z);
      if (d < REACH && (!out[p.leg] || d < out[p.leg].d)) out[p.leg] = { d, p };
    }
  }
  return out;
}

// The ground follows the smooth height of the trail, also on the stairs: their stone steps are separate
// meshes set on this slope (stairSteps), so the height field stays continuous.
const trailHeight = (p) => p.y;

/** Steps of the stone stairs (turns + summit): { x, z, y (top of the tread), ax, az (walking direction) }. */
export function stairSteps(rise = 0.17) {
  const out = [];
  for (const pc of PIECES) if (pc.kind !== 'leg') {
    const y0 = pieceAt(pc, 0).y, y1 = pieceAt(pc, 1).y, n = Math.max(2, Math.round((y1 - y0) / rise));
    for (let i = 0; i < n; i++) {
      // u where the stair reaches the middle of step i (pieceAt y is monotonic in u)
      const target = lerp(y0, y1, (i + 0.5) / n);
      let lo = 0, hi = 1;
      for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (pieceAt(pc, mid).y < target) lo = mid; else hi = mid; }
      const p = pieceAt(pc, lo), q = pieceAt(pc, Math.min(1, lo + 0.01)), l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      out.push({ x: p.x, z: p.z, y: lerp(y0, y1, (i + 1) / n), ax: (q.x - p.x) / l, az: (q.z - p.z) / l });
    }
  }
  return out;
}

/** Flat pads cut into the slope for buildings (pagoda...): { x, z, r, y }. */
export const PADS = [];

/**
 * Ground height at (x, z): the cone, roughened by lava bumps, with the trail cut in as a flat ledge.
 * Each piece of trail pulls the ground to its own height with a weight that is infinite on its ledge, so
 * ledges stay flat and the banks between two legs are continuous; far from the trail the bare cone takes over.
 */
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  // lava ridges running down the flanks (radial gullies), plus a fine roughness
  const ang = Math.atan2(z, x), gully = 0.5 + 0.5 * Math.sin(ang * 23 + 3 * noise(r * 0.3, ang * 2));
  const bumps = r > RT + 0.3 && r < RB + 2 ? 0.28 * (gully - 0.5) * sstep((r - RT) / 4) + 0.14 * (noise(x * 0.45, z * 0.45) - 0.5) + 0.06 * (noise(x * 1.7, z * 1.7) - 0.5) : 0;
  let h = profile(r) + bumps * sstep((r - RT) / 1.5) * (1 - sstep((r - RB) / 2));
  for (const pd of PADS) h = lerp(pd.y, h, sstep((Math.hypot(x - pd.x, z - pd.z) - pd.r) / 1.6));
  const near = nearestPerLeg(x, z);
  let wsum = 0, ysum = 0, dmin = Infinity, on = null;
  for (const n of near) if (n && n.d <= LEDGE / 2 && (!on || n.d < on.d)) on = n;
  if (on) return trailHeight(on.p); // on the ledge: flat (or a step of the stair); nearest leg at a hairpin
  for (const n of near) if (n) {
    const e = n.d - LEDGE / 2;
    const w = 1 / (e * e * e * e);
    wsum += w; ysum += w * trailHeight(n.p); dmin = Math.min(dmin, n.d);
  }
  if (!wsum) return h;
  return lerp(ysum / wsum, h, sstep((dmin - LEDGE / 2) / (REACH - LEDGE / 2)));
}

/**
 * Nearest trail point: arc length m (metres from the foot), signed distance d (> 0 = outward, downhill), stair (1 on a
 * stair), y (height of that trail point). Given the ground height h, also bank: horizontal distance (m) beyond the edge
 * of the closest piece of trail that stands above the ground — the bank that holds it up. A min over pieces, each
 * penalised as soon as the ground rises above it, so it stays continuous where the nearest piece switches (the foot
 * of a bank, between two switchbacks); per-vertex values that jump there are interpolated into sawteeth.
 */
export function trailCoord(x, z, h = null) {
  let best = null, bank = 9;
  for (const n of nearestPerLeg(x, z)) if (n) {
    if (!best || n.d < best.d) best = n;
    if (h !== null) bank = Math.min(bank, Math.max(0, n.d - LEDGE / 2) + 12 * Math.max(0, h - n.p.y + 0.03));
  }
  if (!best) return { m: 0, d: 99, stair: 0, y: 0, bank };
  const { p } = best, side = Math.sign((x - p.x) * p.x + (z - p.z) * p.z) || 1; // outward = away from the axis
  return { m: p.m, d: best.d * side, stair: p.stair ? 1 : 0, y: p.y, bank };
}

/** Horizontal tangent of the trail at s (unit), for orienting gates and decorations. */
export function trailTangent(s) {
  const a = pathAt(Math.max(0, s - 0.004)), b = pathAt(Math.min(S_END, s + 0.004));
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
  return { x: tx / l, z: tz / l };
}
