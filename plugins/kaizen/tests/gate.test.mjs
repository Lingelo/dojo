import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

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
      // Coupée au délai, la commande lente meurt avec tout son arbre : rien ne verrouille le dépôt.
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

test('vérifications ciblées : {files} = fichiers touchés par la branche, rien à vérifier = sauté', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { verify: { test: 'node -e "process.exit(0)"' }, gate: { targeted: { lint: 'node -e "process.exit(process.argv.slice(1).includes(\'b.js\') ? 1 : 0)" {files}' } } },
    'a.js': 'a\n',
  });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  cli(dir, ['gate', 'on']);
  assert.equal(stop(dir).status, 0, 'aucun fichier touché : lint ciblé sauté');
  writeFiles(dir, { 'b.js': 'b\n' });
  const r = stop(dir);
  assert.equal(r.status, 2, 'nouveau fichier non suivi passé au linter');
  assert.match(r.stderr, /lint/);
  assert.match(r.stderr, /'b\.js'|"b\.js"/);
  cleanup(dir);
});

test('coût du cycle : tokens relevés depuis le transcript, consignés par gate off', () => {
  const dir = repoWithTest(0);
  cli(dir, ['gate', 'on']);
  const since = JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')).since;
  const later = new Date(Date.parse(since) + 1000).toISOString();
  const usage = (id, ts, out) => JSON.stringify({ timestamp: ts, message: { id, usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } } });
  const transcript = join(dir, '.kaizen/state/t.jsonl');
  writeFileSync(transcript, [usage('old', '2020-01-01T00:00:00Z', 999), usage('m1', later, 5), usage('m1', later, 5), usage('m2', later, 7), 'pas du json'].join('\n'));
  assert.equal(stop(dir, { transcript_path: transcript }).status, 0);
  const off = cli(dir, ['gate', 'off']).json;
  assert.deepEqual(off.cycle.usage, { input_tokens: 20, output_tokens: 12, cache_read_input_tokens: 200, cache_creation_input_tokens: 0, messages: 2 });
  const cost = cli(dir, ['metrics', '--no-github']).json.cycle_cost;
  assert.equal(cost.cycles, 1);
  assert.equal(cost.tokens_median, 232);
  assert.equal(cli(dir, ['gate', 'off']).json.cycle, null, 'un second gate off ne consigne rien');
  cleanup(dir);
});

test('coût du cycle : sous-agents comptés et ventilés par rôle', () => {
  const dir = repoWithTest(0);
  cli(dir, ['gate', 'on']);
  const since = JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')).since;
  const later = new Date(Date.parse(since) + 1000).toISOString();
  const usage = (id, ts, out) => JSON.stringify({ timestamp: ts, message: { id, usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
  const prompt = (text) => JSON.stringify({ type: 'user', timestamp: later, message: { role: 'user', content: text } });
  const launch = (tool_input, tool_response) =>
    spawnSync(process.execPath, [REVIEW_HOOKS, '--evidence'], { input: JSON.stringify({ cwd: dir, session_id: 'S1', tool_name: 'Agent', tool_input, tool_response }), encoding: 'utf8' });

  // Lancements vus par le hook Agent : relecteur critique (id dans la réponse), implémentation (par prompt).
  launch({ subagent_type: 'kaizen:security-reviewer', prompt: 'Relis la sécurité', model: 'opus' }, { agentId: 'a1', content: [] });
  launch({ subagent_type: 'general-purpose', prompt: 'Implémente  l’unité U2\n avec ses tests', model: 'sonnet' }, 'Async agent launched');

  // Transcripts : <projet>/S1.jsonl et <projet>/S1/subagents/[…/]agent-<id>.jsonl
  const proj = join(dir, '.kaizen/state/proj');
  mkdirSync(join(proj, 'S1/subagents/wf'), { recursive: true });
  writeFileSync(join(proj, 'S1.jsonl'), usage('m1', later, 5));
  writeFileSync(join(proj, 'S1/subagents/agent-a1.jsonl'), [prompt('Relis la sécurité'), usage('s1', later, 20), usage('s1', later, 20), usage('old', '2020-01-01T00:00:00Z', 999)].join('\n'));
  writeFileSync(join(proj, 'S1/subagents/wf/agent-a2.jsonl'), [prompt([{ type: 'text', text: 'Implémente l’unité U2 avec ses tests' }]), usage('s2', later, 30)].join('\n'));
  writeFileSync(join(proj, 'S1/subagents/agent-a3.jsonl'), [prompt('autre chose'), usage('s3', later, 40)].join('\n'));

  assert.equal(stop(dir, { session_id: 'S1', transcript_path: join(proj, 'S1.jsonl') }).status, 0);
  const off = cli(dir, ['gate', 'off']).json;
  assert.equal(off.cycle.usage.output_tokens, 5);
  assert.equal(off.cycle.subagents.agents, 3);
  assert.equal(off.cycle.subagents.usage.output_tokens, 90, 'doublon et message antérieur au cycle exclus');
  assert.deepEqual(
    Object.fromEntries(Object.entries(off.cycle.subagents.by_role).map(([r, u]) => [r, u.output_tokens])),
    { review_critical: 20, implement: 30, inconnu: 40 },
  );
  assert.equal(existsSync(join(dir, '.kaizen/state/agent-runs.jsonl')), false, 'journal des lancements effacé par gate off');

  const cost = cli(dir, ['metrics', '--no-github']).json.cycle_cost;
  assert.equal(cost.tokens_median, 15 + 120, 'total = principal + sous-agents');
  assert.equal(cost.main_tokens_median, 15);
  assert.equal(cost.subagent_tokens_median, 120);
  assert.equal(cost.subagent_share, 0.89);
  assert.deepEqual(cost.tokens_by_role.review_critical, { tokens: 30, output_tokens: 20 });
  assert.match(cost.method, /sous-agents/);
  cleanup(dir);
});

test('lancements de sous-agents : rien consigné hors cycle ni pour une autre session', () => {
  const dir = repoWithTest(0);
  const launch = (session) =>
    spawnSync(process.execPath, [REVIEW_HOOKS, '--evidence'], { input: JSON.stringify({ cwd: dir, session_id: session, tool_name: 'Agent', tool_input: { subagent_type: 'Explore', prompt: 'x' } }), encoding: 'utf8' });
  const runs = join(dir, '.kaizen/state/agent-runs.jsonl');
  launch('S1');
  assert.equal(existsSync(runs), false, 'garde-fou inactif');
  cli(dir, ['gate', 'on']);
  claim(dir, 'S1');
  launch('S2');
  assert.equal(existsSync(runs), false, 'autre session');
  launch('S1');
  assert.equal(JSON.parse(readFileSync(runs, 'utf8')).role, 'autre');
  cleanup(dir);
});
