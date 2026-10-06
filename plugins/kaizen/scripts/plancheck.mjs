// Kaizen — deterministic check of a plan (kaizen-plan/v1 contract).
// Checks the structure; judging the substance is left to /kaizen:doc-review.
// French field names from plans written before Kaizen 3.0 are still accepted.

import { readFileSync } from 'node:fs';
import { isDraft } from './constitution.mjs';
import { parseFrontmatter } from './lib.mjs';

const CLARIFY_RE = /\[(NEEDS CLARIFICATION|À CLARIFIER|A CLARIFIER)\s*:[^\]]*\]/gi;

export function sectionText(body, id) {
  const start = body.indexOf(`<!-- kaizen:${id} -->`);
  if (start < 0) return null;
  const rest = body.slice(start + 1);
  const next = rest.search(/<!-- kaizen:[a-z-]+ -->/);
  return next < 0 ? rest : rest.slice(0, next);
}

function ids(text, prefix) {
  const out = new Set();
  const re = new RegExp(`(?:^|[^A-Za-z0-9])(${prefix}\\d+)(?![0-9])`, 'g');
  let m;
  while ((m = re.exec(text))) out.add(m[1]);
  return out;
}

function definedIds(text, prefix) {
  // A definition = an id at the start of a bullet or heading: "- R1.", "### U2.", "KTD1."
  const out = [];
  const re = new RegExp(`^\\s*(?:[-*]\\s+|#{2,4}\\s+)?(${prefix}\\d+)[.:]`, 'gm');
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

export function checkPlan(file, { constitution = null, stage = 'auto' } = {}) {
  const text = readFileSync(file, 'utf8');
  const { data, body, error } = parseFrontmatter(text);
  const errors = [];
  const warnings = [];
  if (!data) return { stage: 'invalid', errors: [error || 'missing frontmatter'], warnings };

  for (const k of ['title', 'type', 'date', 'topic', 'artifact']) if (!data[k]) errors.push(`frontmatter: ${k} missing`);
  if (data.artifact && data.artifact !== 'kaizen-plan/v1') errors.push(`unexpected artifact: ${data.artifact}`);
  if (data.title && !/ - Plan$/.test(data.title)) warnings.push('title: " - Plan" suffix expected');
  if ('status' in data) errors.push('status field forbidden: progress is read from git');

  const hasUnits = body.includes('<!-- kaizen:units -->');
  const detected = stage === 'auto' ? (hasUnits ? 'implementation-ready' : 'requirements') : stage;

  for (const id of ['goal', 'product']) if (!body.includes(`<!-- kaizen:${id} -->`)) errors.push(`section kaizen:${id} missing`);

  const product = sectionText(body, 'product') || '';
  const reqs = definedIds(product, 'R');
  const aes = definedIds(product, 'AE');
  if (!reqs.length) errors.push('no requirement R1… in the product contract');
  reqs.forEach((r, i) => {
    if (r !== `R${i + 1}`) errors.push(`requirements: non-continuous numbering (${r} at position ${i + 1})`);
  });
  if (new Set(reqs).size !== reqs.length) errors.push('requirements: duplicate R id');

  const clarify = body.match(CLARIFY_RE) || [];
  if (detected === 'implementation-ready' && clarify.length) {
    errors.push(`${clarify.length} [NEEDS CLARIFICATION: …] marker(s) left — an implementation-ready plan has none`);
  } else if (clarify.length) {
    warnings.push(`${clarify.length} [NEEDS CLARIFICATION: …] marker(s) to resolve before planning`);
  }
  if (/\bTBD\b|\bTODO\b|\{\{[^}]+\}\}/.test(body)) errors.push('placeholder left (TBD, TODO or {{…}})');

  const report = { stage: detected, requirements: reqs.length, acceptance_examples: aes.length, units: 0, errors, warnings };
  if (detected !== 'implementation-ready') return report;

  for (const id of ['planning', 'units', 'verification', 'done']) if (!body.includes(`<!-- kaizen:${id} -->`)) errors.push(`section kaizen:${id} missing`);
  if (!body.includes('<!-- kaizen:rollout -->')) warnings.push('section kaizen:rollout missing (rollout and rollback) — required as soon as the change reaches production');
  else {
    // Without a signal or a rollback, the release has neither a success criterion nor an emergency exit.
    const r = parseRollout(sectionText(body, 'rollout') || '');
    if (!r.rollback) warnings.push('kaizen:rollout: **Rollback** missing');
    if (!r.signal) warnings.push('kaizen:rollout: **Signal** missing (what to watch after deploying)');
    else if (!/[<>≤≥]|seuil|threshold|%|\d+\s*(ms|s|min|h)\b|au-del[àa]|plus de|more than|above|below|exceed/i.test(r.signal)) warnings.push('kaizen:rollout: **Signal** without a threshold — at what value do we roll back?');
  }

  const units = sectionText(body, 'units') || '';
  const unitIds = definedIds(units, 'U');
  report.units = unitIds.length;
  if (!unitIds.length) errors.push('no unit U1…');
  unitIds.forEach((u, i) => {
    if (u !== `U${i + 1}`) errors.push(`units: non-continuous numbering (${u} at position ${i + 1})`);
  });

  // Each unit: Covers, Files, Evidence, Verification.
  const blocks = units.split(/^#{2,4}\s+(?=U\d+[.:])/m).slice(1);
  for (const b of blocks) {
    const id = /^(U\d+)/.exec(b)?.[1] || '?';
    for (const [label, re] of [
      ['Covers', /\*\*(Covers|Couvre)\s*:/i],
      ['Files', /\*\*(Files|Fichiers)\s*:/i],
      ['Evidence', /\*\*(Evidence|Proof|Preuve)\s*:/i],
      ['Verification', /\*\*(Verification|Vérification)\s*:/i],
    ]) {
      if (!re.test(b)) errors.push(`${id}: field **${label}:** missing`);
    }
  }

  // Traceability: every R and every AE is covered by a unit.
  const covered = new Set([...ids(units, 'R'), ...ids(units, 'AE')]);
  for (const r of reqs) if (!covered.has(r)) errors.push(`${r} is not covered by any unit`);
  for (const a of aes) if (!covered.has(a)) errors.push(`${a} is not covered by any unit (no test scenario)`);
  for (const ref of covered) {
    if (/^R\d+$/.test(ref) && !reqs.includes(ref)) errors.push(`${ref} cited by a unit but not defined`);
    if (/^AE\d+$/.test(ref) && !aes.includes(ref)) errors.push(`${ref} cited by a unit but not defined`);
  }

  // Slices: one slice = one PR. Each unit belongs to a slice if slices are declared.
  const slices = [...units.matchAll(/\*\*(Slice|Tranche)\s*:\*\*\s*(\S+)/gi)].map((m) => m[2]);
  report.slices = new Set(slices).size || (unitIds.length ? 1 : 0);
  if (slices.length && slices.length !== blocks.length) warnings.push('some units have no **Slice:** while others do');

  // Constitution: every article appears in the constitution check. A draft constitution (not ratified)
  // informs but binds nobody: its gaps are warnings, never errors.
  if (constitution?.articles?.length) {
    const draft = isDraft(constitution);
    const gap = (msg) => (draft ? warnings.push(`${msg} (draft constitution: advisory)`) : errors.push(msg));
    const cc = sectionText(body, 'constitution');
    if (!cc) gap('section kaizen:constitution missing (CONSTITUTION.md exists)');
    else {
      for (const a of constitution.articles) {
        // The article is cited as "IV." at the start of a cell, bullet or line.
        const re = new RegExp(`(^|[|\\s*-])${a.id}\\.`, 'm');
        if (!re.test(cc)) gap(`constitution check: article ${a.id} (${a.title}) not assessed`);
      }
      if (/⚠️|exception/i.test(cc) && !/Justification|justifi/i.test(cc)) warnings.push('constitutional exception without a visible justification');
    }
  }
  return report;
}

// Fields of the kaizen:rollout section: "- **Exposure**: …" (may span several lines).
export function parseRollout(text) {
  const fields = { exposure: /^exposition|^exposure/i, order: /^ordre|^order/i, rollback: /^rollback|^retour arri/i, signal: /^signal/i };
  const out = { exposure: '', order: '', rollback: '', signal: '' };
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+\*\*([^*]+?)\*\*\s*:?\s*:?\s*(.*)$/.exec(line);
    if (m) {
      current = Object.keys(fields).find((k) => fields[k].test(m[1].trim())) || null;
      if (current) out[current] = m[2].replace(/^:\s*/, '').trim();
    } else if (current && /^\s+\S/.test(line)) out[current] = `${out[current]} ${line.trim()}`.trim();
    else if (!line.trim()) current = null;
  }
  return out;
}
