import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { MARKER, analyze } from '../scripts/pr.mjs';
import { FAKE_GH, PLUGIN, cleanup, cli, tempRepo } from './helpers.mjs';

const fixture = () => JSON.parse(readFileSync(join(PLUGIN, 'tests/fixtures/pr-state.json'), 'utf8'));
const emptyState = () => ({ threads: {}, comments: {}, checks: {}, needs_human: [], started_at: null, last_head: null });
const NOW = Date.parse('2026-10-02T12:00:00Z');

function prFrom(fx) {
  const pr = { ...fx.pr, reviewThreads: fx.pr.reviewThreadPages.flat() };
  delete pr.reviewThreadPages;
  return pr;
}

test('analyze : fils, commentaires et checks actionnables ; messages Kaizen et corps vides exclus', () => {
  const s = analyze(prFrom(fixture()), emptyState(), { now: NOW });
  assert.equal(s.verdict, 'actionable');
  assert.deepEqual(s.counts, { threads: 1, comments: 1, ci: 1 });
  assert.deepEqual(s.attention.threads.map((t) => t.id), ['T1'], 'le fil résolu T2 est exclu');
  assert.deepEqual(s.attention.comments.map((c) => c.id), ['IC1'], 'IC2 (marqueur kaizen) et la revue vide sont exclus');
  assert.equal(s.attention.checks[0].name, 'test');
});

test('analyze : un fil traité reste traité jusqu’à une nouvelle réponse externe', () => {
  const fx = fixture();
  const state = emptyState();
  state.threads.T1 = { disposition: 'dispatched', last_external_id: 'C1' };
  state.comments.IC1 = { disposition: 'dispatched', at: '2026-10-02T08:12:00Z' };
  state.checks['abc123:test'] = { disposition: 'dispatched' };
  let s = analyze(prFrom(fx), state, { now: NOW });
  assert.equal(s.verdict, 'blocked-failing');

  fx.pr.reviewThreadPages[0][0].comments.nodes.push({ id: 'C9', author: { login: 'kaizen' }, body: `Corrigé\n\n${MARKER}`, createdAt: '2026-10-02T09:00:00Z' });
  s = analyze(prFrom(fx), state, { now: NOW });
  assert.equal(s.counts.threads, 0, 'notre propre réponse ne rouvre pas le fil');

  fx.pr.reviewThreadPages[0][0].comments.nodes.push({ id: 'C10', author: { login: 'bob' }, body: 'Toujours pas', createdAt: '2026-10-02T09:05:00Z' });
  s = analyze(prFrom(fx), state, { now: NOW });
  assert.equal(s.counts.threads, 1, 'une réponse du relecteur rouvre le fil');
});

test('analyze : un commentaire modifié après traitement redevient actionnable', () => {
  const fx = fixture();
  const state = emptyState();
  state.comments.IC1 = { disposition: 'dispatched', at: '2026-10-02T08:12:00Z' };
  fx.pr.comments.nodes[0].updatedAt = '2026-10-02T10:00:00Z';
  assert.equal(analyze(prFrom(fx), state, { now: NOW }).counts.comments, 1);
});

function greenPr() {
  const fx = fixture();
  const pr = prFrom(fx);
  pr.reviewThreads = pr.reviewThreads.map((t) => ({ ...t, isResolved: true }));
  pr.comments.nodes = [];
  pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion = 'SUCCESS';
  pr.mergeStateStatus = 'CLEAN';
  return pr;
}

test('analyze : semble prête seulement après la fenêtre de silence', () => {
  const pr = greenPr();
  assert.equal(analyze(pr, emptyState(), { now: Date.parse('2026-10-02T08:12:00Z') }).verdict, 'waiting');
  const ready = analyze(pr, emptyState(), { now: NOW });
  assert.equal(ready.verdict, 'looks-ready');
  assert.ok(ready.quiet_seconds >= 300);
});

test('analyze : brouillon, BEHIND, DIRTY, approbation externe, terminal, budget', () => {
  assert.notEqual(analyze({ ...greenPr(), isDraft: true }, emptyState(), { now: NOW }).verdict, 'looks-ready');
  assert.equal(analyze({ ...greenPr(), mergeStateStatus: 'BEHIND' }, emptyState(), { now: NOW }).verdict, 'behind');
  assert.equal(analyze({ ...greenPr(), mergeStateStatus: 'DIRTY' }, emptyState(), { now: NOW }).verdict, 'conflict');
  const waiting = greenPr();
  waiting.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0] = { __typename: 'CheckRun', name: 'test', status: 'WAITING', conclusion: null };
  assert.equal(analyze(waiting, emptyState(), { now: NOW }).verdict, 'blocked-external');
  assert.equal(analyze({ ...greenPr(), state: 'MERGED' }, emptyState(), { now: NOW }).verdict, 'terminal');
  const st = { ...emptyState(), started_at: '2026-10-02T00:00:00Z' };
  assert.equal(analyze(greenPr(), st, { now: NOW, budgetSeconds: 3600 }).verdict, 'budget');
});

test('CLI pr : snapshot paginé, mark, réponse marquée, update-branch seulement si BEHIND', () => {
  const dir = tempRepo({});
  const stateFile = join(dir, 'fake-gh.json');
  writeFileSync(stateFile, readFileSync(join(PLUGIN, 'tests/fixtures/pr-state.json'), 'utf8'));
  const env = { KAIZEN_GH: FAKE_GH, FAKE_GH_STATE: stateFile };

  const snap = cli(dir, ['pr', 'snapshot', '--start'], { env });
  assert.equal(snap.code, 0, snap.stderr);
  assert.equal(snap.json.counts.threads, 1, 'la 2e page de fils (résolue) est bien lue');

  assert.equal(cli(dir, ['pr', 'mark', '--thread', 'T1', '--disposition', 'dispatched'], { env }).code, 0);
  assert.equal(cli(dir, ['pr', 'snapshot'], { env }).json.counts.threads, 0);
  assert.notEqual(cli(dir, ['pr', 'mark', '--thread', 'T1', '--disposition', 'bof'], { env }).code, 0);

  writeFileSync(join(dir, 'body.md'), 'Corrigé dans abc124.');
  assert.equal(cli(dir, ['pr', 'reply', '--thread', 'T1', '--body-file', 'body.md'], { env }).code, 0);
  assert.equal(cli(dir, ['pr', 'update-branch'], { env }).json.updated, false);

  const fx = JSON.parse(readFileSync(stateFile, 'utf8'));
  fx.pr.mergeStateStatus = 'BEHIND';
  writeFileSync(stateFile, JSON.stringify(fx));
  assert.equal(cli(dir, ['pr', 'update-branch'], { env }).json.updated, true);

  const log = JSON.parse(readFileSync(stateFile, 'utf8')).log;
  assert.ok(log.find((l) => l.op === 'reply').body.includes(MARKER), 'le marqueur kaizen est ajouté aux réponses');
  assert.equal(log.find((l) => l.op === 'update-branch').sha, 'abc123', 'le SHA de tête attendu est transmis');
  cleanup(dir);
});

test('CLI pr watch : sort immédiatement avec KAIZEN_WAKE quand il y a du travail', () => {
  const dir = tempRepo({});
  const stateFile = join(dir, 'fake-gh.json');
  writeFileSync(stateFile, readFileSync(join(PLUGIN, 'tests/fixtures/pr-state.json'), 'utf8'));
  const r = cli(dir, ['pr', 'watch', '--interval', '30'], { env: { KAIZEN_GH: FAKE_GH, FAKE_GH_STATE: stateFile } });
  assert.equal(r.code, 0);
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('KAIZEN_WAKE '));
  assert.equal(JSON.parse(line.slice('KAIZEN_WAKE '.length)).reason, 'actionable');
  cleanup(dir);
});
