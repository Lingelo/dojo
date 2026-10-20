// Risk surfaces: the profile is a floor, a change touching a risk surface runs one profile up.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextProfile, planFiles, riskSurfaces } from '../scripts/risk.mjs';
import { cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

test('risk surfaces: built-in detection by path, no false positive on look-alike names', () => {
  const s = riskSurfaces([
    'src/auth/login.ts', 'app/models/user_session.rb', 'src/author.ts', 'src/styles/tokens.css',
    'services/billing/charge.py', 'db/migrations/0042_add_index.sql', 'api/openapi.yaml', 'proto/shop.proto',
    'package.json', 'package-lock.json', 'src/health/check.ts', 'docs/plans/2026-auth.md', 'README.md',
  ]);
  assert.deepEqual(s.auth, ['src/auth/login.ts', 'app/models/user_session.rb']);
  assert.deepEqual(s.payment, ['services/billing/charge.py']);
  assert.deepEqual(s.migration, ['db/migrations/0042_add_index.sql']);
  assert.deepEqual(s.public_api, ['api/openapi.yaml', 'proto/shop.proto']);
  assert.deepEqual(s.dependencies, ['package.json']);
  assert.equal(s.sensitive_data, undefined, 'a health check is not health data');
});

test('risk surfaces: team globs add surfaces, ignore drops paths', () => {
  const s = riskSurfaces(['lib/pricing/rules.ts', 'src/auth/login.ts', 'package.json'], {
    paths: { pricing: ['lib/pricing/**'] },
    ignore: ['package.json'],
  });
  assert.deepEqual(Object.keys(s).sort(), ['auth', 'pricing']);
});

test('nextProfile: one step up, critical stays critical', () => {
  assert.equal(nextProfile('prototype'), 'product');
  assert.equal(nextProfile('product'), 'critical');
  assert.equal(nextProfile('critical'), 'critical');
});

test('planFiles: paths from the units\' **Files:** fields', () => {
  const text = '## U1. Charge\n- **Covers:** R1\n- **Files:** `services/billing/charge.py` (new), tests/billing.test.py\n- **Evidence:** test\n';
  assert.deepEqual(planFiles(text), ['services/billing/charge.py', 'tests/billing.test.py']);
});

test('CLI profile: branch, plan and files sources; escalation off; models --profile', () => {
  const dir = tempRepo({ '.kaizen/config.json': { profile: 'prototype' }, 'src/app.ts': 'x' });
  gitc(dir, ['checkout', '-qb', 'feat/pay']);
  let p = cli(dir, ['profile', '--json']).json;
  assert.equal(p.effective, 'prototype');
  assert.equal(p.escalated, false);

  writeFiles(dir, { 'src/payments/refund.ts': 'x' });
  p = cli(dir, ['profile', '--json']).json;
  assert.equal(p.source, 'branch');
  assert.equal(p.effective, 'product');
  assert.deepEqual(p.surfaces, { payment: ['src/payments/refund.ts'] });
  assert.match(cli(dir, ['status']).stdout, /profile prototype → product on this branch \(payment\)/);

  p = cli(dir, ['profile', '--json', '--files', 'db/migrations/1.sql,src/app.ts']).json;
  assert.equal(p.source, 'files');
  assert.deepEqual(Object.keys(p.surfaces), ['migration']);

  writeFiles(dir, { 'docs/plans/p.md': '## U1. x\n- **Files:** `src/auth/session.ts`\n' });
  p = cli(dir, ['profile', '--json', '--plan', 'docs/plans/p.md']).json;
  assert.equal(p.source, 'plan');
  assert.equal(p.effective, 'product');

  writeFiles(dir, { '.kaizen/config.json': { profile: 'prototype', risk: { escalate: false } } });
  p = cli(dir, ['profile', '--json']).json;
  assert.equal(p.effective, 'prototype', 'surfaces reported, profile kept');
  assert.ok(p.surfaces.payment);

  assert.equal(cli(dir, ['models', '--json', '--profile', 'critical']).json.agents['correctness-reviewer'].model, 'opus');
  assert.equal(cli(dir, ['models', '--json', '--profile', 'full']).json.profile, 'critical', 'former name accepted');
  assert.notEqual(cli(dir, ['models', '--profile', 'turbo']).code, 0);
  cleanup(dir);
});
