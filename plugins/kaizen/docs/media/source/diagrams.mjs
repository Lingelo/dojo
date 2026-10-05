#!/usr/bin/env node
// Kaizen documentation diagrams — reproducible SVG sources.
//
//   node plugins/kaizen/docs/media/source/diagrams.mjs        # writes docs/media/diagrams/*.svg
//
// Each diagram is declared with a few helpers (box, arrow, text, region) on a fixed grid. The SVGs carry
// their own opaque background and a dark palette (prefers-color-scheme), so they stay readable on light
// and dark pages. No dependency.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'diagrams');

const STYLE = `
  .bg { fill: #fbfaf7; stroke: #e4e0d8; }
  text { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; fill: #1f2328; }
  .title { font-size: 18px; font-weight: 700; }
  .desc { font-size: 12.5px; fill: #5c6370; }
  .label { font-size: 13.5px; font-weight: 600; }
  .t12 { font-size: 12px; }
  .sub { font-size: 11.5px; fill: #5c6370; }
  .small { font-size: 11px; fill: #5c6370; }
  .edge { font-size: 11px; fill: #5c6370; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .skill { fill: #fdf1ea; stroke: #d97757; }
  .artifact { fill: #edf2fb; stroke: #5b7fbf; }
  .gate { fill: #fdeeee; stroke: #c94a4a; }
  .agent { fill: #ecf6ef; stroke: #3f8f5a; }
  .outside { fill: #f3f0fa; stroke: #7a5fc0; }
  .state { fill: #fff8e1; stroke: #b8901c; }
  .plain { fill: #ffffff; stroke: #c9c4ba; }
  .region { fill: none; stroke: #b9b3a6; stroke-dasharray: 5 4; }
  .regionlabel { font-size: 11.5px; font-weight: 600; fill: #7d776b; letter-spacing: .04em; }
  .band { fill: #fff4dd; stroke: #d6a645; }
  .line { fill: none; stroke: #6e7681; stroke-width: 1.6; }
  .line.accent { stroke: #d97757; }
  .line.bad { stroke: #c94a4a; }
  .line.ok { stroke: #3f8f5a; }
  .line.blue { stroke: #5b7fbf; }
  .dashed { stroke-dasharray: 6 4; }
  .head { fill: #6e7681; }
  .head.accent { fill: #d97757; }
  .head.bad { fill: #c94a4a; }
  .head.ok { fill: #3f8f5a; }
  .head.blue { fill: #5b7fbf; }
  .pill { fill: #ffffff; stroke: none; }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #161b22; stroke: #30363d; }
    text { fill: #e6edf3; }
    .desc, .sub, .small, .edge { fill: #9aa4b0; }
    .skill { fill: #3a2419; stroke: #e08b6c; }
    .artifact { fill: #1b2638; stroke: #7c9fd8; }
    .gate { fill: #3a1d1f; stroke: #e06c6c; }
    .agent { fill: #18301f; stroke: #5fb07a; }
    .outside { fill: #271f3d; stroke: #a08ae0; }
    .state { fill: #33290f; stroke: #d6b043; }
    .plain { fill: #1f2630; stroke: #4a525d; }
    .region { stroke: #5a6270; }
    .regionlabel { fill: #a39d90; }
    .band { fill: #33290f; stroke: #c99a3b; }
    .line { stroke: #9aa4b0; }
    .line.accent { stroke: #e08b6c; }
    .line.bad { stroke: #e06c6c; }
    .line.ok { stroke: #5fb07a; }
    .line.blue { stroke: #7c9fd8; }
    .head { fill: #9aa4b0; }
    .head.accent { fill: #e08b6c; }
    .head.bad { fill: #e06c6c; }
    .head.ok { fill: #5fb07a; }
    .head.blue { fill: #7c9fd8; }
    .pill { fill: #161b22; }
  }`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function diagram(name, width, height, title, desc, build) {
  const parts = [];
  const boxes = {};
  const d = {
    // A box: kind = skill | artifact | gate | agent | outside | state | plain | band.
    box(id, x, y, w, h, kind, label, sub = null, opts = {}) {
      boxes[id] = { x, y, w, h };
      const r = opts.round ?? (kind === 'state' ? h / 2 : 8);
      parts.push(`<rect class="${kind}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" stroke-width="1.5"/>`);
      const labels = String(label).split('\n');
      const subs = sub ? String(sub).split('\n') : [];
      const lh = 16;
      const sh = 14;
      const total = labels.length * lh + subs.length * sh;
      let ty = y + h / 2 - total / 2 + 12;
      const cx = opts.align === 'left' ? x + 12 : x + w / 2;
      const anchor = opts.align === 'left' ? 'start' : 'middle';
      // Shrink a line that would not fit with a comfortable margin (fonts differ between viewers).
      const room = w - (opts.tight ? 12 : opts.align === 'left' ? 22 : 20);
      const fit = (text, size, perChar) => {
        const est = [...text].length * size * perChar;
        return est > room ? ` style="font-size:${Math.max(9.5, Math.floor((size * room * 10) / est) / 10)}px"` : '';
      };
      const labelSize = opts.cls === 't12' ? 12 : 13.5;
      for (const l of labels) {
        parts.push(`<text class="${opts.cls || 'label'}${opts.mono ? ' mono' : ''}" x="${cx}" y="${ty}" text-anchor="${anchor}"${fit(l, labelSize, opts.mono ? 0.68 : opts.cls === 't12' ? 0.55 : 0.65)}>${esc(l)}</text>`);
        ty += lh;
      }
      for (const s of subs) {
        parts.push(`<text class="sub${opts.subMono ? ' mono' : ''}" x="${cx}" y="${ty - 1}" text-anchor="${anchor}"${fit(s, 11.5, 0.55)}>${esc(s)}</text>`);
        ty += sh;
      }
      return boxes[id];
    },
    // Point on a box: "id.r", "id.l", "id.t", "id.b", optionally "@0.3" along the side; or [x, y].
    pt(spec) {
      if (Array.isArray(spec)) return spec;
      const [ref, frac] = spec.split('@');
      const [id, side] = ref.split('.');
      const b = boxes[id];
      if (!b) throw new Error(`${name}: unknown box ${id}`);
      const f = frac === undefined ? 0.5 : Number(frac);
      if (side === 'r') return [b.x + b.w, b.y + b.h * f];
      if (side === 'l') return [b.x, b.y + b.h * f];
      if (side === 't') return [b.x + b.w * f, b.y];
      if (side === 'b') return [b.x + b.w * f, b.y + b.h];
      return [b.x + b.w / 2, b.y + b.h / 2];
    },
    // Polyline through points, arrowhead at the end (opts.both: at both ends).
    arrow(points, opts = {}) {
      const pts = points.map((p) => d.pt(p));
      const cls = `line${opts.tone ? ` ${opts.tone}` : ''}${opts.dashed ? ' dashed' : ''}`;
      const head = opts.tone ? `url(#h-${opts.tone})` : 'url(#h-default)';
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
      parts.push(`<path class="${cls}" d="${path}"${opts.none ? '' : ` marker-end="${head}"`}${opts.both ? ` marker-start="${head.replace('h-', 's-')}"` : ''}/>`);
      if (opts.label) {
        const i = opts.at ?? Math.floor((pts.length - 1) / 2);
        const [a, b] = [pts[i], pts[i + 1] || pts[i]];
        const lx = opts.lx ?? (a[0] + b[0]) / 2 + (opts.dx || 0);
        const ly = opts.ly ?? (a[1] + b[1]) / 2 + (opts.dy ?? -6);
        d.edgeLabel(lx, ly, opts.label, opts.anchor || 'middle');
      }
    },
    edgeLabel(x, y, text, anchor = 'middle') {
      const lines = String(text).split('\n');
      const w = Math.max(...lines.map((l) => l.length)) * 6.1 + 10;
      const h = lines.length * 13 + 4;
      const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x - 5;
      parts.push(`<rect class="pill" x="${x0}" y="${y - 11}" width="${w}" height="${h}" rx="4"/>`);
      lines.forEach((l, i) => parts.push(`<text class="edge" x="${anchor === 'start' ? x : x}" y="${y + i * 13}" text-anchor="${anchor}">${esc(l)}</text>`));
    },
    text(x, y, str, cls = 'small', anchor = 'start') {
      String(str)
        .split('\n')
        .forEach((l, i) => parts.push(`<text class="${cls}" x="${x}" y="${y + i * 15}" text-anchor="${anchor}">${esc(l)}</text>`));
    },
    region(x, y, w, h, label) {
      parts.push(`<rect class="region" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>`);
      if (label) parts.push(`<text class="regionlabel" x="${x + 12}" y="${y + 17}">${esc(label.toUpperCase())}</text>`);
    },
    legend(x, y, items) {
      let cx = x;
      for (const [kind, text] of items) {
        parts.push(`<rect class="${kind}" x="${cx}" y="${y - 10}" width="18" height="12" rx="3" stroke-width="1.3"/>`);
        parts.push(`<text class="small" x="${cx + 24}" y="${y}">${esc(text)}</text>`);
        cx += 24 + text.length * 6.2 + 22;
      }
    },
  };
  build(d);
  const tones = ['default', 'accent', 'bad', 'ok', 'blue'];
  const markers = tones
    .map((t) => {
      const cls = `head${t === 'default' ? '' : ` ${t}`}`;
      return (
        `<marker id="h-${t}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="${cls}" d="M0,0 L10,5 L0,10 z"/></marker>` +
        `<marker id="s-${t}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="${cls}" d="M0,0 L10,5 L0,10 z"/></marker>`
      );
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>${STYLE}
</style>
<defs>${markers}</defs>
<rect class="bg" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14"/>
<text class="title" x="28" y="38">${esc(title)}</text>
<text class="desc" x="28" y="58">${esc(desc)}</text>
${parts.join('\n')}
</svg>
`;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.svg`), svg);
  return name;
}

const written = [];
const LEGEND = [
  ['skill', 'skill (/kaizen:…)'],
  ['artifact', 'file in your repo'],
  ['gate', 'deterministic gate'],
  ['agent', 'subagent'],
  ['outside', 'you / outside world'],
];

// ---------------------------------------------------------------------------------------------------
// 1. The Kaizen loop
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('kaizen-loop', 1100, 700, 'The Kaizen loop', 'Each unit of work makes the next one easier: what a cycle learns is written where the next cycle reads it.', (d) => {
    d.box('const', 36, 76, 1028, 40, 'band', 'CONSTITUTION.md  ·  non-negotiable principles, each with a verifiable Check  ·  enforced at plan, doc-review and review');
    const xs = (i) => 36 + i * 116;
    const Y = 168;
    const row = [
      ['ideate', 'ideate', 'optional'],
      ['brainstorm', 'brainstorm', 'WHAT'],
      ['plan', 'plan', 'HOW'],
      ['docreview', 'doc-review', 'plan review'],
      ['work', 'work', 'test first'],
      ['review', 'review', 'multi-agent'],
      ['ship', 'ship', 'reviewable PR'],
      ['watch', 'watch-pr', '→ looks ready'],
      ['learn', 'learn', 'one lesson'],
    ];
    row.forEach(([id, label, sub], i) => d.box(id, xs(i), Y, 100, 56, 'skill', label, sub));
    for (let i = 0; i < row.length - 1; i++) d.arrow([`${row[i][0]}.r`, `${row[i + 1][0]}.l`], { tone: 'accent', dashed: i === 0 });
    // autopilot span
    d.arrow([[xs(2) + 4, 150], [xs(7) + 96, 150]], { tone: 'blue', both: true });
    d.text((xs(2) + xs(7) + 100) / 2, 140, 'autopilot: plan → work → review → ship → watch-pr, autonomously (never merges, never deploys)', 'small', 'middle');
    // operate row
    const Y2 = 308;
    const ox = (i) => 848 - i * 168;
    d.box('merge', ox(0), Y2, 124, 56, 'outside', 'you merge', 'Kaizen never does');
    d.box('release', ox(1), Y2, 124, 56, 'skill', 'release', 'notes · SemVer');
    d.box('deploy', ox(2), Y2, 124, 56, 'skill', 'deploy', 'your commands');
    d.box('monitor', ox(3), Y2, 124, 56, 'skill', 'monitor', 'incidents');
    d.box('postmortem', ox(4), Y2, 124, 56, 'skill', 'postmortem', 'blameless');
    d.arrow([[898, 224], [898, Y2]], { tone: 'accent' });
    d.arrow(['merge.l', 'release.r'], { tone: 'accent' });
    d.arrow(['release.l', 'deploy.r'], { tone: 'accent' });
    d.arrow(['deploy.l', 'monitor.r'], { tone: 'accent', label: 'watch', dy: -8 });
    d.arrow(['monitor.l', 'postmortem.r'], { tone: 'bad', dashed: true, label: 'breach', dy: -8 });
    d.text(ox(4), Y2 + 76, 'threshold breached → rollback first, then postmortem', 'small');
    // memory
    d.box('memory', xs(1), 438, 1028 - 116, 58, 'artifact', 'Project memory — docs/learnings/ · docs/adr/ · docs/postmortems/ · kaizen-packs/ · constitution amendments', 'versioned in your repo, read back by learnings-researcher');
    d.arrow(['learn.b', [d.pt('learn.b')[0], 438]], { tone: 'blue', label: 'writes', ly: 400, dx: 0 });
    d.arrow(['postmortem.b', [d.pt('postmortem.b')[0], 438]], { tone: 'blue', label: 'learnings · pack rules · amendments', ly: 416, lx: 248, anchor: 'start' });
    // read back
    const yb = 262;
    d.arrow([[xs(1), 467], [96, 467], [96, yb], [d.pt('review.b')[0], yb]], { tone: 'ok', none: true });
    for (const id of ['brainstorm', 'plan', 'review']) d.arrow([[d.pt(`${id}.b`)[0], yb], `${id}.b`], { tone: 'ok' });
    d.edgeLabel(392, yb + 16, 'read back by the next brainstorm, plan, review and debug');
    // around the loop
    d.region(28, 524, 1044, 104, 'Around the loop');
    const side = [
      ['debug', 'debug', 'cause first, then fix'],
      ['polish', 'polish', 'UI touch-ups, live'],
      ['decide', 'decide', 'hard choice → ADR'],
      ['prune', 'prune-learnings', 'keep lessons true'],
      ['metrics', 'metrics', 'DORA · reuse · cost'],
      ['help', 'help', 'what to run now'],
    ];
    side.forEach(([id, label, sub], i) => d.box(id, 44 + i * 170, 552, 156, 56, 'skill', label, sub));
    d.legend(36, 668, LEGEND.filter(([k]) => k !== 'agent' && k !== 'gate'));
    d.text(1064, 668, 'setup and constitution prepare the repo once', 'small', 'end');
  }),
);


// ---------------------------------------------------------------------------------------------------
// 2. Anatomy of a plan
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('plan-anatomy', 1100, 700, 'Anatomy of a plan (kaizen-plan/v1)', 'One file per topic: brainstorm writes WHAT, plan adds HOW in place, plan check proves the traceability.', (d) => {
    const X = 36;
    const W = 440;
    d.box('fm', X, 80, W, 42, 'plain', 'frontmatter', 'title · type · date · topic · artifact: kaizen-plan/v1 · source · jira', { align: 'left' });
    const secs = [
      ['goal', 'kaizen:goal', 'Goal capsule — goal · means · authority · blockers'],
      ['product', 'kaizen:product', 'Product contract — R1… requirements · AE1… examples'],
      ['rel', 'kaizen:relationships', 'How this work fits together (if split)'],
      ['planning', 'kaizen:planning', 'KTD1… decisions · patterns · learnings & pack rules'],
      ['constitution', 'kaizen:constitution', 'every article assessed: ✅ or ⚠️ exception'],
      ['threats', 'kaizen:threats', 'STRIDE, only on a risk surface'],
      ['rollout', 'kaizen:rollout', 'Exposure · Order · Rollback · Signal + threshold'],
      ['units', 'kaizen:units', 'U1… Covers · Files · Evidence · Verification · Slice'],
      ['verification', 'kaizen:verification', 'real commands, what proves each AE'],
      ['done', 'kaizen:done', 'definition of done, verifiable'],
    ];
    let y = 160;
    secs.forEach(([id, label, sub], i) => {
      d.box(id, X + 10, y, W - 20, 40, 'artifact', label, sub, { align: 'left', mono: true });
      y += i === 2 ? 86 : 46;
    });
    d.region(X, 134, W, 168, 'written by brainstorm');
    d.region(X, 316, W, 362, 'added in place by plan');
    // traceability
    const R = ['R1', 'R2', 'R3', 'R4'];
    R.forEach((r, i) => d.box(r, 540, 110 + i * 54, 64, 36, 'state', r));
    ['AE1', 'AE2'].forEach((a, i) => d.box(a, 540, 340 + i * 54, 64, 36, 'state', a));
    const U = [['U1', 'serializer'], ['U2', 'endpoint'], ['U3', 'export button']];
    U.forEach(([u, sub], i) => d.box(u, 690, 130 + i * 110, 150, 52, 'plain', u, sub));
    d.box('S1', 900, 176, 70, 40, 'state', 'S1');
    d.box('S2', 900, 350, 70, 40, 'state', 'S2');
    d.box('PR1', 1000, 172, 72, 48, 'outside', 'PR 1');
    d.box('PR2', 1000, 346, 72, 48, 'outside', 'PR 2');
    for (const [a, b] of [['R1', 'U1'], ['R2', 'U1'], ['R2', 'U2'], ['R3', 'U2'], ['R4', 'U3'], ['AE1', 'U1'], ['AE2', 'U3']]) d.arrow([`${a}.r`, `${b}.l`], { tone: 'blue' });
    d.arrow(['U1.r', 'S1.l'], {});
    d.arrow(['U2.r', 'S1.l'], {});
    d.arrow(['U3.r', 'S2.l'], {});
    d.arrow(['S1.r', 'PR1.l'], { tone: 'accent' });
    d.arrow(['S2.r', 'PR2.l'], { tone: 'accent' });
    d.text(616, 100, 'Covers:', 'small');
    d.text(856, 160, 'Slice:', 'small');
    d.text(900, 420, 'one slice = one PR\n≤ pr.max_lines (400)', 'small');
    d.box('check', 540, 470, 532, 120, 'gate', 'node $K plan check <plan>', 'frontmatter complete, no status field · R and U numbering continuous\nevery R and AE covered by a unit · every cited R/AE defined\nunit fields Covers, Files, Evidence, Verification · every article assessed\nno [NEEDS CLARIFICATION], TBD or TODO in a ready plan · rollout warnings');
    d.box('signal', 540, 606, 532, 50, 'plain', 'Signal: `error_rate` > 1 % → rollback', 'the threshold is read by deploy and monitor watch; release puts it in the checklist', { mono: false });
  }),
);

// ---------------------------------------------------------------------------------------------------
// 3. Constitution enforcement
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('constitution-enforcement', 1100, 560, 'How the constitution is enforced', 'A principle without a verifiable Check is not applied: every article is checked at plan time, at review time, and in the PR.', (d) => {
    d.box('file', 36, 90, 300, 300, 'artifact', '', null, { align: 'left' });
    d.text(52, 116, 'CONSTITUTION.md', 'label');
    d.text(52, 146, '---\nartifact: kaizen-constitution/v1\nversion: 1.2.0 · ratified · last_amended\napprovers: [@alice]\n---\n## Articles\n### I. Test first — NON-NEGOTIABLE\n<rule>  **Check:** <question>\n### II. Small batches\n## AI policy · ## Governance\n## Amendments\n- v1.2.0 (date) — … Approved by: @alice', 'small mono');
    const mid = [
      ['pc', 'plan check', 'every article assessed in the plan'],
      ['dr', 'doc-review', 'plan reviewers read the articles'],
      ['sr', 'standards-reviewer', 'diff vs articles, packs, learnings'],
      ['sh', 'ship', 'exceptions restated in the PR'],
      ['cc', 'constitution check', 'format, numbering, governance'],
    ];
    mid.forEach(([id, l, s], i) => d.box(id, 410, 86 + i * 64, 290, 50, i === 0 || i === 4 ? 'gate' : 'skill', l, s));
    mid.forEach(([id], i) => d.arrow([[336, 110 + i * 64], `${id}.l`], { tone: 'blue' }));
    d.box('ok', 780, 86, 284, 50, 'plain', '✅ respected', 'evidence written next to the article');
    d.box('ex', 780, 150, 284, 62, 'state', '⚠️ exception', 'justified in the plan, restated in the PR,\ncounted by metrics');
    d.box('nn', 780, 226, 284, 62, 'gate', 'NON-NEGOTIABLE', 'no exception: the plan is blocked,\nor the constitution is amended');
    d.box('am', 780, 302, 284, 76, 'skill', '/kaizen:constitution amend', 'new SemVer version + Amendments line\nApproved by: a declared human approver\n(an agent never approves)');
    d.arrow(['pc.r', 'ok.l'], {});
    d.arrow(['pc.r', 'ex.l'], { tone: 'accent' });
    d.arrow(['pc.r', 'nn.l'], { tone: 'bad' });
    d.arrow(['nn.b', 'am.t'], { tone: 'bad', dashed: true });
    d.arrow(['cc.r', 'am.l@0.85'], { tone: 'accent', dashed: true, label: 'governance', dy: -8 });
    d.box('h', 36, 430, 1028, 40, 'band', 'Rule hierarchy:  constitution  >  Kaizen Pack rules  >  learnings  >  preferences');
    d.text(36, 500, 'Checked deterministically: plan check (every article cited as "IV." in the section) and constitution check (MAJOR.MINOR.PATCH version, dates, continuous Roman numbering,\nnon-empty rule and Check, unique titles, ≤ 12 articles advised, AI-policy article advised, approved amendment per version when approvers are declared).', 'small');
    d.legend(36, 540, LEGEND.filter(([k]) => k !== 'agent' && k !== 'outside'));
  }),
);

// ---------------------------------------------------------------------------------------------------
// 4. Stop-hook quality gate
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('quality-gate', 1100, 560, 'The quality gate (Stop hook)', 'While /kaizen:work or /kaizen:autopilot runs, Claude cannot end a turn on red checks — three times at most.', (d) => {
    d.box('on', 36, 90, 190, 56, 'skill', 'work / autopilot', 'node $K gate on --plan p');
    d.box('state', 36, 186, 190, 64, 'state', 'gate.json', 'active · since · blocks\nsession · usage', { round: 10 });
    d.box('claim', 36, 290, 190, 56, 'gate', 'PostToolUse --claim', 'binds gate to session');
    d.arrow(['on.b', 'state.t'], { tone: 'accent' });
    d.arrow(['claim.t', 'state.b'], { tone: 'bad' });
    d.box('stop', 290, 90, 170, 56, 'outside', 'Claude ends a turn', 'Stop event');
    const chain = [
      ['c1', 'active and same session?'],
      ['c2', 'older than max_age_hours (24 h)?'],
      ['c3', 'record tokens: main + subagents'],
      ['c4', 'run verify (budget 840 s)'],
      ['c5', 'all checks green?'],
      ['c6', 'blocks > max_blocks (3)?'],
    ];
    chain.forEach(([id, l], i) => d.box(id, 520, 86 + i * 66, 330, 46, i === 2 || i === 3 ? 'plain' : 'gate', l));
    d.arrow(['stop.r', 'c1.l'], {});
    for (let i = 0; i < chain.length - 1; i++) d.arrow([`${chain[i][0]}.b`, `${chain[i + 1][0]}.t`], { label: i === 0 ? 'yes' : i === 1 ? 'no' : i === 4 ? 'no' : null, anchor: 'start', dx: 8, dy: 4 });
    d.box('pass', 892, 86, 176, 46, 'plain', 'finish (exit 0)');
    d.box('expire', 892, 152, 176, 46, 'plain', 'expired: removed');
    d.box('green', 892, 350, 176, 46, 'plain', 'finish, reset');
    d.box('giveup', 892, 416, 176, 56, 'state', 'finish, but report', 'what is still red, honestly', { round: 10 });
    d.box('block', 520, 490, 330, 52, 'gate', 'BLOCK (exit 2)', 'failure tails sent back: fix the root cause');
    d.arrow(['c1.r', 'pass.l'], { label: 'no', dy: -6 });
    d.arrow(['c2.r', 'expire.l'], { label: 'yes', dy: -6 });
    d.arrow(['c5.r', 'green.l'], { tone: 'ok', label: 'yes', dy: -6 });
    d.arrow(['c6.r', 'giveup.l@0.4'], { label: 'yes', dy: -6 });
    d.arrow(['c6.b', 'block.t'], { tone: 'bad', label: 'no', anchor: 'start', dx: 8, dy: 4 });
    d.arrow(['block.l', [480, 516], [480, 180], [375, 180], 'stop.b'], { tone: 'bad', dashed: true, label: 'Claude keeps working', at: 2, dy: -6 });
    d.text(290, 236, 'targeted checks:\ngate.targeted with {files}\n= only what the branch touches', 'small');
    d.box('off', 36, 410, 190, 56, 'skill', 'gate off', 'end of the cycle');
    d.box('cycles', 36, 486, 400, 50, 'artifact', '.kaizen/state/cycles.jsonl', 'plan · minutes · gate blocks · tokens by role → metrics cycle_cost', { align: 'left' });
    d.arrow(['off.b', [131, 486]], { tone: 'blue' });
  }),
);

// ---------------------------------------------------------------------------------------------------
// 5. Push gate, review evidence and human waiver
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('push-gate', 1100, 640, 'The review required before git push', 'A PreToolUse hook refuses the push until a review recorded the pushed tree. Evidence comes from hooks, not from the agent’s word.', (d) => {
    d.region(28, 76, 330, 520, 'Recording a review');
    d.box('rv', 44, 106, 298, 52, 'skill', '/kaizen:review', 'launches reviewers through the Agent tool');
    d.box('ev', 44, 186, 298, 56, 'gate', 'PostToolUse --evidence', 'logs each kaizen:*-reviewer actually launched');
    d.box('evf', 44, 270, 298, 46, 'state', 'review-evidence.json', null, { round: 10 });
    d.box('rec', 44, 344, 298, 70, 'gate', 'review record --verdict', 'refused without a reviewer since the last review,\nexcept light (branch ≤ 20 lines)\nor update after fixes (≤ 80 lines since)');
    d.box('rf', 44, 442, 298, 66, 'state', 'reviews.json[branch]', 'tree · head · verdict ready|concerns|blocked\ndepth agents|light|update · reviewers · models', { round: 10 });
    d.arrow(['rv.b', 'ev.t'], { tone: 'accent' });
    d.arrow(['ev.b', 'evf.t'], { tone: 'bad' });
    d.arrow(['evf.b', 'rec.t'], {});
    d.arrow(['rec.b', 'rf.t'], { tone: 'bad' });
    d.text(44, 540, 'Direct writes to these state files and hand-made\ndeploy/ rollback/ incident/ resolve/ tags are refused.', 'small');
    // middle: decision
    d.box('push', 396, 96, 300, 50, 'outside', 'git push (any Bash command)');
    const checks = [
      ['k1', 'require_before_push: false?', 'allow'],
      ['k2', 'default branch or no new code?', 'allow'],
      ['k3', 'no review recorded?', 'refuse'],
      ['k4', 'reviewed tree not found?', 'refuse'],
      ['k5', 'blocked and unchanged since?', 'refuse'],
      ['k6', '> 80 lines since the review?', 'refuse'],
    ];
    checks.forEach(([id, l], i) => d.box(id, 396, 176 + i * 62, 300, 44, 'gate', l));
    d.arrow(['push.b', 'k1.t'], { label: 'PreToolUse review-gate', anchor: 'start', dx: 8, dy: 4 });
    for (let i = 0; i < checks.length - 1; i++) d.arrow([`${checks[i][0]}.b`, `${checks[i + 1][0]}.t`], {});
    checks.forEach(([id, , out]) => d.arrow([`${id}.r`, [748, d.pt(`${id}.r`)[1]]], { tone: out === 'allow' ? 'ok' : 'bad', label: out, lx: 724, anchor: 'middle' }));
    d.box('allow', 396, 556, 300, 44, 'plain', 'otherwise: push allowed ✔');
    d.arrow(['k6.b', 'allow.t'], { tone: 'ok' });
    d.arrow(['rf.r', [374, 475], [374, 300], 'k3.l'], { tone: 'blue', dashed: true, label: 'read', at: 1, lx: 374, ly: 392 });
    // right: waiver
    d.region(760, 76, 312, 520, 'Waiver: only you can grant it');
    d.box('ask', 776, 106, 280, 46, 'outside', 'you ask to skip the review');
    d.box('w1', 776, 176, 280, 56, 'skill', 'review waive --reason "…"', 'prints a 6-character code (30 min)');
    d.box('w2', 776, 256, 280, 46, 'state', 'waivers.json (pending)', null, { round: 10 });
    d.box('w3', 776, 326, 280, 52, 'outside', 'you type: kaizen waive 3F9A2C', 'Claude cannot type it for you');
    d.box('w4', 776, 402, 280, 56, 'gate', 'UserPromptSubmit --confirm', 'only a user message reaches this hook');
    d.box('w5', 776, 482, 280, 62, 'state', 'reviews.json: verdict waived', 'push allowed · the PR gets a\n“Review waived” section', { round: 10 });
    d.arrow(['ask.b', 'w1.t'], {});
    d.arrow(['w1.b', 'w2.t'], {});
    d.arrow(['w2.b', 'w3.t'], {});
    d.arrow(['w3.b', 'w4.t'], { tone: 'accent' });
    d.arrow(['w4.b', 'w5.t'], { tone: 'bad' });
    d.legend(36, 622, LEGEND.filter(([k]) => k !== 'agent').concat([['state', 'state in .kaizen/state/']]));
  }),
);


// ---------------------------------------------------------------------------------------------------
// 6. Multi-agent review pipeline
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('review-pipeline', 1100, 640, 'The multi-agent review (/kaizen:review)', 'Reviewers chosen from what the diff touches, run in parallel, merged, filtered by confidence, and every blocking finding re-verified.', (d) => {
    const steps = [
      ['s1', '1. Scope', 'branch diff vs merge-base\n(uncommitted included) or a PR'],
      ['s2', '2. Depth', 'light ≤ 20 lines · targeted < 100,\none area · full otherwise'],
      ['s3', '3. Intent and plan', 'intent summary · R / AE / KTD\nfrom the plan of the branch'],
      ['s4', '4. Selection', 'correctness always + what the\ndiff touches · profile adjusts'],
    ];
    steps.forEach(([id, l, sub], i) => d.box(id, 36 + i * 262, 84, 236, 70, 'skill', l, sub));
    for (let i = 0; i < 3; i++) d.arrow([`${steps[i][0]}.r`, `${steps[i + 1][0]}.l`], { tone: 'accent' });
    d.region(36, 178, 1028, 156, 'Launched in parallel, one Agent call each, model from the profile');
    const rv = [
      ['correctness', 'always'],
      ['standards', 'constitution, packs'],
      ['security', 'auth, input, secrets'],
      ['testing', 'behavior changed'],
      ['performance', 'queries, complexity'],
      ['reliability', 'errors, retries, jobs'],
      ['api-contract', 'external boundary'],
      ['data-migration', 'migrations, backfills'],
      ['maintainability', 'refactor, ≥ 200 lines'],
      ['adversarial', '≥ 50 lines, risky paths'],
    ];
    rv.forEach(([n, sub], i) => d.box(`r${i}`, 48 + (i % 5) * 202, 204 + Math.floor(i / 5) * 62, 190, 50, 'agent', `${n}`, sub));
    d.arrow(['s4.b', [d.pt('s4.b')[0], 178]], { tone: 'accent' });
    d.text(36, 352, 'Each returns the contract JSON: severity P0–P3 · confidence 50 | 75 | 100 · evidence quoting file:line · suggested_fix · autofix_class · pre_existing', 'small');
    const merge = [
      ['m1', 'Normalize', 'no evidence → rejected\nunquoted 75/100 → 50'],
      ['m2', 'Deduplicate', 'same file, ±3 lines, same\nfailure mode · agreement +1'],
      ['m3', 'Confidence gate', '100/75 kept · 50 only as P0\npre-existing listed apart'],
      ['m4', 'Validate P0 / P1', 'quoted lines re-read:\nconfirmed · refuted · unresolved'],
    ];
    merge.forEach(([id, l, sub], i) => d.box(id, 36 + i * 262, 384, 236, 70, 'gate', l, sub));
    d.arrow([[550, 334], [550, 366], [154, 366], 'm1.t'], { tone: 'accent' });
    for (let i = 0; i < 3; i++) d.arrow([`${merge[i][0]}.r`, `${merge[i + 1][0]}.l`], { tone: 'accent' });
    d.box('v', 36, 492, 360, 70, 'plain', 'Verdict', '⛔ a P0, or a confirmed P1 · ⚠️ other P1/P2 or gaps\n✅ otherwise · plan conformance per R/AE');
    d.box('rec', 430, 492, 300, 70, 'gate', 'review record --verdict', 'ready | concerns | blocked\nunlocks git push for this tree');
    d.box('ap', 764, 492, 300, 70, 'skill', 'apply (only on request)', 'gated_auto fixes, verify after each,\ncommit, record again');
    d.arrow([[d.pt('m4.b')[0], 454], [d.pt('m4.b')[0], 474], [216, 474], 'v.t'], { tone: 'accent' });
    d.arrow(['v.r', 'rec.l'], { tone: 'accent' });
    d.arrow(['rec.r', 'ap.l'], { dashed: true });
    d.text(36, 590, 'Report: findings table (number, severity, confidence, file:line, fix, reviewer) · constitution · plan conformance · test gaps · residual risks · pre-existing · to capture.\nmode:agent returns the merged JSON to work / autopilot instead of prose; the tree is never changed in that mode.', 'small');
    d.legend(36, 626, [['skill', 'skill step'], ['agent', 'reviewer subagent'], ['gate', 'deterministic or verified step']]);
  }),
);

// ---------------------------------------------------------------------------------------------------
// 7. Following a PR
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('pr-watch', 1100, 640, 'Driving a PR to "looks ready" (/kaizen:watch-pr)', 'Feedback before CI, CI before branch updates, a token-free watcher between cycles. You merge, never Kaizen.', (d) => {
    d.box('snap', 36, 90, 220, 60, 'gate', 'pr snapshot', 'paginated threads, comments,\nreviews, head checks, merge state');
    d.box('term', 36, 182, 220, 44, 'plain', 'merged / closed → stop');
    const cyc = [
      ['fb', '1. Feedback first', 'address-feedback once, then\npr mark each item (handled)'],
      ['head', '2. Head moved?', 'observed CI is stale: wait'],
      ['ci', '3. CI red', 'infra failure: one rerun\nreal failure: logs → debug → push'],
      ['br', '4. Branch currency', 'BEHIND → update-branch API\nDIRTY → merge base locally'],
      ['conv', '5. Convergence', 'same check red after 2 fixes,\nor threads growing → stop'],
    ];
    cyc.forEach(([id, l, sub], i) => d.box(id, 320, 90 + i * 84, 300, 64, 'skill', l, sub));
    d.arrow(['snap.r', 'fb.l'], { tone: 'accent' });
    d.arrow(['snap.b', 'term.t'], {});
    for (let i = 0; i < cyc.length - 1; i++) d.arrow([`${cyc[i][0]}.b`, `${cyc[i + 1][0]}.t`], { tone: 'accent' });
    d.box('wait', 320, 524, 300, 64, 'gate', 'pr watch --interval 150', 'polls GitHub, no tokens spent,\nexits with a KAIZEN_WAKE line');
    d.arrow(['conv.b', 'wait.t'], { tone: 'accent' });
    d.arrow(['wait.l', [22, 556], [22, 120], 'snap.l'], { tone: 'ok', dashed: true, label: 'KAIZEN_WAKE → next cycle', at: 1, lx: 30, ly: 330, anchor: 'start' });
    d.region(660, 76, 412, 300, 'Watcher verdicts');
    const verdicts = [
      ['terminal', 'merged or closed'],
      ['budget', '8 h active (3-day safety net)'],
      ['actionable', 'open thread, comment or red check'],
      ['behind / conflict', 'GitHub says BEHIND / DIRTY'],
      ['looks-ready', 'see the conditions below'],
      ['blocked-failing', 'every red check already handled'],
      ['blocked-external', 'fork CI waiting for approval'],
      ['needs-human', 'decision left to a human'],
    ];
    verdicts.forEach(([v, why], i) => {
      d.text(680, 120 + i * 30, v, 'label mono');
      d.text(860, 120 + i * 30, why, 'small');
    });
    d.box('ready', 660, 396, 412, 192, 'state', '', null, { round: 12 });
    d.text(680, 424, 'looks-ready requires all of:', 'label');
    d.text(680, 452, '· mergeable = MERGEABLE, merge state CLEAN\n· checks finished and green\n· no open thread or comment, no human decision\n· branch up to date\n· PR quiet for ≥ 5 min (settle_seconds 300)\n· no review on its way (👀, "reviewing…"), description true', 'small');
    d.text(36, 620, 'Kaizen messages carry <!-- kaizen --> and are context, never feedback. State: .kaizen/state/pr/<owner>-<repo>-<n>.json (delete it to start over).', 'small');
  }),
);

// ---------------------------------------------------------------------------------------------------
// 8. Deployment
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('deploy-flow', 1100, 620, 'A watched deployment (/kaizen:deploy)', 'Your commands, your approval for production, a shared tag, the plan’s signals watched, rollback first when a threshold is breached.', (d) => {
    d.box('pre', 36, 90, 250, 112, 'gate', 'Preconditions', 'merged commit, CI green\nshipped plans: rollback + signal\nrollback declared for the env\nsignals already healthy');
    d.box('req', 320, 90, 230, 56, 'skill', 'deploy request <env>', 'protected env: 6-char code, 30 min');
    d.box('you', 320, 166, 230, 56, 'outside', 'you: kaizen deploy 7C1E0B', 'UserPromptSubmit approves');
    d.box('run', 584, 90, 230, 70, 'skill', 'deploy run <env>', 'your command with KAIZEN_ENV,\nKAIZEN_REF, KAIZEN_SHA · timeout');
    d.box('tag', 848, 90, 216, 70, 'artifact', 'deploy/<env>/<stamp>', 'annotated tag on the commit,\npushed (deploy.push_tags)');
    d.arrow(['pre.r@0.3', 'req.l'], { tone: 'accent' });
    d.arrow(['req.b', 'you.t'], {});
    d.arrow(['you.r', [567, 194], [567, 125], 'run.l'], { tone: 'accent' });
    d.arrow(['run.r', 'tag.l'], { tone: 'accent' });
    d.box('watch', 584, 250, 230, 78, 'gate', 'monitor watch', 'watch_minutes (15) · every\ninterval_seconds (60) · breach =\nconsecutive (2) red samples');
    d.arrow(['tag.b', [956, 230], [699, 230], 'watch.t'], { tone: 'accent' });
    d.box('ok', 848, 250, 216, 56, 'plain', '✔ healthy', 'nothing to do');
    d.arrow(['watch.r@0.3', 'ok.l'], { tone: 'ok' });
    d.box('inc', 584, 370, 230, 56, 'artifact', 'incident/<env>/<detected>', 'opened at detection');
    d.box('rb', 320, 370, 230, 76, 'skill', 'deploy rollback <env>', 'no approval needed · automatic\nif deploy.auto_rollback · target =\nprevious successful deploy');
    d.box('rbtag', 36, 370, 250, 56, 'artifact', 'rollback/<env>/<stamp>', 'resolves the incident');
    d.box('pm', 36, 470, 250, 56, 'skill', '/kaizen:postmortem', 'timeline from the tags');
    d.arrow(['watch.b', 'inc.t'], { tone: 'bad', label: 'breach', anchor: 'start', dx: 8, dy: 4 });
    d.arrow(['inc.l', 'rb.r@0.3'], { tone: 'bad' });
    d.arrow(['rb.l@0.3', 'rbtag.r'], { tone: 'bad' });
    d.arrow(['rbtag.b', 'pm.t'], { tone: 'blue' });
    d.box('flag', 848, 370, 216, 56, 'skill', 'deploy flag on|off', 'your feature flag commands');
    d.box('hook', 320, 470, 494, 56, 'gate', 'PreToolUse: the raw command of a protected env is refused', 'and so are hand-made deploy/ rollback/ incident/ resolve/ tags');
    d.text(36, 566, 'Thresholds: a shipped plan’s **Signal** (`error_rate` > 1 %) overrides monitor.signals for that deployment. Every deploy, rollback, incident and resolve tag\nfeeds real DORA metrics (frequency, lead time to production, failure rate, time to restore). Deployment state is uncertain after a timeout: check before retrying.'.replace(/\*\*/g, ''), 'small');
    d.legend(36, 606, LEGEND.filter(([k]) => k !== 'agent'));
  }),
);

// ---------------------------------------------------------------------------------------------------
// 9. Incident lifecycle
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('incident-lifecycle', 1100, 520, 'Incidents: detection, resolution, learning', 'An incident is a dated git tag, so time to restore and postmortem timelines are measured, not remembered.', (d) => {
    const src = [
      ['w', 'monitor watch', 'after a deployment'],
      ['p', 'monitor patrol --env e', 'scheduled: routine, cron, CI'],
      ['a', 'monitor alert', 'Alertmanager · PagerDuty ·\nDatadog · plain JSON'],
      ['m', 'monitor incident open', 'by hand, --at, --summary'],
    ];
    src.forEach(([id, l, s], i) => d.box(id, 36, 86 + i * 82, 250, 62, 'skill', l, s));
    d.box('inc', 360, 190, 270, 96, 'artifact', 'incident/<env>/<detected>', 'on the commit live at detection\nidempotent while one is open\nnote: source · summary · signals');
    src.forEach(([id], i) => d.arrow([`${id}.r`, `inc.l@${0.2 + i * 0.2}`], { tone: 'bad' }));
    d.box('rb', 700, 110, 364, 62, 'skill', 'deploy rollback <env>', 'rollback/<env>/… resolves the open incident');
    d.box('rs', 700, 196, 364, 62, 'skill', 'monitor incident resolve · resolved alert', 'resolve/<env>/… (never before detection)');
    d.arrow(['inc.r@0.3', 'rb.l'], { tone: 'ok' });
    d.arrow(['inc.r@0.6', 'rs.l'], { tone: 'ok' });
    d.region(360, 330, 704, 150, 'Who reads the incident tags');
    const use = [
      ['me', 'metrics', 'failure rate · time to restore\n(detection → resolution)'],
      ['pm', 'postmortem', 'timeline: real start,\ndetection, mitigation'],
      ['st', 'status / help', 'open incident first, then a\nresolved one without postmortem'],
    ];
    use.forEach(([id, l, s], i) => d.box(id, 376 + i * 228, 360, 212, 96, 'skill', l, s));
    d.arrow(['inc.b', [495, 330]], { tone: 'blue' });
    d.text(36, 426, 'Alert time wins over reception time.\n--env wins over the alert’s env label.\nA resolution older than the detection\nis moved to the detection time.', 'small');
    d.legend(36, 506, LEGEND.filter(([k]) => k === 'skill' || k === 'artifact'));
  }),
);


// ---------------------------------------------------------------------------------------------------
// 10. Learnings: the compounding effect
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('learnings-loop', 1100, 600, 'How learnings compound', 'A lesson only counts once it is read back and applied. Kaizen measures both, and prunes what nobody uses.', (d) => {
    d.box('work', 36, 90, 220, 56, 'skill', 'verified work', 'work · debug · review · autopilot');
    d.box('learn', 36, 186, 220, 76, 'skill', '/kaizen:learn', 'durability test: would someone\nmake the mistake again without it?');
    d.box('no', 36, 300, 220, 44, 'plain', '“Learning not written: …”');
    d.arrow(['work.b', 'learn.t'], { tone: 'accent' });
    d.arrow(['learn.b', 'no.t'], { label: 'no', anchor: 'start', dx: 8, dy: 4 });
    d.box('file', 330, 160, 330, 128, 'artifact', '', null, { align: 'left' });
    d.text(346, 186, 'docs/learnings/<category>/<slug>.md', 'small mono');
    d.text(346, 210, 'title · date · module · problem_type\ncomponent · severity · tags (≤ 8)\nbug: symptoms · root_cause · resolution_type\nknowledge: applies_when (≤ 5)', 'small');
    d.arrow(['learn.r', [330, 224]], { tone: 'blue', label: 'yes · validated', dy: -8 });
    d.box('pm', 36, 384, 220, 56, 'skill', '/kaizen:postmortem', 'incident → learning');
    d.arrow(['pm.r', [300, 412], [300, 262], 'file.l@0.8'], { tone: 'blue' });
    d.box('pack', 330, 330, 210, 56, 'artifact', 'kaizen-packs/<pack>/', 'team-wide → pack rule (approved)');
    d.arrow([[420, 288], [420, 330]], { tone: 'blue', dashed: true });
    d.box('lr', 678, 90, 394, 92, 'agent', 'learnings-researcher', 'learnings search, weighted match: title & tags ×4\nmodule & components ×3 · applies_when, symptoms,\nroot cause ×2 · body ×1 · bonus per term matched');
    d.arrow(['file.r@0.2', 'lr.l@0.8'], { tone: 'ok' });
    const readers = [['brainstorm'], ['plan'], ['review'], ['debug']];
    readers.forEach(([n], i) => d.box(`rd${i}`, 678 + i * 100, 214, 94, 40, 'skill', n, null, { tight: true }));
    readers.forEach((_, i) => d.arrow([[725 + i * 100, 182], `rd${i}.t`], { tone: 'ok' }));
    d.box('plancite', 678, 290, 186, 66, 'state', 'cited by a plan', '= read', { round: 12 });
    d.box('commit', 886, 290, 186, 66, 'state', 'commit body: Applies', 'docs/learnings/… = applied', { round: 12 });
    d.arrow(['rd1.b', 'plancite.t@0.4'], {});
    d.arrow([[d.pt('rd1.b')[0] + 30, 254], 'commit.t@0.3'], {});
    d.box('metrics', 678, 400, 394, 76, 'skill', '/kaizen:metrics → kaizen_loop', 'total · new · cited by plans · applied in commits\nreuse rate · never cited · constitution exceptions');
    d.arrow(['plancite.b', [771, 400]], { tone: 'blue' });
    d.arrow(['commit.b', [979, 400]], { tone: 'blue' });
    d.box('prune', 330, 430, 300, 76, 'skill', '/kaizen:prune-learnings', 'Keep · Update · Merge · Replace · Delete\nwith evidence; never touches product code');
    d.arrow(['metrics.l', 'prune.r'], { tone: 'accent', dashed: true, label: 'never cited', dy: 22 });
    d.arrow(['prune.t@0.85', [585, 288]], { tone: 'blue', dashed: true });
    d.text(36, 560, 'Search excludes nothing but README.md and _archived/; validation (learnings validate) rejects missing fields, unknown enums, more than 5 symptoms or 8 tags.', 'small');
    d.legend(36, 586, LEGEND.filter(([k]) => k !== 'gate' && k !== 'outside').concat([['state', 'signal']]));
  }),
);

// ---------------------------------------------------------------------------------------------------
// 11. Autopilot
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('autopilot', 1100, 640, 'Autopilot: from a request to a PR that looks ready', 'The right skill at every step, nothing that stops without a reason, nothing irreversible without your approval.', (d) => {
    d.box('req', 36, 86, 240, 50, 'outside', 'your request');
    const routes = [
      ['plan path / plan from this session', 'straight to work'],
      ['concrete bug (symptom, red test)', 'debug mode:return'],
      ['ambiguous product shape', 'brainstorm (you there) or plan'],
      ['not code (ideas, explanation)', 'that skill, and stop'],
      ['any other code change', 'plan mode:return'],
      ['lean profile, ≤ ~30 lines, no risk surface', 'work without a written plan'],
    ];
    routes.forEach(([a, b], i) => {
      d.box(`q${i}`, 36, 160 + i * 66, 262, 50, 'gate', a, null, { cls: 't12' });
      d.box(`a${i}`, 318, 160 + i * 66, 196, 50, 'skill', b, null, { cls: 't12' });
      d.arrow([`q${i}.r`, `a${i}.l`], {});
    });
    d.arrow(['req.b', 'q0.t'], {});
    d.region(530, 76, 534, 476, 'The run (gate on for the whole run)');
    const run = [
      '1. work source: ready plan (plan check + doc-review) or a debug fix',
      '2. work mode:return — units, test first, one commit each',
      '3. simplification of the diff',
      '4. review mode:agent — a settled decision proven wrong stops all',
      '5. fixes: P0/P1 and gated_auto P2, verified and committed',
      '6. the rest recorded in the PR ("Open points")',
      '7. learn mode:auto, if the run produced a durable lesson',
      '8. browser checks if the UI changed and a tool exists',
      '9. ship mode:auto — PR with reviewer guide',
      '10. watch-pr mode:pipeline — ≤ 2 fixes per cause, no disabled test',
      '11. gate off, report, DONE',
    ];
    run.forEach((r, i) => d.box(`r${i}`, 546, 102 + i * 40, 502, 32, i === 0 || i === 3 || i === 10 ? 'state' : 'plain', r, null, { align: 'left', round: 6, cls: 't12' }));
    d.box('stop', 36, 568, 1028, 52, 'gate', 'It stops — pushing nothing new and saying how to resume — on: an irreversible action not granted (merge, force push, data deletion, deployment),\nno work source, an incomplete child return, a settled decision invalidated, or a review waiver needed while you are away.', null, { cls: 't12' });
  }),
);

// ---------------------------------------------------------------------------------------------------
// 12. What /kaizen:help recommends
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('help-routing', 1100, 600, 'What /kaizen:help recommends next', 'node $K status reads the repo and returns the first situation that applies, in this order.', (d) => {
    const rules = [
      ['open incident on an environment', '/kaizen:monitor <env>', 'bad'],
      ['incident resolved < 14 days ago, no postmortem', '/kaizen:postmortem', 'bad'],
      ['Kaizen not initialized', '/kaizen:setup', null],
      ['no CONSTITUTION.md', '/kaizen:constitution', null],
      ['quality gate active', '/kaizen:work (resume) or gate off', null],
      ['feature branch with changes · waiver pending', 'kaizen waive <code> (you type it)', null],
      ['feature branch · reviewed, committed, clean', '/kaizen:ship', 'ok'],
      ['feature branch · not reviewed or changed since', '/kaizen:review', null],
      ['default branch · commits not deployed', '/kaizen:deploy <env>', null],
      ['latest plan is requirements only', '/kaizen:plan <plan>', null],
      ['latest plan is ready', '/kaizen:work <plan>', null],
      ['otherwise', '/kaizen:brainstorm <idea> · ideate · debug', 'ok'],
    ];
    rules.forEach(([cond, cmd, tone], i) => {
      const y = 84 + i * 40;
      d.box(`c${i}`, 36, y, 480, 32, 'gate', cond, null, { align: 'left', round: 6 });
      d.box(`n${i}`, 600, y, 464, 32, 'skill', cmd, null, { align: 'left', round: 6, mono: true });
      d.arrow([`c${i}.r`, `n${i}.l`], { tone: tone || undefined });
      d.text(24, y + 21, String(i + 1), 'small', 'end');
    });
    d.text(36, 580, 'The first two are added before everything else; "otherwise" is also added when the repo is in a normal state. /kaizen:help explains the result and can also answer “what is Kaizen?”.', 'small');
  }),
);

// ---------------------------------------------------------------------------------------------------
// 13. Hooks in a session
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('hooks', 1100, 520, 'Kaizen’s hooks in a Claude Code session', 'Five hook registrations make the important rules deterministic. They are inactive outside a Kaizen repo and never block on their own errors.', (d) => {
    const lane = (y, label) => {
      d.text(36, y + 4, label, 'regionlabel');
      d.arrow([[150, y], [1064, y]], { none: true });
    };
    lane(110, 'YOU');
    lane(250, 'CLAUDE');
    lane(390, 'END OF TURN');
    d.box('msg', 170, 86, 230, 48, 'outside', 'you send a message');
    d.box('ups', 170, 150, 230, 64, 'gate', 'UserPromptSubmit', 'review-hooks.mjs --confirm\nkaizen waive / deploy <code>');
    d.arrow(['msg.b', 'ups.t'], {});
    d.box('pre', 440, 214, 270, 76, 'gate', 'PreToolUse', 'review-gate.mjs: git push without\nreview, raw protected deploy, forged\ntags, writes to review state → exit 2');
    d.box('post1', 740, 160, 324, 64, 'gate', 'PostToolUse (Bash)', 'quality-gate.mjs --claim: binds the\ngate to the session after gate on');
    d.box('post2', 740, 238, 324, 64, 'gate', 'PostToolUse (Agent / Task)', 'review-hooks.mjs --evidence: logs\nreviewers launched, cycle subagents');
    d.box('stop', 440, 352, 270, 76, 'gate', 'Stop', 'quality-gate.mjs: verify while the\ngate is on · blocks ≤ 3 times\nrecords tokens');
    d.box('tool', 170, 230, 230, 44, 'plain', 'Claude calls a tool');
    d.arrow(['ups.b', 'tool.t'], {});
    d.arrow(['tool.r', 'pre.l'], {});
    d.arrow(['pre.r@0.3', 'post1.l'], { tone: 'ok', label: 'allowed → tool runs', dy: -6 });
    d.arrow(['pre.r@0.7', 'post2.l'], { tone: 'ok' });
    d.arrow(['pre.b', 'stop.t'], { dashed: true, label: '… turn ends', anchor: 'start', dx: 8, dy: 4 });
    d.text(36, 470, 'Exit 0 = allow, exit 2 = block with the message on stderr (sent back to Claude). UserPromptSubmit and PostToolUse only observe (always exit 0).\nAll registrations live in hooks/hooks.json and use ${CLAUDE_PLUGIN_ROOT}; timeouts: PreToolUse 30 s, PostToolUse 10–15 s, Stop 900 s, UserPromptSubmit 30 s.', 'small');
  }),
);

// ---------------------------------------------------------------------------------------------------
// 14. Files Kaizen writes and reads
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('artifacts-map', 1100, 720, 'What Kaizen writes in your repo, and who reads it', 'Deliverables are versioned and shared; local state stays on your machine; tags carry the deployment history.', (d) => {
    const rows = [
      ['brainstorm · plan', 'docs/plans/<date>-<type>-<topic>-plan.md', 'work · review · ship · release · monitor · metrics'],
      ['learn · prune-learnings', 'docs/learnings/<category>/<slug>.md', 'researcher → brainstorm, plan, review, debug'],
      ['decide', 'docs/adr/NNNN-<title>.md', 'learnings-researcher · metrics (ADR count)'],
      ['postmortem', 'docs/postmortems/YYYY-MM-DD-<title>.md', 'learnings-researcher · metrics · status'],
      ['ideate · metrics', 'docs/ideation/ · docs/metrics/', 'brainstorm · trend over time'],
      ['constitution', 'CONSTITUTION.md', 'plan check · doc-review · standards-reviewer · ship'],
      ['setup (pack:<name>) · learn', 'kaizen-packs/<pack>/<rule>.md', 'brainstorm · plan · review (pack rules)'],
      ['setup · init', '.kaizen/config.json (+ config.local.json)', 'every skill, the CLI and the hooks'],
      ['CLI · hooks', '.kaizen/state/ (git-ignored)', 'gate, push gate, watch-pr, deploy, metrics'],
      ['deploy · monitor', 'tags deploy/ rollback/ incident/ resolve/', 'metrics (DORA) · postmortem · release · status'],
    ];
    d.text(36, 88, 'WRITTEN BY', 'regionlabel');
    d.text(330, 88, 'FILE', 'regionlabel');
    d.text(734, 88, 'READ BY', 'regionlabel');
    rows.forEach(([w, f, r], i) => {
      const y = 100 + i * 58;
      d.box(`w${i}`, 36, y, 250, 44, 'skill', w);
      d.box(`f${i}`, 320, y, 380, 44, i === 8 ? 'state' : 'artifact', f, null, { mono: true, round: i === 8 ? 10 : 8, cls: 't12' });
      d.box(`r${i}`, 734, y, 330, 44, 'plain', r, null, { cls: 't12' });
      d.arrow([`w${i}.r`, `f${i}.l`], { tone: 'accent' });
      d.arrow([`f${i}.r`, `r${i}.l`], { tone: 'blue' });
    });
    d.text(36, 700, 'Default root docs/ (docs_root). No deliverable carries mutable state: progress is read from git, never from a "status" field.', 'small');
  }),
);

for (const n of written) process.stdout.write(`docs/media/diagrams/${n}.svg\n`);
