// Japanese garden pieces of the Kaizen video, procedural (no model file): stone lantern (tōrō), Jizō statue
// with its red bib and cap, stone fence (tamagaki), torii, five-storey pagoda, black pine. Every factory returns a THREE.Group whose
// origin is on the ground, its front looking at -z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// hexagonal ring section: lathe with 6 sides, rotated so a flat face looks at -z
const hexLathe = (pts) => lathe(pts, 6).rotateY(Math.PI / 6);

/**
 * Kasuga-style stone lantern (~1.15 m), the classic proportions: hexagonal plinth with lotus petals, round post
 * with a carved band, lotus-dish platform, fire box with two square openings and two round (sun/moon) windows,
 * a heavy hexagonal roof whose six corners curl up (warabite), a lotus bud and jewel on top.
 */
export function lantern(stoneMat, { glowMat = null, scale = 1 } = {}) {
  const g = new THREE.Group();
  const add = (geo, mat = stoneMat, y = 0) => { const m = shadowy(new THREE.Mesh(geo, mat)); m.position.y = y; g.add(m); return m; };
  add(hexLathe([[0, 0], [0.25, 0], [0.25, 0.06], [0.23, 0.075], [0.16, 0.1], [0, 0.1]]));                // plinth (kiso)
  // lotus petals carved around the plinth top
  for (let i = 0; i < 12; i++) {
    const pt = add(new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), stoneMat, 0.095);
    const a = (i / 12) * Math.PI * 2; pt.position.x = 0.13 * Math.cos(a); pt.position.z = 0.13 * Math.sin(a); pt.scale.set(1, 0.6, 0.55); pt.rotation.y = -a;
  }
  add(lathe([[0.07, 0.1], [0.062, 0.28], [0.075, 0.29], [0.075, 0.32], [0.062, 0.33], [0.056, 0.52], [0.07, 0.56], [0, 0.56]], 20)); // post (sao), carved band
  add(hexLathe([[0, 0.55], [0.1, 0.55], [0.17, 0.585], [0.19, 0.61], [0.19, 0.64], [0, 0.64]]));        // platform (chūdai)
  // fire box (hibukuro): six posts and lintels, openings on two faces, solid carved panels on the others
  const R = 0.135, H = 0.22, y0 = 0.64;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, post = add(new THREE.BoxGeometry(0.035, H, 0.035), stoneMat, y0 + H / 2);
    post.position.x = R * Math.cos(a); post.position.z = R * Math.sin(a); post.rotation.y = -a;
    const fa = a + Math.PI / 6, face = i % 3; // 0: open (fire) · 1: round window · 2: solid
    if (face === 0) continue;
    const pw = R * 0.98;
    if (face === 2) {
      const pan = add(new THREE.BoxGeometry(0.03, H * 0.92, pw), stoneMat, y0 + H / 2);
      pan.position.x = R * 0.85 * Math.cos(fa); pan.position.z = R * 0.85 * Math.sin(fa); pan.rotation.y = -fa;
    } else { // sun / moon: a panel pierced by a disc of light
      const ring = add(new THREE.TorusGeometry(0.04, 0.022, 6, 18), stoneMat, y0 + H * 0.55); ring.position.x = R * 0.86 * Math.cos(fa); ring.position.z = R * 0.86 * Math.sin(fa); ring.rotation.y = Math.PI / 2 - fa;
      for (const dy of [-1, 1]) { const b = add(new THREE.BoxGeometry(0.03, H * 0.2, pw), stoneMat, y0 + H * 0.55 + dy * H * 0.35); b.position.x = R * 0.86 * Math.cos(fa); b.position.z = R * 0.86 * Math.sin(fa); b.rotation.y = -fa; }
    }
  }
  if (glowMat) add(new THREE.CylinderGeometry(0.1, 0.1, H * 0.8, 6), glowMat, y0 + H / 2);
  add(hexLathe([[0, y0 + H], [0.16, y0 + H], [0.16, y0 + H + 0.02], [0, y0 + H + 0.02]]));
  // roof (kasa): concave hexagonal hat, corners curled up
  const roof = hexLathe([[0, 0], [0.3, 0], [0.31, 0.025], [0.24, 0.05], [0.14, 0.11], [0.07, 0.15], [0, 0.155]]);
  const rp = roof.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x) - Math.PI / 6;
    const corner = Math.pow(Math.abs(Math.cos(3 * a)), 8); // 1 at the six corners
    if (r > 0.2) rp.setY(i, rp.getY(i) + corner * 0.06 * ((r - 0.2) / 0.11) ** 1.5);
  }
  roof.computeVertexNormals();
  add(roof, stoneMat, y0 + H + 0.02);
  add(lathe([[0, 0], [0.05, 0], [0.065, 0.03], [0.05, 0.05], [0, 0.05]], 16), stoneMat, y0 + H + 0.17);  // lotus bud seat (ukebana)
  add(lathe([[0, 0], [0.04, 0.005], [0.055, 0.04], [0.045, 0.075], [0.015, 0.105], [0, 0.115]], 16), stoneMat, y0 + H + 0.215); // jewel (hōju), pointed
  g.scale.setScalar(scale);
  return g;
}

/**
 * Jizō (~0.6 m): a monk carved in soft granite, standing on a lotus pedestal; shaven round head, long ears, hands
 * joined in prayer under a red cloth bib (yodarekake) that drapes in folds, a red knitted cap.
 */
export function jizo(stoneMat, redMat, { scale = 1 } = {}) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = shadowy(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); g.add(m); return m; };
  add(lathe([[0, 0], [0.2, 0], [0.2, 0.05], [0.17, 0.06], [0, 0.06]], 8), stoneMat);                     // octagonal plinth
  add(lathe([[0, 0.06], [0.12, 0.06], [0.17, 0.1], [0.18, 0.12], [0, 0.12]], 20), stoneMat);             // lotus seat
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, pt = add(new THREE.SphereGeometry(0.045, 8, 6), stoneMat, 0.15 * Math.cos(a), 0.1, 0.15 * Math.sin(a)); pt.scale.set(0.6, 0.45, 1); pt.rotation.y = -a; }
  // robe: a soft tapered column, wider at the sleeves, folds suggested by a slight wave on the silhouette
  const robe = lathe([[0, 0.12], [0.12, 0.12], [0.125, 0.2], [0.12, 0.3], [0.13, 0.36], [0.115, 0.42], [0.075, 0.46], [0.05, 0.47], [0, 0.47]], 28);
  const rp = robe.attributes.position;
  for (let i = 0; i < rp.count; i++) { const a = Math.atan2(rp.getZ(i), rp.getX(i)), f = 1 + 0.025 * Math.sin(a * 9) * Math.min(1, (0.42 - rp.getY(i)) * 5); rp.setX(i, rp.getX(i) * f); rp.setZ(i, rp.getZ(i) * f * 0.88); }
  robe.computeVertexNormals(); add(robe, stoneMat);
  // hands joined in prayer at the chest: two flat palms pressed together, sleeves falling from the forearms
  for (const sx of [-1, 1]) {
    const palm = add(new THREE.CapsuleGeometry(0.016, 0.05, 4, 10), stoneMat, sx * 0.012, 0.345, -0.118); palm.scale.set(0.8, 1, 0.55); palm.rotation.z = sx * 0.12;
    const sleeve = add(new THREE.CapsuleGeometry(0.03, 0.07, 4, 10), stoneMat, sx * 0.07, 0.3, -0.1); sleeve.rotation.set(0.5, 0, sx * 1.05);
  }
  add(new THREE.CylinderGeometry(0.035, 0.04, 0.04, 14), stoneMat, 0, 0.485);                             // neck
  const head = add(new THREE.SphereGeometry(0.075, 24, 18), stoneMat, 0, 0.55); head.scale.set(1, 1.12, 1);
  for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(0.014, 0.05, 4, 8), stoneMat, sx * 0.074, 0.54, 0.005); // long lobes
  // face, gently carved: half-closed eyes, nose, the ūrnā between the brows
  const shade = new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 1 }); // a shallow groove, not a drawn line
  for (const sx of [-1, 1]) { const e = add(new THREE.TorusGeometry(0.014, 0.0018, 4, 10, Math.PI), shade, sx * 0.027, 0.556, -0.071); e.rotation.z = Math.PI; }
  add(new THREE.SphereGeometry(0.011, 8, 6), stoneMat, 0, 0.537, -0.081).scale.set(0.8, 1.3, 0.9);
  add(new THREE.SphereGeometry(0.005, 6, 4), stoneMat, 0, 0.575, -0.077);
  // bib: follows the shoulders of the robe (same profile, a few mm out), open at the back, wavy hem
  const prof = [[0.058, 0.475], [0.08, 0.46], [0.112, 0.43], [0.126, 0.405], [0.132, 0.38]];
  const bib = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r + 0.006, y)), 28, Math.PI * 0.25, Math.PI * 1.5), bp = bib.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const a = Math.atan2(bp.getX(i), bp.getZ(i)); bp.setZ(i, bp.getZ(i) * 0.88);
    if (bp.getY(i) < 0.39) bp.setY(i, bp.getY(i) - 0.012 * Math.sin(a * 6) ** 2);
  }
  bib.computeVertexNormals();
  add(bib, redMat); // redMat: DoubleSide (open lathe)
  add(new THREE.TorusGeometry(0.06, 0.009, 6, 20).rotateX(Math.PI / 2), redMat, 0, 0.474);
  // knitted cap, a little rolled brim
  add(new THREE.SphereGeometry(0.08, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), redMat, 0, 0.565);
  add(new THREE.TorusGeometry(0.077, 0.012, 6, 24).rotateX(Math.PI / 2), redMat, 0, 0.57);
  g.scale.setScalar(scale);
  return g;
}

/**
 * Stone fence (tamagaki) along a closed or open polyline of [x, z] points: square granite posts with a pyramidal
 * cap, two rails between them. `y(x, z)` gives the ground height. Returns a Group (world coordinates).
 */
export function fence(stoneMat, points, y, { spacing = 0.9, height = 0.55, closed = false } = {}) {
  const g = new THREE.Group(), post = new THREE.BoxGeometry(0.1, height, 0.1), cap = new THREE.ConeGeometry(0.085, 0.07, 4).rotateY(Math.PI / 4);
  // posts every `spacing` metres along the whole polyline (not per segment: a finely sampled arc has short segments)
  const pts = closed ? [...points, points[0]] : points, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1], n = Math.max(1, Math.round(total / spacing)), at = [];
  for (let k = 0, i = 1; k <= (closed ? n - 1 : n); k++) {
    const d = (k / n) * total; while (i < cum.length - 1 && cum[i] < d) i++;
    const u = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    at.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]);
  }
  const posts = new THREE.InstancedMesh(post, stoneMat, at.length), caps = new THREE.InstancedMesh(cap, stoneMat, at.length), o = new THREE.Object3D();
  at.forEach(([x, z], i) => {
    const gy = y(x, z); o.position.set(x, gy + height / 2 - 0.05, z); o.rotation.set(0, 0, 0); o.updateMatrix(); posts.setMatrixAt(i, o.matrix);
    o.position.y = gy + height - 0.05 + 0.035; o.updateMatrix(); caps.setMatrixAt(i, o.matrix);
  });
  for (const m of [posts, caps]) g.add(shadowy(m));
  const railGeo = new THREE.BoxGeometry(1, 0.05, 0.05), rails = [];
  for (let i = 0; i < at.length - (closed ? 0 : 1); i++) {
    const [x0, z0] = at[i], [x1, z1] = at[(i + 1) % at.length], L = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, gy = (y(x0, z0) + y(x1, z1)) / 2;
    for (const hy of [0.18, height - 0.16]) { o.position.set(mx, gy + hy, mz); o.rotation.set(0, -Math.atan2(z1 - z0, x1 - x0), 0); o.scale.set(L, 1, 1); o.updateMatrix(); rails.push(o.matrix.clone()); o.scale.set(1, 1, 1); }
  }
  const rm = new THREE.InstancedMesh(railGeo, stoneMat, rails.length); rails.forEach((m, i) => rm.setMatrixAt(i, m)); g.add(shadowy(rm));
  return g;
}

/**
 * Myōjin torii: tie beam along x (the way passes along z). Pillars lean slightly inwards (uchikorobi) on black
 * plinths (kamebara) with a top ring (daiwa); the tie beam (nuki) passes through them, held by wedges (kusabi);
 * the lintel is a vermilion beam (shimaki) under a black cap (kasagi) with upswept ends; a tablet (gaku) in a gilt
 * frame hangs from a central strut. Optional sacred rope with paper streamers across the opening.
 */
export function torii(shuMat, kuroMat, { width = 1.7, height = 2.3, seg = 20, tablet = '富士', rope = false, goldMat = null } = {}) {
  const g = new THREE.Group(), half = width / 2, lean = 0.025;
  const add = (geo, mat, x, y, z = 0) => { const m = shadowy(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); g.add(m); return m; };
  goldMat ??= new THREE.MeshStandardMaterial({ color: 0xc9a04a, roughness: 0.35, metalness: 1 });
  for (const s of [-1, 1]) {
    const x = s * half, p = add(new THREE.CylinderGeometry(0.085, 0.1, height, seg), shuMat, x, height / 2);
    p.rotation.z = s * lean; // feet further apart than heads
    add(lathe([[0.1, 0], [0.135, 0], [0.14, 0.05], [0.135, 0.2], [0.115, 0.27], [0.1, 0.28]], seg), kuroMat, x, 0);           // kamebara
    add(new THREE.CylinderGeometry(0.105, 0.105, 0.07, seg), kuroMat, x - s * lean * (height - 0.11), height - 0.11);            // daiwa
    // wedge through the pillar, under the nuki
    add(new THREE.BoxGeometry(0.05, 0.05, 0.22), kuroMat, x - s * lean * (height - 0.52), height - 0.53);
  }
  const top = half - lean * height; // pillar centre at the top
  // nuki through both pillars, ends cut square, sticking out
  add(new THREE.BoxGeometry(2 * top + 0.42, 0.13, 0.1), shuMat, 0, height - 0.45);
  add(new THREE.BoxGeometry(2 * top + 0.5, 0.11, 0.16), shuMat, 0, height - 0.03);      // shimaki
  // kasagi: black, thicker in the middle, ends swept up (sorihashi) and cut at an angle
  const KL = 2 * top + 1.0, kg = new THREE.BoxGeometry(KL, 0.14, 0.26, 40, 2, 2), kp = kg.attributes.position;
  for (let i = 0; i < kp.count; i++) {
    const a = Math.abs(kp.getX(i) / (KL / 2));
    kp.setY(i, kp.getY(i) * (1 - 0.2 * a) + 0.22 * Math.pow(a, 2.4) + (a > 0.97 && kp.getY(i) > 0 ? 0.03 : 0));
    kp.setZ(i, kp.getZ(i) * (1 + 0.12 * a));
  }
  kg.computeVertexNormals();
  add(kg, kuroMat, 0, height + 0.1);
  // gakuzuka strut and tablet: dark board in a gilt frame, characters painted in gold (canvas)
  add(new THREE.BoxGeometry(0.12, 0.38, 0.08), shuMat, 0, height - 0.24);
  const tw = 0.26, th = 0.4;
  add(new THREE.BoxGeometry(tw + 0.05, th + 0.05, 0.11), goldMat, 0, height - 0.22, 0); // thicker than the strut it hangs on
  if (tablet && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 200; const x = c.getContext('2d');
    x.fillStyle = '#1c1a18'; x.fillRect(0, 0, 128, 200);
    x.fillStyle = '#d8b25a'; x.font = 'bold 76px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    [...tablet].forEach((ch, i, all) => x.fillText(ch, 64, 100 + (i - (all.length - 1) / 2) * 84));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
    for (const z of [-0.057, 0.057]) { const m = add(new THREE.PlaneGeometry(tw, th), face, 0, height - 0.22, z); if (z < 0) m.rotation.y = Math.PI; } // planes face +z by default
  } else add(new THREE.BoxGeometry(tw, th, 0.116), kuroMat, 0, height - 0.22);
  if (rope) {
    const straw = new THREE.MeshStandardMaterial({ color: 0xb59a62, roughness: 1 }), paper = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x222018 });
    const curve = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((u) => new THREE.Vector3(u * (half - 0.12), height - 0.62 - 0.14 * (1 - u * u), 0)));
    // two strands of rice straw twisted round each other, thicker in the middle (a real shimenawa is fattest at its centre)
    for (const ph of [0, Math.PI]) { const tw = [];
      for (let i = 0; i <= 120; i++) { const u = i / 120, p = curve.getPointAt(u), a = u * 34 + ph, r = 0.013 + 0.009 * Math.sin(u * Math.PI); tw.push(new THREE.Vector3(p.x, p.y + r * Math.cos(a), p.z + r * Math.sin(a))); }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tw), 240, 0.017, 7, false), straw, 0, 0); }
    const zig = [[0, 0], [0.05, -0.055], [0, -0.11], [0.05, -0.165], [0, -0.22]], pos = [];
    for (let i = 0; i < zig.length - 1; i++) { const [x0, y0] = zig[i], [x1, y1] = zig[i + 1]; pos.push(x0, y0, 0, x0 + 0.045, y0, 0, x1, y1, 0, x1, y1, 0, x0 + 0.045, y0, 0, x1 + 0.045, y1, 0); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.computeVertexNormals();
    for (const u of [0.25, 0.5, 0.75]) { const p = curve.getPointAt(u); add(sg, paper, p.x - 0.045, p.y - 0.03, 0); }
  }
  return g;
}

/** Five-storey pagoda (gojū-no-tō, ~6.5 m): stone base, five shrinking storeys, wide eaves, sōrin spire. */
export function pagoda(shuMat, roofMat, plasterMat, stoneMat, metalMat) {
  const g = new THREE.Group();
  const add = (geo, mat, y) => { const m = shadowy(new THREE.Mesh(geo, mat)); m.position.y = y; g.add(m); return m; };
  add(new THREE.BoxGeometry(2.4, 0.35, 2.4), stoneMat, 0.175);
  let y = 0.35;
  for (let k = 0; k < 5; k++) {
    const w = 1.55 - k * 0.17, h = 0.62 - k * 0.03;
    add(new THREE.BoxGeometry(w, h, w), plasterMat, y + h / 2);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { // vermilion corner posts
      const post = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), shuMat)); post.position.set(sx * w / 2, y + h / 2, sz * w / 2); g.add(post);
    }
    add(new THREE.BoxGeometry(w + 0.04, 0.07, w + 0.04), shuMat, y + h - 0.035); // beam band under the eaves
    // eaves: a flat pyramid frustum with upturned corners
    const ew = w + 1.0 - k * 0.06, roof = new THREE.CylinderGeometry(w * 0.42, ew * 0.71, 0.24, 4, 1);
    roof.rotateY(Math.PI / 4);
    const rp = roof.attributes.position;
    for (let i = 0; i < rp.count; i++) { const r = Math.hypot(rp.getX(i), rp.getZ(i)); if (r > ew * 0.6) rp.setY(i, rp.getY(i) + 0.08); }
    roof.computeVertexNormals();
    add(roof, roofMat, y + h + 0.1);
    y += h + 0.22;
  }
  add(new THREE.CylinderGeometry(0.03, 0.05, 1.5, 10), metalMat, y + 0.75);                // sōrin spire
  for (let i = 0; i < 9; i++) add(new THREE.TorusGeometry(0.1 - i * 0.004, 0.018, 6, 16).rotateX(Math.PI / 2), metalMat, y + 0.3 + i * 0.1);
  add(new THREE.SphereGeometry(0.07, 12, 8), metalMat, y + 1.55);
  return g;
}

/**
 * Japanese black pine (kuromatsu), as gardeners shape it: a leaning, twisting trunk and flat cloud-pruned
 * pads of needles (niwaki). `rand` = a seeded random function.
 */
export function pine(barkMat, needleMat, rand, { height = 3.2 } = {}) {
  const g = new THREE.Group();
  const lean = (rand() - 0.5) * 0.6, twist = rand() * Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    pts.push(new THREE.Vector3(Math.sin(twist + u * 2.4) * 0.35 * u + lean * u * height * 0.5, u * height, Math.cos(twist + u * 1.9) * 0.25 * u));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 24, 1, 8, false), tp = trunk.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i < tp.count; i++) { // taper: the tube is built with radius 1, scaled per ring
    const ring = Math.floor(i / 9) / 24; curve.getPointAt(Math.min(1, ring), c);
    const r = 0.13 * (1 - ring * 0.75); tp.setXYZ(i, c.x + (tp.getX(i) - c.x) * r, c.y + (tp.getY(i) - c.y) * r, c.z + (tp.getZ(i) - c.z) * r);
  }
  trunk.computeVertexNormals();
  g.add(shadowy(new THREE.Mesh(trunk, barkMat)));
  // pads: each a flat cloud of needle tufts — small cones of needles pointing up and out, tinted per tuft, over a
  // dark core that keeps the pad dense; branches fork out to them
  // a tuft = a brush of ~24 thin needles fanning out from a shoot (real pine needles, two per sheath, ~12 cm)
  const tuft = (() => {
    const parts = [], r = rng(7);
    for (let k = 0; k < 24; k++) {
      const a = r() * Math.PI * 2, tilt = 0.25 + r() * 0.6, L = 0.13 + r() * 0.06;
      const n = new THREE.PlaneGeometry(0.006, L, 1, 2).translate(0, L / 2, 0);
      const np = n.attributes.position; for (let i = 0; i < np.count; i++) { const y = np.getY(i); np.setZ(i, 0.06 * (y / L) ** 2); } // slight droop
      n.rotateX(tilt).rotateY(a); parts.push(n);
    }
    return mergeGeometries(parts);
  })(), core = new THREE.IcosahedronGeometry(1, 2);
  const pads = 3 + Math.floor(rand() * 3), tufts = [], col = new THREE.Color();
  const coreMat = pine.core ??= new THREE.MeshStandardMaterial({ color: 0x1f3018, roughness: 0.9 }); // shaded inside of the pad
  for (let k = 0; k < pads; k++) {
    const u = 0.45 + (k / pads) * 0.55, base = curve.getPointAt(Math.min(1, u)), a = rand() * Math.PI * 2, reach = (0.5 + rand() * 0.5) * (1.15 - u);
    const end = base.clone().add(new THREE.Vector3(Math.cos(a) * reach, 0.15 + rand() * 0.2, Math.sin(a) * reach));
    const mid = base.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.08, 0));
    g.add(shadowy(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(base, mid, end), 6, 0.035, 6, false), barkMat)));
    const w = 0.55 + rand() * 0.35 + (1 - u) * 0.4;
    const c = shadowy(new THREE.Mesh(core, coreMat)); c.position.copy(end); c.scale.set(w * 0.38, w * 0.07, w * 0.38); g.add(c);
    const n = Math.round(70 * w * w);
    for (let j = 0; j < n; j++) {
      const ra = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * w * 0.5, dome = 1 - (rr / (w * 0.5)) ** 2;
      tufts.push({ p: new THREE.Vector3(end.x + Math.cos(ra) * rr, end.y + 0.02 + dome * w * 0.08 + (rand() - 0.5) * 0.03, end.z + Math.sin(ra) * rr), tilt: 0.3 + 0.9 * (rr / (w * 0.5)), ra, s: 0.7 + 0.6 * rand() });
    }
  }
  const im = new THREE.InstancedMesh(tuft, needleMat, tufts.length), o = new THREE.Object3D();
  tufts.forEach((t, i) => {
    o.position.copy(t.p); o.rotation.set(0, -t.ra, 0); o.rotateZ(-t.tilt * 0.6); o.scale.setScalar(t.s * 1.3); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    im.setColorAt(i, col.setHSL(0.25 + 0.05 * rand(), 0.3 + 0.15 * rand(), 0.13 + 0.09 * rand()));
  });
  g.add(shadowy(im));
  return g;
}
