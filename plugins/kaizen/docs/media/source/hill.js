// Hill of the Kaizen video: a spiral path of torii climbing a hill to a temple (after Fushimi Inari).
// One function drives everything: helix(s) gives the point of the path at station s (6 per turn); the
// crane, the camera rail, the cards and the torii all follow it. The hill is built around the path:
// each turn is a flat ledge (the path) cut into the slope, a steep mossy bank rises to the next turn, so
// every torii stands on the ground and nothing floats. Pure math, no Three.js: node can check it.

export const STATIONS_PER_TURN = 6, TURNS = 4, S_END = STATIONS_PER_TURN * TURNS;
export const R0 = 16.0, R1 = 4.5;   // path radius at the foot / where it reaches the plateau
export const Y0 = 0.0, Y1 = 7.2;    // path height at the foot / of the temple plateau
export const LEDGE = 1.8;           // width of a ledge (holds both pillars of a torii, ±0.84 m)
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

const lin = (s) => R0 + (R1 - R0) * (s / S_END);
const angleOf = (s) => (s / STATIONS_PER_TURN) * TAU - Math.PI / 2;

/** Outline of the hill: depends on the angle only, shared by every turn, so the gap between turns never changes. */
export const wobble = (a) => 0.55 * Math.sin(2 * a + 0.7) + 0.3 * Math.sin(3 * a + 2.1) + 0.15 * Math.sin(5 * a + 0.4);

export const pathRadius = (s) => lin(Math.min(S_END, Math.max(0, s))) + wobble(angleOf(s));
export const pathHeight = (s) => Y0 + (Y1 - Y0) * clamp01(s / S_END);

/** Point of the path at station s (0 → S_END), turning anticlockwise seen from above. `out` needs set(x, y, z). */
export function helix(s, out) {
  const a = angleOf(s), r = pathRadius(s), x = r * Math.cos(a), y = pathHeight(s), z = r * Math.sin(a);
  return out ? out.set(x, y, z) : { x, y, z };
}

// value noise for the banks (deterministic, no dependency)
const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; // [0, 1]
}

/**
 * Ground height at (x, z). At angle a, the path passes at stations base + 6k (k = turn), each at its own
 * radius; the point lies on a ledge, or on the bank between the ledge outside it (lower) and the one inside
 * it (higher). Banks are eased at the top and the toe and their edge wanders, but never reaches into a
 * ledge: the pillars always stand on flat ground.
 */
export function hillHeight(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  let u = (a + Math.PI / 2) / TAU; u -= Math.floor(u);
  const base = u * STATIONS_PER_TURN, w = wobble(a);
  // k = -1: a virtual turn on the plain, one gap outside the first turn. Seen from any angle, the ground
  // outside the hill is "the ledge before the first one", so the seam where the path starts (s = 0, on the
  // plain) and where the first turn ends (s = 6, 1.8 m up) meets without a step.
  let prev = null;
  for (let k = -1; k <= TURNS; k++) {
    const s = base + k * STATIONS_PER_TURN, plateau = s > S_END;
    // the plateau rim is "the turn after the last one", one gap further in: it follows the last turn at a
    // constant distance, and where the path arrives (s = S_END) the ledge and the plateau are level
    const ri = lin(s) + w, yi = k < 0 ? Y0 : plateau ? Y1 : pathHeight(s);
    if (r >= ri - LEDGE / 2 || plateau) {
      if (r < ri + LEDGE / 2 || !prev) return yi; // on this ledge, the plateau, or the plain
      const out = prev.r - LEDGE / 2, inn = ri + LEDGE / 2;
      const k2 = (out - r) / Math.max(0.01, out - inn) - 0.08 + 0.12 * (noise(x * 1.4, z * 1.4) - 0.5);
      return prev.y + (yi - prev.y) * sstep(k2 / 0.84);
    }
    prev = { r: ri, y: yi };
  }
  return Y1;
}

/** Steep ground (banks): where the stone and earth show instead of the moss of the ledges. */
export function isWall(x, z, e = 0.05) {
  const h = hillHeight(x, z), gx = hillHeight(x + e, z) - h, gz = hillHeight(x, z + e) - h;
  return Math.hypot(gx, gz) / e > 1.2;
}

/**
 * Spacing of the torii along the path (metres): a dense tunnel at the entrance (the intro looks through it)
 * and on the last turns (the approach to the shrine), airier on the first turn, where the camera follows the
 * crane from outside and must see it between the pillars.
 */
export function gateSpacing(s) {
  const dense = Math.max(1 - sstep((s - 0.6) / 1.2), sstep((s - 13) / 4));
  return 1.2 - 0.6 * dense;
}

/** Stations of the torii: one every gateSpacing(s) metres of path, the first half a spacing from the foot. */
export function gateStations(spacing = gateSpacing, step = 0.005) {
  const out = [];
  let p = helix(0), acc = spacing(0) / 2;
  for (let s = step; s <= S_END; s += step) {
    const q = helix(s);
    acc += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); p = q;
    if (acc >= spacing(s)) { acc -= spacing(s); out.push(s); }
  }
  return out;
}

/**
 * Nearest ledge of the path at (x, z): s = station along the path, d = signed distance (m) from the path
 * centreline (> 0 outward). Drives the paving of the path and its gravel shoulders in the ground shader.
 */
export function pathCoord(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  let u = (a + Math.PI / 2) / TAU; u -= Math.floor(u);
  const w = wobble(a);
  let best = { s: 0, d: Infinity };
  for (let k = 0; k < TURNS; k++) {
    const s = (u + k) * STATIONS_PER_TURN, d = r - (lin(s) + w);
    if (Math.abs(d) < Math.abs(best.d)) best = { s, d };
  }
  return best;
}
