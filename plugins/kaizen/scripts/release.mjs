// Kaizen — notes de version depuis les commits conventionnels, et proposition de version SemVer.

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { docsRoot, git, parseFrontmatter } from './lib.mjs';
import { parseRollout, sectionText } from './plancheck.mjs';

const CC_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s+(.+)$/;
const GROUPS = [
  ['feat', 'Nouveautés'],
  ['fix', 'Corrections'],
  ['perf', 'Performances'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['revert', 'Annulations'],
];

export function lastTag(root) {
  return git(root, ['describe', '--tags', '--abbrev=0'], { allowFail: true });
}

export function bump(version, level) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version || '0.0.0');
  if (!m) return null;
  let [maj, min, pat] = m.slice(1).map(Number);
  // En 0.x, un changement cassant monte le mineur (convention SemVer pour l'instable).
  if (level === 'major' && maj === 0) level = 'minor';
  if (level === 'major') return `${maj + 1}.0.0`;
  if (level === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

export function releaseNotes(root, { from, to = 'HEAD' } = {}) {
  const base = from || lastTag(root);
  const range = base ? `${base}..${to}` : to;
  const out = git(root, ['log', range, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e'], { allowFail: true }) || '';
  const rollout = rolloutOf(root, range, out);
  const entries = out
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, subject, body] = r.split('\x1f');
      const m = CC_RE.exec(subject);
      const breaking = Boolean(m?.[3]) || /BREAKING[ -]CHANGE:/.test(body || '');
      return { sha: sha.slice(0, 7), type: m?.[1]?.toLowerCase() || 'other', scope: m?.[2] || null, description: m?.[4] || subject, breaking, conventional: Boolean(m) };
    });
  const level = entries.some((e) => e.breaking) ? 'major' : entries.some((e) => e.type === 'feat') ? 'minor' : entries.length ? 'patch' : null;
  const groups = {};
  for (const [type, label] of GROUPS) {
    const items = entries.filter((e) => e.type === type);
    if (items.length) groups[label] = items;
  }
  const others = entries.filter((e) => !GROUPS.some(([t]) => t === e.type) && !['chore', 'ci', 'build', 'test', 'style'].includes(e.type));
  if (others.length) groups.Autres = others;
  return {
    from: base,
    to,
    commits: entries.length,
    non_conventional: entries.filter((e) => !e.conventional).length,
    breaking: entries.filter((e) => e.breaking),
    level,
    current: base,
    next: level ? bump(base || '0.0.0', level) : null,
    groups,
    rollout,
  };
}

// Plans livrés dans la plage : cités par un commit (« Unité U3 du plan docs/plans/… ») ou modifiés
// dans la plage. Leur section kaizen:rollout nourrit la checklist de mise en production ; un plan
// sans signal ni retour arrière est signalé avant la release, pas découvert pendant l'incident.
function rolloutOf(root, range, log) {
  let plansDir;
  try {
    plansDir = join(docsRoot(root), 'plans');
  } catch {
    return [];
  }
  const rel = relative(root, plansDir).split(sep).join('/');
  const touched = (git(root, ['log', range, '--name-only', '--format=', '--', rel], { allowFail: true }) || '').split('\n');
  const cited = [...log.matchAll(/[\w./-]*plans\/[\w./-]+\.md/g)].map((m) => m[0]);
  const paths = [...new Set([...touched, ...cited].filter(Boolean).map((p) => p.slice(p.indexOf(rel))).filter((p) => p.startsWith(rel)))];
  return paths
    .filter((p) => existsSync(join(root, p)))
    .sort()
    .map((p) => {
      const text = readFileSync(join(root, p), 'utf8');
      const { data, body } = parseFrontmatter(text);
      const section = sectionText(body || text, 'rollout');
      const r = section ? parseRollout(section) : null;
      const missing = r ? ['rollback', 'signal'].filter((k) => !r[k]) : ['rollout'];
      return { plan: p, title: data?.title || p, ...(r || {}), missing };
    });
}
