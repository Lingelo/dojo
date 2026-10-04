// Model policy: one role per agent, one model per role depending on the profile, adjustable.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { MODELS, PROFILE_MODELS, ROLES, roleOf } from '../scripts/models.mjs';
import { PLUGIN, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

test('every plugin agent has a role, and every role a valid model in every profile', () => {
  const agents = readdirSync(join(PLUGIN, 'agents')).map((f) => f.replace(/\.md$/, ''));
  assert.deepEqual(agents.filter((a) => !roleOf(a)), [], 'agents without a role in scripts/models.mjs');
  const listed = Object.values(ROLES).flat();
  assert.deepEqual(listed.filter((a) => !agents.includes(a)), [], 'roles citing a nonexistent agent');
  for (const [p, roles] of Object.entries(PROFILE_MODELS)) {
    assert.deepEqual(Object.keys(roles).sort(), Object.keys(ROLES).sort(), `profile ${p}`);
    for (const m of Object.values(roles)) assert.ok(MODELS.includes(m), `${p} : ${m}`);
  }
  assert.equal(PROFILE_MODELS.standard.review_critical, 'opus', 'costly judgments get the strongest model');
  assert.equal(PROFILE_MODELS.lean.research, 'haiku', 'bulk research is cheap in lean');
});

test('models: profile, override per role and per agent, invalid values reported', () => {
  const dir = tempRepo({ '.kaizen/config.json': { profile: 'lean' } });
  let m = cli(dir, ['models', '--json']).json;
  assert.equal(m.profile, 'lean');
  assert.equal(m.agents['learnings-researcher'].model, 'haiku');
  assert.equal(m.agents['security-reviewer'].role, 'review_critical');
  writeFiles(dir, { '.kaizen/config.json': { profile: 'lean', models: { roles: { review_critical: 'opus', research: 'gpt-5' }, agents: { 'performance-reviewer': 'opus', 'unknown-reviewer': 'haiku' } } } });
  m = cli(dir, ['models', '--json']).json;
  assert.equal(m.agents['adversarial-reviewer'].model, 'opus');
  assert.equal(m.agents['adversarial-reviewer'].source, 'config');
  assert.equal(m.agents['performance-reviewer'].model, 'opus');
  assert.equal(m.agents['correctness-reviewer'].model, 'sonnet', 'the rest of the role keeps the profile');
  assert.equal(m.agents['repo-researcher'].model, 'haiku', 'invalid model ignored');
  assert.ok(m.warnings.some((w) => /gpt-5/.test(w)));
  assert.ok(m.warnings.some((w) => /unknown-reviewer/.test(w)));
  assert.equal(cli(dir, ['models', '--agent', 'kaizen:security-reviewer']).stdout.trim(), 'opus');
  assert.match(cli(dir, ['models']).stdout, /critical review .* opus +\(config\)/);
  cleanup(dir);
});

test('the review records the model actually requested for each reviewer', () => {
  const dir = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/m']);
  writeFiles(dir, { 'app.js': Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') });
  gitc(dir, ['commit', '-qam', 'feat: m']);
  const run = (tool_input) => spawnSync(process.execPath, [REVIEW_HOOKS, '--evidence'], { input: JSON.stringify({ cwd: dir, tool_name: 'Agent', tool_input }), encoding: 'utf8' });
  run({ subagent_type: 'kaizen:security-reviewer', model: 'opus', prompt: 'x' });
  run({ subagent_type: 'kaizen:correctness-reviewer', prompt: 'x' });
  const rec = cli(dir, ['review', 'record', '--verdict', 'ready']).json;
  assert.deepEqual(rec.models, { 'security-reviewer': 'opus', 'correctness-reviewer': 'agent default' });
  cleanup(dir);
});
