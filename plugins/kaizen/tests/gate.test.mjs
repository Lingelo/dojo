import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE, cleanup, cli, tempRepo } from './helpers.mjs';

function stop(dir, extra = {}) {
  return spawnSync(process.execPath, [GATE], { input: JSON.stringify({ cwd: dir, ...extra }), encoding: 'utf8' });
}

function claim(dir, session, command = 'node "/p/scripts/kaizen.mjs" gate on --plan docs/plans/x.md') {
  return spawnSync(process.execPath, [GATE, '--claim'], {
    input: JSON.stringify({ cwd: dir, session_id: session, tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
}

function repoWithTest(exitCode) {
  return tempRepo({ '.kaizen/config.json': { verify: { test: `node -e "process.exit(${exitCode})"` }, gate: { max_blocks: 2 } } });
}

test('inactif sans gate on : laisse terminer sans rien lancer', () => {
  const dir = repoWithTest(1);
  assert.equal(stop(dir).status, 0);
  cleanup(dir);
});

test('actif et rouge : bloque (exit 2) puis laisse passer après max_blocks', () => {
  const dir = repoWithTest(1);
  cli(dir, ['gate', 'on', '--plan', 'docs/plans/x.md']);
  const first = stop(dir);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /Garde-fou qualité \(1\/2\)/);
  assert.equal(stop(dir).status, 2);
  const third = stop(dir);
  assert.equal(third.status, 0);
  assert.match(third.stderr, /je laisse terminer/);
  cleanup(dir);
});

test('actif et vert : laisse terminer et remet le compteur à zéro', () => {
  const dir = repoWithTest(0);
  cli(dir, ['gate', 'on']);
  const state = join(dir, '.kaizen/state/gate.json');
  writeFileSync(state, JSON.stringify({ ...JSON.parse(readFileSync(state, 'utf8')), blocks: 1 }));
  assert.equal(stop(dir).status, 0);
  assert.equal(JSON.parse(readFileSync(state, 'utf8')).blocks, 0);
  cleanup(dir);
});

test('expiré : se désactive tout seul', () => {
  const dir = repoWithTest(1);
  cli(dir, ['gate', 'on']);
  const state = join(dir, '.kaizen/state/gate.json');
  writeFileSync(state, JSON.stringify({ active: true, since: '2020-01-01T00:00:00Z', blocks: 0 }));
  const r = stop(dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /expiré/);
  assert.equal(existsSync(state), false);
  cleanup(dir);
});

test('désactivé par la config, et hors dépôt git', () => {
  const dir = tempRepo({ '.kaizen/config.json': { verify: { test: 'node -e "process.exit(1)"' }, gate: { enabled: false } } });
  cli(dir, ['gate', 'on']);
  assert.equal(stop(dir).status, 0);
  cleanup(dir);
  assert.equal(spawnSync(process.execPath, [GATE], { input: '{"cwd":"/"}', encoding: 'utf8' }).status, 0);
});

test("l'état du garde-fou est ignoré par git", () => {
  const dir = repoWithTest(0);
  cli(dir, ['gate', 'on']);
  const st = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(st, /state/);
  cleanup(dir);
});

test('le garde-fou appartient à la session qui l’a posé', () => {
  const dir = repoWithTest(1);
  cli(dir, ['gate', 'on']);
  assert.equal(claim(dir, 'autre', 'git status').status, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')).session, undefined, 'seul « gate on » revendique');
  claim(dir, 'S1', 'K="/p/scripts/kaizen.mjs"; node "$K" gate on --plan docs/plans/x.md');
  claim(dir, 'S2');
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')).session, 'S1', 'la première revendication gagne');
  assert.equal(stop(dir, { session_id: 'S2' }).status, 0, 'une autre session n’est pas bloquée');
  assert.equal(stop(dir, { session_id: 'S1' }).status, 2);
  cleanup(dir);
});

test('budget épuisé : les commandes restantes ne sont pas lancées et ne bloquent pas', () => {
  const dir = tempRepo({
    '.kaizen/config.json': {
      verify: { test: 'node -e "setTimeout(() => {}, 3000)"', lint: 'node -e "process.exit(1)"' },
      gate: { budget_seconds: 1.5 },
    },
  });
  cli(dir, ['gate', 'on']);
  const r = stop(dir);
  assert.equal(r.status, 2, 'test coupé au budget = rouge');
  assert.match(r.stderr, /timeout/);
  assert.doesNotMatch(r.stderr, /lint/, 'lint jamais lancé');
  cleanup(dir);
});
