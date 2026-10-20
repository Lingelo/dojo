// Kaizen — what a review will cost, before it runs.
//
// `/kaizen:review` picks its reviewers, then asks this estimate before launching them: tokens per
// reviewer and per model, in relative cost units, so the team sees the price of a selection and can trim
// it. Tokens per reviewer come from this repo's history when there is enough of it (review agents of the
// cycles closed by `gate off`, `.kaizen/state/cycles.jsonl`), otherwise from a heuristic on the diff
// size. An order of magnitude, never a bill: cache reads dominate a subagent's tokens and are cheap.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffSize, git, globToRegex, usageTotal } from './lib.mjs';
import { resolveModels } from './models.mjs';

// Relative weight of a million tokens per model. Put your blended price per million tokens here
// (`review.cost_weights`) to read the estimate in your currency.
export const DEFAULT_WEIGHTS = { haiku: 1, sonnet: 3, opus: 5 };

// Heuristic: a reviewer reads its contract, the agent prompt, the diff and the code around it.
export const BASE_TOKENS = 60000;
export const TOKENS_PER_LINE = 150;
// Agents of review roles needed in the history before trusting it over the heuristic.
export const MIN_HISTORY_AGENTS = 5;

const REVIEW_ROLES = ['review', 'review_critical'];

// Mean tokens per review agent over the recorded cycles that counted their agents per role.
export function reviewHistory(root) {
  let lines = [];
  try {
    lines = readFileSync(join(root, '.kaizen', 'state', 'cycles.jsonl'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return null;
  }
  let tokens = 0;
  let agents = 0;
  for (const line of lines) {
    let c;
    try {
      c = JSON.parse(line);
    } catch {
      continue;
    }
    for (const role of REVIEW_ROLES) {
      const u = c?.subagents?.by_role?.[role];
      if (u?.agents) {
        tokens += usageTotal(u);
        agents += u.agents;
      }
    }
  }
  return agents ? { agents, tokens_per_agent: Math.round(tokens / agents) } : null;
}

// Lines and count of the new files not yet added to git: the review reads them, `git diff` does not show them.
function untrackedLines(root, ignore) {
  const res = ignore.map(globToRegex);
  let lines = 0;
  let files = 0;
  for (const f of (git(root, ['ls-files', '--others', '--exclude-standard'], { allowFail: true }) || '').split('\n')) {
    if (!f || f.startsWith('.kaizen/') || res.some((r) => r.test(f))) continue;
    try {
      const text = readFileSync(join(root, f), 'utf8');
      if (text.includes('\0')) continue;
      lines += text.split('\n').filter(Boolean).length;
      files++;
    } catch {}
  }
  return { lines, files };
}

// reviewers: names as the review skill announces them (`correctness`, `security-reviewer`,
// `kaizen:adversarial-reviewer`). profile: the cycle's (see risk.mjs), defaults to the repo's.
export function estimateReview(root, config, { reviewers = [], profile, base } = {}) {
  const ignore = config.pr?.ignore || [];
  const size = diffSize(root, { base, ignore });
  const fresh = untrackedLines(root, ignore);
  size.total += fresh.lines;
  size.files += fresh.files;
  const models = resolveModels({ ...config, profile: profile || config.profile });
  const weights = { ...DEFAULT_WEIGHTS, ...(config.review?.cost_weights || {}) };
  // `inherit` runs on the session's model, unknown here: priced as the strongest.
  const weightOf = (model) => weights[model] ?? Math.max(...Object.values(weights));
  const history = reviewHistory(root);
  const fromHistory = history && history.agents >= MIN_HISTORY_AGENTS;
  const perReviewer = fromHistory ? history.tokens_per_agent : BASE_TOKENS + TOKENS_PER_LINE * size.total;

  const unknown = [];
  const list = [];
  for (const raw of reviewers) {
    const short = String(raw).replace(/^kaizen:/, '');
    const name = models.agents[short] ? short : models.agents[`${short}-reviewer`] ? `${short}-reviewer` : null;
    if (!name) {
      unknown.push(raw);
      continue;
    }
    const model = models.agents[name].model;
    list.push({ name, model, tokens: perReviewer, cost: round((perReviewer / 1e6) * weightOf(model)) });
  }
  const byModel = {};
  for (const r of list) {
    const m = (byModel[r.model] ||= { reviewers: 0, tokens: 0, cost: 0 });
    m.reviewers++;
    m.tokens += r.tokens;
    m.cost = round(m.cost + r.cost);
  }
  const confirmAbove = config.review?.confirm_above_cost ?? null;
  const cost = round(list.reduce((n, r) => n + r.cost, 0));
  return {
    profile: models.profile,
    lines: size.total,
    files: size.files,
    reviewers: list,
    unknown,
    total_tokens: list.reduce((n, r) => n + r.tokens, 0),
    cost,
    by_model: byModel,
    confirm: confirmAbove !== null && cost > confirmAbove,
    confirm_above_cost: confirmAbove,
    source: fromHistory ? 'history' : 'heuristic',
    method: fromHistory
      ? `mean of ${history.agents} review agent(s) recorded in this repo's cycles (does not scale with the diff)`
      : `${BASE_TOKENS} + ${TOKENS_PER_LINE} × ${size.total} changed line(s) per reviewer${history ? ` (history: ${history.agents}/${MIN_HISTORY_AGENTS} agents, not enough yet)` : ''}`,
    weights,
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
