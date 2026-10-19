// kaizen perf: a declared budget, held like the checks, blind when it cannot measure.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../scripts/lib.mjs';
import { parseMetrics } from '../scripts/perf.mjs';
import { cleanup, cli, tempRepo } from './helpers.mjs';

const node = (code) => `node -e ${JSON.stringify(code)}`;
const repo = (perf) => tempRepo({ '.kaizen/config.json': { perf } });

test('within budget → pass, exit 0', () => {
  const dir = repo({ command: node('console.log("fps=61\\nframe_ms: 14.2")'), thresholds: { fps: '>= 55', frame_ms: '<= 18' } });
  const r = cli(dir, ['perf', '--json']);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.status, 'pass');
  assert.equal(r.json.metrics.frame_ms.value, 14.2);
  cleanup(dir);
});

test('a missed threshold → exit 1 with the metric (AE7)', () => {
  const dir = repo({ command: node('console.log("warming up\\nfps=41")'), thresholds: { fps: '>= 55' } });
  const r = cli(dir, ['perf']);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /over budget: fps/);
  assert.match(r.stdout, /fps = 41 \(budget >= 55\)/);
  cleanup(dir);
});

test('crash, silence or timeout → blind (exit 2), never a pass (AE7)', () => {
  for (const [perf, detail] of [
    [{ command: node('process.exit(3)'), thresholds: { fps: '>= 55' } }, /command failed \(exit 3\)/],
    [{ command: node('console.log("done")'), thresholds: { fps: '>= 55' } }, /not printed: fps/],
    [{ command: node('setTimeout(() => {}, 20000)'), timeout_seconds: 1, thresholds: { fps: '>= 55' } }, /timeout/],
  ]) {
    const dir = repo(perf);
    const r = cli(dir, ['perf', '--json']);
    assert.equal(r.code, 2);
    assert.equal(r.json.status, 'blind');
    assert.match(r.json.detail, detail);
    cleanup(dir);
  }
});

test('not configured → blind; an invalid threshold is an error', () => {
  let dir = tempRepo({ '.kaizen/config.json': {} });
  assert.equal(cli(dir, ['perf']).code, 2);
  cleanup(dir);
  dir = repo({ command: 'true', thresholds: { fps: 'fast' } });
  assert.match(cli(dir, ['perf']).stderr, /invalid perf threshold/);
  cleanup(dir);
});

test('config merge keeps the defaults; metrics parse name=value and name: value', () => {
  const dir = repo({ command: 'bench' });
  const c = loadConfig(dir);
  assert.equal(c.perf.timeout_seconds, 600);
  assert.deepEqual(c.perf.thresholds, {});
  assert.deepEqual(parseMetrics('fps=60\nnoise 3\nheap_mb: 120.5\nfps=58'), { fps: 58, heap_mb: 120.5 });
  cleanup(dir);
});
