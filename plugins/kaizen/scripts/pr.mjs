// Kaizen — instantané déterministe d'une PR GitHub et état du suivi (watch-pr, address-feedback).
//
// L'agent garde le jugement et les modifications ; ce module fait ce que la prose fait mal :
// une lecture complète et paginée des fils de revue, des commentaires, des revues et des checks du
// commit de tête, l'état de ce qui a déjà été traité, et un veilleur qui ne réveille l'agent que
// lorsqu'il y a quelque chose à faire.
//
// Sous-commandes (via kaizen.mjs pr …) :
//   snapshot [--pr N] [--repo o/r] [--start] [--budget-seconds S] [--settle-seconds S]
//   watch    [--pr N] [--repo o/r] [--interval 150] [--settle-seconds 300]
//   mark     --thread ID | --comment ID | --check NAME  --disposition dispatched|needs-human|open [--note …]
//   threads  [--pr N] [--repo o/r] [--all]          fils de revue complets (pour address-feedback)
//   reply    --thread ID --body-file F               répond dans un fil (marqueur kaizen ajouté)
//   resolve  --thread ID                             marque un fil comme résolu
//   comment  --body-file F                           commentaire de premier niveau (marqueur ajouté)
//   update-branch                                    met à jour la branche depuis la base (si BEHIND)
//
// Variable de test : KAIZEN_GH = binaire (ou script Node .mjs/.js) à utiliser à la place de `gh`.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { ghCommand } from './lib.mjs';

export const MARKER = '<!-- kaizen -->';
const BACKSTOP_SECONDS = 3 * 24 * 3600;

function gh(args, { input } = {}) {
  try {
    const [cmd, argv] = ghCommand(args);
    return execFileSync(cmd, argv, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    const msg = String(err.stderr || err.message).trim().split('\n')[0];
    throw new Error(`gh ${args.slice(0, 2).join(' ')} : ${msg}`);
  }
}

function ghJson(args) {
  const out = gh(args);
  return out.trim() ? JSON.parse(out) : null;
}

function graphql(query, vars) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(vars)) {
    if (v === null || v === undefined) continue;
    args.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`);
  }
  const res = ghJson(args);
  if (res?.errors?.length) throw new Error(`GraphQL : ${res.errors.map((e) => e.message).join(' ; ')}`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Résolution de la PR
// ---------------------------------------------------------------------------

export function resolveTarget({ pr, repo } = {}) {
  let nameWithOwner = repo;
  if (!nameWithOwner) nameWithOwner = ghJson(['repo', 'view', '--json', 'nameWithOwner'])?.nameWithOwner;
  if (!nameWithOwner || !nameWithOwner.includes('/')) throw new Error('dépôt GitHub introuvable (passe --repo owner/name)');
  const parts = nameWithOwner.replace(/^https?:\/\/[^/]+\//, '').split('/');
  const [owner, name] = parts.slice(-2);
  let number = pr ? Number(String(pr).replace(/.*\/pull\//, '').replace(/\D.*$/, '')) : null;
  if (!number) number = ghJson(['pr', 'view', '--json', 'number', '-R', `${owner}/${name}`])?.number;
  if (!number) throw new Error('aucune PR pour la branche courante (passe --pr N)');
  return { owner, name, number };
}

const PR_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
 repository(owner:$owner,name:$name){ pullRequest(number:$number){
  number url title state isDraft updatedAt headRefName headRefOid baseRefName
  mergeable mergeStateStatus reviewDecision author{login}
  commits(last:1){nodes{commit{oid committedDate statusCheckRollup{state contexts(first:100){nodes{
   __typename
   ... on CheckRun{ name status conclusion detailsUrl startedAt completedAt checkSuite{ workflowRun{ databaseId } } }
   ... on StatusContext{ context state targetUrl createdAt }
  }}}}}}
  reviewThreads(first:100, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{
   id isResolved isOutdated path line originalLine
   comments(last:30){nodes{ id databaseId author{login} body createdAt url }}
  }}
  comments(last:60){nodes{ id databaseId author{login} body createdAt updatedAt url }}
  reviews(last:40){nodes{ id databaseId author{login} body state submittedAt updatedAt url }}
 }}}`;

export function fetchPr(target) {
  let cursor = null;
  let pr = null;
  const threads = [];
  do {
    const data = graphql(PR_QUERY, { owner: target.owner, name: target.name, number: target.number, cursor });
    const page = data?.repository?.pullRequest;
    if (!page) throw new Error(`PR #${target.number} introuvable`);
    if (!pr) pr = page;
    threads.push(...page.reviewThreads.nodes);
    cursor = page.reviewThreads.pageInfo.hasNextPage ? page.reviewThreads.pageInfo.endCursor : null;
  } while (cursor);
  pr.reviewThreads = threads;
  return pr;
}

// ---------------------------------------------------------------------------
// État local (.kaizen/state/pr/<owner>-<name>-<n>.json)
// ---------------------------------------------------------------------------

export function statePath(stateRoot, t) {
  return join(stateRoot, 'pr', `${t.owner}-${t.name}-${t.number}.json`);
}

export function loadState(file) {
  if (!existsSync(file)) return { threads: {}, comments: {}, checks: {}, needs_human: [], started_at: null, budget_seconds: null, last_head: null };
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function saveState(file, state) {
  mkdirSync(join(file, '..'), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, file); // écriture atomique
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

const PASS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const FAIL = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR', 'STALE']);

function normalizeChecks(commit) {
  const nodes = commit?.statusCheckRollup?.contexts?.nodes || [];
  return nodes.map((n) => {
    if (n.__typename === 'CheckRun') {
      const done = n.status === 'COMPLETED';
      return {
        name: n.name,
        state: !done ? (n.status === 'WAITING' ? 'waiting' : 'pending') : PASS.has(n.conclusion) ? 'pass' : FAIL.has(n.conclusion) ? 'fail' : 'pending',
        conclusion: n.conclusion,
        url: n.detailsUrl,
        run_id: n.checkSuite?.workflowRun?.databaseId ?? null,
        at: n.completedAt || n.startedAt,
      };
    }
    const st = n.state;
    return {
      name: n.context,
      state: st === 'SUCCESS' ? 'pass' : st === 'FAILURE' || st === 'ERROR' ? 'fail' : 'pending',
      conclusion: st,
      url: n.targetUrl,
      run_id: null,
      at: n.createdAt,
    };
  });
}

const isOurs = (body) => typeof body === 'string' && body.includes(MARKER);
const ts = (s) => (s ? Date.parse(s) : 0);

export function analyze(pr, state, { now = Date.now(), settleSeconds = 300, budgetSeconds } = {}) {
  const commit = pr.commits?.nodes?.[0]?.commit;
  const head = pr.headRefOid || commit?.oid;
  const checks = normalizeChecks(commit);

  // Fils non résolus : actionnables s'ils n'ont pas été traités depuis leur dernier commentaire externe.
  const threads = [];
  for (const t of pr.reviewThreads || []) {
    if (t.isResolved) continue;
    const comments = t.comments?.nodes || [];
    const last = comments.at(-1);
    const lastExternal = [...comments].reverse().find((c) => !isOurs(c.body));
    const mark = state.threads[t.id];
    const handled = mark && (mark.disposition !== 'open') && (!lastExternal || mark.last_external_id === lastExternal.id);
    threads.push({
      id: t.id,
      path: t.path,
      line: t.line ?? t.originalLine ?? null,
      outdated: t.isOutdated,
      author: comments[0]?.author?.login ?? null,
      last_author: last?.author?.login ?? null,
      last_is_ours: isOurs(last?.body),
      url: comments[0]?.url ?? null,
      excerpt: (comments[0]?.body || '').slice(0, 280),
      last_external_id: lastExternal?.id ?? null,
      disposition: handled ? mark.disposition : 'open',
    });
  }

  // Commentaires de premier niveau et corps de revues non vides, hors messages Kaizen.
  const candidates = [];
  for (const c of pr.comments?.nodes || []) {
    if (!c.body?.trim() || isOurs(c.body)) continue;
    candidates.push({ id: c.id, kind: 'comment', author: c.author?.login ?? null, url: c.url, at: c.updatedAt || c.createdAt, excerpt: c.body.slice(0, 280) });
  }
  for (const r of pr.reviews?.nodes || []) {
    if (!r.body?.trim() || isOurs(r.body)) continue;
    candidates.push({ id: r.id, kind: `review:${r.state}`, author: r.author?.login ?? null, url: r.url, at: r.updatedAt || r.submittedAt, excerpt: r.body.slice(0, 280) });
  }
  const comments = candidates.map((c) => {
    const mark = state.comments[c.id];
    const handled = mark && mark.disposition !== 'open' && mark.at === c.at;
    return { ...c, disposition: handled ? mark.disposition : 'open' };
  });

  // Checks : un échec n'est actionnable qu'une fois par commit de tête.
  const failing = checks
    .filter((c) => c.state === 'fail')
    .map((c) => ({ ...c, disposition: state.checks[`${head}:${c.name}`]?.disposition || 'open' }));
  const pending = checks.filter((c) => c.state === 'pending' || c.state === 'waiting');
  const waitingApproval = checks.filter((c) => c.state === 'waiting');

  const attention = {
    threads: threads.filter((t) => t.disposition === 'open'),
    comments: comments.filter((c) => c.disposition === 'open'),
    checks: failing.filter((c) => c.disposition === 'open'),
  };
  const counts = { threads: attention.threads.length, comments: attention.comments.length, ci: attention.checks.length };
  const needsHuman = [
    ...threads.filter((t) => t.disposition === 'needs-human').map((t) => ({ kind: 'thread', id: t.id, url: t.url })),
    ...comments.filter((c) => c.disposition === 'needs-human').map((c) => ({ kind: 'comment', id: c.id, url: c.url })),
  ];

  // Silence : depuis la dernière activité observable (commit, commentaire, revue, check).
  const activity = [
    ts(commit?.committedDate),
    ...(pr.reviewThreads || []).flatMap((t) => (t.comments?.nodes || []).map((c) => ts(c.createdAt))),
    ...(pr.comments?.nodes || []).map((c) => ts(c.updatedAt || c.createdAt)),
    ...(pr.reviews?.nodes || []).map((r) => ts(r.submittedAt)),
    ...checks.map((c) => ts(c.at)),
  ];
  const quietSeconds = Math.max(0, Math.round((now - Math.max(0, ...activity)) / 1000));

  // Mise à jour depuis la base : seulement sur signal explicite de GitHub.
  const ms = pr.mergeStateStatus;
  const branchCurrency = ms === 'BEHIND' ? { kind: 'behind', action: 'update-branch' } : ms === 'DIRTY' ? { kind: 'conflict', action: 'merge-base-locally-and-resolve' } : null;

  const budget = budgetSeconds ?? state.budget_seconds ?? 28800;
  const elapsed = state.started_at ? Math.round((now - Date.parse(state.started_at)) / 1000) : 0;
  const budgetExhausted = Boolean(state.started_at) && (elapsed >= budget || elapsed >= BACKSTOP_SECONDS);

  const checksTerminal = pending.length === 0;
  const terminal = pr.state === 'MERGED' || pr.state === 'CLOSED';
  const looksReady =
    !terminal &&
    !pr.isDraft &&
    pr.mergeable === 'MERGEABLE' &&
    (ms === 'CLEAN' || ms === 'HAS_HOOKS') &&
    checksTerminal &&
    failing.length === 0 &&
    counts.threads + counts.comments === 0 &&
    needsHuman.length === 0 &&
    !branchCurrency &&
    quietSeconds >= settleSeconds;

  let verdict;
  if (terminal) verdict = 'terminal';
  else if (budgetExhausted) verdict = 'budget';
  else if (counts.threads + counts.comments + counts.ci > 0) verdict = 'actionable';
  else if (branchCurrency) verdict = branchCurrency.kind;
  else if (looksReady) verdict = 'looks-ready';
  else if (checksTerminal && failing.length && failing.every((c) => c.disposition !== 'open')) verdict = 'blocked-failing';
  else if (waitingApproval.length && pending.length === waitingApproval.length) verdict = 'blocked-external';
  else if (needsHuman.length && checksTerminal) verdict = 'needs-human';
  else verdict = 'waiting';

  return {
    url: pr.url,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.isDraft,
    head_sha: head,
    head_changed: Boolean(state.last_head && state.last_head !== head),
    head_ref: pr.headRefName,
    base_ref: pr.baseRefName,
    mergeable: pr.mergeable,
    merge_state_status: ms,
    review_decision: pr.reviewDecision,
    checks: { total: checks.length, pass: checks.filter((c) => c.state === 'pass').length, pending: pending.length, waiting_approval: waitingApproval.length, failing },
    checks_terminal: checksTerminal,
    counts,
    attention,
    needs_human: needsHuman,
    branch_currency: branchCurrency,
    quiet_seconds: quietSeconds,
    settle_seconds: settleSeconds,
    budget: { seconds: budget, elapsed_seconds: elapsed, exhausted: budgetExhausted },
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export function snapshot(stateRoot, opts) {
  const target = resolveTarget(opts);
  const file = statePath(stateRoot, target);
  const state = loadState(file);
  if (opts.start || !state.started_at) {
    state.started_at = new Date().toISOString();
    if (opts.budgetSeconds) state.budget_seconds = Number(opts.budgetSeconds);
  }
  const pr = fetchPr(target);
  const snap = analyze(pr, state, { settleSeconds: Number(opts.settleSeconds || 300), budgetSeconds: opts.budgetSeconds ? Number(opts.budgetSeconds) : undefined });
  state.last_head = snap.head_sha;
  state.last_snapshot_at = new Date().toISOString();
  saveState(file, state);
  return { ...snap, state_file: file };
}

export function mark(stateRoot, opts) {
  const target = resolveTarget(opts);
  const file = statePath(stateRoot, target);
  const state = loadState(file);
  const disposition = opts.disposition;
  if (!['dispatched', 'needs-human', 'open'].includes(disposition)) throw new Error('--disposition dispatched|needs-human|open');
  const pr = fetchPr(target);
  const now = new Date().toISOString();
  if (opts.thread) {
    const t = pr.reviewThreads.find((x) => x.id === opts.thread);
    if (!t) throw new Error(`fil ${opts.thread} introuvable`);
    const lastExternal = [...(t.comments?.nodes || [])].reverse().find((c) => !isOurs(c.body));
    state.threads[opts.thread] = { disposition, last_external_id: lastExternal?.id ?? null, note: opts.note || null, at: now };
  } else if (opts.comment) {
    const all = [...(pr.comments?.nodes || []), ...(pr.reviews?.nodes || [])];
    const c = all.find((x) => x.id === opts.comment);
    if (!c) throw new Error(`commentaire ${opts.comment} introuvable`);
    state.comments[opts.comment] = { disposition, at: c.updatedAt || c.createdAt || c.submittedAt, note: opts.note || null };
  } else if (opts.check) {
    const head = pr.headRefOid;
    state.checks[`${head}:${opts.check}`] = { disposition, note: opts.note || null, at: now };
  } else throw new Error('--thread, --comment ou --check requis');
  saveState(file, state);
  return { ok: true, state_file: file };
}

export function threads(opts) {
  const target = resolveTarget(opts);
  const pr = fetchPr(target);
  return {
    url: pr.url,
    head_ref: pr.headRefName,
    threads: pr.reviewThreads
      .filter((t) => opts.all || !t.isResolved)
      .map((t) => ({
        id: t.id,
        resolved: t.isResolved,
        outdated: t.isOutdated,
        path: t.path,
        line: t.line ?? t.originalLine ?? null,
        comments: (t.comments?.nodes || []).map((c) => ({ id: c.id, author: c.author?.login ?? null, ours: isOurs(c.body), body: c.body, at: c.createdAt, url: c.url })),
      })),
    comments: [...(pr.comments?.nodes || []), ...(pr.reviews?.nodes || [])]
      .filter((c) => c.body?.trim() && !isOurs(c.body))
      .map((c) => ({ id: c.id, author: c.author?.login ?? null, kind: c.state ? `review:${c.state}` : 'comment', body: c.body, url: c.url })),
  };
}

function withMarker(body) {
  return body.includes(MARKER) ? body : `${body.trimEnd()}\n\n${MARKER}`;
}

export function reply(opts) {
  if (!opts.thread || !opts.bodyFile) throw new Error('--thread et --body-file requis');
  const body = withMarker(readFileSync(opts.bodyFile, 'utf8'));
  const data = graphql(
    'mutation($thread:ID!,$body:String!){ addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$thread, body:$body}){ comment{ url } } }',
    { thread: opts.thread, body },
  );
  return { url: data.addPullRequestReviewThreadReply.comment.url };
}

export function resolveThread(opts) {
  if (!opts.thread) throw new Error('--thread requis');
  const data = graphql('mutation($thread:ID!){ resolveReviewThread(input:{threadId:$thread}){ thread{ id isResolved } } }', { thread: opts.thread });
  return data.resolveReviewThread.thread;
}

export function comment(opts) {
  const target = resolveTarget(opts);
  if (!opts.bodyFile) throw new Error('--body-file requis');
  const body = withMarker(readFileSync(opts.bodyFile, 'utf8'));
  const url = gh(['pr', 'comment', String(target.number), '-R', `${target.owner}/${target.name}`, '--body-file', '-'], { input: body }).trim();
  return { url };
}

export function updateBranch(stateRoot, opts) {
  const target = resolveTarget(opts);
  const pr = fetchPr(target);
  if (pr.mergeStateStatus !== 'BEHIND') {
    return { updated: false, reason: `mergeStateStatus=${pr.mergeStateStatus} : aucune mise à jour demandée par GitHub` };
  }
  gh(['api', '-X', 'PUT', `repos/${target.owner}/${target.name}/pulls/${target.number}/update-branch`, '-f', `expected_head_sha=${pr.headRefOid}`]);
  return { updated: true, from_head: pr.headRefOid };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Veilleur : aucun token consommé ; sort avec une ligne KAIZEN_WAKE quand il y a quelque chose à faire.
export async function watch(stateRoot, opts, log = (s) => process.stdout.write(`${s}\n`)) {
  const interval = Math.max(30, Number(opts.interval || 150)) * 1000;
  let previous = null;
  for (;;) {
    let snap;
    try {
      snap = snapshot(stateRoot, { ...opts, start: false });
    } catch (err) {
      log(`KAIZEN_WAKE ${JSON.stringify({ reason: 'error', message: err.message })}`);
      return 2;
    }
    const wake = ['terminal', 'budget', 'actionable', 'behind', 'conflict', 'looks-ready'].includes(snap.verdict) ||
      (['blocked-failing', 'blocked-external', 'needs-human'].includes(snap.verdict) && snap.verdict !== previous);
    if (wake) {
      log(`KAIZEN_WAKE ${JSON.stringify({ reason: snap.verdict, url: snap.url, head: snap.head_sha, counts: snap.counts, quiet_seconds: snap.quiet_seconds, merge_state_status: snap.merge_state_status })}`);
      return 0;
    }
    previous = snap.verdict;
    await sleep(interval);
  }
}
