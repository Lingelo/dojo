// Politique de modèles : un rôle par agent, un modèle par rôle selon le profil, ajustable.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { MODELS, PROFILE_MODELS, ROLES, roleOf } from '../scripts/models.mjs';
import { PLUGIN, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

test('chaque agent du plugin a un rôle, et chaque rôle un modèle valide dans chaque profil', () => {
  const agents = readdirSync(join(PLUGIN, 'agents')).map((f) => f.replace(/\.md$/, ''));
  assert.deepEqual(agents.filter((a) => !roleOf(a)), [], 'agents sans rôle dans scripts/models.mjs');
  const listed = Object.values(ROLES).flat();
  assert.deepEqual(listed.filter((a) => !agents.includes(a)), [], 'rôles qui citent un agent inexistant');
  for (const [p, roles] of Object.entries(PROFILE_MODELS)) {
    assert.deepEqual(Object.keys(roles).sort(), Object.keys(ROLES).sort(), `profil ${p}`);
    for (const m of Object.values(roles)) assert.ok(MODELS.includes(m), `${p} : ${m}`);
  }
  assert.equal(PROFILE_MODELS.standard.review_critical, 'opus', 'les jugements coûteux ont le modèle le plus fort');
  assert.equal(PROFILE_MODELS.lean.research, 'haiku', 'la recherche en volume coûte peu en lean');
});

test('models : profil, surcharge par rôle et par agent, valeurs invalides signalées', () => {
  const dir = tempRepo({ '.kaizen/config.json': { profile: 'lean' } });
  let m = cli(dir, ['models', '--json']).json;
  assert.equal(m.profile, 'lean');
  assert.equal(m.agents['learnings-researcher'].model, 'haiku');
  assert.equal(m.agents['security-reviewer'].role, 'review_critical');
  writeFiles(dir, { '.kaizen/config.json': { profile: 'lean', models: { roles: { review_critical: 'opus', research: 'gpt-5' }, agents: { 'performance-reviewer': 'opus', 'inconnu-reviewer': 'haiku' } } } });
  m = cli(dir, ['models', '--json']).json;
  assert.equal(m.agents['adversarial-reviewer'].model, 'opus');
  assert.equal(m.agents['adversarial-reviewer'].source, 'config');
  assert.equal(m.agents['performance-reviewer'].model, 'opus');
  assert.equal(m.agents['correctness-reviewer'].model, 'sonnet', 'le reste du rôle garde le profil');
  assert.equal(m.agents['repo-researcher'].model, 'haiku', 'modèle invalide ignoré');
  assert.ok(m.warnings.some((w) => /gpt-5/.test(w)));
  assert.ok(m.warnings.some((w) => /inconnu-reviewer/.test(w)));
  assert.equal(cli(dir, ['models', '--agent', 'kaizen:security-reviewer']).stdout.trim(), 'opus');
  assert.match(cli(dir, ['models']).stdout, /revue critique .* opus +\(config\)/);
  cleanup(dir);
});

test('la revue enregistre le modèle réellement demandé pour chaque relecteur', () => {
  const dir = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/m']);
  writeFiles(dir, { 'app.js': Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') });
  gitc(dir, ['commit', '-qam', 'feat: m']);
  const run = (tool_input) => spawnSync(process.execPath, [REVIEW_HOOKS, '--evidence'], { input: JSON.stringify({ cwd: dir, tool_name: 'Agent', tool_input }), encoding: 'utf8' });
  run({ subagent_type: 'kaizen:security-reviewer', model: 'opus', prompt: 'x' });
  run({ subagent_type: 'kaizen:correctness-reviewer', prompt: 'x' });
  const rec = cli(dir, ['review', 'record', '--verdict', 'ready']).json;
  assert.deepEqual(rec.models, { 'security-reviewer': 'opus', 'correctness-reviewer': 'défaut de l’agent' });
  cleanup(dir);
});
