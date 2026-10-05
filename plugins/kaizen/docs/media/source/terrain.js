// Ground of the Kaizen video: the hill of hill.js on a moss plain that fades into the washi page.
// One dense plane displaced by hillHeight; the shader paints, from per-vertex data:
//   ledges = moss · banks = dry-laid stones (ishigaki, Voronoi in cylindrical coordinates)
//   path   = irregular flagstones (ishidatami) with packed-earth-and-gravel shoulders, like Fushimi Inari.
// The heavy part (one hillHeight + pathCoord per vertex) runs once at build time.
import * as THREE from 'three';
import { hillHeight, pathCoord } from './hill.js';

// F2 - F1 Voronoi: x = distance to the nearest joint, y/z = random per cell (one stone)
const VORO = `
vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
vec3 voro(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), o = h22(i + g); o = 0.5 + 0.42 * sin(6.2831 * o);
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d; }
  vec2 r = h22(id * 1.7); return vec3(d2 - d1, r.x, r.y); }`;

/**
 * @param {object} o
 * @param {{diff, nor}} o.moss   mossy ground PBR (ledges and plain)
 * @param {{diff}} o.stone       stone colour (walls and flagstones)
 * @param {{diff}} o.gravel      gravel colour (path shoulders)
 * @param {number} o.size        side of the plane (m), centred on the hill
 * @param {number} o.seg         segments per side
 * @param {number[]} o.fade      [r0, r1]: the ground melts into the fog colour between these radii
 */
export function createTerrain({ moss, stone, gravel, size = 68, seg = 800, fade = [26, 32] }) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, hillHeight(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  // per vertex: steepness (0 ledge → 1 wall), station along the path, signed distance to its centreline
  const nrm = g.attributes.normal, data = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = pathCoord(p.getX(i), p.getZ(i));
    data.set([1 - Math.min(1, Math.max(0, (nrm.getY(i) - 0.55) / 0.25)), c.s, c.d], i * 3);
  }
  g.setAttribute('ground', new THREE.BufferAttribute(data, 3));

  // moss tiles every 4 m, sampled in world space (the plane is far larger than one texture)
  const mossNor = moss.nor.clone();
  mossNor.repeat.set(size / 4, size / 4);
  mossNor.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: moss.diff, normalMap: mossNor, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { mossMap: { value: moss.diff }, stoneMap: { value: stone.diff }, gravMap: { value: gravel.diff } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 ground;\nvarying vec3 vGround; varying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = ground; vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D mossMap; uniform sampler2D stoneMap; uniform sampler2D gravMap; varying vec3 vGround; varying vec3 vW;
${VORO}`)
      .replace('#include <map_fragment>', `
  float wall = vGround.x, ad = abs(vGround.z);
  vec3 mossC = texture2D(mossMap, vW.xz * 0.25).rgb * vec3(0.9, 1.0, 0.8);
  // ishigaki: stones ~0.42 × 0.3 m laid around the hill, dark joints, a slight bulge per stone
  float rr = length(vW.xz);
  vec2 cu = vec2(atan(vW.z, vW.x) * rr / 0.42, vW.y / 0.3);
  vec3 vo = voro(cu);
  vec3 st = texture2D(stoneMap, cu * 0.22 + vo.yz).rgb;
  vec3 wallC = st * (0.8 + 0.4 * vo.z) * vec3(1.02 + 0.06 * vo.y, 1.0, 0.94) * (0.62 + 0.38 * smoothstep(0.0, 0.5, vo.x))
    * mix(0.35, 1.0, smoothstep(0.015, 0.09, vo.x));
  // path: flagstones in the middle, earth and gravel on the shoulders, moss beyond
  vec2 fp = vec2(vGround.y * 14.0, vGround.z / 0.34);
  vec3 fv = voro(fp + vec2(0.0, 0.5));
  vec3 flag = texture2D(stoneMap, fp * 0.13 + fv.yz).rgb * vec3(1.08, 1.04, 0.98) * (0.82 + 0.3 * fv.z)
    * mix(0.5, 1.0, smoothstep(0.02, 0.1, fv.x));
  vec3 grav = texture2D(gravMap, vW.xz * 0.9).rgb * vec3(0.82, 0.74, 0.62);
  vec3 walk = mix(grav, flag, 1.0 - smoothstep(0.6, 0.68, ad));
  walk = mix(walk, mossC, smoothstep(0.8, 1.05, ad) * 0.7);
  vec3 groundC = mix(mossC, walk, (1.0 - smoothstep(0.95, 1.1, ad)) * (1.0 - wall));
  diffuseColor.rgb = mix(groundC, wallC, wall);`)
      // past the garden, the ground melts into the page (an island of ink wash on washi)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(${fade[0].toFixed(1)}, ${fade[1].toFixed(1)}, length(vW.xz)));`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
