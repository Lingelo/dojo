// Kaizen — état des revues par branche, lu par le hook PreToolUse qui garde `git push`.
//
// Une revue enregistre l'arbre qu'elle a réellement lu (commité + non commité). Au moment du push, on
// compare cet arbre à HEAD : au-delà de `review.max_unreviewed_lines` lignes changées depuis, le push
// attend une nouvelle revue.
//
// Ce qui ne repose pas sur la parole de l'agent :
// - **Preuve de revue.** Le hook PostToolUse sur l'outil Agent consigne chaque relecteur de code Kaizen
//   réellement lancé (`review-evidence.json`). `review record` exige au moins un relecteur lancé depuis
//   la revue précédente de la branche — sauf revue légère (diff de la branche ≤ LIGHT_MAX_LINES), que
//   la skill fait sans sous-agents, et sauf mise à jour après correctifs (≤ max_unreviewed_lines
//   depuis l'arbre relu, relecteurs repris de la revue précédente).
// - **Renonciation humaine.** `review waive` ne crée qu'une demande en attente, avec un code. Seul un
//   message de l'utilisateur contenant `kaizen waive <code>` (hook UserPromptSubmit) la confirme.
//
// Limite assumée : ces garde-fous arrêtent l'oubli et la dérive, pas un agent décidé à les contourner
// (le hook PreToolUse refuse toutefois l'écriture directe de ces fichiers d'état).

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedLines, defaultBranch, diffBase, git, loadConfig, worktreeTree } from './lib.mjs';

export const VERDICTS = ['ready', 'reserves', 'blocked'];
export const LIGHT_MAX_LINES = 20;
const EVIDENCE_MAX_AGE_MS = 12 * 3600 * 1000;
const WAIVER_MAX_AGE_MS = 30 * 60 * 1000;
// Fichiers d'état que seuls le CLI et les hooks écrivent (le hook PreToolUse en refuse l'écriture directe).
export const PROTECTED_STATE = ['reviews.json', 'review-evidence.json', 'waivers.json'];

function stateDir(root) {
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '*\n');
  return dir;
}

function readJson(root, name, fallback) {
  try {
    return JSON.parse(readFileSync(join(stateDir(root), name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(root, name, value) {
  writeFileSync(join(stateDir(root), name), `${JSON.stringify(value, null, 2)}\n`);
}

export function currentBranch(root) {
  const b = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  return b && b !== 'HEAD' ? b : null;
}

function branchLines(root, config) {
  const base = diffBase(root);
  return base ? changedLines(root, base, 'HEAD', config.pr.ignore) ?? 0 : 0;
}

function snapshot(root, branch) {
  return { branch, head: git(root, ['rev-parse', 'HEAD']), tree: worktreeTree(root) };
}

// --- Preuves : relecteurs réellement lancés -------------------------------------------------------

// Relecteur de code Kaizen dans un appel de l'outil Agent : `kaizen:<nom>-reviewer` (hors relecteurs
// de plan), ou `general-purpose` avec le prompt de la skill review (repli prévu par les conventions).
export function reviewerOf(toolInput = {}) {
  const type = String(toolInput.subagent_type || '');
  const m = /^kaizen:([a-z-]+-reviewer)$/.exec(type);
  if (m) return m[1].startsWith('plan-') ? null : m[1];
  const prompt = String(toolInput.prompt || '');
  if (prompt.includes('<contexte-de-revue>')) {
    const r = /Relecteur\s*:\s*(?:kaizen:)?([a-z-]+)/.exec(prompt);
    if (r && !r[1].startsWith('plan-')) return r[1].endsWith('-reviewer') ? r[1] : `${r[1]}-reviewer`;
  }
  return null;
}

export function addEvidence(root, { reviewer, session = null, model = null }) {
  const now = Date.now();
  const list = readJson(root, 'review-evidence.json', []).filter((e) => now - Date.parse(e.at) < EVIDENCE_MAX_AGE_MS);
  list.push({ reviewer, model, session, at: new Date(now).toISOString() });
  writeJson(root, 'review-evidence.json', list);
}

function evidenceSince(root, since) {
  const from = Math.max(since ? Date.parse(since) : 0, Date.now() - EVIDENCE_MAX_AGE_MS);
  return readJson(root, 'review-evidence.json', []).filter((e) => Date.parse(e.at) > from);
}

// --- Enregistrement d'une revue -------------------------------------------------------------------

export function recordReview(root, { verdict, run = null } = {}) {
  const branch = currentBranch(root);
  if (!branch) throw new Error('HEAD détachée : une revue s’enregistre sur une branche');
  if (!VERDICTS.includes(verdict)) throw new Error(`--verdict attendu : ${VERDICTS.join(' | ')}`);
  const config = loadConfig(root);
  const state = readJson(root, 'reviews.json', {});
  const previous = state[branch];
  const evidence = evidenceSince(root, previous?.at);
  const reviewers = [...new Set(evidence.map((e) => e.reviewer))].sort();
  // Modèle réellement demandé pour chaque relecteur (paramètre `model` de l'appel Agent, sinon celui
  // de la définition de l'agent).
  const models = Object.fromEntries(evidence.map((e) => [e.reviewer, e.model || 'défaut de l’agent']));
  const lines = branchLines(root, config);
  // Mise à jour après les correctifs de la revue elle-même : sans nouveau relecteur, seulement si ce qui
  // a changé depuis l'arbre relu reste sous le plafond de lignes non relues.
  const tree = worktreeTree(root);
  const sincePrevious = previous && previous.verdict !== 'waived' ? changedLines(root, previous.tree, tree, config.pr.ignore) : null;
  const max = Number(config.review.max_unreviewed_lines ?? 80);
  if (!reviewers.length && sincePrevious !== null && sincePrevious <= max) {
    const entry = { ...snapshot(root, branch), verdict, depth: 'mise à jour', reviewers: previous.reviewers || [], run: run || previous.run || null, updated_lines: sincePrevious, at: new Date().toISOString() };
    state[branch] = entry;
    writeJson(root, 'reviews.json', state);
    return entry;
  }
  if (!reviewers.length && lines > LIGHT_MAX_LINES) {
    throw new Error(
      `aucun relecteur Kaizen lancé depuis la dernière revue de ${branch} (${lines} lignes sur la branche, ` +
        `revue légère seulement jusqu’à ${LIGHT_MAX_LINES}) : lance /kaizen:review, qui exécute les relecteurs, avant d’enregistrer`,
    );
  }
  const entry = { ...snapshot(root, branch), verdict, depth: reviewers.length ? 'agents' : 'légère', reviewers, models, run, at: new Date().toISOString() };
  state[branch] = entry;
  writeJson(root, 'reviews.json', state);
  return entry;
}

// --- Renonciation : demandée par l'agent, confirmée par l'utilisateur ------------------------------

export function requestWaiver(root, { reason }) {
  const branch = currentBranch(root);
  if (!branch) throw new Error('HEAD détachée : une renonciation porte sur une branche');
  if (!reason) throw new Error('review waive exige --reason "<demande de l’utilisateur>"');
  const code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const now = Date.now();
  const pending = readJson(root, 'waivers.json', []).filter((w) => now - Date.parse(w.at) < WAIVER_MAX_AGE_MS && w.branch !== branch);
  pending.push({ code, reason, ...snapshot(root, branch), at: new Date(now).toISOString() });
  writeJson(root, 'waivers.json', pending);
  return {
    pending: true,
    branch,
    code,
    expires_in_minutes: WAIVER_MAX_AGE_MS / 60000,
    instruction: `Demande à l’utilisateur de taper lui-même : kaizen waive ${code}`,
  };
}

// Appelée par le hook UserPromptSubmit : seul un message de l'utilisateur atteint ce chemin.
export function confirmWaiver(root, code, { session = null } = {}) {
  const now = Date.now();
  const pending = readJson(root, 'waivers.json', []);
  const w = pending.find((x) => x.code === String(code).toUpperCase() && now - Date.parse(x.at) < WAIVER_MAX_AGE_MS);
  if (!w) return null;
  const state = readJson(root, 'reviews.json', {});
  const entry = {
    branch: w.branch,
    head: w.head,
    tree: w.tree,
    verdict: 'waived',
    reason: w.reason,
    reviewers: [],
    confirmed_by: 'utilisateur (message)',
    session,
    at: new Date(now).toISOString(),
  };
  state[w.branch] = entry;
  writeJson(root, 'reviews.json', state);
  writeJson(root, 'waivers.json', pending.filter((x) => x !== w));
  return entry;
}

// --- Décision au moment du push --------------------------------------------------------------------

// Décide si l'état courant de la branche peut être poussé. Toujours { allowed, reason, ... }.
export function checkPush(root, config = loadConfig(root)) {
  if (config.review.require_before_push === false) return { allowed: true, reason: 'review.require_before_push désactivé' };
  const branch = currentBranch(root);
  if (!branch) return { allowed: true, reason: 'HEAD détachée' };
  if (branch === defaultBranch(root)) return { allowed: true, reason: 'branche par défaut (gardée par le plugin git)' };
  if (!diffBase(root)) return { allowed: true, reason: 'base introuvable' };
  const lines = branchLines(root, config);
  if (!lines) return { allowed: true, reason: 'aucun changement de code sur la branche' };

  const max = Number(config.review.max_unreviewed_lines ?? 80);
  const rec = readJson(root, 'reviews.json', {})[branch];
  if (!rec) return { allowed: false, branch, reason: 'aucune revue enregistrée pour cette branche', branch_lines: lines };
  const since = changedLines(root, rec.tree, 'HEAD', config.pr.ignore);
  if (since === null) return { allowed: false, branch, reason: 'l’arbre relu est introuvable (historique réécrit ?)', review: rec };
  if (rec.verdict === 'blocked' && since === 0) {
    return { allowed: false, branch, reason: 'la dernière revue a rendu ⛔ et rien n’a changé depuis', review: rec, unreviewed_lines: 0 };
  }
  if (since > max) {
    return { allowed: false, branch, reason: `${since} lignes modifiées depuis la revue (plafond ${max})`, review: rec, unreviewed_lines: since };
  }
  const reason = rec.verdict === 'waived' ? `revue écartée par l’utilisateur : ${rec.reason}` : `revue ${rec.verdict} (${rec.depth === 'légère' ? 'légère' : rec.reviewers.join(', ')})`;
  return { allowed: true, branch, reason, review: rec, unreviewed_lines: since };
}

export function reviewStatus(root) {
  const branch = currentBranch(root);
  const pending = readJson(root, 'waivers.json', []).filter((w) => w.branch === branch && Date.now() - Date.parse(w.at) < WAIVER_MAX_AGE_MS);
  return {
    branch,
    review: branch ? readJson(root, 'reviews.json', {})[branch] || null : null,
    pending_waiver: pending.length ? { reason: pending[0].reason, at: pending[0].at } : null,
    push: checkPush(root),
  };
}
