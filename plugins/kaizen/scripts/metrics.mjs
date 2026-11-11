// Kaizen — delivery metrics (DORA, approximated from git and GitHub) and loop health.
//
// DORA 2025: throughput (deployment frequency, change lead time, rework rate) and instability
// (change failure rate, time to restore). Kaizen does not deploy:
// these values are **approximations** from the default branch and GitHub; each metric states its method.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { DEFAULT_WEIGHTS, costByKind, itemCosts, readLedger } from './ledger.mjs';
import { FRICTION, defaultBranch, docsRoot, ghCommand, git, loadConfig, parseFrontmatter, usageTotal, walkMarkdown } from './lib.mjs';

const DAY = 86400 * 1000;
const FIX_RE = /^(fix|hotfix|revert)(\(|!|:)|^Revert "/i;

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round = (x, d = 1) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d);

export function parseSince(since) {
  const m = /^(\d+)([dwm])$/.exec(since || '90d');
  if (!m) throw new Error(`--since expected as 30d, 12w or 6m: "${since}"`);
  const n = Number(m[1]) * (m[2] === 'd' ? 1 : m[2] === 'w' ? 7 : 30);
  return { days: n, from: new Date(Date.now() - n * DAY) };
}

function changesOnDefault(root, branch, from) {
  const ref = git(root, ['rev-parse', '--verify', '--quiet', `origin/${branch}`], { allowFail: true }) ? `origin/${branch}` : branch;
  const out = git(root, ['log', '--first-parent', ref, `--since=${from.toISOString()}`, '--format=%H%x09%P%x09%cI%x09%s', '-n', '1000'], { allowFail: true });
  if (!out) return [];
  return out.split('\n').map((line) => {
    const [sha, parents, date, subject] = line.split('\t');
    const ps = parents.split(' ').filter(Boolean);
    const range = ps.length > 1 ? [`${ps[0]}`, sha] : ps.length ? [`${sha}^`, sha] : null;
    let files = [];
    let lines = 0;
    if (range) {
      const ns = git(root, ['diff', '--numstat', range[0], range[1]], { allowFail: true }) || '';
      for (const l of ns.split('\n').filter(Boolean)) {
        const [a, d, f] = l.split('\t');
        files.push(f);
        if (a !== '-') lines += Number(a) + Number(d);
      }
    }
    // Lead time: from the oldest commit of the merged branch to the merge (merges only).
    let leadHours = null;
    if (ps.length > 1) {
      const first = git(root, ['log', '--format=%aI', `${ps[0]}..${ps[1]}`], { allowFail: true });
      const dates = (first || '').split('\n').filter(Boolean).map(Date.parse);
      if (dates.length) leadHours = (Date.parse(date) - Math.min(...dates)) / 3600000;
    }
    return { sha, merge: ps.length > 1, date, subject, files, lines, leadHours, fix: FIX_RE.test(subject) };
  });
}

function prsFromGitHub(from) {
  try {
    const [cmd, argv] = ghCommand(['pr', 'list', '--state', 'merged', '--limit', '300', '--search', `merged:>=${from.toISOString().slice(0, 10)}`, '--json', 'number,createdAt,mergedAt,additions,deletions,title']);
    const out = execFileSync(cmd, argv, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30000,
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const LEARNING_REF = /learnings\/[\w./-]+\.md/g;

function loopHealth(root, from, branch) {
  const config = loadConfig(root);
  let docs;
  try {
    docs = docsRoot(root, config);
  } catch {
    return null;
  }
  const learningsDir = join(docs, 'learnings');
  const learnings = walkMarkdown(learningsDir).map((f) => ({ f, data: parseFrontmatter(readFileSync(f, 'utf8')).data || {} }));
  // What plans the work: agent-skills' spec and plan.
  const plans = [join(root, 'SPEC.md'), join(root, 'docs', 'SPEC.md'), join(root, 'tasks', 'plan.md'), join(root, 'tasks', 'todo.md')].filter((f) => existsSync(f));
  // A plan touched in the window counts as recent: agent-skills' files carry no date.
  const touched = (f) => {
    const d = parseFrontmatter(readFileSync(f, 'utf8')).data?.date;
    if (d) return Date.parse(d) >= from.getTime();
    const last = git(root, ['log', '-1', '--format=%cI', '--', relative(root, f)], { allowFail: true });
    return last ? Date.parse(last) >= from.getTime() : true;
  };
  const recentPlans = plans.filter(touched);
  const cited = new Set();
  for (const p of recentPlans) for (const m of readFileSync(p, 'utf8').matchAll(LEARNING_REF)) cited.add(m[0]);
  // A citation in a plan says a learning was read; a citation in a commit message that reached the
  // default branch says it changed code.
  const appliedIn = new Set();
  const ref = git(root, ['rev-parse', '--verify', '--quiet', `origin/${branch}`], { allowFail: true }) ? `origin/${branch}` : branch;
  const bodies = git(root, ['log', ref, `--since=${from.toISOString()}`, '--format=%B'], { allowFail: true }) || '';
  for (const m of bodies.matchAll(LEARNING_REF)) appliedIn.add(m[0]);

  // Never cited anywhere (plans, commits) and older than the window: a candidate for pruning
  // (/kaizen:learn prune) — a learning nobody reads back closes no loop.
  const everCited = new Set(appliedIn);
  for (const f of plans) for (const m of readFileSync(f, 'utf8').matchAll(LEARNING_REF)) everCited.add(m[0]);
  const allBodies = git(root, ['log', ref, '--format=%B', '-n', '5000'], { allowFail: true }) || '';
  for (const m of allBodies.matchAll(LEARNING_REF)) everCited.add(m[0]);
  const key = (f) => `learnings/${relative(learningsDir, f).split(sep).join('/')}`;
  const neverCited = learnings
    .filter((l) => !(l.data.date && Date.parse(l.data.date) >= from.getTime()))
    .map((l) => key(l.f))
    .filter((k) => ![...everCited].some((c) => c.endsWith(k)));
  const used = new Set([...cited, ...appliedIn]);
  return {
    learnings_total: learnings.length,
    learnings_new: learnings.filter((l) => l.data.date && Date.parse(l.data.date) >= from.getTime()).length,
    plans_touched: recentPlans.length,
    learnings_cited_by_plans: cited.size,
    learnings_applied_in_commits: appliedIn.size,
    learning_reuse_rate: learnings.length && (recentPlans.length || appliedIn.size) ? round(used.size / learnings.length, 2) : null,
    learning_reuse_method: 'distinct learnings cited by a plan touched in the window (SPEC.md, tasks/) or by a commit message in the window / existing learnings — a plan citation means "read", a commit citation means "applied"',
    learnings_never_cited: neverCited.length,
    learnings_never_cited_sample: neverCited.slice(0, 10),
  };
}

export function computeMetrics(root, { since = '90d', useGitHub = true } = {}) {
  const { days, from } = parseSince(since);
  const branch = defaultBranch(root);
  if (!branch) throw new Error('default branch not found');
  const changes = changesOnDefault(root, branch, from);
  const weeks = Math.max(1, days / 7);

  // Change failure (approximated): a change followed within 7 days by a fix/revert touching its files.
  const chrono = [...changes].reverse();
  let failed = 0;
  chrono.forEach((c, i) => {
    if (c.fix) return;
    const t = Date.parse(c.date);
    const files = new Set(c.files);
    const followed = chrono.slice(i + 1).some((d) => d.fix && Date.parse(d.date) - t <= 7 * DAY && d.files.some((f) => files.has(f)));
    if (followed) failed++;
  });
  const nonFix = changes.filter((c) => !c.fix).length;

  const prs = useGitHub ? prsFromGitHub(from) : null;
  const leadFromPrs = prs?.map((p) => (Date.parse(p.mergedAt) - Date.parse(p.createdAt)) / 3600000).filter((h) => h >= 0) || [];
  const leadFromMerges = changes.map((c) => c.leadHours).filter((h) => h !== null);
  const sizes = prs?.length ? prs.map((p) => p.additions + p.deletions) : changes.map((c) => c.lines);
  const config = loadConfig(root);

  return {
    window: { since, days, from: from.toISOString().slice(0, 10), default_branch: branch },
    changes: changes.length,
    throughput: {
      deployment_frequency_per_week: round(changes.length / weeks),
      deployment_frequency_method: 'changes that reached the default branch (deployment proxy)',
      lead_time_hours_median: round(median(leadFromPrs.length ? leadFromPrs : leadFromMerges)),
      lead_time_method: leadFromPrs.length ? 'PR opened → merged (GitHub)' : leadFromMerges.length ? 'first commit → merge (git)' : 'unavailable (squash merges without GitHub access)',
      rework_rate: changes.length ? round(changes.filter((c) => c.fix).length / changes.length, 2) : null,
      rework_method: 'share of fix / hotfix / revert changes',
    },
    instability: {
      change_failure_rate: nonFix ? round(failed / nonFix, 2) : null,
      change_failure_method: 'changes followed within 7 days by a fix or revert touching the same files',
      time_to_restore_hours_median: null,
      time_to_restore_method: 'unavailable: Kaizen records no deployment nor incident',
    },
    batch_size: {
      lines_median: round(median(sizes), 0),
      lines_p90: sizes.length ? [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length * 0.9)] ?? null : null,
      over_limit_share: sizes.length ? round(sizes.filter((s) => s > config.pr.max_lines).length / sizes.length, 2) : null,
      max_lines: config.pr.max_lines,
      source: prs?.length ? 'GitHub PRs' : 'diffstat git',
    },
    kaizen_loop: loopHealth(root, from, branch),
    friction: friction(root, from),
    work_items: workItems(root, from, config),
  };
}

// Cost per feature, fix… end to end (ledger.mjs): the most expensive items and the median per kind.
export function workItems(root, from, config = loadConfig(root)) {
  const entries = readLedger(root).filter((e) => Date.parse(e.at) >= from.getTime());
  if (!entries.length) return null;
  const items = itemCosts(entries, { ...DEFAULT_WEIGHTS, ...(config.review?.cost_weights || {}) });
  const unattributed = items.find((i) => i.item === 'unattributed');
  const total = items.reduce((n, i) => n + i.tokens, 0);
  return {
    items: items.length - (unattributed ? 1 : 0),
    by_kind: costByKind(items),
    top: items.filter((i) => i.item !== 'unattributed').slice(0, 5).map(({ item, kind, title, cost, tokens, sessions }) => ({ item, kind, title, cost, tokens, sessions })),
    unattributed_share: total && unattributed ? Math.round((unattributed.tokens / total) * 100) / 100 : 0,
    method:
      'every turn in this repo on this machine (Stop hook, .kaizen/state/ledger.jsonl) charged to the branch\'s Jira key, ' +
      'otherwise the branch; cost = tokens per model family × review.cost_weights',
  };
}

export function readFriction(root) {
  let lines = [];
  try {
    lines = readFileSync(join(root, FRICTION), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  return lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.gate && e.kind && !Number.isNaN(Date.parse(e.at)));
}

// What the guard rails cost: every stop logged by the gates (.kaizen/state/friction.jsonl), and what
// lifted it. The question: are the gates catching real problems, or taxing the work?
export function friction(root, from) {
  const events = readFriction(root).filter((e) => Date.parse(e.at) >= from.getTime()).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!events.length) return null;
  const count = (pred) => events.filter(pred).length;
  const tally = (list, key) => list.reduce((o, e) => ((o[e[key] ?? 'other'] = (o[e[key] ?? 'other'] || 0) + 1), o), {});

  // Time stopped on push: from the first stop on a branch (Claude asked the user) to the next review
  // recorded on it. A stop never lifted in the window counts as still waiting.
  const stops = (e) => e.gate === 'push' && e.kind === 'asked';
  const waitedMinutes = [];
  const open = new Map();
  for (const e of events.filter((x) => x.gate === 'push')) {
    if (stops(e) && !open.has(e.branch)) open.set(e.branch, Date.parse(e.at));
    if (e.kind === 'review_recorded' && open.has(e.branch)) {
      waitedMinutes.push((Date.parse(e.at) - open.get(e.branch)) / 60000);
      open.delete(e.branch);
    }
    // Pushed without a review: the user's choice ends the wait too.
    if (e.kind === 'skip_confirm') open.delete(e.branch);
  }
  const stopped = events.filter(stops);
  const recorded = count((e) => e.kind === 'review_recorded');
  // The user chose "Push without a review" and Claude Code's prompt asked them to confirm it.
  const skipped = count((e) => e.gate === 'push' && e.kind === 'skip_confirm');
  const quality = events.filter((e) => e.gate === 'quality');
  const checks = {};
  for (const e of quality.filter((x) => x.kind === 'blocked')) for (const c of e.checks || []) checks[c] = (checks[c] || 0) + 1;
  return {
    events: events.length,
    push: {
      stopped: stopped.length,
      pushed_without_review: skipped,
      by_reason: tally(stopped, 'reason'),
      unblocked_median_minutes: round(median(waitedMinutes), 0),
      still_waiting: open.size,
      // Share of pushes that went out without a review (a declined prompt included) rather than after
      // one: a rising share means the review is felt as a tax.
      skip_share: recorded + skipped ? round(skipped / (recorded + skipped), 2) : null,
    },
    reviews_recorded: recorded,
    quality: { blocked: count((e) => e.gate === 'quality' && e.kind === 'blocked'), released: count((e) => e.gate === 'quality' && e.kind === 'released'), by_check: checks },
    secrets: { refused: count((e) => e.gate === 'secrets' && e.kind === 'refused'), no_verify: count((e) => e.gate === 'secrets' && e.kind === 'no_verify') },
    other_refusals: tally(events.filter((e) => e.gate === 'state'), 'gate'),
    method:
      'stops logged by the Kaizen hooks on this machine (.kaizen/state/friction.jsonl); time stopped = first push stop on a ' +
      'branch → next review recorded on it; skip share = pushes without a review (a declined prompt included) / (reviews + those)',
  };
}
