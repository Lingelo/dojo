// Kaizen — production signals: one-off check and post-deployment watch.
//
// `.kaizen/config.json → monitor.signals.<name>` declares each signal, without depending on a tool:
//   { "type": "http", "url": "https://…/health", "expect": 200 }        availability (native)
//   { "command": "curl -s … | jq -r .value", "max": 0.01 }               any command that prints a number
//   (min / max: thresholds; `env`: restricts the signal to one environment; `{env}` replaced in command/url)
//
// The threshold may come from the plan: the kaizen:rollout section cites the signal by name and
// threshold, "**Signal**: `error_rate` > 0.01 → rollback". A threshold breached on `consecutive`
// samples in a row (2 by default) is a **breach**: `watch` stops and says so.
//
// Beyond the post-deployment window, two paths detect an incident without manual action:
// - `patrol`: a confirmed one-off check, to schedule (Claude Code routine, cron, CI workflow);
// - `alert`: translates an alert from the team's tool (Alertmanager, PagerDuty, Datadog, plain JSON),
//   received for instance through a `repository_dispatch` workflow.
// An incident is an `incident/<env>/<detection>` tag (resolved by `resolve/<env>/…` or a rollback):
// the dated detection feeds postmortem timelines and DORA time to restore.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deployments, tagDeployment } from './deploy.mjs';
import { git, loadConfig, parseFrontmatter, runBounded } from './lib.mjs';
import { parseRollout, sectionText } from './plancheck.mjs';

function stateDir(root) {
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '*\n');
  return dir;
}

// Thresholds cited by a plan's rollout section: `name` followed by >, >=, <, <= and a value.
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
  if (r.status !== 0 || value === null) return { value, ok: false, ms: Date.now() - started, detail: r.timedOut ? 'timeout' : r.status !== 0 ? `command failed (exit ${r.status})` : `non-numeric output: "${(r.stdout || '').trim().slice(0, 60)}"` };
  const breach = (spec.max !== undefined && value > Number(spec.max)) || (spec.min !== undefined && value < Number(spec.min));
  return { value, ok: !breach, ms: Date.now() - started, detail: breach ? `threshold breached (${spec.max !== undefined ? `max ${spec.max}` : `min ${spec.min}`})` : 'ok' };
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

// Watches for `minutes`; stops at the first confirmed breach (consecutive samples).
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

// Confirmed one-off check, for a scheduled run: a red signal is measured again up to `consecutive`
// samples before it counts, and a breach opens an incident (unless one is already open on this
// environment).
export async function patrol(root, { env = null, plan = null, intervalSeconds, consecutive } = {}) {
  const config = loadConfig(root);
  const every = Number(intervalSeconds ?? config.monitor.interval_seconds ?? 60) * 1000;
  const needed = Number(consecutive ?? config.monitor.consecutive ?? 2);
  const streak = {};
  let c;
  for (let i = 0; i < needed; i++) {
    if (i) await new Promise((r) => setTimeout(r, every));
    c = await check(root, { env, plan });
    appendFileSync(join(stateDir(root), 'monitor.jsonl'), `${JSON.stringify(c)}\n`);
    for (const [name, r] of Object.entries(c.signals)) streak[name] = r.ok ? 0 : (streak[name] || 0) + 1;
    if (c.ok) break;
  }
  if (!Object.keys(c.signals).length) return { status: 'no-signals', env, last: c };
  const breached = Object.entries(streak).filter(([, n]) => n >= needed).map(([name]) => name);
  const open = incidents(root, { env }).filter((i) => !i.resolved_at);
  if (!breached.length) return { status: 'healthy', env, open_incidents: open, last: c };
  const incident = openIncident(root, env, { source: 'patrol', summary: `${breached.join(', ')} out of threshold`, signals: breached });
  return { status: 'breach', env, breached, detected_at: incident.incident.detected_at, ...incident, last: c };
}

// --- Incidents ----------------------------------------------------------------------------------------

// Incidents of an environment, oldest first: detection, resolution (first `resolve` or rollback that
// follows), duration.
export function incidents(root, { env = null } = {}) {
  const all = deployments(root, { env });
  return all
    .filter((d) => d.kind === 'incident')
    .map((d) => {
      const end = all.find((x) => x.env === d.env && (x.kind === 'resolve' || x.kind === 'rollback') && x.at >= d.at);
      return {
        env: d.env,
        detected_at: d.at,
        source: d.note?.source || null,
        summary: d.note?.summary || null,
        sha: d.sha,
        tag: d.tag,
        resolved_at: end?.at || null,
        resolved_by: end ? end.kind : null,
        hours: end ? Math.round(((Date.parse(end.at) - Date.parse(d.at)) / 3600000) * 100) / 100 : null,
      };
    });
}

function requireEnv(env) {
  if (!env) throw new Error('environment required (--env, or the alert\'s env/environment label)');
  return env;
}

// Opens an incident dated at its detection, on the commit deployed in the environment at that time.
// Idempotent while the previous incident is unresolved: one outage is never counted twice.
export function openIncident(root, env, { at = new Date(), source = 'manual', summary = null, signals = null } = {}) {
  requireEnv(env);
  const open = incidents(root, { env }).find((i) => !i.resolved_at);
  if (open) return { opened: false, incident: open };
  let when = new Date(at);
  if (Number.isNaN(when.getTime())) throw new Error(`unreadable detection date: ${at}`);
  // An alert may predate the last deployment: the culprit commit is the one that was running.
  const detectedIso = when.toISOString().replace(/\.\d+Z$/, 'Z');
  const live = deployments(root, { env }).filter((d) => d.kind === 'deploy' && d.at <= detectedIso).at(-1);
  const sha = live?.sha || git(root, ['rev-parse', 'HEAD']);
  // Tags are dated to the second: an incident dated no later than the last resolution would look
  // already resolved. So it is placed right after it.
  const last = deployments(root, { env }).filter((d) => d.kind === 'resolve' || d.kind === 'rollback').at(-1);
  if (last && when.getTime() <= Date.parse(last.at)) when = new Date(Date.parse(last.at) + 1000);
  const tagged = tagDeployment(root, 'incident', env, sha, { env, source, summary, signals }, loadConfig(root), when);
  return { opened: true, ...tagged, incident: incidents(root, { env }).find((i) => i.tag === tagged.tag) };
}

export function resolveIncident(root, env, { at = new Date(), summary = null } = {}) {
  requireEnv(env);
  const open = incidents(root, { env }).filter((i) => !i.resolved_at);
  if (!open.length) return { resolved: false, reason: `no open incident on ${env}` };
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) throw new Error(`unreadable resolution date: ${at}`);
  // A resolution never precedes detection (alerting tool and machine clocks may differ).
  const first = open[0].detected_at;
  const stampAt = when.toISOString() < first ? new Date(first) : when;
  const tagged = tagDeployment(root, 'resolve', env, open.at(-1).sha, { env, summary }, loadConfig(root), stampAt);
  return { resolved: true, ...tagged, incidents: incidents(root, { env }).filter((i) => open.some((o) => o.tag === i.tag)) };
}

// --- Incoming alerts -------------------------------------------------------------------------------------

function isoOf(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 ? null : d.toISOString();
}

// Translates an alert into { action: 'open'|'resolve', at, summary, env, format }. Recognized formats:
// Prometheus Alertmanager, PagerDuty (v3 webhooks), Datadog (webhook template), plain JSON
// { status: firing|resolved, summary, at, env }.
export function parseAlert(payload) {
  const p = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!p || typeof p !== 'object') throw new Error('unreadable alert: JSON object expected');
  const firing = (s) => /^(firing|triggered|trigger|alert|open|opened|critical|error|warn(ing)?)$/i.test(String(s));
  const resolvedWord = (s) => /^(resolved|recovered|ok|closed|close)$/i.test(String(s));

  if (Array.isArray(p.alerts)) {
    const alerts = p.alerts.length ? p.alerts : [{}];
    const isFiring = (p.status || alerts[0].status) !== 'resolved';
    const times = alerts.map((a) => isoOf(isFiring ? a.startsAt : a.endsAt)).filter(Boolean).sort();
    const labels = { ...(p.commonLabels || {}), ...(alerts[0].labels || {}) };
    const names = [...new Set(alerts.map((a) => a.labels?.alertname).filter(Boolean))];
    return {
      format: 'alertmanager',
      action: isFiring ? 'open' : 'resolve',
      at: (isFiring ? times[0] : times.at(-1)) || null,
      summary: p.commonAnnotations?.summary || alerts[0].annotations?.summary || names.join(', ') || null,
      env: labels.env || labels.environment || null,
    };
  }
  if (p.event && typeof p.event === 'object' && /^incident\./.test(String(p.event.event_type || ''))) {
    const type = p.event.event_type;
    if (!/triggered|resolved/.test(type)) return { format: 'pagerduty', action: 'ignore', reason: `event ${type} ignored` };
    return {
      format: 'pagerduty',
      action: type === 'incident.resolved' ? 'resolve' : 'open',
      at: isoOf(p.event.occurred_at),
      summary: p.event.data?.title || null,
      env: p.event.data?.service?.summary || null,
    };
  }
  if (p.alert_transition !== undefined || p.transition !== undefined) {
    const t = p.alert_transition ?? p.transition;
    return {
      format: 'datadog',
      action: resolvedWord(t) ? 'resolve' : firing(t) ? 'open' : 'ignore',
      at: isoOf(p.date ?? p.last_updated),
      summary: p.title || null,
      env: p.env || p.environment || null,
    };
  }
  const status = p.status ?? p.state ?? 'firing';
  return {
    format: 'generic',
    action: resolvedWord(status) ? 'resolve' : firing(status) ? 'open' : 'ignore',
    at: isoOf(p.at ?? p.startsAt ?? p.timestamp),
    summary: p.summary || p.title || p.message || null,
    env: p.env || p.environment || null,
  };
}

export function handleAlert(root, payload, { env = null } = {}) {
  const a = parseAlert(payload);
  const target = env || a.env;
  if (a.action === 'ignore') return { alert: a, action: 'ignore' };
  const at = a.at || new Date().toISOString();
  if (a.action === 'resolve') return { alert: a, ...resolveIncident(root, target, { at, summary: a.summary }) };
  return { alert: a, ...openIncident(root, target, { at, source: `${a.format} alert`, summary: a.summary }) };
}
