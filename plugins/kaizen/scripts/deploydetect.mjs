// Kaizen — recognizes how this project deploys and proposes deploy.environments / monitor.signals.
//
// Nothing is guessed silently: each candidate states its source (the file that revealed it), its
// confidence and its limits (`notes`). `/kaizen:setup` shows them, the user picks one, then
// `deploy configure <id>` writes it to .kaizen/config.json without overwriting an existing environment.
//
// Rollback: the platform's native command when there is one (vercel rollback, heroku rollback, helm
// rollback, kamal rollback, cap deploy:rollback, kubectl rollout undo). Otherwise, a "redeploy of the
// previous commit": the same command run from a git worktree of the target commit ($KAIZEN_SHA,
// provided by `deploy rollback`). POSIX shell (Linux, macOS, Git Bash).

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { defaultBranch, git } from './lib.mjs';

const read = (root, p) => {
  try {
    return readFileSync(join(root, p), 'utf8');
  } catch {
    return null;
  }
};
const has = (root, p) => existsSync(join(root, p));
const rel = (root, p) => relative(root, p).split(sep).join('/');

function listDir(root, p) {
  try {
    return readdirSync(join(root, p));
  } catch {
    return [];
  }
}

// Files up to `depth` levels, excluding dependencies: enough for charts/, k8s/overlays/, infra/.
function walk(root, dir = '', depth = 3, out = []) {
  if (depth < 0) return out;
  for (const name of listDir(root, dir)) {
    if (['node_modules', '.git', 'vendor', 'dist', 'build', '.kaizen', '.terraform', 'target'].includes(name)) continue;
    const p = dir ? `${dir}/${name}` : name;
    let st;
    try {
      st = statSync(join(root, p));
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(root, p, depth - 1, out);
    else out.push(p);
  }
  return out;
}

// Redeploys the target commit from a throwaway worktree: generic rollback, without touching the working
// copy.
export function redeployPrevious(command) {
  const wt = '.kaizen/state/rollback-worktree';
  return `git worktree add --force --detach ${wt} "$KAIZEN_SHA" && (cd ${wt} && ${command}); s=$?; git worktree remove --force ${wt}; exit $s`;
}

const tomlString = (text, key) => new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, 'm').exec(text || '')?.[1] || null;
const yamlScalar = (text, key) => new RegExp(`^\\s*${key}\\s*:\\s*["']?([^"'#\\n]+?)["']?\\s*$`, 'm').exec(text || '')?.[1] || null;

function candidate(id, platform, source, confidence, environments, extra = {}) {
  return { id, platform, source, confidence, environments, signals: extra.signals || {}, notes: extra.notes || [] };
}

const health = (url) => (url ? { health: { type: 'http', url, expect: 200 } } : {});

// --- Platforms -----------------------------------------------------------------------------------------

function vercel(root) {
  if (!has(root, 'vercel.json') && !has(root, '.vercel/project.json')) return null;
  return candidate('vercel', 'Vercel', has(root, 'vercel.json') ? 'vercel.json' : '.vercel/project.json', 'high', {
    staging: { command: 'npx vercel deploy --yes', rollback: null, note: 'preview deployment' },
    production: { command: 'npx vercel deploy --prod --yes', rollback: 'npx vercel rollback' },
  }, { notes: ['VERCEL_TOKEN required outside an authenticated machine', 'production url: to fill in (project domain)'] });
}

function netlify(root) {
  if (!has(root, 'netlify.toml')) return null;
  return candidate('netlify', 'Netlify', 'netlify.toml', 'high', {
    staging: { command: 'npx netlify deploy', rollback: null, note: 'draft deployment' },
    production: { command: 'npx netlify deploy --prod', rollback: redeployPrevious('npx netlify deploy --prod') },
  }, { notes: ['NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID required in CI', 'rollback by redeploying the previous commit (the CLI has no direct rollback)'] });
}

function fly(root) {
  const t = read(root, 'fly.toml');
  if (!t) return null;
  const app = tomlString(t, 'app');
  const path = /\[\[(?:http_service\.checks|services\.http_checks)\]\][^[]*?path\s*=\s*["']([^"']+)["']/s.exec(t)?.[1] || null;
  const url = app ? `https://${app}.fly.dev${path || '/'}` : null;
  return candidate('fly', 'Fly.io', 'fly.toml', 'high', {
    production: { command: 'fly deploy', rollback: redeployPrevious('fly deploy'), url: app ? `https://${app}.fly.dev` : null },
  }, { signals: health(url), notes: [path ? `health-check ${path} read from fly.toml` : 'no HTTP check in fly.toml: health-check on the root', 'rollback by redeploying the previous commit'] });
}

function heroku(root) {
  const remotes = git(root, ['remote', '-v'], { allowFail: true }) || '';
  const viaRemote = /heroku\.com/.test(remotes);
  const appJson = read(root, 'app.json');
  if (!viaRemote && !(appJson && /heroku/i.test(appJson))) return null;
  const branch = defaultBranch(root) || 'main';
  return candidate('heroku', 'Heroku', viaRemote ? 'remote git heroku' : 'app.json', viaRemote ? 'high' : 'medium', {
    production: { command: `git push heroku HEAD:${branch}`, rollback: 'heroku rollback' },
  }, { notes: ['authenticated heroku CLI required for rollback'] });
}

function kamal(root) {
  const t = read(root, 'config/deploy.yml');
  if (!t || !/^service\s*:/m.test(t) || !/^image\s*:/m.test(t)) return null;
  const dests = listDir(root, 'config').map((f) => /^deploy\.([\w-]+)\.yml$/.exec(f)?.[1]).filter(Boolean);
  const path = /healthcheck\s*:[\s\S]*?path\s*:\s*["']?([^\s"']+)/.exec(t)?.[1] || '/up';
  const envs = {};
  const mk = (d) => ({ command: `kamal deploy${d ? ` -d ${d}` : ''}`, rollback: `kamal rollback "$KAIZEN_SHA"${d ? ` -d ${d}` : ''}` });
  if (dests.includes('staging')) envs.staging = mk('staging');
  envs.production = mk(dests.includes('production') ? 'production' : null);
  return candidate('kamal', 'Kamal', 'config/deploy.yml', 'high', envs, { notes: [`Kamal health-check: ${path} (host url to fill in)`, 'kamal versions by git SHA: rollback targets the previous deployment\'s commit'] });
}

function capistrano(root) {
  if (!has(root, 'config/deploy.rb') && !has(root, 'Capfile')) return null;
  const stages = listDir(root, 'config/deploy').map((f) => /^([\w-]+)\.rb$/.exec(f)?.[1]).filter(Boolean);
  const envs = {};
  for (const s of stages.length ? stages : ['production']) {
    const env = s === 'prod' ? 'production' : s;
    envs[env] = { command: `bundle exec cap ${s} deploy`, rollback: `bundle exec cap ${s} deploy:rollback` };
  }
  return candidate('capistrano', 'Capistrano', 'config/deploy.rb', 'high', envs);
}

function helm(root, files) {
  const chart = files.find((f) => /(^|\/)Chart\.yaml$/.test(f));
  if (!chart) return null;
  const dir = dirname(chart) || '.';
  const name = yamlScalar(read(root, chart), 'name') || 'app';
  const values = files.filter((f) => f.startsWith(dir === '.' ? '' : `${dir}/`) && /values[.-]([\w-]+)\.ya?ml$/.test(f));
  const valuesFor = (env) => values.find((f) => new RegExp(`values[.-]${env}\\.ya?ml$`).test(f));
  const envs = {};
  for (const env of ['staging', 'production']) {
    const v = valuesFor(env) || (env === 'production' ? valuesFor('prod') : null);
    if (env === 'staging' && !v) continue;
    envs[env] = {
      command: `helm upgrade --install ${name} ${dir}${v ? ` -f ${v}` : ''} --set image.tag="$KAIZEN_SHA" --wait`,
      rollback: `helm rollback ${name} --wait`,
    };
  }
  return candidate('helm', 'Kubernetes (Helm)', chart, 'high', envs, { notes: ['assumes an image tagged by SHA (image.tag): adjust to your chart', 'kubectl/helm configured on the right cluster context'] });
}

function k8sDeploymentName(root, files) {
  for (const f of files) {
    const t = read(root, f) || '';
    const m = /kind:\s*Deployment[\s\S]*?metadata:\s*\n\s+name:\s*["']?([\w.-]+)/.exec(t);
    if (m) return m[1];
  }
  return null;
}

function kustomize(root, files) {
  const kfiles = files.filter((f) => /(^|\/)kustomization\.ya?ml$/.test(f));
  if (!kfiles.length) return null;
  const dirOf = (f) => dirname(f);
  const yamls = files.filter((f) => /\.ya?ml$/.test(f) && /k8s|kube|deploy|manifests|overlays|base/.test(f));
  const dep = k8sDeploymentName(root, yamls);
  const overlay = (env) => kfiles.find((f) => new RegExp(`/(${env})/kustomization`).test(f));
  const envs = {};
  for (const [env, aliases] of [['staging', 'staging|stage|preprod'], ['production', 'production|prod']]) {
    const k = overlay(aliases) || (env === 'production' && kfiles.length === 1 ? kfiles[0] : null);
    if (!k) continue;
    envs[env] = { command: `kubectl apply -k ${dirOf(k)} && ${dep ? `kubectl rollout status deployment/${dep}` : 'true'}`, rollback: dep ? `kubectl rollout undo deployment/${dep}` : redeployPrevious(`kubectl apply -k ${dirOf(k)}`) };
  }
  if (!Object.keys(envs).length) return null;
  return candidate('kustomize', 'Kubernetes (Kustomize)', kfiles[0], 'medium', envs, { notes: [dep ? `Deployment "${dep}": rollback with kubectl rollout undo` : 'no Deployment found: rollback by re-applying the previous commit', 'kubectl configured on the right cluster context'] });
}

function compose(root) {
  const f = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].find((x) => has(root, x));
  if (!f) return null;
  const prod = ['compose.prod.yaml', 'compose.prod.yml', 'docker-compose.prod.yml', 'docker-compose.production.yml'].find((x) => has(root, x));
  const cmd = `docker compose -f ${f}${prod ? ` -f ${prod}` : ''} up -d --build --wait`;
  return candidate('compose', 'Docker Compose', prod || f, prod ? 'medium' : 'low', {
    production: { command: cmd, rollback: redeployPrevious(cmd) },
  }, { notes: [prod ? `production override ${prod}` : 'often a development environment: confirm before using it for production', 'DOCKER_HOST or docker context pointing to the production host'] });
}

function terraform(root, files) {
  const tf = files.find((f) => f.endsWith('.tf'));
  if (!tf) return null;
  const dir = dirname(tf);
  const chdir = dir === '.' ? '' : ` -chdir=${dir}`;
  const cmd = `terraform${chdir} init -input=false && terraform${chdir} apply -input=false -auto-approve`;
  return candidate('terraform', 'Terraform', tf, 'low', {
    production: { command: cmd, rollback: redeployPrevious(cmd) },
  }, { notes: ['infrastructure: review the plan (terraform plan) before any production release', 'rollback by re-applying the previous commit\'s configuration; a destroyed resource does not come back'] });
}

function serverless(root) {
  if (!has(root, 'serverless.yml') && !has(root, 'serverless.ts')) return null;
  const mk = (stage) => ({ command: `npx serverless deploy --stage ${stage}`, rollback: redeployPrevious(`npx serverless deploy --stage ${stage}`) });
  return candidate('serverless', 'Serverless Framework', has(root, 'serverless.yml') ? 'serverless.yml' : 'serverless.ts', 'high', { staging: mk('staging'), production: mk('production') });
}

function sam(root) {
  const f = ['template.yaml', 'template.yml'].find((x) => /AWS::Serverless/.test(read(root, x) || ''));
  if (!f) return null;
  const conf = read(root, 'samconfig.toml') || '';
  const mk = (env) => {
    const cmd = `sam build && sam deploy --no-confirm-changeset${new RegExp(`^\\[${env}`, 'm').test(conf) ? ` --config-env ${env}` : ''}`;
    return { command: cmd, rollback: redeployPrevious(cmd) };
  };
  const envs = { production: mk('production') };
  if (/^\[staging/m.test(conf)) envs.staging = mk('staging');
  return candidate('sam', 'AWS SAM', f, 'high', envs, { notes: ['AWS credentials for the right account required'] });
}

function firebase(root) {
  if (!has(root, 'firebase.json')) return null;
  let projects = {};
  try {
    projects = JSON.parse(read(root, '.firebaserc') || '{}').projects || {};
  } catch {}
  const mk = (alias) => {
    const cmd = `npx firebase deploy${alias ? ` --project ${alias}` : ''}`;
    return { command: cmd, rollback: redeployPrevious(cmd) };
  };
  const envs = { production: mk(projects.production ? 'production' : projects.prod ? 'prod' : null) };
  if (projects.staging) envs.staging = mk('staging');
  return candidate('firebase', 'Firebase', 'firebase.json', 'high', envs, { notes: ['FIREBASE_TOKEN or service account required in CI'] });
}

// --- CI: a deployment workflow already exists -------------------------------------------------------

// Names of `workflow_dispatch` inputs, read by indentation (no YAML dependency).
export function dispatchInputs(text) {
  const lines = text.split(/\r?\n/);
  const indent = (l) => l.length - l.trimStart().length;
  const i = lines.findIndex((l) => /^\s*workflow_dispatch\s*:/.test(l));
  if (i < 0) return [];
  const base = indent(lines[i]);
  let j = i + 1;
  for (; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    if (indent(l) <= base) return [];
    if (/^\s*inputs\s*:/.test(l)) break;
  }
  if (j >= lines.length) return [];
  const inputsIndent = indent(lines[j]);
  let keyIndent = null;
  const out = [];
  for (let k = j + 1; k < lines.length; k++) {
    const l = lines[k];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    if (indent(l) <= inputsIndent) break;
    keyIndent ??= indent(l);
    const m = /^\s*([\w-]+)\s*:/.exec(l);
    if (indent(l) === keyIndent && m) out.push(m[1]);
  }
  return out;
}

function githubWorkflows(root) {
  const out = [];
  for (const f of listDir(root, '.github/workflows').filter((x) => /\.ya?ml$/.test(x))) {
    const path = `.github/workflows/${f}`;
    const t = read(root, path) || '';
    const name = yamlScalar(t, 'name') || f;
    const deployish = /deploy|release|\bcd\b|production/i.test(`${f} ${name}`) || /environment\s*:\s*["']?(production|prod)/i.test(t);
    if (!deployish) continue;
    if (/workflow_dispatch/.test(t)) {
      const inputs = dispatchInputs(t);
      const envInput = inputs.find((i) => /^(environment|env|stage|target)$/i.test(i));
      const refInput = inputs.find((i) => /^(ref|sha|commit|version|tag)$/i.test(i));
      const watch = `sleep 5 && gh run watch "$(gh run list --workflow ${f} --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status`;
      const mk = (env, sha) => `gh workflow run ${f}${envInput ? ` -f ${envInput}=${env}` : ''}${refInput ? ` -f ${refInput}="${sha}"` : ''} && ${watch}`;
      const envs = { production: { command: mk('production', '$KAIZEN_SHA'), rollback: refInput ? mk('production', '$KAIZEN_SHA') : null } };
      if (envInput) envs.staging = { command: mk('staging', '$KAIZEN_SHA'), rollback: refInput ? mk('staging', '$KAIZEN_SHA') : null };
      out.push(candidate(`gha:${f}`, `GitHub Actions (${name})`, path, 'high', envs, {
        notes: [
          `workflow_dispatch${inputs.length ? ` with ${inputs.join(', ')}` : ' without inputs'}`,
          refInput ? `rollback: the same workflow on the target commit (${refInput})` : 'no commit input: the workflow deploys the branch head, rollback to plan (revert or a ref input)',
          'authenticated gh required; Kaizen waits for the run to finish (gh run watch)',
        ],
      }));
    } else if (/on\s*:[\s\S]*?push\s*:/m.test(t)) {
      // Continuous deployment: the merge already triggers the release. Kaizen follows the commit's run.
      const cmd = `gh run watch "$(gh run list --workflow ${f} --commit "$KAIZEN_SHA" --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status`;
      out.push(candidate(`gha-continuous:${f}`, `Continuous deployment (${name})`, path, 'medium', {
        production: { command: cmd, rollback: null },
      }, { notes: ['deployment already runs on every push: Kaizen waits for the commit\'s run, tags it and watches', 'rollback: revert on the default branch (no automatic command)'] }));
    }
  }
  return out;
}

// --- Repo scripts: Makefile, package.json -------------------------------------------------------------

function scripts(root) {
  const out = [];
  const mk = read(root, 'Makefile');
  if (mk && /^deploy[\w-]*\s*:/m.test(mk)) {
    const targets = [...mk.matchAll(/^([\w-]+)\s*:/gm)].map((m) => m[1]);
    const envs = {};
    const pick = (re) => targets.find((t) => re.test(t));
    const prodT = pick(/^deploy[-_]?(prod|production)$/) || pick(/^deploy$/);
    const stagT = pick(/^deploy[-_]?(staging|stage)$/);
    const rbProd = pick(/^rollback[-_]?(prod|production)$/) || pick(/^rollback$/);
    const rbStag = pick(/^rollback[-_]?(staging|stage)$/) || pick(/^rollback$/);
    if (prodT) envs.production = { command: `make ${prodT}`, rollback: rbProd ? `make ${rbProd}` : redeployPrevious(`make ${prodT}`) };
    if (stagT) envs.staging = { command: `make ${stagT}`, rollback: rbStag ? `make ${rbStag}` : redeployPrevious(`make ${stagT}`) };
    if (Object.keys(envs).length) out.push(candidate('make', 'Makefile', 'Makefile', 'medium', envs, { notes: ['repo targets: check they do not require a variable (ENV=…)'] }));
  }
  let pkg = null;
  try {
    pkg = JSON.parse(read(root, 'package.json') || 'null');
  } catch {}
  const s = pkg?.scripts || {};
  const names = Object.keys(s);
  const find = (re) => names.find((n) => re.test(n));
  const prod = find(/^deploy([:_-](prod|production))?$/);
  const stag = find(/^deploy[:_-](staging|stage|preview)$/);
  if (prod || stag) {
    const run = (n) => `npm run ${n}`;
    const rb = (env) => find(new RegExp(`^rollback([:_-]${env})?$`));
    const envs = {};
    if (prod) envs.production = { command: run(prod), rollback: rb('(prod|production)') ? run(rb('(prod|production)')) : redeployPrevious(run(prod)) };
    if (stag) envs.staging = { command: run(stag), rollback: rb('(staging|stage|preview)') ? run(rb('(staging|stage|preview)')) : redeployPrevious(run(stag)) };
    out.push(candidate('npm', 'npm scripts', 'package.json', 'medium', envs));
  }
  return out;
}

// --- Entry point -----------------------------------------------------------------------------------

export function detectDeploy(root) {
  const files = walk(root);
  const found = [
    vercel(root), netlify(root), fly(root), heroku(root), kamal(root), capistrano(root),
    helm(root, files), kustomize(root, files), serverless(root), sam(root), firebase(root),
    ...githubWorkflows(root), ...scripts(root), compose(root), terraform(root, files),
  ].filter(Boolean);
  const order = { high: 0, medium: 1, low: 2 };
  return found.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

// Writes the chosen candidate to .kaizen/config.json: an already declared environment is only replaced
// with `force`; the proposed health-check is added if it does not exist yet.
export function configureDeploy(root, id, { force = false } = {}) {
  const c = detectDeploy(root).find((x) => x.id === id);
  if (!c) throw new Error(`unknown candidate: "${id}" (see \`deploy detect\`)`);
  const file = join(root, '.kaizen', 'config.json');
  mkdirSync(dirname(file), { recursive: true });
  const cfg = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  cfg.deploy = cfg.deploy || {};
  cfg.deploy.environments = cfg.deploy.environments || {};
  const written = [];
  const kept = [];
  for (const [env, e] of Object.entries(c.environments)) {
    if (cfg.deploy.environments[env] && !force) {
      kept.push(env);
      continue;
    }
    const { note: _note, ...clean } = e;
    for (const k of Object.keys(clean)) if (clean[k] === null) delete clean[k];
    cfg.deploy.environments[env] = clean;
    written.push(env);
  }
  const signals = [];
  if (Object.keys(c.signals).length) {
    cfg.monitor = cfg.monitor || {};
    cfg.monitor.signals = cfg.monitor.signals || {};
    for (const [n, sig] of Object.entries(c.signals)) {
      if (cfg.monitor.signals[n]) continue;
      cfg.monitor.signals[n] = sig;
      signals.push(n);
    }
  }
  writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
  return { candidate: c.id, platform: c.platform, written, kept, signals, missing_rollback: written.filter((e) => !cfg.deploy.environments[e].rollback), notes: c.notes, config: rel(root, file) };
}
