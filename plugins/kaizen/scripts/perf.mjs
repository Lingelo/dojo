// Kaizen — performance budget: a command the team declares prints `name=value` lines, each named
// metric is held to its threshold. Like a monitor signal, a command that crashes, times out or does not
// print a metric with a threshold is **blind** — never a pass: an unmeasured budget is not a kept one.
//
//   perf: { command: "npm run bench", timeout_seconds: 600, thresholds: { fps: ">= 55", frame_ms: "<= 18" } }
//
// Result: { status: pass|fail|blind, metrics: { name: { value, threshold, ok } }, detail }. Exit codes
// in the CLI: 0 pass, 1 fail, 2 blind (or not configured).

import { loadConfig, runBounded } from './lib.mjs';

const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '==': (a, b) => a === b };

export function parseThreshold(spec) {
  const m = /^\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(spec));
  if (!m) throw new Error(`invalid perf threshold "${spec}" (expected e.g. ">= 55")`);
  return { op: m[1], value: Number(m[2]) };
}

// `name=value` or `name: value` per line, a unit may follow (`16.7ms`); the last value of a name wins.
export function parseMetrics(stdout) {
  const out = {};
  for (const line of String(stdout).split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][\w.-]*)\s*[=:]\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?![\d.])/.exec(line);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

export function runPerf(root, config = loadConfig(root)) {
  const perf = config.perf || {};
  if (!perf.command) return { status: 'blind', configured: false, metrics: {}, detail: 'no perf.command in .kaizen/config.json' };
  const thresholds = Object.entries(perf.thresholds || {}).map(([name, spec]) => [name, spec, parseThreshold(spec)]);
  if (!thresholds.length) throw new Error('perf.thresholds is empty: name at least one metric and its threshold');
  const started = Date.now();
  const r = runBounded(perf.command, { cwd: root, env: process.env, timeoutMs: Number(perf.timeout_seconds || 600) * 1000 });
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  if (r.timedOut || r.status !== 0) {
    return { status: 'blind', configured: true, command: perf.command, seconds, metrics: {}, detail: r.timedOut ? 'timeout' : `command failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ')}` };
  }
  const values = parseMetrics(r.stdout);
  const metrics = {};
  for (const [name, spec, t] of thresholds) {
    const value = values[name];
    metrics[name] = value === undefined ? { value: null, threshold: spec, ok: false, missing: true } : { value, threshold: spec, ok: OPS[t.op](value, t.value) };
  }
  const missing = Object.keys(metrics).filter((n) => metrics[n].missing);
  if (missing.length) return { status: 'blind', configured: true, command: perf.command, seconds, metrics, detail: `metric(s) not printed: ${missing.join(', ')}` };
  const failed = Object.keys(metrics).filter((n) => !metrics[n].ok);
  return { status: failed.length ? 'fail' : 'pass', configured: true, command: perf.command, seconds, metrics, detail: failed.length ? `over budget: ${failed.join(', ')}` : 'within budget' };
}

export function formatPerf(r) {
  const icon = { pass: '✔', fail: '✘', blind: '?' };
  const lines = [`${icon[r.status]} perf ${r.status} — ${r.detail}${r.seconds !== undefined ? ` (${r.seconds}s)` : ''}`];
  for (const [n, m] of Object.entries(r.metrics)) lines.push(`    ${m.ok ? '✔' : '✘'} ${n} = ${m.value ?? '—'} (budget ${m.threshold})`);
  return lines.join('\n');
}
