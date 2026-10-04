// Kaizen — delivery metrics (DORA, approximated from git and GitHub) and loop health.
//
// DORA 2025: throughput (deployment frequency, change lead time, rework rate) and instability
// (change failure rate, time to restore). Without access to the deployment system, these values are
// **approximations** from the default branch; each metric states its method.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deployments } from './deploy.mjs';
import { defaultBranch, docsRoot, ghCommand, git, loadConfig, parseFrontmatter, usageTotal, walkMarkdown } from './lib.mjs';

const DAY = 86400 * 1000;
const FIX_RE = /^(fix|hotfix|revert)(\(|!|:)|^Revert "/i;

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round = (x, d = 1) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d);

function parseSince(since) {
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
  const plans = walkMarkdown(join(docs, 'plans'));
  const recentPlans = plans.filter((f) => {
    const d = parseFrontmatter(readFileSync(f, 'utf8')).data?.date;
    return d && Date.parse(d) >= from.getTime();
  });
  const cited = new Set();
  let exceptions = 0;
  for (const p of recentPlans) {
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(LEARNING_REF)) cited.add(m[0]);
    const cc = text.split('<!-- kaizen:constitution -->')[1]?.split(/<!-- kaizen:[a-z-]+ -->/)[0] || '';
    exceptions += (cc.match(/⚠️/g) || []).length;
  }
  // A citation in a plan says a learning was read; a citation in a commit message that reached the
  // default branch says it changed code (a unit or a review fix applying it).
  const appliedIn = new Set();
  const ref = git(root, ['rev-parse', '--verify', '--quiet', `origin/${branch}`], { allowFail: true }) ? `origin/${branch}` : branch;
  const bodies = git(root, ['log', ref, `--since=${from.toISOString()}`, '--format=%B'], { allowFail: true }) || '';
  for (const m of bodies.matchAll(LEARNING_REF)) appliedIn.add(m[0]);

  // Never cited anywhere (plans, ADRs, postmortems, commits) and older than the window: a candidate
  // for /kaizen:prune-learnings — a learning nobody reads back closes no loop.
  const everCited = new Set(appliedIn);
  for (const f of [...plans, ...walkMarkdown(join(docs, 'adr')), ...walkMarkdown(join(docs, 'postmortems'))]) {
    for (const m of readFileSync(f, 'utf8').matchAll(LEARNING_REF)) everCited.add(m[0]);
  }
  const allBodies = git(root, ['log', ref, '--format=%B', '-n', '5000'], { allowFail: true }) || '';
  for (const m of allBodies.matchAll(LEARNING_REF)) everCited.add(m[0]);
  const key = (f) => `learnings/${relative(learningsDir, f).split(sep).join('/')}`;
  const neverCited = learnings
    .filter((l) => !(l.data.date && Date.parse(l.data.date) >= from.getTime()))
    .map((l) => key(l.f))
    .filter((k) => ![...everCited].some((c) => c.endsWith(k)));

  const postmortems = walkMarkdown(join(docs, 'postmortems')).map((f) => parseFrontmatter(readFileSync(f, 'utf8')).data || {});
  const recovery = postmortems
    .filter((p) => p.detected && p.resolved && Date.parse(p.detected) >= from.getTime())
    .map((p) => (Date.parse(p.resolved) - Date.parse(p.detected)) / 3600000)
    .filter((h) => h >= 0);
  const adrs = existsSync(join(docs, 'adr')) ? walkMarkdown(join(docs, 'adr')).length : 0;
  const used = new Set([...cited, ...appliedIn]);
  return {
    learnings_total: learnings.length,
    learnings_new: learnings.filter((l) => l.data.date && Date.parse(l.data.date) >= from.getTime()).length,
    plans_new: recentPlans.length,
    learnings_cited_by_new_plans: cited.size,
    learnings_applied_in_commits: appliedIn.size,
    learning_reuse_rate: learnings.length && (recentPlans.length || appliedIn.size) ? round(used.size / learnings.length, 2) : null,
    learning_reuse_method: 'distinct learnings cited by a recent plan or a commit message in the window / existing learnings — a plan citation means "read", a commit citation means "applied"',
    learnings_never_cited: neverCited.length,
    learnings_never_cited_sample: neverCited.slice(0, 10),
    constitution_exceptions: exceptions,
    postmortems: postmortems.length,
    recovery_hours_median: round(median(recovery)),
    adrs,
  };
}

// DORA measured on real deployments (deploy/<env>/… and rollback/<env>/… tags created by
// `kaizen.mjs deploy`), when there are any in the window: frequency, commit → production lead time,
// failure rate (deployment followed by a rollback or an incident before the next one), time to
// restore (incident detection — or the deployment, with no recorded incident — → rollback or
// resolution). Incidents (`incident/<env>/…`) come from monitor watch, patrol or an alert.
function doraFromDeployments(root, from, env) {
  const all = deployments(root, { env });
  const deploys = all.filter((d) => d.kind === 'deploy');
  const inWindow = deploys.filter((d) => Date.parse(d.at) >= from.getTime());
  if (!inWindow.length) return null;
  const lead = [];
  let failed = 0;
  const restore = [];
  for (const d of inWindow) {
    const prev = deploys[deploys.indexOf(d) - 1];
    const range = prev ? `${prev.sha}..${d.sha}` : d.sha;
    const times = (git(root, ['log', '--format=%aI', range, '-n', '500'], { allowFail: true }) || '').split('\n').filter(Boolean).map(Date.parse);
    for (const t of times) lead.push((Date.parse(d.at) - t) / 3600000);
    const next = deploys[deploys.indexOf(d) + 1];
    const during = (x) => x.at >= d.at && (!next || x.at < next.at);
    const rb = all.find((x) => x.kind === 'rollback' && during(x));
    const inc = all.find((x) => x.kind === 'incident' && during(x));
    if (rb || inc) {
      failed++;
      const start = inc && (!rb || inc.at <= rb.at) ? inc.at : d.at;
      const end = all.find((x) => (x.kind === 'rollback' || x.kind === 'resolve') && x.at >= start);
      if (end) restore.push((Date.parse(end.at) - Date.parse(start)) / 3600000);
    }
  }
  const windowed = (kind) => all.filter((x) => x.kind === kind && Date.parse(x.at) >= from.getTime());
  return {
    env,
    deployments: inWindow.length,
    rollbacks: windowed('rollback').length,
    incidents: windowed('incident').length,
    lead_time_hours_median: round(median(lead.filter((h) => h >= 0))),
    change_failure_rate: round(failed / inWindow.length, 2),
    time_to_restore_hours_median: round(median(restore)),
    method: `tags deploy/${env}/…, rollback/${env}/…, incident/${env}/… and resolve/${env}/… (kaizen.mjs deploy, monitor): lead time = first commit → deployment, failure = rollback or incident before the next deployment, restore = incident detection (otherwise, deployment) → rollback or resolution`,
  };
}

// Cost of finished work/autopilot cycles (`gate off`), recorded locally: duration, quality gate
// blocks, tokens of the main session and its subagents, broken down by role (model policy). Local to
// the machine, like .kaizen/state/.
function cycleCost(root, from) {
  let lines = [];
  try {
    lines = readFileSync(join(root, '.kaizen', 'state', 'cycles.jsonl'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return null;
  }
  const cycles = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((c) => c && Date.parse(c.ended) >= from.getTime());
  if (!cycles.length) return null;
  const withUsage = cycles.filter((c) => c.usage);
  // Cycles recorded before subagent tracking only have the main session.
  const withSub = withUsage.filter((c) => c.subagents);
  const subTotal = (c) => usageTotal(c.subagents?.usage);
  const mainSum = withSub.reduce((n, c) => n + usageTotal(c.usage), 0);
  const subSum = withSub.reduce((n, c) => n + subTotal(c), 0);
  const byRole = {};
  for (const c of withSub) {
    for (const [role, u] of Object.entries(c.subagents.by_role || {})) {
      const r = (byRole[role] ||= { tokens: 0, output_tokens: 0 });
      r.tokens += usageTotal(u);
      r.output_tokens += Number(u.output_tokens) || 0;
    }
  }
  return {
    cycles: cycles.length,
    minutes_median: round(median(cycles.map((c) => c.minutes))),
    tokens_median: round(median(withUsage.map((c) => usageTotal(c.usage) + subTotal(c))), 0),
    output_tokens_median: round(median(withUsage.map((c) => (c.usage.output_tokens || 0) + (Number(c.subagents?.usage?.output_tokens) || 0))), 0),
    main_tokens_median: round(median(withUsage.map((c) => usageTotal(c.usage))), 0),
    subagent_tokens_median: withSub.length ? round(median(withSub.map(subTotal)), 0) : null,
    subagents_median: withSub.length ? round(median(withSub.map((c) => c.subagents.agents || 0)), 0) : null,
    subagent_share: mainSum + subSum ? round(subSum / (mainSum + subSum), 2) : null,
    tokens_by_role: withSub.length ? byRole : null,
    gate_blocks_total: cycles.reduce((n, c) => n + (c.gate_blocks || 0), 0),
    cycles_with_gate_block_share: round(cycles.filter((c) => c.gate_blocks > 0).length / cycles.length, 2),
    method:
      '/kaizen:work and /kaizen:autopilot cycles closed by gate off on this machine; tokens = main session + subagents ' +
      '(Claude Code <session>/subagents/ transcripts, deduplicated per message); a subagent\'s role comes from its launch ' +
      'logged by the Agent hook (agent id, otherwise start of the prompt), `unknown` without a match; share and breakdown ' +
      `computed over ${withSub.length}/${withUsage.length} recorded cycle(s) with subagents`,
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

  const real = doraFromDeployments(root, from, config.deploy.metrics_env || 'production');
  const weeksReal = real ? round(real.deployments / weeks) : null;

  return {
    window: { since, days, from: from.toISOString().slice(0, 10), default_branch: branch },
    deployments: real,
    changes: changes.length,
    throughput: {
      deployment_frequency_per_week: real ? weeksReal : round(changes.length / weeks),
      deployment_frequency_method: real ? `real deployments to ${real.env} (deploy/ tags)` : 'changes that reached the default branch (deployment proxy)',
      lead_time_hours_median: real?.lead_time_hours_median ?? round(median(leadFromPrs.length ? leadFromPrs : leadFromMerges)),
      lead_time_method: real?.lead_time_hours_median != null ? `first commit → deployment to ${real.env}` : leadFromPrs.length ? 'PR opened → merged (GitHub)' : leadFromMerges.length ? 'first commit → merge (git)' : 'unavailable (squash merges without GitHub access)',
      rework_rate: changes.length ? round(changes.filter((c) => c.fix).length / changes.length, 2) : null,
      rework_method: 'share of fix / hotfix / revert changes',
    },
    instability: {
      change_failure_rate: real ? real.change_failure_rate : nonFix ? round(failed / nonFix, 2) : null,
      change_failure_method: real ? `deployments to ${real.env} followed by a rollback` : 'changes followed within 7 days by a fix or revert touching the same files',
      time_to_restore_hours_median: real?.time_to_restore_hours_median ?? null,
    },
    batch_size: {
      lines_median: round(median(sizes), 0),
      lines_p90: sizes.length ? [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length * 0.9)] ?? null : null,
      over_limit_share: sizes.length ? round(sizes.filter((s) => s > config.pr.max_lines).length / sizes.length, 2) : null,
      max_lines: config.pr.max_lines,
      source: prs?.length ? 'GitHub PRs' : 'diffstat git',
    },
    kaizen_loop: loopHealth(root, from, branch),
    cycle_cost: cycleCost(root, from),
  };
}
