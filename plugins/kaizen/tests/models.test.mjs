// model-hooks.mjs: the session's model recorded (SessionStart, PostModelSwitch), a warning when /kaizen:build
// starts on another model than models.build, and /kaizen:build-fork refused while off or for `auto`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN, cleanup, hook, tempRepo, writeFiles } from './helpers.mjs';

const MODEL_HOOKS = join(PLUGIN, 'scripts', 'model-hooks.mjs');
const record = (dir, payload) => hook(MODEL_HOOKS, { cwd: dir, session_id: 'S1', ...payload }, ['--record']);
const expand = (dir, command_name, extra = {}) =>
  hook(MODEL_HOOKS, { cwd: dir, session_id: 'S1', hook_event_name: 'UserPromptExpansion', expansion_type: 'slash_command', command_name, command_args: '', command_source: 'plugin', ...extra }, ['--command']);
const on = { models: { enabled: true } };
const answer = (model) => `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', model, content: [{ type: 'text', text: 'ok' }] } })}\n`;

test('the session model: SessionStart then every switch, kept per session', () => {
  const dir = tempRepo({ '.kaizen/config.json': on });
  assert.equal(record(dir, { hook_event_name: 'SessionStart', source: 'startup', model: 'claude-opus-5-5' }).code, 0);
  const state = () => JSON.parse(readFileSync(join(dir, '.kaizen/state/session-model.json'), 'utf8'));
  assert.equal(state().S1.model, 'claude-opus-5-5');
  assert.equal(state().S1.source, 'start:startup');
  record(dir, { hook_event_name: 'PostModelSwitch', from_model: 'claude-opus-5-5', to_model: 'claude-sonnet-5-5', source: 'command' });
  assert.deepEqual([state().S1.model, state().S1.source], ['claude-sonnet-5-5', 'switch:command']);
  record(dir, { hook_event_name: 'SessionStart', source: 'clear' }); // no model: nothing to record
  assert.equal(state().S1.model, 'claude-sonnet-5-5');
  cleanup(dir);
});

test('/kaizen:build on Opus with models.enabled: a warning, never a block', () => {
  const dir = tempRepo({ '.kaizen/config.json': on });
  record(dir, { hook_event_name: 'SessionStart', source: 'startup', model: 'claude-opus-5-5' });
  const r = expand(dir, 'kaizen:build');
  assert.equal(r.code, 0);
  assert.match(r.json.systemMessage, /\/kaizen:build is running on claude-opus-5-5, models\.build is sonnet: switch with `\/model sonnet`/);
  assert.match(r.json.systemMessage, /claude --model sonnet --effort medium/);
  assert.equal(r.json.decision, undefined);
  record(dir, { hook_event_name: 'PostModelSwitch', to_model: 'claude-sonnet-5-5', source: 'command' });
  assert.equal(expand(dir, 'kaizen:build').stdout, '', 'on Sonnet: silent');
  cleanup(dir);
});

test('/kaizen:build: the model read from the transcript when none was recorded; unknown → silent', () => {
  const dir = tempRepo({ '.kaizen/config.json': on });
  const transcript = join(dir, 't.jsonl');
  writeFiles(dir, { 't.jsonl': answer('claude-sonnet-5-5') + answer('claude-opus-5-5') + `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', model: '<synthetic>' } })}\n` });
  assert.match(expand(dir, 'kaizen:build', { transcript_path: transcript }).json.systemMessage, /running on claude-opus-5-5/, 'the last real answer');
  assert.equal(expand(dir, 'kaizen:build').stdout, '', 'nothing recorded, no transcript: no guess');
  cleanup(dir);
});

test('/kaizen:build: silent with models off (the default), outside a Kaizen repo, and for other commands', () => {
  const off = tempRepo({ '.kaizen/config.json': {} });
  record(off, { hook_event_name: 'SessionStart', model: 'claude-opus-5-5' });
  assert.equal(expand(off, 'kaizen:build').stdout, '');
  const bare = tempRepo({});
  assert.equal(expand(bare, 'kaizen:build', { transcript_path: join(bare, 'none.jsonl') }).stdout, '');
  const dir = tempRepo({ '.kaizen/config.json': on });
  record(dir, { hook_event_name: 'SessionStart', model: 'claude-opus-5-5' });
  assert.equal(expand(dir, 'kaizen:plan').stdout, '');
  [off, bare, dir].forEach(cleanup);
});

test('/kaizen:build-fork: refused while models.build_fork is off, and for auto; allowed for one task', () => {
  const dir = tempRepo({ '.kaizen/config.json': on });
  const off = expand(dir, 'kaizen:build-fork');
  assert.equal(off.code, 2);
  assert.match(off.stderr, /build-fork is off: set "models": \{ "build_fork": true \}/);
  const bare = tempRepo({});
  assert.equal(expand(bare, 'kaizen:build-fork').code, 2, 'off outside a Kaizen repo too');
  cleanup(bare);
  writeFiles(dir, { '.kaizen/config.json': { models: { build_fork: true } } });
  assert.equal(expand(dir, 'kaizen:build-fork').code, 0);
  for (const args of ['auto', 'ALL now']) {
    const r = expand(dir, 'kaizen:build-fork', { command_args: args });
    assert.equal(r.code, 2, args);
    assert.match(r.stderr, /cannot stop for your approval\. Run \/kaizen:build auto/);
  }
  cleanup(dir);
});

test('hooks.json: the model hooks on SessionStart, PostModelSwitch, and UserPromptExpansion for the two build commands', () => {
  const hooks = JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const commands = (event) => hooks[event].flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(commands('SessionStart').some((c) => c.endsWith('model-hooks.mjs" --record')));
  assert.ok(commands('PostModelSwitch').some((c) => c.endsWith('model-hooks.mjs" --record')));
  const [expansion] = hooks.UserPromptExpansion;
  const matcher = new RegExp(expansion.matcher);
  assert.deepEqual(['kaizen:build', 'kaizen:build-fork', 'kaizen:build-x', 'kaizen:plan'].map((n) => matcher.test(n)), [true, true, false, false]);
});
