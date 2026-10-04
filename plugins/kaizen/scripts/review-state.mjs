// Kaizen — état des revues par branche, lu par le hook PreToolUse qui garde `git push`.
//
// Une revue enregistre l'arbre qu'elle a réellement lu (commité + non commité). Au moment du push, on
// compare cet arbre à HEAD : au-delà de `review.max_unreviewed_lines` lignes changées depuis, le push
// attend une nouvelle revue. Une renonciation explicite (`review waive --reason`) laisse une trace.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedLines, defaultBranch, diffBase, git, loadConfig, worktreeTree } from './lib.mjs';

export const VERDICTS = ['ready', 'reserves', 'blocked'];

function stateFile(root) {
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '*\n');
  return join(dir, 'reviews.json');
}

function readState(root) {
  try {
    return JSON.parse(readFileSync(stateFile(root), 'utf8'));
  } catch {
    return {};
  }
}

export function currentBranch(root) {
  const b = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  return b && b !== 'HEAD' ? b : null;
}

export function recordReview(root, { verdict, waive = false, reason = null, run = null } = {}) {
  const branch = currentBranch(root);
  if (!branch) throw new Error('HEAD détachée : une revue s’enregistre sur une branche');
  if (waive && !reason) throw new Error('review waive exige --reason "<instruction de l’utilisateur>"');
  if (!waive && !VERDICTS.includes(verdict)) throw new Error(`--verdict attendu : ${VERDICTS.join(' | ')}`);
  const entry = {
    branch,
    head: git(root, ['rev-parse', 'HEAD']),
    tree: worktreeTree(root),
    verdict: waive ? 'waived' : verdict,
    reason,
    run,
    at: new Date().toISOString(),
  };
  const state = readState(root);
  state[branch] = entry;
  writeFileSync(stateFile(root), `${JSON.stringify(state, null, 2)}\n`);
  return entry;
}

// Décide si l'état courant de la branche peut être poussé. Toujours { allowed, reason, ... }.
export function checkPush(root, config = loadConfig(root)) {
  if (config.review.require_before_push === false) return { allowed: true, reason: 'review.require_before_push désactivé' };
  const branch = currentBranch(root);
  if (!branch) return { allowed: true, reason: 'HEAD détachée' };
  if (branch === defaultBranch(root)) return { allowed: true, reason: 'branche par défaut (gardée par le plugin git)' };
  const base = diffBase(root);
  if (!base) return { allowed: true, reason: 'base introuvable' };
  const branchLines = changedLines(root, base, 'HEAD', config.pr.ignore);
  if (!branchLines) return { allowed: true, reason: 'aucun changement de code sur la branche' };

  const max = Number(config.review.max_unreviewed_lines ?? 80);
  const rec = readState(root)[branch];
  if (!rec) return { allowed: false, branch, reason: 'aucune revue enregistrée pour cette branche', branch_lines: branchLines };
  const since = changedLines(root, rec.tree, 'HEAD', config.pr.ignore);
  if (since === null) return { allowed: false, branch, reason: 'l’arbre relu est introuvable (historique réécrit ?)', review: rec };
  if (rec.verdict === 'blocked' && since === 0) {
    return { allowed: false, branch, reason: 'la dernière revue a rendu ⛔ et rien n’a changé depuis', review: rec, unreviewed_lines: 0 };
  }
  if (since > max) {
    return { allowed: false, branch, reason: `${since} lignes modifiées depuis la revue (plafond ${max})`, review: rec, unreviewed_lines: since };
  }
  return { allowed: true, branch, reason: rec.verdict === 'waived' ? `revue écartée par l’utilisateur : ${rec.reason}` : `revue ${rec.verdict}`, review: rec, unreviewed_lines: since };
}

export function reviewStatus(root) {
  const branch = currentBranch(root);
  return { branch, review: branch ? readState(root)[branch] || null : null, push: checkPush(root) };
}
