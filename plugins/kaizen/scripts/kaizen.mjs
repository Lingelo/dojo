#!/usr/bin/env node
// Kaizen — the engine's CLI, used by Kaizen's four skills and its hooks. The workflow itself (spec, plan,
// build, test, review, ship) is agent-skills': Kaizen holds the gates around it, keeps the learnings,
// follows pull requests and measures.
//
//   node kaizen.mjs status [--json]              where the repo stands, and the next command
//   node kaizen.mjs root                         deliverable paths (JSON)
//   node kaizen.mjs init [--docs-root d] [--language en]   creates .kaizen/config.json and docs/learnings/
//   node kaizen.mjs config                       effective configuration (JSON)
//   node kaizen.mjs detect                       stack and verification commands (JSON)
//   node kaizen.mjs verify [--only test,lint] [--json]     runs the checks (exit 1 if red)
//   node kaizen.mjs doctor [--in-skill] [--json] [--strict]   are the guard rails on? exit 1 with --strict
//   node kaizen.mjs upgrade [--apply] [--json]   what this repo still has to change after a Kaizen update
//   node kaizen.mjs install settings             kaizen@dojo and agent-skills@dojo declared for every clone
//   node kaizen.mjs gate status | off             quality gate of this session (on by itself when code is edited)
//   node kaizen.mjs review status | check
//                                                 reviewed state per branch, required before git push; the review
//                                                 is agent-skills' and records itself
//   node kaizen.mjs secrets scan [--staged | --base <ref>] [--json]   possible secrets in the changes (exit 1 if any)
//   node kaizen.mjs learnings search <words…> [--limit 8] [--json] | validate [files…] | list [--retire] | stats
//   node kaizen.mjs metrics [--since 90d] [--no-github]   approximated DORA metrics, learnings reuse, friction, cost
//   node kaizen.mjs cost [item | current] [--since 90d] [--json]   what each feature or fix cost, end to end
//   node kaizen.mjs pr snapshot|watch|mark|threads|reply|resolve|comment|update-branch|overlap …   PR follow-up (pr.mjs)

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import * as prmod from './pr.mjs';
import { readAgentSkills } from './agentskills.mjs';
import { computeMetrics, parseSince, workItems } from './metrics.mjs';
import { DEFAULT_WEIGHTS, itemCosts, readLedger, workItem } from './ledger.mjs';
import { declarePlugin, doctor, formatDoctor } from './doctor.mjs';
import { isEmpty, loadLearnings, searchLearnings, termsOf, validateLearning } from './learnings.mjs';
import { formatFindings, scan as scanSecrets } from './secrets.mjs';
import { checkPush, currentBranch, reviewStatus } from './review-state.mjs';
import { applyAll, formatUpgrade, pending as pendingMigrations } from './upgrade.mjs';
import { DEFAULT_CONFIG, changedFiles, defaultBranch, detectStack, diffBase, docsRoot, git, loadConfig, readState, repoRoot, runVerify, verifyCommands, walkMarkdown } from './lib.mjs';

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  } else positional.push(a);
}

function die(msg, code = 2) {
  process.stderr.write(`kaizen: ${msg}\n`);
  process.exit(code);
}

function out(value) {
  process.stdout.write(typeof value === 'string' ? `${value}\n` : `${JSON.stringify(value, null, 2)}\n`);
}

function requireRepo() {
  const root = repoRoot();
  if (!root) die('no git repository here — Kaizen stores its deliverables in the repo.');
  return root;
}

// Paths shown POSIX-style, including on Windows: git, Node and the skills accept them as is.
const rel = (root, p) => relative(root, p).split(sep).join('/') || '.';

function ensureStateDir(root) {
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '*\n');
  return dir;
}

function paths(root) {
  const docs = docsRoot(root, loadConfig(root));
  return {
    repo: root,
    docs_root: rel(root, docs),
    learnings: rel(root, join(docs, 'learnings')),
    config_file: existsSync(join(root, '.kaizen', 'config.json')) ? '.kaizen/config.json' : null,
  };
}

function cmdInit(root) {
  const dir = join(root, '.kaizen');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'config.json');
  const created = [];
  if (!existsSync(file)) {
    const config = {
      docs_root: flags['docs-root'] || DEFAULT_CONFIG.docs_root,
      language: flags.language || DEFAULT_CONFIG.language,
      verify: {},
      gate: DEFAULT_CONFIG.gate,
      review: { require_before_push: DEFAULT_CONFIG.review.require_before_push },
    };
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    created.push('.kaizen/config.json');
  }
  ensureStateDir(root);
  const docs = docsRoot(root);
  for (const sub of ['learnings']) {
    const d = join(docs, sub);
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, '.gitkeep'), '');
      created.push(rel(root, d));
    }
  }
  // config.local.json stays personal.
  const gi = join(root, '.gitignore');
  const line = '.kaizen/config.local.json';
  const current = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  if (!current.split(/\r?\n/).includes(line)) {
    writeFileSync(gi, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`);
    created.push('.gitignore (+ .kaizen/config.local.json)');
  }
  out({ created, ...paths(root), detected: detectStack(root) });
}

function cmdVerify(root) {
  const results = runVerify(root, { only: flags.only });
  if (flags.json) out(results);
  else if (!results.length) out('No verification command detected or configured (.kaizen/config.json → verify).');
  else {
    for (const r of results) {
      out(`${r.ok ? '✔' : '✘'} ${r.name.padEnd(10)} ${r.command}  (${r.seconds}s)`);
      if (!r.ok) out(r.output.split('\n').map((l) => `    ${l}`).join('\n'));
    }
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

// ---------------------------------------------------------------------------
// learnings
// ---------------------------------------------------------------------------

function cmdLearnings(root, sub) {
  if (sub === 'validate') {
    const files = positional.slice(2).length ? positional.slice(2).map((f) => resolve(f)) : walkMarkdown(join(docsRoot(root), 'learnings'));
    let bad = 0;
    for (const f of files) {
      const errors = validateLearning(f);
      if (errors.length) {
        bad++;
        out(`✘ ${rel(root, f)}\n${errors.map((e) => `    - ${e}`).join('\n')}`);
      } else out(`✔ ${rel(root, f)}`);
    }
    if (!files.length) out('No learning to validate.');
    process.exit(bad ? 1 : 0);
  }
  const all = loadLearnings(root);
  if (sub === 'stats') {
    const count = (k) => all.reduce((acc, l) => ((acc[l.data[k] || '?'] = (acc[l.data[k] || '?'] || 0) + 1), acc), {});
    return out({ total: all.length, by_problem_type: count('problem_type'), by_component: count('component'), by_module: count('module') });
  }
  if (sub === 'search') {
    const terms = termsOf(positional.slice(2).join(' '));
    if (!terms.length) die('usage: learnings search <keywords…>');
    const found = searchLearnings(root, terms, { limit: Number(flags.limit || 8), all });
    if (flags.json) out(found);
    else if (!found.length) out(`No learning matches (${all.length} in total).`);
    else for (const r of found) out(`${String(r.score).padStart(5)}  ${r.path}  — ${r.title} [${r.problem_type}, ${r.module}]`);
    return;
  }
  if (sub === 'list') {
    // --retire: only the learnings declaring a retirement condition, for /kaizen:learn prune.
    const listed = flags.retire ? all.filter((l) => !isEmpty(l.data.retire_when)) : all;
    return out(listed.map((l) => ({ path: l.rel, title: l.data.title, problem_type: l.data.problem_type, module: l.data.module, date: l.data.date, ...(isEmpty(l.data.retire_when) ? {} : { retire_when: l.data.retire_when }) })));
  }
  die('usage: learnings search <words…> | validate [files…] | list [--retire] | stats');
}

// ---------------------------------------------------------------------------
// status — where the repo stands (read by /kaizen)
// ---------------------------------------------------------------------------

function repoStatus(root) {
  const config = loadConfig(root);
  const initialized = existsSync(join(root, '.kaizen', 'config.json'));
  const branch = currentBranch(root);
  const def = defaultBranch(root);
  const base = diffBase(root);
  const ahead = base ? Number(git(root, ['rev-list', '--count', `${base}..HEAD`], { allowFail: true }) || 0) : 0;
  const dirty = (git(root, ['status', '--porcelain'], { allowFail: true }) || '').split('\n').filter(Boolean).length;
  let learnings = 0;
  try {
    learnings = walkMarkdown(join(docsRoot(root, config), 'learnings')).length;
  } catch {}
  const as = readAgentSkills(root);
  const tasks = as.tasks ? { path: as.tasks.path, done: as.tasks.list.filter((t) => t.done).length, total: as.tasks.list.length, next: as.tasks.next ? `Task ${as.tasks.next.n}: ${as.tasks.next.title}` : null } : null;
  const gate = readState(root, 'gate.json', null);
  const review = initialized && branch ? reviewStatus(root) : null;

  // Code changed on the branch: agent-skills' planning files (the spec, tasks/) are not code to review.
  const planning = (f) => /^(docs\/)?SPEC\.md$|^tasks\//.test(f);
  const code = branch && branch !== def ? changedFiles(root, base).filter((f) => !planning(f)).length : 0;

  // Next step: the first situation that applies — the cycle's order: spec, plan, build, review, ship.
  const next = [];
  const say = (command, why) => next.push({ command, why });
  if (!initialized) say('/kaizen:setup', 'Kaizen is not initialized in this repo');
  if (gate?.active && gate.blocks) say('make the checks green', `the quality gate stopped the last turn${gate.blocks > 1 ? ` ${gate.blocks} times` : ''} (\`node $K verify\`; \`gate off\` only if the failure is outside the task)`);
  else if (tasks && tasks.done < tasks.total) say('/kaizen:build', `${tasks.done}/${tasks.total} tasks done in ${tasks.path}, next: ${tasks.next}`);
  else if (as.spec && !as.tasks) say('/kaizen:plan', `${as.spec.path} has no task list yet`);
  else if (code) {
    if (review?.review && review.push.allowed && ahead && !dirty) say('/kaizen:ship', `branch ${branch} reviewed (${review.push.reason}): push, open the PR, then /kaizen:watch`);
    else say('/kaizen:review', `branch ${branch}: ${review?.review ? review.push.reason : 'changes not reviewed yet'}${dirty ? ' (uncommitted included)' : ''}`);
  }
  if (initialized && !next.length) say('/kaizen:spec <what to build>', 'the next feature: spec, plan, build, review, ship (a bug → /kaizen:test with its reproduction)');
  return {
    repo: basename(root),
    branch,
    default_branch: def,
    ahead_of_base: ahead,
    uncommitted_files: dirty,
    initialized,
    agent_skills: { spec: as.spec?.path || null, plan: as.plan?.path || null, tasks, constraints: as.constraints?.path || null },
    learnings,
    gate: { active: Boolean(gate?.active), blocks: gate?.blocks || 0, since: gate?.since || null },
    review: review ? { verdict: review.review?.verdict || null, depth: review.review?.depth || null, push_allowed: review.push.allowed, reason: review.push.reason } : null,
    next,
  };
}

function cmdStatus(root) {
  const st = repoStatus(root);
  if (flags.json) return out(st);
  const yes = (b) => (b ? '✔' : '✘');
  out(`Kaizen — ${st.branch || 'detached HEAD'}${st.ahead_of_base ? ` (+${st.ahead_of_base} commit(s))` : ''}${st.uncommitted_files ? `, ${st.uncommitted_files} modified file(s)` : ''}`);
  out(`  ${yes(st.initialized)} initialized · ${st.learnings} learning(s)`);
  const a = st.agent_skills;
  out(`  · agent-skills: ${[a.spec, a.plan, a.tasks && `${a.tasks.path} ${a.tasks.done}/${a.tasks.total}`, a.constraints].filter(Boolean).join(' · ') || 'no SPEC.md, tasks/ nor CONSTRAINTS.md yet'}`);
  if (st.gate.active) out(`  ⚠ quality gate on since ${st.gate.since}${st.gate.blocks ? ` (${st.gate.blocks} block(s))` : ''}`);
  if (st.review) out(`  ${yes(st.review.push_allowed)} push: ${st.review.reason}`);
  out('\nNext:');
  for (const n of st.next) out(`  → ${n.command} — ${n.why}`);
}

// ---------------------------------------------------------------------------

const [cmd, sub] = positional;
try {
  switch (cmd) {
    case 'status':
      cmdStatus(requireRepo());
      break;
    case 'root':
      out(paths(requireRepo()));
      break;
    case 'init':
      cmdInit(requireRepo());
      break;
    case 'config':
      out(loadConfig(requireRepo()));
      break;
    case 'detect':
      out(verifyCommands(requireRepo()));
      break;
    case 'verify':
      cmdVerify(requireRepo());
      break;
    case 'doctor': {
      const r = doctor(requireRepo(), { inSkill: !!flags['in-skill'] });
      out(flags.json ? r : formatDoctor(r));
      if (flags.strict && r.status !== 'ok') process.exit(1);
      break;
    }
    case 'upgrade': {
      const root = requireRepo();
      if (flags.apply) {
        const result = applyAll(root);
        out(flags.json ? result : formatUpgrade(null, result));
      } else {
        const list = pendingMigrations(root);
        out(flags.json ? { pending: list } : formatUpgrade(list));
      }
      break;
    }
    case 'install': {
      const root = requireRepo();
      if (sub === 'settings') out(declarePlugin(root));
      else die('usage: install settings');
      break;
    }
    case 'gate': {
      const root = requireRepo();
      const file = join(ensureStateDir(root), 'gate.json');
      if (sub === 'status') out(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { active: false });
      else if (sub === 'off') {
        rmSync(file, { force: true });
        out({ active: false });
      } else die('usage: gate status | off   (the gate turns itself on when code is edited)');
      break;
    }
    case 'learnings':
      cmdLearnings(requireRepo(), sub);
      break;
    case 'review': {
      const root = requireRepo();
      if (sub === 'status') out(reviewStatus(root));
      else if (sub === 'check') {
        const res = checkPush(root);
        out(res);
        process.exit(res.allowed ? 0 : 1);
      } else die('usage: review status | review check');
      break;
    }
    case 'secrets': {
      const root = requireRepo();
      if (sub !== 'scan') die('usage: secrets scan [--staged | --base <ref>] [--json]');
      const ignore = loadConfig(root).secrets.ignore;
      const base = typeof flags.base === 'string' ? flags.base : null;
      // Default: everything not yet committed (index, tracked changes, untracked files).
      const scope = base ? { base } : flags.staged ? { staged: true } : { staged: true, worktree: true, untrackedFiles: true };
      const findings = scanSecrets(root, { ...scope, ignore });
      if (flags.json) out({ findings });
      else out(findings.length ? `✘ ${findings.length} possible secret(s):\n${formatFindings(findings)}` : '✔ no secret found');
      process.exit(findings.length ? 1 : 0);
    }
    case 'cost': {
      // What a feature or a fix cost, end to end: `cost` lists the work items, `cost <item>` details one,
      // `cost current` says what the turns are charged to right now.
      const root = requireRepo();
      const config = loadConfig(root);
      if (sub === 'current') {
        out(workItem(root));
        break;
      }
      const { from } = parseSince(typeof flags.since === 'string' ? flags.since : '90d');
      const weights = { ...DEFAULT_WEIGHTS, ...(config.review?.cost_weights || {}) };
      const items = itemCosts(readLedger(root).filter((e) => Date.parse(e.at) >= from.getTime()), weights);
      if (sub) {
        const it = items.find((i) => i.item.toLowerCase() === String(sub).toLowerCase() || i.item === `plan:${sub}` || i.item === `branch:${sub}`);
        if (!it) die(`no cost recorded for "${sub}" in the window (kaizen cost lists the work items)`);
        out(it);
        break;
      }
      if (flags.json) {
        out({ items, summary: workItems(root, from, config) });
        break;
      }
      if (!items.length) {
        out('No turn recorded yet: the ledger fills at the end of every turn in this repo (Stop hook).');
        break;
      }
      const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
      out(`Cost per work item (relative units, ${Object.entries(weights).map(([m, w]) => `${m} ${w}`).join(', ')})`);
      for (const it of items.slice(0, 20)) {
        out(`  ${it.item.padEnd(28)} ${it.kind.padEnd(9)} ${String(it.cost).padStart(8)}  ${k(it.tokens).padStart(6)} tokens  ${it.sessions} session(s)${it.title ? `  ${it.title}` : ''}${it.priced_share !== null && it.priced_share < 1 ? `  (${Math.round(it.priced_share * 100)}% priced)` : ''}`);
      }
      for (const [kind, v] of Object.entries(workItems(root, from, config)?.by_kind || {})) out(`  · ${kind}: median ${v.cost_median} over ${v.items} item(s)`);
      break;
    }
    case 'metrics': {
      const root = requireRepo();
      out(computeMetrics(root, { since: flags.since || '90d', useGitHub: !flags['no-github'] }));
      break;
    }
    case 'pr': {
      const root = requireRepo();
      const stateRoot = ensureStateDir(root);
      const opts = {
        pr: flags.pr,
        repo: flags.repo,
        start: Boolean(flags.start),
        budgetSeconds: flags['budget-seconds'],
        settleSeconds: flags['settle-seconds'],
        interval: flags.interval,
        thread: flags.thread,
        comment: flags.comment,
        check: flags.check,
        disposition: flags.disposition,
        note: flags.note,
        bodyFile: flags['body-file'],
        all: Boolean(flags.all),
        base: typeof flags.base === 'string' ? flags.base : undefined,
      };
      if (sub === 'watch') process.exit(await prmod.watch(stateRoot, opts));
      const handlers = {
        snapshot: () => prmod.snapshot(stateRoot, opts),
        mark: () => prmod.mark(stateRoot, opts),
        threads: () => prmod.threads(opts),
        reply: () => prmod.reply(opts),
        resolve: () => prmod.resolveThread(opts),
        comment: () => prmod.comment(opts),
        'update-branch': () => prmod.updateBranch(stateRoot, opts),
        overlap: () => prmod.overlap({ base: opts.base, cwd: root }),
      };
      if (!handlers[sub]) die('usage: pr snapshot|watch|mark|threads|reply|resolve|comment|update-branch|overlap');
      out(handlers[sub]());
      break;
    }
    default:
      out(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//   ')).map((l) => l.slice(3)).join('\n'));
      if (cmd && cmd !== 'help') process.exit(2);
  }
} catch (err) {
  die(err.message);
}
