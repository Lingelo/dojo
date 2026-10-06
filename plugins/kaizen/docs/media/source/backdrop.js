// Painted backdrop of the Kaizen video: a sumi-e panorama on washi, wrapped on a cylinder around the scene.
// Red rising sun, bands of ink clouds (kasumi), distant ranges in diluted ink and a flight of black cranes
// (the tanchō of Japanese ink painting). Drawn once with canvas 2D from a seeded random: deterministic, no image file.
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/**
 * @param {object} o
 * @param {number} o.radius   cylinder radius (m), beyond the ground fade
 * @param {number} o.height   cylinder height (m); its foot sits at y = o.y
 * @param {number} o.sunAngle azimuth of the sun (radians, three.js convention: x = cos, z = sin)
 */
export function createBackdrop({ radius = 60, height = 46, y = -6, sunAngle = Math.PI / 2, seed = 5, W = 8192, H = 2048 } = {}) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rand = rng(seed);
  // washi: warm paper, a light vertical wash darker at the top (ink sky)
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#d9d0bf'); bg.addColorStop(0.45, '#efe8d9'); bg.addColorStop(1, '#efe8d9');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // paper fibres
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = `rgba(120,100,70,${0.025 + rand() * 0.03})`;
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 6, 1);
  }
  // the canvas u runs with the cylinder angle: u = 0.5 - angle / 2π (three.js cylinder uv), so the sun lands at sunAngle
  const uOf = (a) => { let u = 0.25 - a / (Math.PI * 2); u -= Math.floor(u); return u; };
  // sun: a vermilion disc, denser in the middle, soft wet edge
  const sx = uOf(sunAngle) * W, sy = H * 0.3, sr = H * 0.12;
  for (const dx of [-W, 0, W]) {
    const rg = g.createRadialGradient(sx + dx, sy, sr * 0.2, sx + dx, sy, sr * 1.04);
    rg.addColorStop(0, 'rgba(200,52,26,1)'); rg.addColorStop(0.9, 'rgba(196,58,30,0.96)'); rg.addColorStop(1, 'rgba(196,64,31,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(sx + dx, sy, sr * 1.04, 0, Math.PI * 2); g.fill();
  }
  // ink clouds (kasumi): long flat bands, a crisp wet top edge and a dry brush tail fading downwards
  const cloud = (cx, cy, len, thick, alpha) => {
    const steps = 140;
    for (let layer = 0; layer < 3; layer++) {
      const a = alpha * (layer === 0 ? 0.55 : 0.22), off = layer * thick * 0.35;
      g.fillStyle = `rgba(29,28,26,${a})`;
      g.beginPath();
      for (let i = 0; i <= steps; i++) { // top edge: soft lumps
        const u = i / steps, x = cx - len / 2 + u * len, env = Math.sin(Math.PI * u);
        g.lineTo(x, cy + off - thick * 0.5 * env * (0.75 + 0.25 * Math.sin(u * 19 + layer + cx)));
      }
      for (let i = steps; i >= 0; i--) { const u = i / steps, x = cx - len / 2 + u * len; g.lineTo(x, cy + off + thick * 0.18 * Math.sin(Math.PI * u)); }
      g.closePath(); g.fill();
    }
    // dry-brush streaks under the band
    for (let k = 0; k < 40; k++) {
      const x = cx + (rand() - 0.5) * len * 0.9, l = len * (0.1 + rand() * 0.3), yy = cy + thick * (0.25 + rand() * 0.6);
      g.strokeStyle = `rgba(29,28,26,${alpha * (0.08 + rand() * 0.18)})`; g.lineWidth = 1 + rand() * 3;
      g.beginPath(); g.moveTo(x - l / 2, yy); g.lineTo(x + l / 2, yy + (rand() - 0.5) * 4); g.stroke();
    }
  };
  const wrap = (fn, x, ...a) => { fn(x, ...a); if (x < W * 0.15) fn(x + W, ...a); if (x > W * 0.85) fn(x - W, ...a); };
  for (let i = 0; i < 9; i++) wrap(cloud, rand() * W, H * (0.16 + rand() * 0.3), W * (0.12 + rand() * 0.12), H * (0.05 + rand() * 0.04), 0.55);
  wrap(cloud, sx + sr * 0.5, sy + sr * 0.55, sr * 4.5, sr * 0.5, 0.75); // a band across the lower part of the sun

  // distant ranges: layered washes of diluted ink, paler and higher with distance (atmospheric perspective).
  // Ridge = periodic fractal noise (sum of octaves of a seeded periodic value noise), so the crests are irregular
  // like real hills, not waves; each wash darkens towards its crest (wet ink pools at the top of a stroke)
  const pnoise = (oct, period) => { const v = Array.from({ length: period }, () => rand()); return (u) => { const f = u * period, i = Math.floor(f), t = f - i, a = v[((i % period) + period) % period], b = v[(((i + 1) % period) + period) % period]; return a + (b - a) * t * t * (3 - 2 * t); }; };
  const ridgeOf = (base) => { const os = [0, 1, 2, 3, 4].map((k) => ({ n: pnoise(k, base << k), w: 0.55 ** k })); const tw = os.reduce((x, o) => x + o.w, 0); return (u) => os.reduce((x, o) => x + o.w * o.n(u), 0) / tw; };
  const range = (baseY, amp, alpha, freq, trees = 0) => {
    const ridge = ridgeOf(freq), crest = [];
    for (let x = 0; x <= W; x += 4) crest.push(baseY - amp * Math.pow(ridge(x / W), 1.6) * 1.8);
    const grad = g.createLinearGradient(0, baseY - amp * 1.4, 0, baseY + H * 0.04);
    grad.addColorStop(0, `rgba(29,28,26,${alpha * 1.25})`); grad.addColorStop(1, `rgba(29,28,26,${alpha * 0.55})`);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, H);
    crest.forEach((y, i) => g.lineTo(i * 4, y));
    g.lineTo(W, H); g.closePath(); g.fill();
    // pines standing on the nearest crests: little ink trees, a dab of foliage on a stroke of trunk
    for (let k = 0; k < trees; k++) {
      const i = Math.floor(rand() * crest.length), x = i * 4, y = crest[i], h = 10 + rand() * 18;
      g.fillStyle = `rgba(29,28,26,${alpha * 1.4})`;
      g.fillRect(x - 0.8, y - h, 1.6, h);
      for (let j = 0; j < 3; j++) { g.beginPath(); g.ellipse(x + (rand() - 0.5) * 6, y - h + j * h * 0.28, 7 - j * 1.5, 2.5, 0, 0, Math.PI * 2); g.fill(); }
    }
    // mist lying in the valleys at the foot of the range
    const mg = g.createLinearGradient(0, baseY - amp * 0.3, 0, baseY + H * 0.04);
    mg.addColorStop(0, 'rgba(239,232,217,0)'); mg.addColorStop(1, 'rgba(239,232,217,0.95)');
    g.fillStyle = mg; g.fillRect(0, baseY - amp * 0.3, W, H * 0.04 + amp * 0.3);
  };
  // the real Fuji, far away behind the replica: a pale wash with a snow cap left as bare paper (sumi-e reserve)
  const fuji = (cx, baseY, hw, hh) => {
    const top = baseY - hh, tw = hw * 0.12;
    const path = (yCut) => { g.beginPath(); g.moveTo(cx - hw, baseY); g.quadraticCurveTo(cx - hw * 0.35, baseY - hh * 0.35, cx - tw, top); g.lineTo(cx + tw, top); g.quadraticCurveTo(cx + hw * 0.35, baseY - hh * 0.35, cx + hw, baseY); g.closePath(); };
    const fg = g.createLinearGradient(0, top, 0, baseY); fg.addColorStop(0, 'rgba(60,62,66,0.42)'); fg.addColorStop(1, 'rgba(60,62,66,0.08)');
    g.fillStyle = fg; path(); g.fill();
    // snow: paper colour over the top third, ragged lower edge (gullies)
    g.save(); path(); g.clip();
    g.fillStyle = 'rgba(244,239,228,0.92)'; g.beginPath(); g.moveTo(cx - hw, top - 5);
    // tongues down the gullies: smooth value noise (random knots, cosine-interpolated), not per-pixel jitter
    const knots = Array.from({ length: 15 }, () => rand()), tongue = (u) => { const f = u * (knots.length - 1), i = Math.min(knots.length - 2, Math.floor(f)), t = (1 - Math.cos((f - i) * Math.PI)) / 2; return knots[i] * (1 - t) + knots[i + 1] * t; };
    for (let x = cx - hw; x <= cx + hw; x += 2) { const u = (x - cx + hw) / (2 * hw), d = Math.abs(x - cx) / hw; g.lineTo(x, top + hh * (0.24 - 0.1 * d) + hh * 0.16 * Math.pow(tongue(u), 2.5) * (1 - d)); }
    g.lineTo(cx + hw, top - 5); g.closePath(); g.fill(); g.restore();
  };
  range(H * 0.8, H * 0.1, 0.1, 5);
  fuji(((uOf(sunAngle) + 0.5) % 1) * W, H * 0.82, H * 0.5, H * 0.24);
  range(H * 0.85, H * 0.08, 0.18, 7, 40);
  range(H * 0.9, H * 0.06, 0.3, 11, 120);

  // black cranes: a flight painted in sumi across the sky, each wing a few loaded brush strokes
  const crane = (x, y, size, flap, dir) => {
    g.save(); g.translate(x, y); g.scale(dir * size, size);
    g.fillStyle = 'rgba(24,23,22,0.9)'; g.strokeStyle = 'rgba(24,23,22,0.9)'; g.lineCap = 'round';
    // body
    g.beginPath(); g.ellipse(0, 0, 0.32, 0.075, -0.05, 0, Math.PI * 2); g.fill();
    // neck stretched forward, small head, long beak
    g.lineWidth = 0.05; g.beginPath(); g.moveTo(0.25, -0.01); g.quadraticCurveTo(0.5, -0.05, 0.72, -0.06); g.stroke();
    g.beginPath(); g.ellipse(0.75, -0.065, 0.045, 0.03, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 0.018; g.beginPath(); g.moveTo(0.79, -0.06); g.lineTo(0.95, -0.045); g.stroke();
    // legs trailing behind
    g.lineWidth = 0.016; g.beginPath(); g.moveTo(-0.25, 0.02); g.lineTo(-0.72, 0.07); g.moveTo(-0.25, 0.04); g.lineTo(-0.7, 0.1); g.stroke();
    // wings: up or down stroke; primaries splayed like fingers at the tip
    for (const side of [-1, 1]) {
      const lift = flap * side; // the near wing and the far wing move in opposite apparent directions
      g.beginPath(); g.moveTo(0.12, -0.03);
      g.quadraticCurveTo(0.0, -0.45 * lift - 0.05, -0.15, -0.85 * lift);
      for (let k = 0; k < 6; k++) { // feather tips
        const a = -0.15 - k * 0.07, tipY = -0.85 * lift + k * 0.06 * lift;
        g.lineTo(a - 0.06, tipY - 0.07 * lift); g.lineTo(a - 0.02, tipY + 0.02 * lift);
      }
      g.quadraticCurveTo(-0.3, -0.3 * lift, -0.12, -0.02);
      g.closePath(); g.fill();
    }
    g.restore();
  };
  // the flight crosses in front of the sun, smaller and paler further away
  const flock = [[0.0, 0.0, 1.0], [-1.1, 0.35, 0.82], [-2.0, 0.75, 0.7], [1.0, 0.45, 0.75], [1.9, 0.95, 0.6], [-2.9, 1.25, 0.5], [2.8, 1.5, 0.45]];
  flock.forEach(([dx, dy, k], n) => {
    g.globalAlpha = 0.55 + 0.45 * k;
    crane(sx - sr * 1.3 + dx * sr * 0.75, sy - sr * 0.15 + dy * sr * 0.55, sr * 0.62 * k, n % 2 ? 0.8 : -0.55, 1);
  });
  // a second, distant flight on the far side of the panorama
  for (let n = 0; n < 5; n++) { g.globalAlpha = 0.45; crane(((uOf(sunAngle) + 0.45) % 1) * W + n * sr * 0.55, H * 0.24 + (n % 2) * sr * 0.3 + n * sr * 0.1, sr * 0.32, n % 2 ? 0.7 : -0.5, -1); }
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 128, 1, true), mat);
  mesh.position.y = y + height / 2;
  mesh.renderOrder = -1;
  return mesh;
}
