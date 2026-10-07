// Shrine at the top of the mountain: a nagare-zukuri honden, the most common shrine style. Its gabled roof flows
// forward over the steps in a long concave sweep (a 2D profile extruded across the width), carried by rafters and
// bracket sets; barge boards with a gilded ornament close the gables. A veranda with a railing runs round the
// sanctuary; wooden stairs lead down to the offering box, under a sacred rope (shimenawa) and its paper streamers.
// The shrine faces -z; its origin is at the foot of the stone platform.
import * as THREE from 'three';

export function createTemple({ shu, stone, roofMap, roofNor, plaster, wood, roof: roofMat = null, kuro, metal, gold } = {}) {
  const g = new THREE.Group();
  const W = 3.4, RW = W + 0.9;                      // body width (x), roof width
  shu ??= new THREE.MeshPhysicalMaterial({ color: 0xc23a1c, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  plaster ??= new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.92 });
  wood ??= new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.75 });
  roofMat ??= new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 0.95, map: roofMap ?? null, normalMap: roofNor ?? null });
  kuro ??= new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.5 });
  metal ??= new THREE.MeshStandardMaterial({ color: 0x5d8676, roughness: 0.6, metalness: 0.35 }); // verdigris copper
  gold ??= new THREE.MeshStandardMaterial({ color: 0xc9a04a, roughness: 0.35, metalness: 1 });
  stone ??= new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.9 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.9, side: THREE.DoubleSide });
  const straw = new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 0.95 });
  const shade = new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 1 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const inst = (geo, mat, mats) => { const m = new THREE.InstancedMesh(geo, mat, mats.length); mats.forEach((t, i) => m.setMatrixAt(i, t)); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const M = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

  // ---- roof profile, in (depth d, height); world z = 0.3 - d (front at +d = world -z)
  const top = new THREE.QuadraticBezierCurve(new THREE.Vector2(-1.75, 1.95), new THREE.Vector2(-0.6, 2.35), new THREE.Vector2(0.25, 2.95));
  const front = new THREE.QuadraticBezierCurve(new THREE.Vector2(0.25, 2.95), new THREE.Vector2(1.2, 2.2), new THREE.Vector2(2.25, 2.02));
  const T = 0.2, ptsTop = [...top.getPoints(24), ...front.getPoints(36).slice(1)];
  const roofY = (zw) => { // top surface of the roof above world z (linear in the sampled profile)
    const d = 0.3 - zw;
    for (let i = 1; i < ptsTop.length; i++) if (ptsTop[i].x >= d) { const a = ptsTop[i - 1], b = ptsTop[i], u = (d - a.x) / (b.x - a.x); return a.y + (b.y - a.y) * u; }
    return ptsTop[ptsTop.length - 1].y;
  };
  const under = (zw) => roofY(zw) - T;

  // ---- stone platform (kidan): a base course, a coping course, three stone steps
  box(W + 0.6, 0.3, 3.8, stone, 0, 0.15, 0.1);
  box(W + 0.7, 0.1, 3.9, stone, 0, 0.35, 0.1);
  for (let i = 0; i < 3; i++) box(1.5 - i * 0.05, 0.13, 0.34, stone, 0, 0.065 + i * 0.13, -2.25 + i * 0.12);

  // ---- floor on short posts, veranda planks, black fascia
  const F = 0.75, ZF = -1.0, ZB = 1.6, XS = (W - 0.2) / 2;     // floor height, veranda front / back edge, half width
  for (const x of [-XS + 0.1, -0.5, 0.5, XS - 0.1]) for (const z of [ZF + 0.1, 0.3, ZB - 0.1]) add(new THREE.CylinderGeometry(0.05, 0.05, F - 0.45, 8), wood, x, 0.4 + (F - 0.45) / 2, z);
  const planks = [];
  for (let x = -XS + 0.07; x < XS; x += 0.14) planks.push(M(x, F - 0.03, (ZF + ZB) / 2));
  inst(new THREE.BoxGeometry(0.13, 0.06, ZB - ZF), wood, planks);
  box(W - 0.15, 0.08, 0.04, kuro, 0, F - 0.07, ZF - 0.01);
  for (const s of [-1, 1]) box(0.04, 0.08, ZB - ZF, kuro, s * (XS + 0.03), F - 0.07, (ZF + ZB) / 2);

  // ---- sanctuary: plaster walls between vermilion posts; the roof slopes down at the back, heights follow it
  const ZW0 = -0.2, ZW1 = 1.5, XP = (W - 0.6) / 2, wallTop = under(ZW1) - 0.04;
  box(W - 0.66, wallTop - F, ZW1 - ZW0 - 0.06, plaster, 0, (F + wallTop) / 2, (ZW0 + ZW1) / 2);
  const xs = [-XP, -XP / 3, XP / 3, XP], yb = under(ZW0) - 0.3;
  for (const x of xs) for (const [z, t] of [[ZW0, yb], [ZW1, wallTop]]) add(new THREE.CylinderGeometry(0.07, 0.075, t - 0.4, 14), shu, x, 0.4 + (t - 0.4) / 2, z);
  for (const x of [-XP, XP]) add(new THREE.CylinderGeometry(0.07, 0.075, wallTop - 0.4, 14), shu, x, 0.4 + (wallTop - 0.4) / 2, (ZW0 + ZW1) / 2);
  // front wall up to the bracket level, above the side walls
  box(W - 0.66, yb - wallTop, 0.05, plaster, 0, (wallTop + yb) / 2, ZW0 + 0.03);
  // tie beams (nageshi) round the walls, at the sill and at the head
  for (const y of [F + 0.07, wallTop - 0.06]) {
    box(W - 0.5, 0.09, 0.09, shu, 0, y, ZW0 - 0.02); box(W - 0.5, 0.09, 0.09, shu, 0, y, ZW1 + 0.02);
    for (const s of [-1, 1]) box(0.09, 0.09, ZW1 - ZW0, shu, s * (XP + 0.02), y, (ZW0 + ZW1) / 2);
  }
  // front: lattice doors in the middle bay (thin vermilion bars over the dark inside), solid panels on the side bays
  const dw = (2 * XP) / 3 - 0.16, dy0 = F + 0.13, dy1 = wallTop - 0.12, bars = [], hb = [];
  box(dw, dy1 - dy0, 0.02, shade, 0, (dy0 + dy1) / 2, ZW0 - 0.04);
  for (let i = 0; i <= 14; i++) bars.push(M(-dw / 2 + (dw * i) / 14, (dy0 + dy1) / 2, ZW0 - 0.06, 1, (dy1 - dy0) / 0.1, 1));
  inst(new THREE.BoxGeometry(0.018, 0.1, 0.022), shu, bars);
  for (let i = 0; i <= 18; i++) hb.push(M(0, dy0 + ((dy1 - dy0) * i) / 18, ZW0 - 0.065, dw / 0.1, 1, 1));
  inst(new THREE.BoxGeometry(0.1, 0.016, 0.02), shu, hb);
  box(0.04, dy1 - dy0, 0.05, kuro, 0, (dy0 + dy1) / 2, ZW0 - 0.075);                     // meeting stile of the two leaves
  for (const s of [-1, 1]) box(0.02, 0.05, 0.03, gold, s * 0.05, (dy0 + dy1) / 2, ZW0 - 0.1); // pulls
  for (const s of [-1, 1]) box(dw, 0.06, 0.05, shu, s * (2 * XP / 3), (dy0 + dy1) / 2, ZW0 - 0.04);

  // ---- bracket sets (masugumi) on the front posts: bearing block, arm, three small blocks, then the wall plate
  for (const x of xs) {
    box(0.17, 0.09, 0.17, wood, x, yb + 0.045, ZW0);
    box(0.5, 0.07, 0.1, shu, x, yb + 0.125, ZW0);
    for (const dx of [-0.2, 0, 0.2]) box(0.1, 0.06, 0.12, wood, x + dx, yb + 0.19, ZW0);
  }
  box(W - 0.2, 0.08, 0.12, shu, 0, yb + 0.26, ZW0);

  // ---- front aisle (hisashi): posts, head beam, cambered tie beams back to the sanctuary
  const ZH = -1.2, yh = under(ZH) - 0.14;
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.065, 0.07, yh - 0.4, 14), shu, s * XP, 0.4 + (yh - 0.4) / 2, ZH);
    box(0.15, 0.08, 0.15, wood, s * XP, yh + 0.04, ZH);
    const kb = new THREE.BoxGeometry(0.08, 0.1, ZW0 - ZH, 1, 1, 8), kp = kb.attributes.position;
    for (let i = 0; i < kp.count; i++) { const u = kp.getZ(i) / (ZW0 - ZH) + 0.5; kp.setY(i, kp.getY(i) + 0.03 * Math.sin(Math.PI * u)); }
    kb.computeVertexNormals(); add(kb, shu, s * XP, yh - 0.05, (ZH + ZW0) / 2);
  }
  box(2 * XP + 0.3, 0.1, 0.1, shu, 0, yh - 0.05, ZH);
  box(2 * XP + 0.5, 0.07, 0.12, wood, 0, yh + 0.115, ZH);

  // ---- veranda railing (kōran): black posts with gilt onion caps (gibōshi), two rails; open in front of the stairs
  const railH = 0.42, posts = [];
  for (const x of [-XS, -1.0, -0.62, 0.62, 1.0, XS]) posts.push([x, ZF + 0.03]);
  for (const s of [-1, 1]) for (const z of [ZF + 0.6, 0.3, 0.9, ZB - 0.05]) posts.push([s * XS, z]);
  const capGeo = new THREE.LatheGeometry([[0, 0], [0.036, 0], [0.036, 0.02], [0.045, 0.045], [0.032, 0.08], [0.007, 0.115], [0, 0.12]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  for (const [x, z] of posts) { add(new THREE.CylinderGeometry(0.03, 0.03, railH, 8), kuro, x, F + railH / 2, z); add(capGeo, gold, x, F + railH, z); }
  const span = (x0, z0, x1, z1) => { for (const [y, r] of [[F + railH - 0.02, 0.022], [F + 0.15, 0.016]]) { const L = Math.hypot(x1 - x0, z1 - z0), m = add(new THREE.CylinderGeometry(r, r, L, 8).rotateZ(Math.PI / 2), shu, (x0 + x1) / 2, y, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); } };
  span(-XS, ZF + 0.03, -0.62, ZF + 0.03); span(0.62, ZF + 0.03, XS, ZF + 0.03);
  for (const s of [-1, 1]) span(s * XS, ZF + 0.03, s * XS, ZB - 0.05);

  // ---- wooden stairs (kizahashi) from the veranda down to the platform, between black stringers
  const NS = 3, sz0 = ZF - 0.02, run = 0.18, rise = (F - 0.4) / NS;
  for (let i = 0; i < NS; i++) box(1.2, 0.04, run + 0.03, wood, 0, F - rise * (i + 1) + 0.02, sz0 - run * (i + 0.5));
  for (const s of [-1, 1]) { const st = box(0.05, 0.1, Math.hypot(run * NS, F - 0.4) + 0.1, kuro, s * 0.62, (F + 0.4) / 2, sz0 - run * NS / 2); st.rotation.x = -Math.atan2(F - 0.4, run * NS); }

  // ---- offering box (saisen-bako) on the platform: slatted top, dark frame, gilt corner fittings
  const ob = new THREE.Group(); g.add(ob); ob.position.set(0, 0.4, -1.78);
  const obAdd = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; ob.add(m); return m; };
  obAdd(new THREE.BoxGeometry(0.8, 0.36, 0.42), wood, 0, 0.18, 0);
  for (let i = 0; i < 7; i++) obAdd(new THREE.BoxGeometry(0.76, 0.03, 0.045), wood, 0, 0.37, -0.18 + i * 0.06).rotation.x = 0.55;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { obAdd(new THREE.BoxGeometry(0.06, 0.37, 0.06), kuro, sx * 0.39, 0.185, sz * 0.2); obAdd(new THREE.BoxGeometry(0.07, 0.03, 0.07), gold, sx * 0.39, 0.37, sz * 0.2); }

  // ---- sacred rope (shimenawa) under the aisle beam, sagging and twisted, zigzag paper streamers (shide); bell
  const rope = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((u) => new THREE.Vector3(u * XP * 0.95, yh - 0.16 - 0.1 * (1 - u * u), ZH - 0.09)));
  add(new THREE.TubeGeometry(rope, 40, 0.045, 10, false), straw);
  const twist = [];
  for (let i = 0; i <= 160; i++) { const u = i / 160, p = rope.getPointAt(u), a = u * 50; twist.push(new THREE.Vector3(p.x, p.y + 0.036 * Math.cos(a), p.z + 0.036 * Math.sin(a))); }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(twist), 320, 0.017, 6, false), straw);
  const zig = [[0, 0], [0.055, -0.06], [0.0, -0.12], [0.055, -0.18], [0.0, -0.24], [0.055, -0.3]], zw = 0.05, zp = [];
  for (let i = 0; i < zig.length - 1; i++) { const [x0, y0] = zig[i], [x1, y1] = zig[i + 1]; zp.push(x0, y0, 0, x0 + zw, y0, 0, x1, y1, 0, x1, y1, 0, x0 + zw, y0, 0, x1 + zw, y1, 0); }
  const shideGeo = new THREE.BufferGeometry(); shideGeo.setAttribute('position', new THREE.Float32BufferAttribute(zp, 3)); shideGeo.computeVertexNormals();
  for (const u of [0.2, 0.4, 0.6, 0.8]) { const p = rope.getPointAt(u); add(shideGeo, paper, p.x - 0.05, p.y - 0.03, p.z - 0.05); }
  add(new THREE.SphereGeometry(0.085, 18, 14), gold, 0, yh - 0.4, ZH - 0.12);                       // bell (suzu)
  const cord = new THREE.MeshStandardMaterial({ color: 0xb23a2a, roughness: 0.9 }), cl = yh - 0.4 - 0.62;
  add(new THREE.CylinderGeometry(0.016, 0.016, cl, 6), cord, 0.02, 0.62 + cl / 2, ZH - 0.14);

  // ---- roof: thick bark shingles (hiwada), laminated eave edges
  const shape = new THREE.Shape(ptsTop);
  for (const p of [...ptsTop].reverse()) shape.lineTo(p.x, p.y - T);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: RW, bevelEnabled: false, curveSegments: 1 });
  roofGeo.rotateY(Math.PI / 2).translate(-RW / 2, 0, 0.3); roofGeo.computeVertexNormals();
  add(roofGeo, roofMat);
  for (const [p, n] of [[front.getPoint(1), 5], [top.getPoint(0), 3]]) for (let i = 0; i < n; i++)
    box(RW - i * 0.02, 0.035, 0.1 + i * 0.012, roofMat, 0, p.y - T - 0.02 - i * 0.034, 0.3 - p.x + (p.x > 0 ? -0.04 : 0.04) * i);

  // ---- rafters (taruki) under both eaves, following the underside of the roof
  const rafter = (d0, d1) => {
    const pts = []; for (let i = 0; i <= 10; i++) { const d = d0 + ((d1 - d0) * i) / 10; pts.push(new THREE.Vector3(0, under(0.3 - d) - 0.03, 0.3 - d)); }
    const sec = new THREE.Shape([new THREE.Vector2(-0.025, -0.03), new THREE.Vector2(0.025, -0.03), new THREE.Vector2(0.025, 0.03), new THREE.Vector2(-0.025, 0.03)]);
    return new THREE.ExtrudeGeometry(sec, { steps: 10, bevelEnabled: false, extrudePath: new THREE.CatmullRomCurve3(pts) });
  };
  const rx = []; for (let x = -RW / 2 + 0.12; x <= RW / 2 - 0.1; x += 0.16) rx.push(M(x, 0, 0));
  inst(rafter(0.3 - ZW0 + 0.05, 2.15), wood, rx);
  inst(rafter(-1.68, 0.3 - ZW1 - 0.08), wood, rx);

  // ---- gables: plaster infill under the roof with a central strut, barge boards (hafu) along the profile, gegyo
  for (const s of [-1, 1]) {
    const gs = new THREE.Shape(), n = 20;
    gs.moveTo(ZW0, wallTop);
    for (let i = 0; i <= n; i++) { const z = ZW0 + ((ZW1 - ZW0) * i) / n; gs.lineTo(z, under(z) - 0.02); }
    gs.lineTo(ZW1, wallTop); gs.closePath();
    const gg = new THREE.ExtrudeGeometry(gs, { depth: 0.04, bevelEnabled: false });
    gg.rotateY(-Math.PI / 2).translate(s * (XP + 0.02) + 0.02, 0, 0);
    add(gg, plaster);
    const zc = 0.3 - 0.25; box(0.06, under(zc) - wallTop, 0.08, shu, s * (XP + 0.05), (wallTop + under(zc)) / 2, zc); // taiheizuka strut
    const hs = new THREE.Shape(ptsTop.map((p) => new THREE.Vector2(p.x, p.y + 0.04)));
    for (const p of [...ptsTop].reverse()) hs.lineTo(p.x, p.y - T - 0.07);
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.05, bevelEnabled: false, curveSegments: 1 });
    hg.rotateY(Math.PI / 2).translate(s * (RW / 2 + 0.03) - 0.025, 0, 0.3); hg.computeVertexNormals();
    add(hg, wood);
    // gegyo: a gilt plate hanging from the apex, with a dark boar's-eye ring; gilt caps on the board ends
    const gy = 2.95 - T - 0.14;
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24).rotateZ(Math.PI / 2), gold, s * (RW / 2 + 0.07), gy, 0.05).scale.set(1, 1.25, 1);
    add(new THREE.TorusGeometry(0.05, 0.012, 6, 16).rotateY(Math.PI / 2), shade, s * (RW / 2 + 0.09), gy, 0.05);
    for (const p of [ptsTop[0], ptsTop[ptsTop.length - 1]]) box(0.07, T + 0.13, 0.05, gold, s * (RW / 2 + 0.03), p.y - T / 2 - 0.015, 0.3 - p.x);
  }

  // ---- ridge: copper cap, crossed finials (chigi) with gilt tips, logs (katsuogi) with gilt bands
  box(RW + 0.1, 0.16, 0.26, metal, 0, 3.0, 0.05);
  box(RW + 0.12, 0.05, 0.3, metal, 0, 2.92, 0.05);
  for (let i = 0; i < 3; i++) {
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.46, 14).rotateX(Math.PI / 2), kuro, (i - 1) * 1.1, 3.15, 0.05);
    for (const dz of [-0.2, 0.2]) add(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 14).rotateX(Math.PI / 2), gold, (i - 1) * 1.1, 3.15, 0.05 + dz);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    box(0.05, 0.8, 0.1, kuro, x * (RW / 2 + 0.02), 3.12, 0.05 + z * 0.13).rotation.x = z * 0.5;
    box(0.052, 0.05, 0.11, gold, x * (RW / 2 + 0.02), 3.12 + 0.39 * Math.cos(0.5), 0.05 + z * 0.13 + 0.39 * Math.sin(0.5) * z).rotation.x = z * 0.5;
  }
  return g;
}
