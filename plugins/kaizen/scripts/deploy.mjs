// Kaizen — déploiement, retour arrière et feature flags, par les commandes de l'équipe.
//
// Kaizen ne connaît aucune plateforme : `.kaizen/config.json → deploy.environments.<env>` déclare
// `command` (déployer), `rollback` (revenir), `url`, `protected`. Ce module les exécute avec
// KAIZEN_ENV, KAIZEN_REF, KAIZEN_SHA dans l'environnement, et laisse une trace partagée :
//
// - un **tag git annoté** `deploy/<env>/<horodatage>` sur le commit déployé (`rollback/<env>/…` pour un
//   retour arrière ; `incident/<env>/…` et `resolve/<env>/…` pour la détection et la résolution d'un
//   incident, posés par monitor.mjs), poussé si un remote existe (`deploy.push_tags`). C'est la source
//   des vraies métriques DORA (`metrics`) et de la chronologie des post-mortems ;
// - une ligne dans `.kaizen/state/deployments.jsonl` (local) pour le suivi immédiat.
//
// Un environnement **protégé** (`protected: true`, défaut pour `production`) ne se déploie qu'avec une
// approbation confirmée par l'utilisateur : `deploy request` émet un code, l'utilisateur tape lui-même
// `kaizen deploy <code>` (hook UserPromptSubmit), et `deploy run` consomme cette approbation, valable
// 30 minutes pour cet environnement et ce commit. Le retour arrière n'exige pas d'approbation : il
// rétablit, et il est urgent.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, loadConfig } from './lib.mjs';

const APPROVAL_MAX_AGE_MS = 30 * 60 * 1000;
export const DEPLOY_TAG = /^(deploy|rollback|incident|resolve)\/([\w.-]+)\/(\d{8}T\d{6}Z)(?:-\d+)?$/;

function stateDir(root) {
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '*\n');
  return dir;
}

function readJson(root, name, fallback) {
  try {
    return JSON.parse(readFileSync(join(stateDir(root), name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(root, name, value) {
  writeFileSync(join(stateDir(root), name), `${JSON.stringify(value, null, 2)}\n`);
}

export function environment(root, env, config = loadConfig(root)) {
  const e = config.deploy.environments?.[env];
  if (!e) {
    const known = Object.keys(config.deploy.environments || {});
    throw new Error(`environnement inconnu : "${env}" (${known.length ? `déclarés : ${known.join(', ')}` : 'aucun dans .kaizen/config.json → deploy.environments'})`);
  }
  return { name: env, ...e, protected: e.protected ?? env === 'production' };
}

function resolveSha(root, ref) {
  const sha = git(root, ['rev-parse', '--verify', '--quiet', `${ref || 'HEAD'}^{commit}`], { allowFail: true });
  if (!sha) throw new Error(`référence introuvable : ${ref}`);
  return sha;
}

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function tagDeployment(root, kind, env, sha, note, config = loadConfig(root), at = new Date()) {
  const base = `${kind}/${env}/${stamp(at)}`;
  let tag = base;
  for (let i = 2; git(root, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { allowFail: true }); i++) tag = `${base}-${i}`;
  git(root, ['tag', '-a', tag, sha, '-m', JSON.stringify(note)]);
  let pushed = false;
  if (config.deploy.push_tags !== false && git(root, ['remote'], { allowFail: true })) {
    pushed = git(root, ['push', '-q', 'origin', `refs/tags/${tag}`], { allowFail: true }) !== null;
  }
  return { tag, pushed };
}

function run(root, command, env, sha, ref) {
  const started = Date.now();
  const r = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, KAIZEN_ENV: env, KAIZEN_REF: ref || sha, KAIZEN_SHA: sha },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${r.stdout || ''}${r.stderr || ''}`.replace(/\s+$/, '').split(/\r?\n/).slice(-40).join('\n');
  return { ok: r.status === 0, exit: r.status, seconds: Math.round((Date.now() - started) / 100) / 10, output };
}

function log(root, entry) {
  appendFileSync(join(stateDir(root), 'deployments.jsonl'), `${JSON.stringify(entry)}\n`);
}

// --- Approbation des environnements protégés ---------------------------------------------------------

export function requestDeploy(root, env, { ref } = {}) {
  const e = environment(root, env);
  const sha = resolveSha(root, ref);
  if (!e.protected) return { env, sha, protected: false, approval_needed: false };
  const code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const now = Date.now();
  const pending = readJson(root, 'deploy-approvals.json', []).filter((a) => now - Date.parse(a.at) < APPROVAL_MAX_AGE_MS && !(a.env === env && !a.confirmed));
  pending.push({ code, env, sha, at: new Date(now).toISOString(), confirmed: false });
  writeJson(root, 'deploy-approvals.json', pending);
  return {
    env,
    sha,
    protected: true,
    approval_needed: true,
    code,
    expires_in_minutes: APPROVAL_MAX_AGE_MS / 60000,
    instruction: `Demande à l’utilisateur de taper lui-même : kaizen deploy ${code}`,
  };
}

// Appelée par le hook UserPromptSubmit : seul un message de l'utilisateur atteint ce chemin.
export function confirmDeploy(root, code, { session = null } = {}) {
  const now = Date.now();
  const list = readJson(root, 'deploy-approvals.json', []);
  const a = list.find((x) => x.code === String(code).toUpperCase() && !x.confirmed && now - Date.parse(x.at) < APPROVAL_MAX_AGE_MS);
  if (!a) return null;
  a.confirmed = true;
  a.confirmed_at = new Date(now).toISOString();
  a.session = session;
  writeJson(root, 'deploy-approvals.json', list);
  return a;
}

function consumeApproval(root, env, sha) {
  const now = Date.now();
  const list = readJson(root, 'deploy-approvals.json', []);
  const a = list.find((x) => x.env === env && x.sha === sha && x.confirmed && now - Date.parse(x.at) < APPROVAL_MAX_AGE_MS);
  if (!a) return null;
  writeJson(root, 'deploy-approvals.json', list.filter((x) => x !== a));
  return a;
}

// --- Déployer, revenir, basculer un flag ---------------------------------------------------------------

export function deploy(root, env, { ref, plans = [] } = {}) {
  const config = loadConfig(root);
  const e = environment(root, env, config);
  if (!e.command) throw new Error(`deploy.environments.${env}.command manquant`);
  const sha = resolveSha(root, ref);
  let approval = null;
  if (e.protected) {
    approval = consumeApproval(root, env, sha);
    if (!approval) {
      throw new Error(
        `${env} est protégé : approbation requise pour ${sha.slice(0, 7)}. ` +
          `Lance \`deploy request ${env}${ref ? ` --ref ${ref}` : ''}\`, puis l’utilisateur tape lui-même « kaizen deploy <code> »`,
      );
    }
  }
  const result = run(root, e.command, env, sha, ref);
  const entry = { kind: 'deploy', env, sha, ref: ref || null, at: new Date().toISOString(), ok: result.ok, seconds: result.seconds, approved_at: approval?.confirmed_at || null, plans };
  if (result.ok) Object.assign(entry, tagDeployment(root, 'deploy', env, sha, { env, sha, approved_at: entry.approved_at, plans }, config));
  log(root, entry);
  return { ...entry, url: e.url || null, output: result.output };
}

export function rollback(root, env, { reason = null, to } = {}) {
  const config = loadConfig(root);
  const e = environment(root, env, config);
  if (!e.rollback) throw new Error(`deploy.environments.${env}.rollback manquant : déclarez comment revenir en arrière`);
  // Cible par défaut : le déploiement réussi précédent de cet environnement.
  const target = to ? resolveSha(root, to) : (deployments(root, { env }).filter((d) => d.kind === 'deploy').at(-2)?.sha || null);
  const result = run(root, e.rollback, env, target || '', target || '');
  const entry = { kind: 'rollback', env, sha: target, at: new Date().toISOString(), ok: result.ok, seconds: result.seconds, reason };
  if (result.ok) Object.assign(entry, tagDeployment(root, 'rollback', env, target || 'HEAD', { env, reason, to: target }, config));
  log(root, entry);
  return { ...entry, output: result.output };
}

export function flag(root, state, name, { env = null } = {}) {
  const config = loadConfig(root);
  const cmd = config.deploy.flags?.[state];
  if (!cmd) throw new Error(`deploy.flags.${state} manquant (ex. "unleash-cli toggle {flag} --${state}")`);
  const command = cmd.replaceAll('{flag}', name).replaceAll('{env}', env || '');
  const result = run(root, command, env || '', resolveSha(root), null);
  const entry = { kind: `flag-${state}`, flag: name, env, at: new Date().toISOString(), ok: result.ok };
  log(root, entry);
  return { ...entry, output: result.output };
}

// --- Historique ----------------------------------------------------------------------------------------

// Depuis les tags (partagés) : { kind, env, at, sha, tag, note }. Trié chronologiquement.
export function deployments(root, { env = null } = {}) {
  const out = git(root, ['for-each-ref', '--format=%(refname:short)%09%(*objectname)%09%(objectname)%09%(contents:subject)', 'refs/tags/deploy', 'refs/tags/rollback', 'refs/tags/incident', 'refs/tags/resolve'], { allowFail: true }) || '';
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [tag, peeled, obj, subject] = line.split('\t');
      const m = DEPLOY_TAG.exec(tag);
      if (!m) return null;
      const s = m[3];
      const at = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
      let note = null;
      try {
        note = JSON.parse(subject);
      } catch {}
      return { kind: m[1], env: m[2], at, sha: peeled || obj, tag, note };
    })
    .filter((d) => d && (!env || d.env === env))
    .sort((a, b) => a.at.localeCompare(b.at) || a.tag.localeCompare(b.tag));
}
