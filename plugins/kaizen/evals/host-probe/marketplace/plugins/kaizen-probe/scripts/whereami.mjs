#!/usr/bin/env node
// kaizen-probe — called by the probe skills. Records how the skill found this script (the skill
// directory the host gave the model, the path actually run, plugin env vars) under
// <project>/.probe/skills/. `--sleep <s>` keeps it running so two subagents can be seen overlapping.
//   node <skill dir>/../../scripts/whereami.mjs --skill probe-locate --skill-dir <dir> --how "<text>"

import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostEnv, opts, record } from './common.mjs';

const o = opts(process.argv.slice(2));
const started = new Date();
if (o.sleep) await new Promise((r) => setTimeout(r, Number(o.sleep) * 1000));

const script = realpathSync(fileURLToPath(import.meta.url));
const pluginRoot = resolve(dirname(script), '..');
let skillDirMatches = null;
if (typeof o['skill-dir'] === 'string') {
  try {
    skillDirMatches = realpathSync(resolve(o['skill-dir'], '..', '..')) === realpathSync(pluginRoot);
  } catch {
    skillDirMatches = false;
  }
}

const file = record(process.cwd(), 'skills', `${o.skill || 'unknown'}-${o.as || 'main'}`, {
  started: started.toISOString(),
  ended: new Date().toISOString(),
  skill: o.skill || null,
  as: o.as || null,
  how: o.how || null,
  skill_dir: o['skill-dir'] || null,
  skill_dir_resolves_plugin: skillDirMatches,
  script,
  plugin_root: pluginRoot,
  cwd: process.cwd(),
  platform: process.platform,
  env: hostEnv(),
});
console.log(`KAIZEN-PROBE-OK skill=${o.skill || '?'} as=${o.as || 'main'} root=${pluginRoot} record=${join('.probe', 'skills', file.split(/[\\/]/).pop())}`);
