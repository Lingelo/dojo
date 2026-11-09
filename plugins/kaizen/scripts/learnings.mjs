// Kaizen — learnings: one durable lesson per file under <docs>/learnings/, written by /kaizen:learn and
// read back by the next cycle. The read-back does not depend on the agent remembering to search: when
// agent-skills' spec or plan is written (post-edit.mjs), the matching learnings are added to Claude's
// context.

import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { docsRoot, globToRegex, parseFrontmatter, walkMarkdown } from './lib.mjs';

export const SCHEMA = {
  bug: ['build_error', 'test_failure', 'runtime_error', 'performance_issue', 'database_issue', 'security_issue', 'ui_bug', 'integration_issue', 'logic_error'],
  knowledge: ['best_practice', 'documentation_gap', 'workflow_issue', 'developer_experience', 'architecture_pattern', 'design_pattern', 'tooling_decision', 'convention'],
  severity: ['critical', 'high', 'medium', 'low'],
  resolution_type: ['code_fix', 'migration', 'config_change', 'test_fix', 'dependency_update', 'environment_setup', 'workflow_improvement', 'documentation_update', 'tooling_addition', 'seed_data_update'],
};

export const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const rel = (root, p) => relative(root, p).split(sep).join('/');

export function validateLearning(file) {
  const errors = [];
  const { data, error } = parseFrontmatter(readFileSync(file, 'utf8'));
  if (!data) return [error];
  if (error) errors.push(error);
  for (const k of ['title', 'date', 'module', 'problem_type', 'component', 'severity']) if (isEmpty(data[k])) errors.push(`required field missing: ${k}`);
  if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date))) errors.push(`date in YYYY-MM-DD format expected: "${data.date}"`);
  const track = SCHEMA.bug.includes(data.problem_type) ? 'bug' : SCHEMA.knowledge.includes(data.problem_type) ? 'knowledge' : null;
  if (data.problem_type && !track) errors.push(`unknown problem_type: "${data.problem_type}"`);
  if (data.severity && !SCHEMA.severity.includes(data.severity)) errors.push(`unknown severity: "${data.severity}" (${SCHEMA.severity.join('|')})`);
  if (!isEmpty(data.resolution_type) && !SCHEMA.resolution_type.includes(data.resolution_type)) errors.push(`unknown resolution_type: "${data.resolution_type}"`);
  if (track === 'bug') {
    for (const k of ['symptoms', 'root_cause', 'resolution_type']) if (isEmpty(data[k])) errors.push(`bug track: required field missing: ${k}`);
    if (data.symptoms && (!Array.isArray(data.symptoms) || data.symptoms.length > 5)) errors.push('symptoms: list of 1 to 5 items');
  }
  if (track === 'knowledge' && data.applies_when && (!Array.isArray(data.applies_when) || data.applies_when.length > 5)) errors.push('applies_when: list of 5 items at most');
  if (data.tags && (!Array.isArray(data.tags) || data.tags.length > 8)) errors.push('tags: list of 8 items at most');
  if (data.files !== undefined && (!Array.isArray(data.files) || !data.files.length || data.files.some((f) => typeof f !== 'string' || !f.trim()))) errors.push('files: list of path globs');
  if (track !== 'bug' && !isEmpty(data.framework_version)) errors.push('framework_version: reserved for the bug track');
  if (data.retire_when !== undefined && (typeof data.retire_when !== 'string' || !data.retire_when.trim())) errors.push('retire_when: one string naming the change and how to check it');
  return errors;
}

export function loadLearnings(root) {
  return walkMarkdown(join(docsRoot(root), 'learnings')).map((file) => {
    const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'));
    return { file, rel: rel(root, file), data: data || {}, body };
  });
}

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'when', 'then', 'task', 'tasks', 'spec', 'plan', 'file', 'files', 'test', 'tests', 'pass', 'build', 'none', 'les', 'des', 'une', 'pour', 'avec', 'dans']);
export const termsOf = (text) => [...new Set(norm(text).split(/[^a-z0-9_]+/).filter((t) => t.length > 2 && !STOP.has(t)))];

// Learnings ranked against the terms: title and tags weigh 4, module and components 3, applies_when,
// symptoms and root cause 2, body 1; more terms matched, higher the score.
export function searchLearnings(root, terms, { limit = 8, all = loadLearnings(root) } = {}) {
  if (!terms.length) return [];
  return all
    .map((l) => {
      const d = l.data;
      const fields = [
        [norm(d.title), 4],
        [norm([].concat(d.tags || []).join(' ')), 4],
        [norm(`${d.module} ${d.component} ${[].concat(d.related_components || []).join(' ')}`), 3],
        [norm([].concat(d.applies_when || [], d.symptoms || []).join(' ')), 2],
        [norm(`${d.root_cause} ${d.problem_type}`), 2],
        [norm(l.body), 1],
      ];
      let score = 0;
      const hits = new Set();
      for (const t of terms)
        for (const [text, w] of fields)
          if (text.includes(t)) {
            score += w;
            hits.add(t);
          }
      score *= 1 + hits.size / terms.length;
      return { score: Math.round(score * 10) / 10, path: l.rel, title: d.title, problem_type: d.problem_type, module: d.module, date: d.date, severity: d.severity, matched: [...hits] };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
}

// Learnings whose `files` globs match a repository path.
export function learningsForFile(root, relFile, all = loadLearnings(root)) {
  return all.filter((l) => Array.isArray(l.data.files) && l.data.files.some((g) => globToRegex(String(g)).test(relFile)));
}
