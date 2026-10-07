#!/usr/bin/env node
// Assets of the Kaizen video: all CC0 from Poly Haven (https://polyhaven.com/license), 1k or 2k resolution.
// The 1k sets are committed in assets/; the 2k scans (~123 MB) are not versioned (see .gitignore) — run this
// once before rendering. It documents where each file comes from, downloads the missing ones and verifies
// every md5 (pinned by the Poly Haven API), so the render is reproducible and, once fetched, offline.
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
  // ---- 2k, the mountain (fuji.js, terrain.js, decor.js)
  // dry-laid retaining walls of the trail (ishigaki)
  ['japanese_stone_wall/diff.jpg', 'Textures/jpg/2k/japanese_stone_wall/japanese_stone_wall_diff_2k.jpg', '2f5ec4c7871a1c629b8b55026c0aa9bf'],
  ['japanese_stone_wall/nor_gl.jpg', 'Textures/jpg/2k/japanese_stone_wall/japanese_stone_wall_nor_gl_2k.jpg', '4c153f8fbcbf5d9d3fa84a83c05d5c7b'],
  ['japanese_stone_wall/arm.jpg', 'Textures/jpg/2k/japanese_stone_wall/japanese_stone_wall_arm_2k.jpg', 'fb3c829c9ce2efab2db432e891535211'],
  // flagstones of the trail
  ['grey_stone_path/diff.jpg', 'Textures/jpg/2k/grey_stone_path/grey_stone_path_diff_2k.jpg', '686579822b7b6c1c4600a738156328d4'],
  ['grey_stone_path/nor_gl.jpg', 'Textures/jpg/2k/grey_stone_path/grey_stone_path_nor_gl_2k.jpg', 'cff6e39f546c63240fec5e12aa464646'],
  ['grey_stone_path/arm.jpg', 'Textures/jpg/2k/grey_stone_path/grey_stone_path_arm_2k.jpg', '127dd1138f1756c8068d1135797451cc'],
  // grassy, stony slopes of the mountain
  ['rocky_terrain_02/diff.jpg', 'Textures/jpg/2k/rocky_terrain_02/rocky_terrain_02_diff_2k.jpg', '68f9c94575ff3c3512be9b010eb03f0e'],
  ['rocky_terrain_02/nor_gl.jpg', 'Textures/jpg/2k/rocky_terrain_02/rocky_terrain_02_nor_gl_2k.jpg', '672bfdf5e7835fa369da6a5d1209026a'],
  ['rocky_terrain_02/arm.jpg', 'Textures/jpg/2k/rocky_terrain_02/rocky_terrain_02_arm_2k.jpg', 'd86dcfb1f4dcd8bc2c49f5cf28dd6cce'],
  // snow cap
  ['snow_02/diff.jpg', 'Textures/jpg/2k/snow_02/snow_02_diff_2k.jpg', '5541e5601951b071691238ddc70632c0'],
  ['snow_02/nor_gl.jpg', 'Textures/jpg/2k/snow_02/snow_02_nor_gl_2k.jpg', 'ef128fbdf1b31932c792eb6472c84574'],
  ['snow_02/arm.jpg', 'Textures/jpg/2k/snow_02/snow_02_arm_2k.jpg', '888201f385b78e06ddd205a352c8ce7d'],
  // volcanic rock of the upper cone
  ['dark_rock_02/diff.jpg', 'Textures/jpg/2k/dark_rock_02/dark_rock_02_diff_2k.jpg', '492ae574844fa49cba63aee89ef226d1'],
  ['dark_rock_02/nor_gl.jpg', 'Textures/jpg/2k/dark_rock_02/dark_rock_02_nor_gl_2k.jpg', 'bfde991c327e33704686fb7ede0561a7'],
  ['dark_rock_02/arm.jpg', 'Textures/jpg/2k/dark_rock_02/dark_rock_02_arm_2k.jpg', '97fb8a2c3fcef2e1679c709c386311ca'],
  // bark of the black pines
  ['pine_bark/diff.jpg', 'Textures/jpg/2k/pine_bark/pine_bark_diff_2k.jpg', 'd10980446d36a65a73081cf61bc84992'],
  ['pine_bark/nor_gl.jpg', 'Textures/jpg/2k/pine_bark/pine_bark_nor_gl_2k.jpg', 'ee1de039967165665060653a0e12e571'],
  ['pine_bark/arm.jpg', 'Textures/jpg/2k/pine_bark/pine_bark_arm_2k.jpg', 'e8a438551d14ac7dccbaee5cc2c5fe45'],
  // weathered granite of the lanterns and Jizō statues
  ['lichen_rock/diff.jpg', 'Textures/jpg/2k/lichen_rock/lichen_rock_diff_2k.jpg', '5625c90a7b55058b7d89e180376a7cda'],
  ['lichen_rock/nor_gl.jpg', 'Textures/jpg/2k/lichen_rock/lichen_rock_nor_gl_2k.jpg', '801690ee8bbc1d4aa2f16af2d49acc26'],
  ['lichen_rock/arm.jpg', 'Textures/jpg/2k/lichen_rock/lichen_rock_arm_2k.jpg', 'ca53b5e011dfb7d0b8fed989b44d9b40'],
  // weathered wood of the shrine
  ['weathered_planks/diff.jpg', 'Textures/jpg/2k/weathered_planks/weathered_planks_diff_2k.jpg', 'dd5f91445812117d216ed962c2607b7d'],
  ['weathered_planks/nor_gl.jpg', 'Textures/jpg/2k/weathered_planks/weathered_planks_nor_gl_2k.jpg', 'db8ad9ad21c8de018e009f9c27c2a63d'],
  ['weathered_planks/arm.jpg', 'Textures/jpg/2k/weathered_planks/weathered_planks_arm_2k.jpg', 'dfe9c9bbefd9146d62852966f95ef096'],
  // plaster walls of the shrine and the pagoda
  ['white_plaster_rough_02/diff.jpg', 'Textures/jpg/2k/white_plaster_rough_02/white_plaster_rough_02_diff_2k.jpg', '5f076802ccd2f49f3a9f5a50a64de306'],
  ['white_plaster_rough_02/nor_gl.jpg', 'Textures/jpg/2k/white_plaster_rough_02/white_plaster_rough_02_nor_gl_2k.jpg', '91968e258c3bf5ebdfcc6cdf854d958d'],
  ['white_plaster_rough_02/arm.jpg', 'Textures/jpg/2k/white_plaster_rough_02/white_plaster_rough_02_arm_2k.jpg', '03f65a766d1391a794a33896f708c2c8'],
  // cypress-bark shingles of the shrine roof (hiwada)
  ['thatch_roof_angled/diff.jpg', 'Textures/jpg/2k/thatch_roof_angled/thatch_roof_angled_diff_2k.jpg', 'd043c7e632bb9560138ccb13a036a02f'],
  ['thatch_roof_angled/nor_gl.jpg', 'Textures/jpg/2k/thatch_roof_angled/thatch_roof_angled_nor_gl_2k.jpg', 'cda9c9e08f034d725194a7bf49f791be'],
  ['thatch_roof_angled/arm.jpg', 'Textures/jpg/2k/thatch_roof_angled/thatch_roof_angled_arm_2k.jpg', '99e517dffeefee419b19aeeea09deb8e'],
  // tiled eaves of the pagoda
  ['grey_roof_tiles_02/diff.jpg', 'Textures/jpg/2k/grey_roof_tiles_02/grey_roof_tiles_02_diff_2k.jpg', '2f49aaebd1b68926e76ddce57d27b6ff'],
  ['grey_roof_tiles_02/nor_gl.jpg', 'Textures/jpg/2k/grey_roof_tiles_02/grey_roof_tiles_02_nor_gl_2k.jpg', 'ec60f08e8819bfac34b71e04d354459b'],
  ['grey_roof_tiles_02/arm.jpg', 'Textures/jpg/2k/grey_roof_tiles_02/grey_roof_tiles_02_arm_2k.jpg', '3e3c52768bb79f9e4d00fc0af74e66e2'],
  // weathered vermilion lacquer of the torii and posts
  ['red_plaster_weathered/diff.jpg', 'Textures/jpg/2k/red_plaster_weathered/red_plaster_weathered_diff_2k.jpg', '1b0964d0aae71933d0e95a09252a1d43'],
  ['red_plaster_weathered/nor_gl.jpg', 'Textures/jpg/2k/red_plaster_weathered/red_plaster_weathered_nor_gl_2k.jpg', '0870564bdf8ae93abec92bdfe8a37b9e'],
  ['red_plaster_weathered/arm.jpg', 'Textures/jpg/2k/red_plaster_weathered/red_plaster_weathered_arm_2k.jpg', '1258f26a85cdce4b5d6554a880122ffd'],
  // black-lacquered wood: torii lintels, plinths
  ['dark_wooden_planks/diff.jpg', 'Textures/jpg/2k/dark_wooden_planks/dark_wooden_planks_diff_2k.jpg', 'e6ae2fe585184c16343c56b833eddbf8'],
  ['dark_wooden_planks/nor_gl.jpg', 'Textures/jpg/2k/dark_wooden_planks/dark_wooden_planks_nor_gl_2k.jpg', 'c7b2e77045b0983cd7c9c408c0361a59'],
  ['dark_wooden_planks/arm.jpg', 'Textures/jpg/2k/dark_wooden_planks/dark_wooden_planks_arm_2k.jpg', '7e25bc0cd9f2cb69bdd47b81c6b31a97'],
  // weathered granite of the lanterns, Jizō statues, steps and the summit fence
  ['rock_boulder_dry/diff.jpg', 'Textures/jpg/2k/rock_boulder_dry/rock_boulder_dry_diff_2k.jpg', 'fbc9cf377db427f54381f463c0639e1f'],
  ['rock_boulder_dry/nor_gl.jpg', 'Textures/jpg/2k/rock_boulder_dry/rock_boulder_dry_nor_gl_2k.jpg', '513ef3fdaadd106c38a9c40919918cc0'],
  ['rock_boulder_dry/arm.jpg', 'Textures/jpg/2k/rock_boulder_dry/rock_boulder_dry_arm_2k.jpg', 'acee3a43c7fc3bbe79c343cb3bb3b113'],
];

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const checkOnly = process.argv.includes('--check');

let bad = 0;
for (const [rel, src, sum] of ASSETS) {
  const f = path.join(dir, rel);
  // a file with the wrong md5 is treated as missing: re-downloaded (or reported by --check), never kept
  if (fs.existsSync(f) && md5(f) === sum) continue;
  if (checkOnly) { console.error(fs.existsSync(f) ? `✖ ${rel}: md5 ${md5(f)} ≠ ${sum}` : `✖ missing ${rel}`); bad++; continue; }
  // one file failing (network, timeout, bad checksum) is reported and the others still run
  try {
    const r = await fetch(`${DL}/${src}`, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(`${f}.part`, Buffer.from(await r.arrayBuffer()));
    // checked BEFORE it replaces anything: a corrupt or swapped download never becomes the asset
    const got = md5(`${f}.part`);
    if (got !== sum) { fs.rmSync(`${f}.part`, { force: true }); throw new Error(`md5 ${got} ≠ ${sum}`); }
    fs.renameSync(`${f}.part`, f);
    console.error(`↓ ${rel}`);
  } catch (e) {
    fs.rmSync(`${f}.part`, { force: true });
    console.error(`✖ ${rel}: ${e.name === 'TimeoutError' ? 'timed out' : e.message}`); bad++;
  }
}
console.error(bad ? `✖ ${bad} problem(s)` : `✔ ${ASSETS.length} assets verified`);
process.exit(bad ? 1 : 0);
