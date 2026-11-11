// Kaizen — reads the files agent-skills (Addy Osmani, embedded in agent-skills/) writes in a repository, so
// that Kaizen's engine can enforce them without asking the agent to run anything:
//   SPEC.md or docs/SPEC.md   spec-driven-development: sections, boundaries (Always / Ask first / Never)
//   tasks/plan.md             planning-and-task-breakdown: the plan (path only)
//   tasks/todo.md             the tasks: number, title, acceptance, verification, dependencies, files, scope
//   CONSTRAINTS.md            constraint-driven-development: floor, enforced rows, measured, exceptions
// Read-only and tolerant: a missing file or section is an absent field, never an error — his templates
// evolve. Used by `doctor` (5.2) and the gates (5.3).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (root, rel) => {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n?/g, '\n') : null;
};

// `## Heading` → its body, up to the next heading of the same or a higher level.
function sections(text, level = 2) {
  const out = [];
  const re = new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm');
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => out.push({ title: m[1].trim(), body: text.slice(m.index + m[0].length, heads[i + 1]?.index ?? text.length) }));
  return out;
}
const bullets = (body) => [...body.matchAll(/^\s*[-*]\s+(?!\[[ xX]\])(.+)$/gm)].map((m) => m[1].trim());
const boxes = (body) => [...body.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/gm)].map((m) => ({ checked: m[1] !== ' ', text: m[2].trim() }));
const unquote = (s) => s.trim().replace(/^`(.*)`$/, '$1').trim();

// Markdown table → rows of cells (header and separator dropped).
function table(body) {
  const lines = body.split('\n').filter((l) => /^\s*\|/.test(l));
  if (lines.length < 2) return [];
  const header = lines[0].split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
  return lines.slice(2).map((l) => {
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}
// A labelled block of a task: `**Label:** inline` and/or the lines under it, up to the next label.
function field(body, label) {
  const m = new RegExp(`^\\*\\*${label}[^*]*:\\*\\*(.*)$`, 'im').exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const end = rest.search(/^\*\*[^*]+:\*\*/m);
  return { inline: m[1].trim(), block: end < 0 ? rest : rest.slice(0, end) };
}

function readSpec(root) {
  for (const rel of ['SPEC.md', 'docs/SPEC.md']) {
    const text = read(root, rel);
    if (text === null) continue;
    const secs = sections(text);
    const boundaries = { always: [], ask: [], never: [] };
    const b = secs.find((s) => /^boundaries$/i.test(s.title));
    for (const item of b ? bullets(b.body) : []) {
      const m = /^\**(Always|Ask first|Never)(?: do)?:?\**:?\s*(.+)$/i.exec(item);
      if (m) boundaries[{ always: 'always', 'ask first': 'ask', never: 'never' }[m[1].toLowerCase()]].push(m[2].trim());
    }
    const title = /^# (?:Spec:\s*)?(.+)$/m.exec(text)?.[1].trim() || null;
    return { path: rel, title, sections: secs.map((s) => s.title), boundaries };
  }
  return null;
}

function readTasks(root) {
  const text = read(root, 'tasks/todo.md');
  if (text === null) return { tasks: null, checkpoints: null };
  const list = [];
  const checkpoints = [];
  for (const s of sections(text)) {
    const task = /^Task\s+(\d+)\s*:\s*(.+)$/i.exec(s.title);
    const cp = /^Checkpoint\s*:?\s*(.*)$/i.exec(s.title);
    if (task) {
      const acceptance = boxes(field(s.body, 'Acceptance criteria')?.block || '');
      const verification = boxes(field(s.body, 'Verification')?.block || '').map((v) => ({
        ...v,
        command: /`([^`]+)`/.exec(v.text)?.[1] || null,
      }));
      const deps = field(s.body, 'Dependencies')?.inline || '';
      const files = field(s.body, 'Files likely touched');
      list.push({
        n: Number(task[1]),
        title: task[2].trim(),
        done: acceptance.length > 0 && acceptance.every((a) => a.checked),
        acceptance,
        verification,
        depends: /none/i.test(deps) ? [] : [...deps.matchAll(/\d+/g)].map((m) => Number(m[0])),
        files: files ? bullets(files.block).map(unquote).map((f) => f.replace(/\s+\(.*\)$/, '')) : [],
        scope: (field(s.body, 'Estimated scope')?.inline || '').split(/[\s:|]/)[0] || null,
      });
    } else if (cp) {
      const items = boxes(s.body);
      checkpoints.push({ title: cp[1].trim(), done: items.length > 0 && items.every((i) => i.checked) });
    }
  }
  return { tasks: { path: 'tasks/todo.md', list, next: list.find((t) => !t.done) || null }, checkpoints };
}

function readConstraints(root) {
  const text = read(root, 'CONSTRAINTS.md');
  if (text === null) return null;
  const secs = sections(text);
  const sec = (re) => secs.find((s) => re.test(s.title))?.body || '';
  const commandOf = (cell) => /`([^`]+)`/.exec(cell)?.[1] || null;
  return {
    path: 'CONSTRAINTS.md',
    floor: bullets(sec(/^floor/i)),
    enforced: table(sec(/^enforced/i)).map((r) => ({ dimension: r.dimension, rule: r.rule, command: commandOf(r['checked by'] || ''), stage: r['runs at'] })),
    measured: table(sec(/^measured/i)).map((r) => ({ metric: r.metric, today: r.today, direction: r.direction })),
    exceptions: table(sec(/^exceptions/i)).map((r) => ({ id: r.id, rule: unquote(r.rule || ''), path: unquote(r.path || ''), owner: r.owner, expires: r.expires })),
  };
}

// Everything agent-skills wrote in `root`; fields absent when their file is.
export function readAgentSkills(root) {
  const out = {};
  const spec = readSpec(root);
  if (spec) out.spec = spec;
  if (read(root, 'tasks/plan.md') !== null) out.plan = { path: 'tasks/plan.md' };
  const { tasks, checkpoints } = readTasks(root);
  if (tasks) Object.assign(out, { tasks, checkpoints });
  const constraints = readConstraints(root);
  if (constraints) out.constraints = constraints;
  return out;
}
