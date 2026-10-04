// Kaizen — signaux de production : contrôle ponctuel et surveillance après déploiement.
//
// `.kaizen/config.json → monitor.signals.<nom>` déclare chaque signal, sans dépendre d'un outil :
//   { "type": "http", "url": "https://…/health", "expect": 200 }        disponibilité (natif)
//   { "command": "curl -s … | jq -r .value", "max": 0.01 }               toute commande qui affiche un nombre
//   (min / max : seuils ; `env` : limite le signal à un environnement ; `{env}` remplacé dans command/url)
//
// Le seuil peut venir du plan : la section kaizen:rollout cite le signal par son nom et son seuil,
// « **Signal** : `error_rate` > 0.01 → retour arrière ». Un seuil franchi sur `consecutive`
// échantillons de suite (2 par défaut) est une **violation** : `watch` s'arrête et le dit.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, parseFrontmatter, runBounded } from './lib.mjs';
import { parseRollout, sectionText } from './plancheck.mjs';

function stateDir(root) {
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '*\n');
  return dir;
}

// Seuils cités par la section rollout d'un plan : `nom` suivi de >, >=, <, <= et d'une valeur.
export function planThresholds(root, planPaths) {
  const out = {};
  for (const p of [].concat(planPaths || [])) Object.assign(out, thresholdsOf(root, p));
  return out;
}

function thresholdsOf(root, planPath) {
  let text;
  try {
    text = readFileSync(join(root, planPath), 'utf8');
  } catch {
    return {};
  }
  const { body } = parseFrontmatter(text);
  const signal = parseRollout(sectionText(body || text, 'rollout') || '').signal || '';
  const out = {};
  for (const m of signal.matchAll(/`([\w.-]+)`\s*(>=|<=|>|<|≥|≤)\s*(-?\d+(?:[.,]\d+)?)\s*(%?)/g)) {
    let v = Number(m[3].replace(',', '.'));
    if (m[4] === '%') v /= 100;
    const op = { '≥': '>=', '≤': '<=' }[m[2]] || m[2];
    out[m[1]] = op.startsWith('>') ? { max: v } : { min: v };
  }
  return out;
}

async function sample(name, spec, env) {
  const sub = (s) => String(s || '').replaceAll('{env}', env || '');
  const started = Date.now();
  if (spec.type === 'http') {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), (spec.timeout_seconds || 10) * 1000);
      const res = await fetch(sub(spec.url), { signal: ctrl.signal, redirect: 'manual' });
      clearTimeout(timer);
      const expect = [].concat(spec.expect ?? 200).map(Number);
      return { value: res.status, ok: expect.includes(res.status), ms: Date.now() - started, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { value: null, ok: false, ms: Date.now() - started, detail: err.name === 'AbortError' ? 'timeout' : err.message };
    }
  }
  const r = runBounded(sub(spec.command), { timeoutMs: (spec.timeout_seconds || 30) * 1000, env: { ...process.env, KAIZEN_ENV: env || '' } });
  const raw = (r.stdout || '').trim().split(/\s+/).pop();
  const value = raw !== undefined && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : null;
  if (r.status !== 0 || value === null) return { value, ok: false, ms: Date.now() - started, detail: r.timedOut ? 'timeout' : r.status !== 0 ? `commande en échec (exit ${r.status})` : `sortie non numérique : "${(r.stdout || '').trim().slice(0, 60)}"` };
  const breach = (spec.max !== undefined && value > Number(spec.max)) || (spec.min !== undefined && value < Number(spec.min));
  return { value, ok: !breach, ms: Date.now() - started, detail: breach ? `seuil franchi (${spec.max !== undefined ? `max ${spec.max}` : `min ${spec.min}`})` : 'ok' };
}

export function signalsFor(root, { env = null, plan = null } = {}) {
  const config = loadConfig(root);
  const fromPlan = planThresholds(root, plan);
  const out = {};
  for (const [name, spec] of Object.entries(config.monitor.signals || {})) {
    if (spec.env && env && ![].concat(spec.env).includes(env)) continue;
    out[name] = { ...spec, ...(fromPlan[name] || {}), threshold_source: fromPlan[name] ? 'plan' : 'config' };
  }
  const unknown = Object.keys(fromPlan).filter((n) => !out[n]);
  return { signals: out, unknown_plan_signals: unknown };
}

export async function check(root, opts = {}) {
  const { signals, unknown_plan_signals } = signalsFor(root, opts);
  const results = {};
  await Promise.all(Object.entries(signals).map(async ([name, spec]) => (results[name] = { ...(await sample(name, spec, opts.env)), threshold_source: spec.threshold_source })));
  return { at: new Date().toISOString(), env: opts.env || null, ok: Object.values(results).every((r) => r.ok), signals: results, unknown_plan_signals };
}

// Surveille pendant `minutes` ; s'arrête à la première violation confirmée (consecutive échantillons).
export async function watch(root, { env = null, plan = null, minutes, intervalSeconds, consecutive, onSample } = {}) {
  const config = loadConfig(root);
  const duration = Number(minutes ?? config.deploy.watch_minutes ?? 15) * 60000;
  const every = Number(intervalSeconds ?? config.monitor.interval_seconds ?? 60) * 1000;
  const needed = Number(consecutive ?? config.monitor.consecutive ?? 2);
  const started = Date.now();
  const streak = {};
  const samples = [];
  for (;;) {
    const c = await check(root, { env, plan });
    samples.push(c);
    appendFileSync(join(stateDir(root), 'monitor.jsonl'), `${JSON.stringify(c)}\n`);
    onSample?.(c);
    for (const [name, r] of Object.entries(c.signals)) streak[name] = r.ok ? 0 : (streak[name] || 0) + 1;
    const breached = Object.entries(streak).filter(([, n]) => n >= needed).map(([name]) => name);
    if (breached.length) {
      return { status: 'breach', env, plan, breached, detected_at: c.at, started_at: new Date(started).toISOString(), samples: samples.length, last: c };
    }
    if (!Object.keys(c.signals).length) return { status: 'no-signals', env, plan, samples: samples.length, last: c };
    if (Date.now() - started + every > duration) {
      return { status: 'healthy', env, plan, started_at: new Date(started).toISOString(), ended_at: new Date().toISOString(), samples: samples.length, last: c };
    }
    await new Promise((r) => setTimeout(r, every));
  }
}
