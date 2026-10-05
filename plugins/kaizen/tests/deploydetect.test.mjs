// Recognizing a project's deployment mechanism, and writing the chosen candidate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { dispatchInputs } from '../scripts/deploydetect.mjs';
import { cleanup, cli, gitc, tempRepo } from './helpers.mjs';

const detect = (dir) => cli(dir, ['deploy', 'detect', '--json']).json;
const byId = (dir, id) => detect(dir).find((c) => c.id === id);

test('nothing recognized: empty list and a clear message', () => {
  const dir = tempRepo({ 'a.txt': '1' });
  assert.deepEqual(detect(dir), []);
  assert.match(cli(dir, ['deploy', 'detect']).stdout, /No recognized deployment mechanism/);
  cleanup(dir);
});

test('PaaS: Vercel, Netlify, Fly.io (app and health-check read), Heroku (remote)', () => {
  const dir = tempRepo({
    'vercel.json': '{}',
    'netlify.toml': '[build]\ncommand = "npm run build"\n',
    'fly.toml': 'app = "boutique"\n\n[[http_service.checks]]\n  path = "/healthz"\n',
  });
  gitc(dir, ['remote', 'add', 'heroku', 'https://git.heroku.com/boutique.git']);
  const v = byId(dir, 'vercel');
  assert.equal(v.environments.production.command, 'npx vercel deploy --prod --yes');
  assert.equal(v.environments.production.rollback, 'npx vercel rollback');
  assert.match(byId(dir, 'netlify').environments.production.rollback, /git worktree add .*"\$KAIZEN_SHA".*npx netlify deploy --prod/);
  const f = byId(dir, 'fly');
  assert.equal(f.environments.production.url, 'https://boutique.fly.dev');
  assert.deepEqual(f.signals.health, { type: 'http', url: 'https://boutique.fly.dev/healthz', expect: 200 });
  const h = byId(dir, 'heroku');
  assert.equal(h.environments.production.rollback, 'heroku rollback');
  assert.match(h.environments.production.command, /^git push heroku HEAD:/);
  cleanup(dir);
});

test('Kamal (destinations) and Capistrano (stages)', () => {
  const dir = tempRepo({
    'config/deploy.yml': 'service: boutique\nimage: acme/boutique\nproxy:\n  healthcheck:\n    path: /up\n',
    'config/deploy.staging.yml': 'servers: [1.2.3.4]\n',
    'config/deploy.rb': 'set :application, "boutique"\n',
    'config/deploy/staging.rb': '',
    'config/deploy/production.rb': '',
  });
  const k = byId(dir, 'kamal');
  assert.equal(k.environments.staging.command, 'kamal deploy -d staging');
  assert.equal(k.environments.production.rollback, 'kamal rollback "$KAIZEN_SHA"');
  const c = byId(dir, 'capistrano');
  assert.equal(c.environments.production.rollback, 'bundle exec cap production deploy:rollback');
  assert.equal(c.environments.staging.command, 'bundle exec cap staging deploy');
  cleanup(dir);
});

test('Kubernetes: Helm (values per environment) and Kustomize (overlays, Deployment)', () => {
  const dir = tempRepo({
    'charts/boutique/Chart.yaml': 'apiVersion: v2\nname: boutique\nversion: 0.1.0\n',
    'charts/boutique/values-staging.yaml': 'replicas: 1\n',
    'charts/boutique/values-production.yaml': 'replicas: 3\n',
    'k8s/base/kustomization.yaml': 'resources: [deployment.yaml]\n',
    'k8s/base/deployment.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: boutique-web\n',
    'k8s/overlays/prod/kustomization.yaml': 'resources: [../../base]\n',
    'k8s/overlays/staging/kustomization.yaml': 'resources: [../../base]\n',
  });
  const h = byId(dir, 'helm');
  assert.equal(h.environments.production.command, 'helm upgrade --install boutique charts/boutique -f charts/boutique/values-production.yaml --set image.tag="$KAIZEN_SHA" --wait');
  assert.equal(h.environments.staging.rollback, 'helm rollback boutique --wait');
  const k = byId(dir, 'kustomize');
  assert.equal(k.environments.production.command, 'kubectl apply -k k8s/overlays/prod && kubectl rollout status deployment/boutique-web');
  assert.equal(k.environments.staging.rollback, 'kubectl rollout undo deployment/boutique-web');
  cleanup(dir);
});

test('serverless, AWS SAM (config-env), Firebase (alias), Terraform and Compose at low confidence', () => {
  const dir = tempRepo({
    'serverless.yml': 'service: api\n',
    'template.yaml': 'Transform: AWS::Serverless-2016-10-31\n',
    'samconfig.toml': '[staging.deploy.parameters]\n[production.deploy.parameters]\n',
    'firebase.json': '{}',
    '.firebaserc': JSON.stringify({ projects: { staging: 'shop-staging', production: 'shop-prod' } }),
    'infra/main.tf': 'terraform {}\n',
    'docker-compose.yml': 'services: {}\n',
  });
  assert.equal(byId(dir, 'serverless').environments.staging.command, 'npx serverless deploy --stage staging');
  assert.match(byId(dir, 'sam').environments.staging.command, /--config-env staging$/);
  assert.equal(byId(dir, 'firebase').environments.production.command, 'npx firebase deploy --project production');
  const tf = byId(dir, 'terraform');
  assert.equal(tf.confidence, 'low');
  assert.match(tf.environments.production.command, /terraform -chdir=infra init/);
  assert.equal(byId(dir, 'compose').confidence, 'low');
  const ids = detect(dir).map((c) => c.id);
  assert.ok(ids.indexOf('terraform') > ids.indexOf('serverless'), 'sorted by confidence');
  cleanup(dir);
});

test('GitHub Actions: workflow_dispatch (environment and ref inputs) and continuous deployment', () => {
  const dispatch = `name: Deploy
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [staging, production]
      ref:
        description: commit to deploy
jobs:
  deploy:
    runs-on: ubuntu-latest
`;
  const continuous = 'name: CD\non:\n  push:\n    branches: [main]\njobs:\n  ship:\n    environment: production\n';
  assert.deepEqual(dispatchInputs(dispatch), ['environment', 'ref']);
  const dir = tempRepo({ '.github/workflows/deploy.yml': dispatch, '.github/workflows/cd.yml': continuous, '.github/workflows/ci.yml': 'name: CI\non: [push]\n' });
  const d = byId(dir, 'gha:deploy.yml');
  assert.match(d.environments.staging.command, /^gh workflow run deploy\.yml -f environment=staging -f ref="\$KAIZEN_SHA" && .*gh run watch/);
  assert.equal(d.environments.production.rollback, d.environments.production.command, 'same workflow on the target commit');
  const c = byId(dir, 'gha-continuous:cd.yml');
  assert.match(c.environments.production.command, /gh run list --workflow cd\.yml --commit "\$KAIZEN_SHA"/);
  assert.equal(c.environments.production.rollback, null);
  assert.equal(byId(dir, 'gha:ci.yml'), undefined, 'a CI workflow is not a deployment');
  cleanup(dir);
});

test('repo scripts: make targets and npm scripts, native rollback or redeploy', () => {
  const dir = tempRepo({
    Makefile: 'deploy-staging:\n\t./deploy.sh staging\ndeploy-production:\n\t./deploy.sh production\nrollback-production:\n\t./rollback.sh\n',
    'package.json': JSON.stringify({ scripts: { 'deploy:prod': 'x', 'deploy:staging': 'y' } }),
  });
  const m = byId(dir, 'make');
  assert.equal(m.environments.production.rollback, 'make rollback-production');
  assert.match(m.environments.staging.rollback, /git worktree add .*make deploy-staging/);
  assert.equal(byId(dir, 'npm').environments.production.command, 'npm run deploy:prod');
  cleanup(dir);
});

test('configure: writes environments and health-check, without overwriting existing ones unless --force', () => {
  const dir = tempRepo({
    'fly.toml': 'app = "boutique"\n',
    '.kaizen/config.json': { deploy: { environments: { staging: { command: 'make staging' } } } },
  });
  const r = cli(dir, ['deploy', 'configure', 'fly']).json;
  assert.deepEqual(r.written, ['production']);
  assert.deepEqual(r.signals, ['health']);
  const cfg = JSON.parse(readFileSync(join(dir, '.kaizen/config.json'), 'utf8'));
  assert.equal(cfg.deploy.environments.production.command, 'fly deploy');
  assert.equal(cfg.deploy.environments.staging.command, 'make staging', 'existing one kept');
  assert.equal(cfg.monitor.signals.health.url, 'https://boutique.fly.dev/');
  assert.deepEqual(cli(dir, ['deploy', 'configure', 'fly']).json.kept, ['production']);
  assert.notEqual(cli(dir, ['deploy', 'configure', 'unknown']).code, 0);
  cleanup(dir);
});

// Generic rollback: POSIX shell (Linux, macOS, Git Bash), as stated in the docs.
test('generic rollback: redeploys the target commit from a throwaway worktree, working copy untouched', { skip: process.platform === 'win32' }, async () => {
  const { redeployPrevious } = await import('../scripts/deploydetect.mjs');
  const { writeFiles } = await import('./helpers.mjs');
  const { spawnSync } = await import('node:child_process');
  const deployCmd = 'git rev-parse HEAD >> "$OUT"';
  const dir = tempRepo({
    '.gitignore': 'deployed.log\n',
    'app.js': '1\n',
    '.kaizen/config.json': { deploy: { environments: { staging: { command: deployCmd, rollback: redeployPrevious(deployCmd) } } } },
  });
  const env = { OUT: join(dir, 'deployed.log') };
  const first = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
  cli(dir, ['deploy', 'run', 'staging'], { env });
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2']);
  cli(dir, ['deploy', 'run', 'staging'], { env });
  writeFiles(dir, { 'wip.txt': 'work in progress\n' });
  const rb = cli(dir, ['deploy', 'rollback', 'staging'], { env });
  assert.equal(rb.code, 0, rb.stdout + rb.stderr);
  assert.equal(readFileSync(join(dir, 'deployed.log'), 'utf8').trim().split('\n').at(-1), first, 'the previous commit was redeployed');
  assert.equal(readFileSync(join(dir, 'wip.txt'), 'utf8'), 'work in progress\n', 'working copy untouched');
  assert.doesNotMatch(spawnSync('git', ['worktree', 'list'], { cwd: dir, encoding: 'utf8' }).stdout, /rollback-worktree/, 'worktree cleaned up');
  cleanup(dir);
});
