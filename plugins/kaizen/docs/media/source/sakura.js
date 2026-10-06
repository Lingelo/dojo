// Procedural cherry tree (sakura) of the Kaizen video: deterministic (seeded), no model file.
// Branches: recursive growth into tapered tubes wearing the sakura_bark PBR texture (Poly Haven, CC0).
// Blossoms: clusters of five-petal flowers in one InstancedMesh, opened by bloom(k), k = 0 → 1.
// Falling petals: a second InstancedMesh whose motion is a pure function of time (frame-by-frame safe).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// mulberry32: small seeded PRNG, so the same tree grows on every machine
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// one petal: a notched teardrop (cherry petals have a small notch at the tip), slightly cupped
function petalGeometry(len = 1, w = 0.62, cup = 0.18) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(w * 0.55, len * 0.15, w * 0.62, len * 0.72, w * 0.22, len * 0.98);
  s.lineTo(0, len * 0.86); // notch
  s.lineTo(-w * 0.22, len * 0.98);
  s.bezierCurveTo(-w * 0.62, len * 0.72, -w * 0.55, len * 0.15, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, cup * ((x / w) ** 2 * 2.2 + (y / len) * 0.6)); }
  g.computeVertexNormals();
  return g;
}

// a flower: five petals around a center, tilted open by the instance scale/rotation; vertex color = pink
// at the base fading to white at the tip, the real gradient of a Somei-Yoshino blossom
function flowerGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const g = petalGeometry(1, 0.62, 0.16);
    g.rotateX(-1.05); // petals open outwards
    g.rotateY((i / 5) * Math.PI * 2);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const r = Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / 0.95);
    const k = Math.pow(r, 0.7);
    col.set([0.95 + 0.05 * k, 0.42 + 0.42 * k, 0.55 + 0.33 * k], i * 3); // deep pink center → pale pink tip
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Build the tree. Returns { group, bloom(k), petals(t, t0, span) } where
 *   bloom(k)   opens the blossoms (0 = bare branches with buds, 1 = full bloom), clusters stagger in
 *   petals(t, t0, span) petals leave the crown one by one from t0 over span seconds, then rest on the ground
 * ground(x, z) → y, in world space: where the petals land (default: flat at the tree's foot). The tree must not
 * be rotated (its group position is used to go from local to world). gust: a share of the petals the wind
 * carries far, up to `reach` metres downwind (wind = +x local), so they settle down the slope of a hill.
 */
export function createSakura({ textures, seed = 7, height = 3.4, quality = 'standard', ground = null, gust = 0, reach = 8 } = {}) {
  const rand = rng(seed);
  const HQ = quality === 'high', DRAFT = quality === 'draft';
  const group = new THREE.Group();

  // ------------------------------------------------------------ branches
  // limbs: { pts: Vector3[], rad: number[] }, one smooth tube each (no stacked cylinders, no visible joints)
  const limbs = [], tips = [];
  const up = new THREE.Vector3(0, 1, 0);
  const trunkLen = height * 0.34, crownBase = trunkLen * 1.2;
  // Branching follows Leonardo's rule (the cross-sections are conserved: r² = Σ rᵢ²): one child carries
  // on the main axis, thinner side shoots leave it at different heights, so the wood tapers like a real tree.
  function grow(a, dir, len, r, depth, back = null) {
    const steps = depth < 2 ? 7 : 4;
    const rEnd = r * (depth < 1 ? 0.72 : 0.8); // taper along the limb itself
    let p = a, d = dir.clone();
    // a child starts a little inside its parent, so the fork reads as one piece of wood
    const pts = [back ? a.clone().addScaledVector(back, -r * 1.5) : a.clone()], rad = [r];
    for (let k = 0; k < steps; k++) {
      const wobble = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.4, rand() - 0.5).multiplyScalar(depth < 1 ? 0.1 : 0.28);
      d.add(wobble);
      // umbrella crown: scaffold limbs climb and open outwards, only the fine twigs arch down
      d.y += depth === 0 ? 0.03 : -0.03 - 0.035 * depth; // limbs bend outwards with age: wider than tall
      d.normalize();
      // nothing hangs below the crown: a limb heading under it turns back up
      if (depth > 0 && p.y < crownBase && d.y < 0.15) { d.y = 0.15; d.normalize(); }
      const q0 = p.clone().addScaledVector(d, len / steps);
      const u = (k + 1) / steps;
      let rb = r + (rEnd - r) * u;
      // root flare: the trunk swells smoothly towards the ground
      if (depth === 0) rb *= 1 + 0.6 * Math.pow(Math.max(0, 1 - u / 0.3), 2);
      pts.push(q0); rad.push(rb);
      if (depth >= 3 && k > 0 && q0.y > crownBase) tips.push({ p: q0, dir: d.clone(), depth }); // flowers along the twigs
      // side shoot partway along the limb (not every branch from one node)
      if (depth >= 1 && depth < 5 && k === Math.floor(steps / 2) && rand() < 0.7) {
        const side = d.clone().applyAxisAngle(new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize(), 0.9 + rand() * 0.4).normalize();
        grow(q0, side, len * 0.55, rb * 0.5, depth + 2, side);
      }
      p = q0;
    }
    if (depth === 0) rad[0] *= 1.6; // the flare at ground level
    limbs.push({ pts, rad, depth });
    if (depth >= 6 || rEnd < 0.01) { if (p.y > crownBase) tips.push({ p, dir: d, depth }); return; }
    // fork: a leader (most of the section) + 1–2 thinner children; areas sum to the parent's
    const n = depth === 0 ? 3 : rand() < 0.3 ? 3 : 2;
    const share = Array.from({ length: n }, (_, i) => (depth === 0 ? 1 : i === 0 ? 1.6 : 0.6 + rand() * 0.5));
    const tot = share.reduce((x, y) => x + y, 0);
    const az0 = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const ri = rEnd * Math.sqrt(share[i] / tot);
      // the trunk splits into 3 scaffold limbs ~120° apart opening wide (~45°); higher forks are tighter
      const spread = depth === 0 ? 0.85 + rand() * 0.15 : i === 0 ? 0.3 + rand() * 0.25 : 0.65 + rand() * 0.4;
      const side = new THREE.Vector3().crossVectors(d, up);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      const di = d.clone().applyAxisAngle(side.normalize(), spread).applyAxisAngle(d, az0 + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5).normalize();
      grow(p, di, len * (depth === 0 ? 0.95 : i === 0 ? 0.82 : 0.66) * (0.9 + rand() * 0.2), ri, depth + 1, di);
    }
  }
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 1, 0.02).normalize(), trunkLen, 0.17, 0);

  // each limb = a tube along a Catmull-Rom curve, radius interpolated per ring; merged (one draw call)
  const radial = DRAFT ? 6 : HQ ? 16 : 10;
  const geos = limbs.map(({ pts, rad }) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const rings = Math.max(4, (pts.length - 1) * (DRAFT ? 2 : 3));
    const g = new THREE.TubeGeometry(curve, rings, 1, radial, false);
    const pos = g.attributes.position, uv = g.attributes.uv, len = curve.getLength();
    const c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, f = t * (rad.length - 1), i0 = Math.floor(f), i1 = Math.min(rad.length - 1, i0 + 1);
      const r = rad[i0] + (rad[i1] - rad[i0]) * (f - i0);
      curve.getPointAt(t, c);
      for (let k = 0; k <= radial; k++) {
        const idx = j * (radial + 1) + k;
        v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c); // unit tube → real radius
        pos.setXYZ(idx, v.x, v.y, v.z);
        // bark uv: around × along, scaled to world size so the texture keeps its scale on thin twigs
        uv.setXY(idx, (k / radial) * Math.max(1, Math.round(r * 14)), t * len * 2.2);
      }
    }
    g.computeVertexNormals();
    return g;
  });
  const barkMat = new THREE.MeshStandardMaterial({
    map: textures.barkDiff, normalMap: textures.barkNor, roughnessMap: textures.barkArm, aoMap: textures.barkArm,
    metalnessMap: textures.barkArm, metalness: 1, roughness: 1, normalScale: new THREE.Vector2(1.4, 1.4),
  });
  const wood = new THREE.Mesh(mergeGeometries(geos), barkMat);
  wood.castShadow = wood.receiveShadow = true;
  group.add(wood);

  // ------------------------------------------------------------ blossoms
  // clusters (hanami: cherries flower in bunches of 3–5 on short stalks) around every tip
  const flowerGeo = flowerGeometry();
  // translucent petals: light through the back face (transmission-like) via a soft wrap term and sheen
  const petalMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, sheen: 1, sheenRoughness: 0.4,
    sheenColor: new THREE.Color(1, 0.8, 0.86), emissive: new THREE.Color(0.22, 0.08, 0.11), // subsurface: light through the petal
  });
  // bunches of 3–5 flowers on short stalks, real size (~3.5 cm): round every tip and all along the two outermost
  // orders of twigs — the crown reads as a cloud made of thousands of small flowers, not a few big ones
  const flowers = [];
  const perTip = DRAFT ? 3 : HQ ? 9 : 6, perMetre = DRAFT ? 0 : HQ ? 26 : 16;
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const bunch = (c, dir) => {
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const off = new THREE.Vector3(rand() - 0.5, rand() - 0.75, rand() - 0.5).multiplyScalar(0.07); // the flowers hang a little
      const pos = c.clone().add(off);
      const out = off.clone().normalize().add(dir.clone().multiplyScalar(0.4)).add(new THREE.Vector3(0, 0.15, 0)).normalize();
      q.setFromUnitVectors(up, out).multiply(new THREE.Quaternion().setFromEuler(e.set(0, rand() * Math.PI * 2, 0)));
      flowers.push({ pos, q: q.clone(), size: DRAFT ? 0.07 + rand() * 0.03 : 0.03 + rand() * 0.012, delay: rand() * 0.42 + (pos.y / height) * 0.12 });
    }
  };
  for (const { p, dir } of tips) for (let i = 0; i < perTip; i++) {
    bunch(p.clone().add(new THREE.Vector3(rand() - 0.5, (rand() - 0.3) * 0.7, rand() - 0.5).multiplyScalar(0.28)).addScaledVector(dir, rand() * 0.08), dir);
  }
  const maxDepth = Math.max(...limbs.map((l) => l.depth));
  for (const { pts, depth } of limbs) if (perMetre && depth >= maxDepth - 1) {
    const curve = new THREE.CatmullRomCurve3(pts), L = curve.getLength(), n = Math.round(L * perMetre), c = new THREE.Vector3(), t = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = 0.25 + 0.75 * rand(); curve.getPointAt(u, c); curve.getTangentAt(u, t);
      if (c.y < crownBase) continue;
      const side = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(t).normalize();
      bunch(c.clone().addScaledVector(side, 0.03), side);
    }
  }
  const blossoms = new THREE.InstancedMesh(flowerGeo, petalMat, flowers.length);
  blossoms.castShadow = !DRAFT;
  blossoms.frustumCulled = false;
  group.add(blossoms);

  const m4 = new THREE.Matrix4(), s3 = new THREE.Vector3();
  function bloom(k) {
    flowers.forEach((f, i) => {
      // bare branches at k = 0; each flower buds then opens over 30 % of the range, staggered, so that
      // every quarter of k (one learning each in the video) visibly adds blossoms
      const o = Math.min(1, Math.max(0, (k - f.delay * 1.3) / 0.3));
      const e3 = o * o * (3 - 2 * o);
      const sc = f.size * e3;
      s3.set(sc, sc * (0.35 + 0.65 * e3), sc); // a bud is flatter than an open flower
      m4.compose(f.pos, f.q, s3);
      blossoms.setMatrixAt(i, m4);
    });
    blossoms.instanceMatrix.needsUpdate = true;
    blossoms.visible = k > 0.001;
  }

  // ------------------------------------------------------------ falling petals
  const NP = DRAFT ? 200 : HQ ? 1400 : 900;
  const petalGeo = petalGeometry(1, 0.62, 0.22);
  const col = new Float32Array(petalGeo.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([0.98, 0.72, 0.8], i);
  petalGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const fallers = new THREE.InstancedMesh(petalGeo, petalMat, NP);
  fallers.frustumCulled = false;
  group.add(fallers);
  const crown = tips.map((t) => t.p);
  const P = Array.from({ length: NP }, () => ({
    from: crown[Math.floor(rand() * crown.length)].clone(), phase: rand() * 100, period: 4 + rand() * 4,
    drift: new THREE.Vector3(0.5 + rand() * 0.6, 0, (rand() - 0.5) * 0.7), spin: new THREE.Vector3(rand() * 4, rand() * 3, rand() * 5),
    size: 0.05 + rand() * 0.03, gate: rand(), far: rand() < gust ? 1 + rand() * (reach / 2.2 - 1) : 1,
  }));
  if (gust) P.forEach((p) => { if (p.far > 1) { p.period *= 1 + 0.25 * p.far; p.drift.z *= 1.6; } }); // carried petals fly longer
  const pos = new THREE.Vector3(), rot = new THREE.Euler(), qq = new THREE.Quaternion();
  // petals(t, t0, span): each petal leaves the crown once, at t0 + gate·span, falls for its period, then stays
  // on the sand — no loop, so the ground keeps the trace of what fell (the garden remembers)
  function petals(t, t0 = 0, span = 10) {
    let any = false;
    P.forEach((p, i) => {
      const start = t0 + p.gate * span, u = (t - start) / p.period;
      if (u <= 0) { m4.makeScale(0, 0, 0); fallers.setMatrixAt(i, m4); return; }
      any = true;
      const v = Math.min(1, u);
      // landing spot first (wind drift at v = 1), so the fall ends exactly on the ground below it
      const lx = p.from.x + p.drift.x * 2.2 * p.far, lz = p.from.z + p.drift.z * 2.2 * p.far;
      const land = 0.012 + (ground ? ground(lx + group.position.x, lz + group.position.z) - group.position.y : 0);
      pos.copy(p.from);
      // drag: eases out near the ground; a carried petal floats level for a while before it sinks
      const fall = p.far > 1 ? Math.pow(v, 1.6) : v * v * (3 - 2 * v) * 0.3 + v * 0.7;
      pos.y = p.from.y + (land - p.from.y) * fall;
      // flutter: lateral sway + wind drift growing with the fall (frozen once landed)
      const tt = start + v * p.period + p.phase;
      pos.x += p.drift.x * v * 2.2 * p.far + 0.25 * Math.sin(tt * 1.7) * (1 - v * v);
      pos.z += p.drift.z * v * 2.2 * p.far + 0.2 * Math.cos(tt * 1.3) * (1 - v * v);
      if (u >= 1) rot.set(-Math.PI / 2 + 0.15 * Math.sin(p.phase), 0, p.spin.z * p.phase); // lying on the sand
      else rot.set(p.spin.x * tt, p.spin.y * tt, p.spin.z * tt);
      const sc = p.size * Math.min(1, u * 10);
      m4.compose(pos, qq.setFromEuler(rot), s3.set(sc, sc, sc));
      fallers.setMatrixAt(i, m4);
    });
    fallers.instanceMatrix.needsUpdate = true;
    fallers.visible = any;
  }

  bloom(0); petals(-1, 0, 1);
  return { group, bloom, petals, petalGeometry: petalGeo, flowerCount: flowers.length, limbCount: limbs.length };
}
