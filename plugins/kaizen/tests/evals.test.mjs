// The end-to-end evals' runner: a model and an effort pinned for A/B runs, passed to claude -p as is.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claudeArgs, parseArgs } from '../evals/run.mjs';

test('evals: --model and --effort reach claude -p, the other arguments name scenarios', () => {
  assert.deepEqual(parseArgs(['setup-route', '--model', 'claude-sonnet-5-5', '--effort=medium', 'push-guard']), { model: 'claude-sonnet-5-5', effort: 'medium', scenarios: ['setup-route', 'push-guard'] });
  assert.deepEqual(parseArgs([]), { model: null, effort: null, scenarios: [] });
  assert.throws(() => parseArgs(['--model']), /--model needs a value/);
  assert.throws(() => parseArgs(['--effort', '--model', 'opus']), /--effort needs a value/);
  const args = claudeArgs('do it', { model: 'claude-opus-5-5', effort: 'high' });
  assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 4), ['--model', 'claude-opus-5-5', '--effort', 'high']);
  assert.equal(args[args.indexOf('-p') + 1], 'do it');
  const plain = claudeArgs('do it');
  assert.ok(!plain.includes('--model') && !plain.includes('--effort'), 'nothing pinned: the session defaults');
});
