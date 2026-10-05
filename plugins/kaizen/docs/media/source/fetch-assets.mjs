#!/usr/bin/env node
// Assets of the Kaizen video: all CC0 from Poly Haven (https://polyhaven.com/license), 1k resolution.
// They are committed in assets/ so the render stays offline; this script documents where each file
// comes from and re-downloads / verifies them (md5 pinned by the Poly Haven API).
//
//   node fetch-assets.mjs           download the missing files, verify every md5
//   node fetch-assets.mjs --check   verify only (exit 1 on a missing or altered file)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DL = 'https://dl.polyhaven.org/file/ph-assets';
// [local path under assets/, source path under DL, md5]
export const ASSETS = [
  // light and reflections only: the background stays washi paper
  ['belfast_open_field_1k.hdr', 'HDRIs/hdr/1k/belfast_open_field_1k.hdr', '6a7f5cfebb9ab2a3e9e16b0883b9faab'],
  // cherry tree bark
  ['sakura_bark/diff.jpg', 'Textures/jpg/1k/sakura_bark/sakura_bark_diff_1k.jpg', '19741f188bdf496e4cb57e34c4211e95'],
  ['sakura_bark/nor_gl.jpg', 'Textures/jpg/1k/sakura_bark/sakura_bark_nor_gl_1k.jpg', 'c94e17644b3c6a5bf22f98ab960693c3'],
  ['sakura_bark/arm.jpg', 'Textures/jpg/1k/sakura_bark/sakura_bark_arm_1k.jpg', '523d671314f2f7b9c8682c3ecf328598'],
  // raked gravel of the dry garden (the rake pattern stays procedural, on top)
  ['sandy_gravel/diff.jpg', 'Textures/jpg/1k/sandy_gravel/sandy_gravel_diff_1k.jpg', '9808ac7c155cff11314a4fe200255c50'],
  ['sandy_gravel/nor_gl.jpg', 'Textures/jpg/1k/sandy_gravel/sandy_gravel_nor_gl_1k.jpg', 'df94f818fdfab5afdaf11add554f51e7'],
  ['sandy_gravel/arm.jpg', 'Textures/jpg/1k/sandy_gravel/sandy_gravel_arm_1k.jpg', 'a1c3d1760e191c344b332310b7c5867b'],
  // mossy rocks (glTF: the .gltf references the .bin and textures/ by relative path)
  ['rock_moss_set_01/rock_moss_set_01_1k.gltf', 'Models/gltf/1k/rock_moss_set_01/rock_moss_set_01_1k.gltf', '75113cc1c21806cca5d8badad4737af7'],
  ['rock_moss_set_01/rock_moss_set_01.bin', 'Models/gltf/8k/rock_moss_set_01/rock_moss_set_01.bin', '207a51c9f56d34732e9814bbf9cc07b1'],
  ['rock_moss_set_01/textures/rock_moss_set_01_diff_1k.jpg', 'Models/jpg/1k/rock_moss_set_01/rock_moss_set_01_diff_1k.jpg', 'b8742301e6b4bc5683d2de712e83f772'],
  ['rock_moss_set_01/textures/rock_moss_set_01_nor_gl_1k.jpg', 'Models/jpg/1k/rock_moss_set_01/rock_moss_set_01_nor_gl_1k.jpg', 'eb7ebd31ad08e78d0497900652ff1568'],
  ['rock_moss_set_01/textures/rock_moss_set_01_rough_1k.jpg', 'Models/jpg/1k/rock_moss_set_01/rock_moss_set_01_rough_1k.jpg', 'ed9d8a2c863262f76f881346e8047c6a'],
  ['rock_moss_set_02/rock_moss_set_02_1k.gltf', 'Models/gltf/1k/rock_moss_set_02/rock_moss_set_02_1k.gltf', '257569e8c064d0cf198ff866446a5f96'],
  ['rock_moss_set_02/rock_moss_set_02.bin', 'Models/gltf/8k/rock_moss_set_02/rock_moss_set_02.bin', 'a63878339f14feceab7347cc28110eaa'],
  ['rock_moss_set_02/textures/rock_moss_set_02_diff_1k.jpg', 'Models/jpg/1k/rock_moss_set_02/rock_moss_set_02_diff_1k.jpg', '50a31622ba7d6f3b8157035ce375de4d'],
  ['rock_moss_set_02/textures/rock_moss_set_02_nor_gl_1k.jpg', 'Models/jpg/1k/rock_moss_set_02/rock_moss_set_02_nor_gl_1k.jpg', '936601de53528f15a12d16a7e187a4f1'],
  ['rock_moss_set_02/textures/rock_moss_set_02_rough_1k.jpg', 'Models/jpg/1k/rock_moss_set_02/rock_moss_set_02_rough_1k.jpg', '5de4c0669f19304230fa550a8f3ac0f4'],
  // stepping stones of the path (tobi-ishi): plain grey-beige stone, no joints
  ['rock_08/diff.jpg', 'Textures/jpg/1k/rock_08/rock_08_diff_1k.jpg', '2025c204133481612c74211135d7b371'],
  ['rock_08/nor_gl.jpg', 'Textures/jpg/1k/rock_08/rock_08_nor_gl_1k.jpg', '583a63d500f362e5ea9f795daf3d0c61'],
  ['rock_08/arm.jpg', 'Textures/jpg/1k/rock_08/rock_08_arm_1k.jpg', 'b638b4452c173dcd9e9cc59f70f40e56'],
  // moss cushions around the rocks and at the foot of the tree (texture of procedural tufts)
  ['mossy_rock/diff.jpg', 'Textures/jpg/1k/mossy_rock/mossy_rock_diff_1k.jpg', 'a57fbbf55269eb64f8d40708fe3af26c'],
  ['mossy_rock/nor_gl.jpg', 'Textures/jpg/1k/mossy_rock/mossy_rock_nor_gl_1k.jpg', '59370f9b3d068271c2bccfb414dc325b'],
  ['mossy_rock/arm.jpg', 'Textures/jpg/1k/mossy_rock/mossy_rock_arm_1k.jpg', 'aa606bf7dda9c12bfea7702ea0507d7b'],
];

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const checkOnly = process.argv.includes('--check');

let bad = 0;
for (const [rel, src, sum] of ASSETS) {
  const f = path.join(dir, rel);
  if (!fs.existsSync(f)) {
    if (checkOnly) { console.error(`✖ missing ${rel}`); bad++; continue; }
    const r = await fetch(`${DL}/${src}`);
    if (!r.ok) { console.error(`✖ ${rel}: HTTP ${r.status}`); bad++; continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(`${f}.part`, Buffer.from(await r.arrayBuffer()));
    fs.renameSync(`${f}.part`, f);
    console.error(`↓ ${rel}`);
  }
  if (md5(f) !== sum) { console.error(`✖ ${rel}: md5 ${md5(f)} ≠ ${sum}`); bad++; }
}
console.error(bad ? `✖ ${bad} problem(s)` : `✔ ${ASSETS.length} assets verified`);
process.exit(bad ? 1 : 0);
