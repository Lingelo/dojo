// Shrine at the top of the hill: a nagare-zukuri honden, the most common Inari shrine style. Its gabled
// roof flows forward over the steps in a long concave sweep. The roof is a 2D profile extruded across the
// width. The shrine faces -z (the end of the torii path); its origin is at the foot of the stone platform.
import * as THREE from 'three';

export function createTemple({ shu, stone, roofMap, roofNor } = {}) {
  const g = new THREE.Group();
  const W = 3.4;                                    // width (x)
  shu ??= new THREE.MeshPhysicalMaterial({ color: 0xc23a1c, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const plaster = new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.92 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.75 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 0.95, map: roofMap ?? null, normalMap: roofNor ?? null });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a3a34, roughness: 0.5, metalness: 0.6 });
  stone ??= new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.9 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

  // stone platform (kidan) and steps
  add(new THREE.BoxGeometry(W + 0.6, 0.4, 3.4), stone, 0, 0.2, 0.3);
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(1.4, 0.13, 0.32), stone, 0, 0.065 + i * 0.13, -1.55 - (2 - i) * 0.3 + 0.0);

  // raised floor on posts, sanctuary walls (white plaster, vermilion frame)
  const F = 0.75;                                  // floor height
  add(new THREE.BoxGeometry(W - 0.2, 0.1, 2.6), wood, 0, F, 0.3);
  add(new THREE.BoxGeometry(W - 0.6, 1.25, 1.7), plaster, 0, F + 0.68, 0.65);
  for (const x of [-1, -1 / 3, 1 / 3, 1]) for (const z of [-0.2, 1.5]) add(new THREE.CylinderGeometry(0.07, 0.075, 1.6 + F - 0.4, 12), shu, x * (W - 0.6) / 2, 0.4 + (1.6 + F - 0.4) / 2, z);
  for (const y of [F + 0.08, F + 1.28]) add(new THREE.BoxGeometry(W - 0.5, 0.09, 0.09), shu, 0, y, -0.2);
  // front posts of the long eave (hisashi) and the veranda rail
  for (const x of [-1, 1]) add(new THREE.CylinderGeometry(0.065, 0.07, 1.55, 12), shu, x * (W - 0.6) / 2, 0.4 + 0.78, -1.2);
  add(new THREE.BoxGeometry(W - 0.4, 0.06, 0.06), shu, 0, F + 0.35, -1.2);
  // offering box
  add(new THREE.BoxGeometry(0.7, 0.42, 0.4), wood, 0, 0.4 + 0.21, -1.45);

  // roof: profile in (depth, height), front at +depth (world -z), concave sweep, thick bark shingles
  const top = new THREE.QuadraticBezierCurve(new THREE.Vector2(-1.75, 1.95), new THREE.Vector2(-0.6, 2.35), new THREE.Vector2(0.25, 2.95));
  const front = new THREE.QuadraticBezierCurve(new THREE.Vector2(0.25, 2.95), new THREE.Vector2(1.2, 2.2), new THREE.Vector2(2.25, 2.02));
  const T = 0.2, ptsTop = [...top.getPoints(16), ...front.getPoints(24).slice(1)];
  const shape = new THREE.Shape(ptsTop);
  for (const p of [...ptsTop].reverse()) shape.lineTo(p.x, p.y - T);
  const roof = new THREE.ExtrudeGeometry(shape, { depth: W + 0.9, bevelEnabled: false, curveSegments: 1 });
  roof.rotateY(Math.PI / 2).translate(-(W + 0.9) / 2, 0, 0.3);
  const r = add(roof, roofMat, 0, 0, 0);
  r.geometry.computeVertexNormals();
  // ridge cap, crossed finials (chigi) and logs (katsuogi)
  add(new THREE.BoxGeometry(W + 1.0, 0.16, 0.26), metal, 0, 3.0, 0.05);
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10).rotateX(Math.PI / 2), metal, (i - 1) * 1.0, 3.13, 0.05);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const c = add(new THREE.BoxGeometry(0.05, 0.75, 0.09), metal, x * (W + 0.9) / 2, 3.12, 0.05 + z * 0.12);
    c.rotation.x = z * 0.5;
  }
  return g;
}
