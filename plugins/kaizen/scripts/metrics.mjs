// Kaizen — indicateurs de livraison (DORA, approchés depuis git et GitHub) et santé de la boucle.
//
// DORA 2025 : débit (fréquence de déploiement, délai de changement, taux de reprise) et instabilité
// (taux d'échec des changements, temps de rétablissement). Sans accès au système de déploiement, ces
// valeurs sont des **approximations** depuis la branche par défaut ; chaque indicateur dit sa méthode.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defaultBranch, docsRoot, ghCommand, git, loadConfig, parseFrontmatter, walkMarkdown } from './lib.mjs';

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
  if (!m) throw new Error(`--since attendu sous la forme 30d, 12w ou 6m : "${since}"`);
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
    // Délai : du plus ancien commit de la branche fusionnée jusqu'au merge (merges uniquement).
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
  // Une citation dans un plan dit qu'une leçon a été lue ; une citation dans un message de commit arrivé
  // sur la branche par défaut dit qu'elle a changé du code (unité ou correctif de revue qui l'applique).
  const appliedIn = new Set();
  const ref = git(root, ['rev-parse', '--verify', '--quiet', `origin/${branch}`], { allowFail: true }) ? `origin/${branch}` : branch;
  const bodies = git(root, ['log', ref, `--since=${from.toISOString()}`, '--format=%B'], { allowFail: true }) || '';
  for (const m of bodies.matchAll(LEARNING_REF)) appliedIn.add(m[0]);

  // Jamais citée nulle part (plans, ADR, post-mortems, commits) et plus ancienne que la fenêtre :
  // candidate à /kaizen:prune-learnings — une leçon que personne ne relit ne referme aucune boucle.
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
    learning_reuse_method: 'leçons distinctes citées par un plan récent ou un message de commit de la fenêtre / leçons existantes — une citation de plan dit « lue », une citation de commit dit « appliquée »',
    learnings_never_cited: neverCited.length,
    learnings_never_cited_sample: neverCited.slice(0, 10),
    constitution_exceptions: exceptions,
    postmortems: postmortems.length,
    recovery_hours_median: round(median(recovery)),
    adrs,
  };
}

export function computeMetrics(root, { since = '90d', useGitHub = true } = {}) {
  const { days, from } = parseSince(since);
  const branch = defaultBranch(root);
  if (!branch) throw new Error('branche par défaut introuvable');
  const changes = changesOnDefault(root, branch, from);
  const weeks = Math.max(1, days / 7);

  // Échec de changement (approché) : un changement suivi sous 7 jours d'un fix/revert qui touche ses fichiers.
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
      deployment_frequency_method: 'changements arrivés sur la branche par défaut (proxy du déploiement)',
      lead_time_hours_median: round(median(leadFromPrs.length ? leadFromPrs : leadFromMerges)),
      lead_time_method: leadFromPrs.length ? 'ouverture → merge des PR (GitHub)' : leadFromMerges.length ? 'premier commit → merge (git)' : 'indisponible (merges squash sans accès GitHub)',
      rework_rate: changes.length ? round(changes.filter((c) => c.fix).length / changes.length, 2) : null,
      rework_method: 'part des changements de type fix / hotfix / revert',
    },
    instability: {
      change_failure_rate: nonFix ? round(failed / nonFix, 2) : null,
      change_failure_method: 'changements suivis sous 7 jours d’un fix ou revert touchant les mêmes fichiers',
    },
    batch_size: {
      lines_median: round(median(sizes), 0),
      lines_p90: sizes.length ? [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length * 0.9)] ?? null : null,
      over_limit_share: sizes.length ? round(sizes.filter((s) => s > config.pr.max_lines).length / sizes.length, 2) : null,
      max_lines: config.pr.max_lines,
      source: prs?.length ? 'PR GitHub' : 'diffstat git',
    },
    kaizen_loop: loopHealth(root, from, branch),
  };
}
