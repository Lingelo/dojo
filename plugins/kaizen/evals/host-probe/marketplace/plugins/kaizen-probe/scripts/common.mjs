// kaizen-probe — shared helpers: where records go and which environment variables are kept.
// Records land in <project>/.probe/ so the tester finds them next to the sandbox repo.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Host variables (names only: they can carry account ids, emails, tokens), with the value kept only
// for the ones that say where the plugin and the project are.
const HOST = /^(CLAUDE|CURSOR|CODEX|PLUGIN|KAIZEN|OPENAI|AGENT)_/;
const PATHS = /PLUGIN|PROJECT_DIR|WORKSPACE|(_ROOT|_DATA|_VERSION)$/;
const SECRET = /KEY|TOKEN|SECRET|PASSWORD|AUTH|EMAIL|ACCOUNT|ORG/i;

export function hostEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([k]) => HOST.test(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, PATHS.test(k) && !SECRET.test(k) ? v : '<set>']),
  );
}

export function opts(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    out[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : (i++, next);
  }
  return out;
}

export function record(root, kind, name, data) {
  const dir = join(process.env.KAIZEN_PROBE_OUT || root, '.probe', kind);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${Date.now()}-${process.pid}-${name.replace(/[^\w.-]/g, '_')}.json`);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}
