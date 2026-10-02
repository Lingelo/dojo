// Kaizen — notes de version depuis les commits conventionnels, et proposition de version SemVer.

import { git } from './lib.mjs';

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
  };
}
