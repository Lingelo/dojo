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

const OUT = process.env.KAIZEN_DIAGRAMS_OUT || join(dirname(fileURLToPath(import.meta.url)), '..', 'diagrams');

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
// `agent` boxes draw agent-skills' commands: the workflow Kaizen guards.
const LEGEND = [
  ['agent', 'agent-skills command (/kaizen:spec\u2026)'],
  ['skill', 'Kaizen skill (setup, learn, metrics, watch)'],
  ['gate', 'Kaizen hook or check'],
  ['artifact', 'file in your repo'],
  ['outside', 'you'],
];

// ---------------------------------------------------------------------------------------------------
// 1. The loop: agent-skills does the work, Kaizen makes it hold
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('kaizen-loop', 1100, 660, 'Kaizen around agent-skills', 'agent-skills does the work; Kaizen’s hooks make it hold, keep what was learned, follow the PR and measure.', (d) => {
    const xs = (i) => 36 + i * 150;
    const steps = [
      ['spec', '/kaizen:spec', 'what, for whom'],
      ['plan', '/kaizen:plan', 'tasks, files'],
      ['build', '/kaizen:build', 'one task, test first'],
      ['test', '/kaizen:test', 'proof'],
      ['review', '/kaizen:review', 'five axes'],
      ['ship', '/kaizen:ship', 'push, PR'],
    ];
    d.region(28, 76, 1044, 120, 'agent-skills\u2019 workflow, under Kaizen\u2019s prefix');
    steps.forEach(([id, l, s], i) => d.box(id, xs(i) + 6, 112, 128, 60, 'agent', l, s));
    for (let i = 0; i < steps.length - 1; i++) d.arrow([`${steps[i][0]}.r`, `${steps[i + 1][0]}.l`], { tone: 'accent' });
    d.box('watch', 948, 112, 116, 60, 'skill', '/kaizen:watch', 'PR to ready');
    d.arrow(['ship.r', 'watch.l'], { tone: 'accent' });
    d.region(28, 220, 1044, 150, 'Kaizen — the engine (hooks, no command to run)');
    const gates = [
      ['g1', 'learnings read back', 'when SPEC.md or tasks/\nare written'],
      ['g2', 'quality gate', 'code edited → no end of\nturn on red checks'],
      ['g3', 'review recorded', 'verdict read from\nagent-skills’ review'],
      ['g4', 'push gate · secrets', 'no unreviewed push,\nno key committed'],
    ];
    const gx = [xs(0) + 6, xs(2) - 40, xs(4) + 6, xs(5) + 6];
    gates.forEach(([id, l, s], i) => d.box(id, gx[i] + (i === 3 ? 44 : 0), 254, i === 1 ? 260 : i === 2 ? 176 : 200, 70, 'gate', l, s));
    d.arrow(['g1.t', [d.pt('g1.t')[0], 172]], { tone: 'bad', dashed: true });
    d.arrow(['g2.t@0.3', [d.pt('g2.t@0.3')[0], 172]], { tone: 'bad', dashed: true });
    d.arrow(['g2.t@0.8', [d.pt('g2.t@0.8')[0], 172]], { tone: 'bad', dashed: true });
    d.arrow(['g3.t', [d.pt('g3.t')[0], 172]], { tone: 'bad', dashed: true });
    d.arrow(['g4.t@0.3', [d.pt('g4.t@0.3')[0], 172]], { tone: 'bad', dashed: true });
    d.box('merge', 948, 396, 116, 52, 'outside', 'you merge', 'never Kaizen');
    d.arrow(['watch.b', [1006, 236], [1006, 380], 'merge.t'], { tone: 'accent' });
    d.box('learn', 760, 396, 160, 52, 'skill', '/kaizen:learn', 'one durable lesson');
    d.arrow(['merge.l', 'learn.r'], { tone: 'accent' });
    d.box('memory', 36, 470, 1028, 54, 'artifact', 'Project memory — docs/learnings/ · CONSTRAINTS.md · SPEC.md · tasks/', 'versioned in your repo, read back by the next spec and plan');
    d.arrow(['learn.b', [840, 470]], { tone: 'blue', label: 'writes' });
    d.arrow([[100, 470], [100, 404], [d.pt('g1.b')[0], 404], 'g1.b'], { tone: 'ok', label: 'read back', at: 1 });
    d.box('metrics', 36, 548, 330, 52, 'skill', '/kaizen:metrics', 'DORA approximated · learnings reuse · friction · cost');
    d.box('setup', 390, 548, 330, 52, 'skill', '/kaizen:setup', 'config, both plugins declared, doctor, upgrade');
    d.legend(36, 640, LEGEND);
  }),
);

// ---------------------------------------------------------------------------------------------------
// 2. The quality gate
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('quality-gate', 1100, 560, 'The quality gate (Stop hook)', 'A session that edits code cannot end a turn while the checks are red — three times at most. Nothing to turn on.', (d) => {
    d.box('edit', 36, 90, 210, 56, 'outside', 'Claude edits a code file', 'Write · Edit · MultiEdit');
    d.box('post', 36, 186, 210, 64, 'gate', 'PostToolUse post-edit.mjs', 'not Markdown, not .kaizen/\nnot agent-skills’ planning');
    d.box('state', 36, 290, 210, 64, 'state', 'gate.json', 'active · session · since\nblocks · files', { round: 10 });
    d.arrow(['edit.b', 'post.t'], { tone: 'accent' });
    d.arrow(['post.b', 'state.t'], { tone: 'bad' });
    d.box('stop', 290, 90, 170, 56, 'outside', 'Claude ends a turn', 'Stop event');
    const chain = [
      ['c1', 'on, and this session?'],
      ['c2', 'older than max_age_hours (24 h)?'],
      ['c3', 'run verify (budget 840 s)'],
      ['c4', 'all checks green?'],
      ['c5', 'blocks > max_blocks (3)?'],
    ];
    chain.forEach(([id, l], i) => d.box(id, 520, 86 + i * 70, 330, 46, i === 2 ? 'plain' : 'gate', l));
    d.arrow(['stop.r', 'c1.l'], {});
    for (let i = 0; i < chain.length - 1; i++) d.arrow([`${chain[i][0]}.b`, `${chain[i + 1][0]}.t`], { label: i === 0 ? 'yes' : i === 1 ? 'no' : i === 3 ? 'no' : null, anchor: 'start', dx: 8, dy: 4 });
    d.box('pass', 892, 86, 176, 46, 'plain', 'finish (exit 0)');
    d.box('expire', 892, 156, 176, 46, 'plain', 'expired: off');
    d.box('green', 892, 296, 176, 46, 'plain', 'finish, gate off');
    d.box('giveup', 892, 366, 176, 56, 'state', 'finish, gate off', 'say what is still red', { round: 10 });
    d.box('block', 520, 450, 330, 56, 'gate', 'BLOCK (exit 2)', 'failure tails sent back: fix the cause,\nnever skip or weaken a test');
    d.arrow(['c1.r', 'pass.l'], { label: 'no', dy: -6 });
    d.arrow(['c2.r', 'expire.l'], { label: 'yes', dy: -6 });
    d.arrow(['c4.r', 'green.l'], { tone: 'ok', label: 'yes', dy: -6 });
    d.arrow(['c5.r', 'giveup.l@0.4'], { label: 'yes', dy: -6 });
    d.arrow(['c5.b', 'block.t'], { tone: 'bad', label: 'no', anchor: 'start', dx: 8, dy: 4 });
    d.arrow(['block.l', [480, 478], [480, 180], [375, 180], 'stop.b'], { tone: 'bad', dashed: true, label: 'Claude keeps working', at: 2, dy: -6 });
    d.text(290, 236, 'targeted checks:\ngate.targeted with {files}\n= only what the branch touches', 'small');
    d.box('off', 36, 410, 210, 56, 'skill', 'node $K gate off', 'only when the failure is\noutside the task, said to you');
    d.text(36, 530, 'gate.enabled: false turns it off for the repo. Another session open on the same repo is never blocked by this one’s gate.', 'small');
  }),
);

// ---------------------------------------------------------------------------------------------------
// 3. The review before push
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('push-gate', 1100, 640, 'The review required before git push', 'agent-skills reviews; Kaizen records the tree it reviewed and the verdict it wrote. A PreToolUse hook stops an unreviewed push, or you choose to skip it.', (d) => {
    d.region(28, 76, 330, 520, 'The review records itself');
    d.box('rv', 44, 106, 140, 60, 'agent', '/kaizen:review', 'skill, in the\nconversation');
    d.box('sh', 202, 106, 140, 60, 'agent', '/kaizen:ship', 'code-reviewer\npersona');
    d.box('mark', 44, 196, 140, 64, 'gate', 'PostToolUse Skill', 'leaves a mark\nreview-pending.json');
    d.box('stopr', 44, 290, 140, 64, 'gate', 'Stop --stop', 'reads the turn’s\nlast message');
    d.box('agent', 202, 196, 140, 64, 'gate', 'PostToolUse Agent', 'reads the\npersona’s return');
    d.arrow(['rv.b', 'mark.t'], { tone: 'accent' });
    d.arrow(['mark.b', 'stopr.t'], {});
    d.arrow(['sh.b', 'agent.t'], { tone: 'accent' });
    d.box('verdict', 44, 384, 298, 64, 'plain', 'verdict', 'Critical finding → blocked\nVerdict: REQUEST CHANGES → concerns · else ready');
    d.arrow(['stopr.b', [114, 384]], {});
    d.arrow(['agent.b', [272, 384]], {});
    d.box('rf', 44, 476, 298, 66, 'state', 'reviews.json[branch]', 'tree · head · verdict · reviewer', { round: 10 });
    d.arrow(['verdict.b', 'rf.t'], { tone: 'bad' });
    d.text(44, 568, 'Direct writes to these state files are refused.', 'small');
    d.box('push', 396, 96, 300, 50, 'outside', 'git push (any spelling)');
    const checks = [
      ['k1', 'require_before_push: false?', 'allow'],
      ['k2', 'default branch or no new code?', 'allow'],
      ['k3', 'no review recorded?', 'stop'],
      ['k4', 'reviewed tree not found?', 'stop'],
      ['k5', 'blocked and unchanged since?', 'stop'],
      ['k6', '> 80 lines since the review?', 'stop'],
    ];
    checks.forEach(([id, l], i) => d.box(id, 396, 176 + i * 62, 300, 44, 'gate', l));
    d.arrow(['push.b', 'k1.t'], { label: 'PreToolUse review-gate', anchor: 'start', dx: 8, dy: 4 });
    for (let i = 0; i < checks.length - 1; i++) d.arrow([`${checks[i][0]}.b`, `${checks[i + 1][0]}.t`], {});
    checks.forEach(([id, , out]) => d.arrow([`${id}.r`, [748, d.pt(`${id}.r`)[1]]], { tone: out === 'allow' ? 'ok' : 'bad', label: out, lx: 724, anchor: 'middle' }));
    d.box('allow', 396, 556, 300, 44, 'plain', 'otherwise: push allowed ✔');
    d.arrow(['k6.b', 'allow.t'], { tone: 'ok' });
    d.arrow(['rf.r', [374, 509], [374, 300], 'k3.l'], { tone: 'blue', dashed: true, label: 'read', at: 1, lx: 374, ly: 420 });
    d.region(760, 76, 312, 520, 'Skipping it: only you decide');
    d.box('ask', 776, 106, 280, 46, 'outside', 'stop: Claude asks you');
    d.box('w1', 776, 176, 280, 56, 'agent', '1. Run the review (Recommended)', '2. Push without a review');
    d.box('w2', 776, 256, 280, 46, 'state', 'push-offers.json (this commit)', null, { round: 10 });
    d.box('w3', 776, 326, 280, 52, 'outside', 'you choose 2: Claude pushes again', 'Claude cannot choose for you');
    d.box('w4', 776, 402, 280, 56, 'gate', 'Claude Code permission prompt', 'only you can answer it');
    d.box('w5', 776, 482, 280, 62, 'state', 'pushed without a review', 'logged in friction.jsonl\n(declined → /kaizen:review)', { round: 10 });
    d.arrow(['ask.b', 'w1.t'], {});
    d.arrow(['w1.b', 'w2.t'], {});
    d.arrow(['w2.b', 'w3.t'], {});
    d.arrow(['w3.b', 'w4.t'], { tone: 'accent' });
    d.arrow(['w4.b', 'w5.t'], { tone: 'bad' });
    d.legend(36, 622, LEGEND.filter(([k]) => k !== 'skill').concat([['state', 'state in .kaizen/state/']]));
  }),
);

// ---------------------------------------------------------------------------------------------------
// 4. Learnings
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('learnings-loop', 1100, 560, 'How learnings compound', 'A lesson only counts once it is read back. Kaizen reads it back by itself, measures the reuse, and prunes what nobody uses.', (d) => {
    d.box('fix', 36, 90, 220, 56, 'outside', 'a problem solved', 'and verified');
    d.box('learn', 36, 186, 220, 76, 'skill', '/kaizen:learn', 'durability test: would someone\nmake the mistake again without it?');
    d.box('no', 36, 300, 220, 44, 'plain', '“Learning not written: …”');
    d.arrow(['fix.b', 'learn.t'], { tone: 'accent' });
    d.arrow(['learn.b', 'no.t'], { label: 'no', anchor: 'start', dx: 8, dy: 4 });
    d.box('file', 320, 160, 330, 128, 'artifact', '', null, { align: 'left' });
    d.text(336, 186, 'docs/learnings/<folder>/<slug>.md', 'small mono');
    d.text(336, 210, 'title · date · module · problem_type\ncomponent · severity · tags · files\nbug: symptoms · root_cause · resolution_type\nknowledge: applies_when', 'small');
    d.arrow(['learn.r', [320, 224]], { tone: 'blue', label: 'yes · validated', dy: -8 });
    d.region(690, 76, 382, 230, 'Read back by post-edit.mjs (no command)');
    d.box('spec', 706, 112, 350, 64, 'agent', 'SPEC.md or tasks/ written', 'matching learnings added to Claude’s\ncontext, cited in tasks/plan.md');
    d.box('code', 706, 196, 350, 64, 'gate', 'a file edited', 'learnings whose files: globs match it,\nonce per session');
    d.arrow(['file.r@0.3', 'spec.l'], { tone: 'ok' });
    d.arrow(['file.r@0.7', 'code.l'], { tone: 'ok' });
    d.box('plancite', 706, 330, 166, 60, 'state', 'cited by a plan', '= read', { round: 12 });
    d.box('commit', 890, 330, 166, 60, 'state', 'cited by a commit', '= applied', { round: 12 });
    d.box('metrics', 690, 420, 382, 66, 'skill', '/kaizen:metrics → kaizen_loop', 'reuse rate · never cited');
    d.arrow(['plancite.b', [789, 420]], { tone: 'blue' });
    d.arrow(['commit.b', [973, 420]], { tone: 'blue' });
    d.box('prune', 320, 420, 330, 66, 'skill', '/kaizen:learn prune', 'Keep · Update · Merge · Replace · Delete\nwith evidence; never touches product code');
    d.arrow(['metrics.l', 'prune.r'], { tone: 'accent', dashed: true, label: 'never cited', dy: 22 });
    d.arrow(['prune.t', [485, 288]], { tone: 'blue', dashed: true });
    d.legend(36, 540, LEGEND.filter(([k]) => k !== 'outside').concat([['state', 'signal']]));
  }),
);

// ---------------------------------------------------------------------------------------------------
// 5. PR follow-up
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('pr-watch', 1100, 640, 'Driving a PR to "looks ready" (/kaizen:watch)', 'Feedback before CI, CI before branch updates, a token-free watcher between cycles. You merge, never Kaizen.', (d) => {
    d.box('snap', 36, 90, 220, 60, 'gate', 'pr snapshot', 'paginated threads, comments,\nreviews, head checks, merge state');
    d.box('term', 36, 182, 220, 44, 'plain', 'merged / closed → stop');
    d.box('fit', 36, 420, 220, 104, 'gate', 'Still relevant?', 'pr overlap, before the first cycle:\nbase touched the PR paths?\nUpdate → cycles · Rework / Close\n→ stop, you decide');
    const cyc = [
      ['fb', '1. Feedback first', 'verdict per comment, fix pushed\nbefore the reply, thread resolved'],
      ['head', '2. Head moved?', 'observed CI is stale: next cycle'],
      ['ci', '3. CI red', 'infra failure: one rerun\nreal failure: logs → fix → push'],
      ['br', '4. Branch currency', 'BEHIND → update-branch API\nDIRTY → merge base locally'],
      ['conv', '5. Convergence', 'same check red after 2 fixes,\nor threads growing → stop'],
    ];
    cyc.forEach(([id, l, sub], i) => d.box(id, 320, 90 + i * 84, 300, 64, 'skill', l, sub));
    d.arrow(['snap.r', 'fb.l'], { tone: 'accent' });
    d.arrow(['snap.b', 'term.t'], {});
    for (let i = 0; i < cyc.length - 1; i++) d.arrow([`${cyc[i][0]}.b`, `${cyc[i + 1][0]}.t`], { tone: 'accent' });
    d.arrow(['br.l', [288, 374], [288, 472], 'fit.r'], { dashed: true, label: 'base moved', at: 1, lx: 210, ly: 400, anchor: 'start' });
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
    d.text(680, 452, '· mergeable = MERGEABLE, merge state CLEAN\n· checks finished and green\n· no open thread or comment, no human decision\n· branch up to date\n· PR quiet for ≥ 5 min (settle_seconds 300)\n· no review on its way (👀, "reviewing…")', 'small');
    d.text(36, 620, 'Kaizen messages carry <!-- kaizen --> and are context, never feedback. State: .kaizen/state/pr/<owner>-<repo>-<n>.json (delete it to start over).', 'small');
  }),
);

// ---------------------------------------------------------------------------------------------------
// 6. Hooks in a session
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('hooks', 1100, 580, 'Kaizen’s hooks in a Claude Code session', 'Nine hook registrations make the rules deterministic. Only the secret scan runs outside a Kaizen repo, and none blocks on its own errors.', (d) => {
    const lane = (y, label) => {
      d.text(36, y + 4, label, 'regionlabel');
      d.arrow([[150, y], [1064, y]], { none: true });
    };
    lane(104, 'YOU');
    lane(254, 'CLAUDE');
    lane(430, 'END OF TURN');
    d.box('ss', 170, 76, 230, 56, 'gate', 'SessionStart', 'review-hooks.mjs --heartbeat:\nhooks-seen.json, read by doctor');
    d.box('msg', 440, 84, 270, 40, 'outside', 'you send a message');
    d.box('ups', 740, 76, 324, 56, 'gate', 'UserPromptSubmit', 'review-hooks.mjs --confirm:\ntyped codes (approvals: "code")');
    d.arrow(['msg.r', 'ups.l'], {});
    d.box('tool', 170, 234, 230, 40, 'plain', 'Claude calls a tool');
    d.box('pre1', 440, 152, 270, 82, 'gate', 'PreToolUse (Bash)', 'secret-gate.mjs: commit carrying\na secret, --no-verify → 2');
    d.box('pre2', 440, 254, 270, 82, 'gate', 'PreToolUse (Bash, Write, Edit)', 'review-gate.mjs: push without\nreview, state writes → 2');
    d.box('post1', 740, 152, 324, 82, 'gate', 'PostToolUse (Write, Edit)', 'post-edit.mjs: quality gate on when\ncode is edited · learnings read back');
    d.box('post2', 740, 254, 324, 82, 'gate', 'PostToolUse (Agent, Task, Skill)', 'review-hooks.mjs --evidence:\nagent-skills’ review recorded');
    d.arrow(['msg.b', [575, 142], [285, 142], 'tool.t'], { dashed: true });
    d.arrow(['tool.r', [420, 254], [420, 193], 'pre1.l'], {});
    d.arrow(['tool.r', [420, 254], [420, 295], 'pre2.l'], {});
    d.arrow(['pre1.r', 'post1.l'], { tone: 'ok' });
    d.arrow(['pre2.r', 'post2.l'], { tone: 'ok' });
    d.text(740, 144, 'allowed → the tool runs, then:', 'edge');
    d.box('stop1', 170, 392, 270, 76, 'gate', 'Stop', 'quality-gate.mjs: verify while the\ngate is on · blocks ≤ 3 times');
    d.box('stop2', 460, 392, 280, 76, 'gate', 'Stop', 'review-hooks.mjs --stop: the turn\nthat ran a review → review recorded');
    d.box('stop3', 760, 392, 304, 76, 'gate', 'Stop', 'ledger-hook.mjs: charges the turn’s\ntokens to the work item · never blocks');
    d.text(36, 506, 'Exit 0 = allow, exit 2 = block with the message on stderr (sent back to Claude). SessionStart, UserPromptSubmit, PostToolUse and the ledger only observe.\nAll registrations live in hooks/hooks.json and use ${CLAUDE_PLUGIN_ROOT}; timeouts: SessionStart 10 s, PreToolUse 30 s, PostToolUse 15 s,\nStop 900 s (gate), 15 s (review), 30 s (ledger), UserPromptSubmit 30 s.', 'small');
  }),
);

// ---------------------------------------------------------------------------------------------------
// 7. What Kaizen writes
// ---------------------------------------------------------------------------------------------------
written.push(
  diagram('artifacts-map', 1100, 496, 'What Kaizen writes in your repo, and who reads it', 'Kaizen keeps few files: the learnings and its configuration are versioned; its state stays on your machine.', (d) => {
    const rows = [
      ['/kaizen:learn', 'docs/learnings/<folder>/<slug>.md', 'post-edit hook → Claude, at spec, plan, edit'],
      ['/kaizen:setup · init', '.kaizen/config.json', 'every hook and the CLI'],
      ['/kaizen:setup', '.claude/settings.json', 'Claude Code: both plugins for every clone'],
      ['hooks · CLI', '.kaizen/state/ (git-ignored)', 'gates · watch · metrics · cost'],
      ['agent-skills', 'SPEC.md · tasks/ · CONSTRAINTS.md', 'Kaizen reads them (doctor, status, learnings)'],
    ];
    d.text(36, 88, 'WRITTEN BY', 'regionlabel');
    d.text(296, 88, 'FILE', 'regionlabel');
    d.text(678, 88, 'READ BY', 'regionlabel');
    rows.forEach(([w, f, r], i) => {
      const y = 100 + i * 64;
      d.box(`w${i}`, 36, y, 230, 48, i === 4 ? 'agent' : 'skill', w);
      d.box(`f${i}`, 296, y, 350, 48, i === 3 ? 'state' : 'artifact', f, null, { mono: true, round: i === 3 ? 10 : 8, cls: 't12' });
      d.box(`r${i}`, 678, y, 386, 48, 'plain', r, null, { cls: 't12' });
      d.arrow([`w${i}.r`, `f${i}.l`], { tone: 'accent' });
      d.arrow([`f${i}.r`, `r${i}.l`], { tone: 'blue' });
    });
    d.text(36, 436, 'Default root docs/ (docs_root). No file carries a mutable "status": progress is read from git and from agent-skills’ task checkboxes.', 'small');
    d.legend(36, 476, LEGEND.filter(([k]) => k !== 'gate' && k !== 'outside').concat([['state', 'local state']]));
  }),
);

for (const n of written) process.stdout.write(`docs/media/diagrams/${n}.svg\n`);
