// Kaizen — amending a plan without hand edits, and marking it reviewed.
//
// IDs are stable and append-only: a new requirement takes the next free number at the end of the
// requirements, so no citation anywhere (plan, commits, ADRs, PRs) ever changes; replacing keeps the
// number. Each amendment is recorded in the frontmatter (`amended:`, one quoted
// "<date> | <by> | <R id> | <reason>" per amendment), like `deepened:`. `reviewed: "<date> <hash>"`
// records the review of the plan body, so a later edit — amended or by hand — shows. Every change is
// validated with the plan check and nothing is written when it adds an error.

import { readFileSync, writeFileSync } from 'node:fs';
import { bodyHash, checkPlanText } from './plancheck.mjs';
import { parseFrontmatter } from './lib.mjs';

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const REQ_LINE = /^(\s*(?:[-*]\s+)?)(R(\d+))[.:]/;

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
const quote = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Sets `key: value` (scalar) or appends `value` to the `key:` list in the frontmatter.
function setFront(text, key, value, { list = false } = {}) {
  const m = FRONT.exec(text);
  if (!m) throw new Error('missing frontmatter');
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = m[1].split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  if (list) {
    const item = `  - ${quote(value)}`;
    if (at < 0) lines.push(`${key}:`, item);
    else {
      let end = at + 1;
      while (end < lines.length && /^\s+-/.test(lines[end])) end++;
      lines.splice(end, 0, item);
    }
  } else if (at < 0) lines.push(`${key}: ${quote(value)}`);
  else lines[at] = `${key}: ${quote(value)}`;
  return `---${nl}${lines.join(nl)}${nl}---${nl}${text.slice(m[0].length)}`;
}

// Line range [start, end) of the product section, and of each requirement inside it.
function requirements(lines) {
  const start = lines.findIndex((l) => l.includes('<!-- kaizen:product -->'));
  if (start < 0) throw new Error('section kaizen:product missing');
  let end = lines.findIndex((l, i) => i > start && /<!-- kaizen:[a-z-]+ -->/.test(l));
  if (end < 0) end = lines.length;
  const reqs = [];
  for (let i = start; i < end; i++) {
    const m = REQ_LINE.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    // A requirement continues on its indented lines.
    while (j < end && /^\s+\S/.test(lines[j]) && !REQ_LINE.test(lines[j])) j++;
    reqs.push({ id: m[2], n: Number(m[3]), prefix: m[1], start: i, end: j });
  }
  return reqs;
}

function validated(file, before, after) {
  const known = new Set(checkPlanText(before).errors);
  const added = checkPlanText(after).errors.filter((e) => !known.has(e));
  if (added.length) throw new Error(`amendment refused, nothing written: ${added.join('; ')}`);
  writeFileSync(file, after);
}

function addCover(lines, unit, id) {
  const head = lines.findIndex((l) => new RegExp(`^#{2,4}\\s+${unit}[.:]`).test(l));
  if (head < 0) throw new Error(`${unit} not found in the units`);
  for (let i = head + 1; i < lines.length && !/^#{2,4}\s/.test(lines[i]) && !/<!-- kaizen:/.test(lines[i]); i++) {
    if (/\*\*(Covers|Couvre)\s*:\*\*/i.test(lines[i])) {
      lines[i] = `${lines[i].replace(/\s+$/, '')}, ${id}`;
      return;
    }
  }
  throw new Error(`${unit} has no **Covers:** line`);
}

export function amendPlan(file, { addReq = null, replaceReq = null, text = null, coveredBy = [], by, reason, date = today() } = {}) {
  if (!by || !reason) throw new Error('plan amend requires --by "<who decided>" and --reason "<why>"');
  if (!addReq === !replaceReq) throw new Error('plan amend: --add-req "<text>" or --replace-req R<n> "<text>"');
  const before = readFileSync(file, 'utf8');
  const nl = before.includes('\r\n') ? '\r\n' : '\n';
  const lines = before.split(/\r?\n/);
  const reqs = requirements(lines);
  if (!reqs.length) throw new Error('no requirement to amend after');
  let id;
  if (addReq) {
    const last = reqs.at(-1);
    id = `R${Math.max(...reqs.map((r) => r.n)) + 1}`;
    lines.splice(last.end, 0, `${last.prefix}${id}. ${oneLine(addReq)}`);
  } else {
    const r = reqs.find((x) => x.id === replaceReq);
    if (!r) throw new Error(`${replaceReq} not found in the product contract`);
    if (!oneLine(text || '')) throw new Error('--replace-req needs the new text');
    id = r.id;
    lines.splice(r.start, r.end - r.start, `${r.prefix}${id}. ${oneLine(text)}`);
  }
  for (const u of coveredBy) addCover(lines, u, id);
  const after = setFront(lines.join(nl), 'amended', `${date} | ${oneLine(by)} | ${id} | ${oneLine(reason)}`, { list: true });
  validated(file, before, after);
  return { file, id, action: addReq ? 'added' : 'replaced', covered_by: coveredBy };
}

export function markReviewed(file, { date = today() } = {}) {
  const before = readFileSync(file, 'utf8');
  if (!parseFrontmatter(before).data) throw new Error('missing frontmatter');
  // The hash covers the body only: writing the mark does not change it.
  const hash = bodyHash(before);
  writeFileSync(file, setFront(before, 'reviewed', `${date} ${hash}`));
  return { file, reviewed: date, hash };
}
