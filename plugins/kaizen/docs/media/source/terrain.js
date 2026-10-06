// Ground of the Kaizen video: a mountain (height field) on a grass plain that fades into the washi page.
// One dense plane displaced by `height`. Every layer is a scanned PBR set (pbr.js) projected in world space,
// triplanar where the slope is steep (no stretched texels on the cone), blended per pixel:
//   plain and gentle slopes = grassy stony ground · steep cone = volcanic rock · stretches of retaining wall
//   under the trail = Japanese dry-laid stone · trail = flagstones, gravel shoulders · summit = snow, melting down the gullies.
// Per vertex (computed once at build time): unsigned distance to the trail, on-a-stair flag, distance down the bank.
// The distance is unsigned on purpose: a signed one flips between two switchbacks and, interpolated across a
// triangle, crosses zero — which painted strips of "trail" across the slope.
import * as THREE from 'three';
import { TRIPLANAR_GLSL } from './pbr.js';

/**
 * @param {object} o
 * @param {object} o.sets      scanned sets { grass, moss, rock, wall, path, gravel, snow } each { diff, nor, arm }
 * @param {number} o.size      side of the plane (m), centred on the mountain
 * @param {number} o.seg       segments per side
 * @param {number[]} o.fade    [r0, r1]: the ground melts into the fog colour between these radii
 * @param {(x, z) => number} o.height        ground height
 * @param {(x, z, h) => {d, stair, bank}} o.coord   nearest trail point: distance d (sign ignored), stair 0/1, bank (m beyond the edge of the trail above)
 * @param {number} o.pathHalf  half width of the trail (m): flagstones, then gravel, then the slope
 * @param {number[]|null} o.snow  [y0, y1]: snow cap fading in between these heights
 * @param {number} o.snowR     no snow inside this radius (the courtyard on the summit)
 * @param {number} o.wet       0..1: after the rain — the flagstones darken and turn glossy, water pools in the hollows and
 *                             the joints (still water: flat normal, mirror roughness), reflecting the sky and, with SSR, the decor
 */
export function createTerrain({ sets, size = 68, seg = 800, fade = [26, 32], height, coord, pathHalf = 0.9, snow = null, snowR = 0, wet = 0 }) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const data = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = coord(p.getX(i), p.getZ(i), p.getY(i));
    data.set([Math.min(9, Math.abs(c.d)), c.stair ?? 0, Math.min(9, c.bank ?? 9)], i * 3);
  }
  g.setAttribute('trail', new THREE.BufferAttribute(data, 3));

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const ssrMask = { value: 0 }; // 1 = draw the reflectivity mask (wet trail) instead of the colour, for a screen-space reflection pass
  const S = { grass: 0.32, rock: 0.22, wall: 0.42, path: 0.45, gravel: 0.9, snow: 0.3 }; // texture repeats per metre
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSSRMask = ssrMask;
    for (const [k, set] of Object.entries(sets)) {
      sh.uniforms[`${k}D`] = { value: set.diff }; sh.uniforms[`${k}N`] = { value: set.nor }; sh.uniforms[`${k}A`] = { value: set.arm };
    }
    const decl = Object.keys(sets).map((k) => `uniform sampler2D ${k}D; uniform sampler2D ${k}N; uniform sampler2D ${k}A;`).join('\n');
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 trail;\nvarying vec3 vTrail; varying vec3 vW; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrail = trail; vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${decl}
varying vec3 vTrail; varying vec3 vW; varying vec3 vWN; uniform float uSSRMask;
${TRIPLANAR_GLSL}
// value noise, to break the borders between layers
float hn2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn2(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hn2(i), hn2(i + vec2(1, 0)), u.x), mix(hn2(i + vec2(0, 1)), hn2(i + vec2(1, 1)), u.x), u.y); }
// one layer: colour, packed arm, world normal — planar from above on gentle ground, triplanar when steep
struct Layer { vec3 c; vec3 arm; vec3 n; };
Layer layer(sampler2D D, sampler2D N, sampler2D A, vec3 p, vec3 n, float s, float steep) {
  Layer l;
  if (steep < 0.02) {
    vec2 uv = p.xz * s;
    l.c = texture2D(D, uv).rgb; l.arm = texture2D(A, uv).rgb;
    vec3 t = texture2D(N, uv).xyz * 2.0 - 1.0;
    l.n = normalize(vec3(t.x, 0.0, -t.y) + n * t.z);
  } else {
    l.c = triTex(D, p, n, s).rgb; l.arm = triTex(A, p, n, s).rgb; l.n = triNor(N, p, n, s, 1.0);
  }
  return l;
}
Layer mixL(Layer a, Layer b, float k) { Layer l; l.c = mix(a.c, b.c, k); l.arm = mix(a.arm, b.arm, k); l.n = normalize(mix(a.n, b.n, k)); return l; }
Layer tTerrain; float tWet; float tPool;`)
      .replace('#include <map_fragment>', `
  vec3 N0 = normalize(vWN);
  float steep = 1.0 - smoothstep(0.62, 0.9, N0.y);       // 0 flat → 1 steep
  float d = vTrail.x, onStair = vTrail.y;
  float n1 = vn2(vW.xz * 0.9), n2 = vn2(vW.xz * 0.23 + 7.0);
  // slopes: grassy stony ground, giving way to bare volcanic rock where steep and high
  // grass: two scans (grassy stony ground, moss) mixed by large-scale noise, so the plain is not one flat green
  Layer L = layer(grassD, grassN, grassA, vW, N0, ${S.grass}, steep);
  L = mixL(L, layer(mossD, mossN, mossA, vW, N0, 0.28, steep), smoothstep(0.35, 0.75, n2));
  L.c *= 0.85 + 0.3 * vn2(vW.xz * 0.07 + 3.0);
  float rocky = clamp(smoothstep(0.35, 0.85, steep + 0.25 * (n2 - 0.5)) + smoothstep(6.0, 10.5, vW.y + 2.0 * (n2 - 0.5)), 0.0, 1.0);
  if (rocky > 0.01) L = mixL(L, layer(rockD, rockN, rockA, vW, N0, ${S.rock}, steep), rocky);
  // retaining walls: stone only on the bank under the trail (the bank it rests on), in stretches that come and
  // go along the way; above the trail the natural slope stays — so the mountain reads as a mountain
  // the wall covers the bank down to ~0.6 m beyond the trail's edge, with an uneven foot
  float stretch = smoothstep(0.3, 0.55, vn2(vW.xz * 0.35 + 11.0));
  float foot = 1.0 - smoothstep(0.45, 0.75, vTrail.z + 0.25 * (vn2(vW.xz * 1.7) - 0.5));
  float held = smoothstep(0.15, 0.5, steep) * foot * stretch * (1.0 - onStair);
  if (held > 0.01) {
    // the wall courses run horizontally around the mountain: project on a cylinder (angle × radius, height)
    float rr = length(vW.xz); vec2 cyl = vec2(atan(vW.z, vW.x) * rr, vW.y) * ${S.wall};
    Layer w; w.c = texture2D(wallD, cyl).rgb; w.arm = texture2D(wallA, cyl).rgb;
    vec3 t = texture2D(wallN, cyl).xyz * 2.0 - 1.0;
    vec3 T = normalize(vec3(-vW.z, 0.0, vW.x)), B = vec3(0.0, 1.0, 0.0);
    w.n = normalize(T * t.x + B * t.y + N0 * t.z);
    L = mixL(L, w, smoothstep(0.0, 0.5, held));
  }
  // trail: flagstones in the middle, gravel on the shoulders (stairs: gravel under the stone steps)
  float onTrail = (1.0 - smoothstep(PATH_W, PATH_W + 0.22, d + 0.12 * (n1 - 0.5))) * (1.0 - steep * 0.7);
  tWet = 0.0; tPool = 0.0;
  if (onTrail > 0.01) {
    Layer gr = layer(gravelD, gravelN, gravelA, vW, N0, ${S.gravel}, 0.0); gr.c *= vec3(0.62, 0.58, 0.52); // packed, damp earth and gravel
    Layer pv = layer(pathD, pathN, pathA, vW, N0, ${S.path}, 0.0);
    Layer tr = mixL(gr, pv, (1.0 - smoothstep(PATH_W * 0.62, PATH_W * 0.78, d)) * (1.0 - onStair));
    L = mixL(L, tr, onTrail);${wet ? `
    // rain: the stone darkens (water fills the pores), puddles in the joints (dark in the scan's AO) and in shallow
    // dips of the trail (large noise), never on the stairs (they drain)
    float dip = smoothstep(0.55, 0.75, vn2(vW.xz * 0.6 + 21.0) * 0.7 + vn2(vW.xz * 2.3) * 0.3);
    float joint = 1.0 - smoothstep(0.35, 0.7, tr.arm.r);
    tPool = clamp(max(dip, joint * 0.85) * onTrail * (1.0 - onStair) * (1.0 - steep), 0.0, 1.0) * ${wet.toFixed(2)};
    tWet = onTrail * ${wet.toFixed(2)};
    L.c *= mix(1.0, 0.55, tWet);
    L.c = mix(L.c, L.c * 0.6, tPool);` : ''}
  }${snow ? `
  // summit courtyard: raked pale gravel on the flat top, inside SNOW_R
  float court = (1.0 - smoothstep(SNOW_R - 0.4, SNOW_R, length(vW.xz) + 0.3 * (n1 - 0.5))) * (1.0 - steep);
  if (court > 0.01) { Layer cg = layer(gravelD, gravelN, gravelA, vW, N0, ${S.gravel * 1.6}, 0.0); cg.c *= vec3(1.12, 1.08, 1.0); L = mixL(L, cg, court); }
  // snow: from SNOW_Y up, lower in the hollows of the gullies, thinner on the steep ridges, never on the trail
  // gullies of uneven width and depth (several frequencies), plus small patches: an irregular, natural edge
  float ang = atan(vW.z, vW.x);
  // noise over the direction from the axis (no seam at ±π, no period): long tongues down the gullies, small patches
  vec2 dir = normalize(vW.xz + 1e-4);
  float gully = 0.6 * vn2(dir * 9.0 + 0.4 * vW.y) + 0.3 * vn2(dir * 23.0 + 3.0) + 0.1 * vn2(dir * 61.0);
  float patches = vn2(vW.xz * 1.3) * 0.6 + vn2(vW.xz * 4.1) * 0.3;
  float sn = smoothstep(${snow[0].toFixed(2)}, ${snow[1].toFixed(2)}, vW.y + 3.0 * (gully - 0.5) + 0.9 * (patches - 0.45) + 0.6 * (n2 - 0.5));
  sn *= (1.0 - onTrail) * smoothstep(SNOW_R - 0.3, SNOW_R + 0.1, length(vW.xz)); // snow right up to the courtyard: no ring of bare rock
  if (sn > 0.01) { Layer sl = layer(snowD, snowN, snowA, vW, N0, ${S.snow}, steep); sl.c *= 1.08; sl.arm.r = 1.0; L = mixL(L, sl, smoothstep(0.0, 0.6, sn)); }` : ''}
  tTerrain = L;
  diffuseColor.rgb *= L.c * mix(1.0, L.arm.r, 0.8);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(clamp(tTerrain.arm.g, 0.05, 1.0), 0.22, tWet), 0.03, tPool);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(normalize(mix(tTerrain.n, N0, tPool)), 0.0)).xyz);')
      // past the garden, the ground melts into the page (an island of ink wash on washi)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  #ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(${fade[0].toFixed(1)}, ${fade[1].toFixed(1)}, length(vW.xz)));
  #endif`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  if (uSSRMask > 0.5) gl_FragColor = vec4(vec3(clamp(0.25 * tWet + 0.75 * tPool, 0.0, 1.0)), 1.0);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n#define PATH_W ${pathHalf.toFixed(3)}\n#define SNOW_R ${snowR.toFixed(2)}`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.userData.ssrMask = ssrMask;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
