// Kaizen — reading and validating CONSTITUTION.md (kaizen-constitution/v1 contract).
//
// An article:    ### I. Test first — NON-NEGOTIABLE
//                <rule in 1 to 3 sentences>
//                **Check:** <question verifiable in the plan and in review>
//                **Exceptions:** <optional>
//
// French constitutions written before Kaizen 3.0 (« NON NÉGOCIABLE », « **Contrôle :** »,
// « ## Amendements », « Approuvé par ») are still accepted.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './lib.mjs';

export const CONSTITUTION_FILE = 'CONSTITUTION.md';

const ARTICLE_RE = /^###\s+([IVXLC]+)\.\s+(.+?)\s*$/;
const NON_NEGOTIABLE_RE = /\s*[—–-]+\s*(NON[ -]N[ÉE]GOCIABLE|NON[ -]NEGOTIABLE)\s*$/i;
// Log: "- v1.2.0 (2026-11-03) — Article IV widened. Reason: … Approved by: @alice, @bob"
const AMENDMENT_RE = /^\s*[-*]\s+v?(\d+\.\d+\.\d+)\s*\((\d{4}-\d{2}-\d{2})\)\s*[—–-]+\s*(.+)$/;
const handles = (v) => [].concat(v || []).flatMap((x) => String(x).split(/[,\s]+/)).map((x) => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
const FIELD_RE = /^\*\*(Check|Control|Contrôle|Exceptions?)\s*:\*\*\s*(.*)$/i;

export function constitutionPath(root) {
  return join(root, CONSTITUTION_FILE);
}

export function parseConstitution(text) {
  const { data, body } = parseFrontmatter(text);
  const articles = [];
  const amendments = [];
  let current = null;
  let section = null;
  for (const line of body.split(/\r?\n/)) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      section = h2[1];
      current = null;
      continue;
    }
    if (/^amend/i.test(section || '')) {
      const am = AMENDMENT_RE.exec(line);
      if (am) {
        const by = /approuv[ée]+\s+par\s*:\s*([^.]+)/i.exec(am[3]) || /approved\s+by\s*:\s*([^.]+)/i.exec(am[3]);
        amendments.push({ version: am[1], date: am[2], text: am[3].trim(), approved_by: by ? handles(by[1]) : [] });
      }
      continue;
    }
    const m = ARTICLE_RE.exec(line);
    if (m) {
      const nonNegotiable = NON_NEGOTIABLE_RE.test(m[2]);
      current = {
        id: m[1],
        title: m[2].replace(NON_NEGOTIABLE_RE, '').trim(),
        non_negotiable: nonNegotiable,
        section,
        rule: '',
        control: '',
        exceptions: '',
      };
      articles.push(current);
      continue;
    }
    if (!current) continue;
    const f = FIELD_RE.exec(line.trim());
    if (f) {
      const key = /^(contr|check)/i.test(f[1]) ? 'control' : 'exceptions';
      current[key] = f[2].trim();
      current._last = key;
    } else if (line.trim()) {
      const key = current._last || 'rule';
      current[key] = `${current[key]} ${line.trim()}`.trim();
    }
  }
  for (const a of articles) delete a._last;
  return { meta: data || {}, articles, amendments };
}

export function loadConstitution(root) {
  const file = constitutionPath(root);
  if (!existsSync(file)) return null;
  return parseConstitution(readFileSync(file, 'utf8'));
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

export function validateConstitution(c) {
  const errors = [];
  const warnings = [];
  const m = c.meta;
  if (m.artifact !== 'kaizen-constitution/v1') warnings.push('frontmatter: artifact: kaizen-constitution/v1 expected');
  if (!/^\d+\.\d+\.\d+$/.test(String(m.version || ''))) errors.push(`version in MAJOR.MINOR.PATCH format expected: "${m.version ?? ''}"`);
  for (const k of ['ratified', 'last_amended']) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m[k] || ''))) errors.push(`${k} in YYYY-MM-DD format expected: "${m[k] ?? ''}"`);
  }
  if (m.ratified && m.last_amended && String(m.last_amended) < String(m.ratified)) errors.push('last_amended is earlier than ratified');
  if (!c.articles.length) errors.push('no article (### I. Title)');
  if (c.articles.length > 12) warnings.push(`${c.articles.length} articles: beyond 12, nobody applies them all anymore`);
  c.articles.forEach((a, i) => {
    if (a.id !== ROMAN[i]) errors.push(`article ${a.id}: expected numbering ${ROMAN[i]} (continuous, no gaps)`);
    if (!a.rule) errors.push(`article ${a.id} (${a.title}): empty rule`);
    if (!a.control) errors.push(`article ${a.id} (${a.title}): **Check:** missing — a principle without a verifiable check is not applied`);
  });
  const titles = c.articles.map((a) => a.title.toLowerCase());
  titles.forEach((t, i) => {
    if (titles.indexOf(t) !== i) errors.push(`duplicate article title: "${c.articles[i].title}"`);
  });
  // Team governance (optional): as soon as `approvers` is declared, every version past ratification
  // must have an amendment in the log approved by one of them — an agent does not approve a change to
  // the rules it must follow.
  const approvers = handles(m.approvers);
  if (approvers.length) {
    if (!handles(m.ratified_by).length) warnings.push('ratified_by missing: who ratified the constitution?');
    const amendments = c.amendments || [];
    const current = amendments.filter((a) => a.version === String(m.version));
    if (String(m.version) !== '1.0.0' || amendments.length) {
      if (!current.length) errors.push(`governance: no v${m.version} amendment in "## Amendments"`);
      else if (!current.some((a) => a.approved_by.some((h) => approvers.includes(h)))) {
        errors.push(`governance: amendment v${m.version} is not approved by any declared approver (${approvers.map((h) => `@${h}`).join(', ')})`);
      }
    }
    for (const a of amendments) {
      if (a.approved_by.some((h) => /^(claude|agent|bot|ai|ia)$/.test(h))) errors.push(`governance: amendment v${a.version} approved by an agent`);
    }
  }
  if (!c.articles.some((a) => /\bia\b|\bai\b|agent/i.test(`${a.title} ${a.section}`))) {
    warnings.push('no article on AI policy (what the agent may do on its own) — recommended by DORA 2025');
  }
  return { errors, warnings };
}
