// Kaizen — cost dashboard: one self-contained HTML file over the cycles recorded on this machine.
//
// `kaizen metrics dashboard` reads `.kaizen/state/cycles.jsonl` (written by `gate off`) and writes a
// page with no dependency and no network: period filter, stat tiles, tokens per cycle by role, cost
// by model, tokens by role, and the table of cycles. Cost is in the relative units of `review
// estimate` (`review.cost_weights`), computed only for cycles that recorded tokens per model.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { usageTotal } from './lib.mjs';
import { DEFAULT_WEIGHTS } from './estimate.mjs';

// Roles folded into a few groups: a stacked column stays readable with six colors at most.
const GROUPS = ['main', 'implement', 'research', 'review', 'plan_review', 'other'];
const GROUP_OF = { implement: 'implement', research: 'research', review: 'review', review_critical: 'review', plan_review: 'plan_review', plan_review_critical: 'plan_review' };

export function readCycles(root) {
  let lines = [];
  try {
    lines = readFileSync(join(root, '.kaizen', 'state', 'cycles.jsonl'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  return lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((c) => c && c.ended && !Number.isNaN(Date.parse(c.ended)));
}

// One row per cycle, ready to chart: tokens per group and per model family, cost when known.
export function cycleRows(cycles, weights = DEFAULT_WEIGHTS) {
  const weightOf = (m) => weights[m] ?? Math.max(...Object.values(weights));
  return cycles
    .map((c) => {
      const groups = Object.fromEntries(GROUPS.map((g) => [g, 0]));
      groups.main = usageTotal(c.usage);
      for (const [role, u] of Object.entries(c.subagents?.by_role || {})) groups[GROUP_OF[role] || 'other'] += usageTotal(u);
      const models = {};
      for (const u of [c.usage, c.subagents?.usage]) {
        for (const [m, mu] of Object.entries(u?.by_model || {})) models[m] = (models[m] || 0) + usageTotal(mu);
      }
      const known = Object.keys(models).length > 0;
      return {
        ended: c.ended,
        plan: c.plan || null,
        minutes: Number(c.minutes) || 0,
        gate_blocks: Number(c.gate_blocks) || 0,
        agents: Number(c.subagents?.agents) || 0,
        tokens: Object.values(groups).reduce((a, b) => a + b, 0),
        groups,
        models,
        cost: known ? Math.round(Object.entries(models).reduce((n, [m, t]) => n + (t / 1e6) * weightOf(m), 0) * 100) / 100 : null,
      };
    })
    .sort((a, b) => Date.parse(a.ended) - Date.parse(b.ended));
}

export function renderDashboard({ repo, rows, weights, generated = new Date().toISOString() }) {
  // JSON inside <script>: `<` escaped so no data (a plan name) can close the tag.
  const data = JSON.stringify({ repo, rows, weights, generated, groups: GROUPS }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kaizen cost</title>
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10);
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
header h1 { font-size: 20px; margin: 0 0 4px; font-weight: 600; }
header p { margin: 0; color: var(--ink-2); }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 20px 0; }
.filters button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--ring); background: var(--surface); color: var(--ink-2); cursor: pointer; }
.filters button[aria-pressed="true"] { color: var(--ink); font-weight: 600; box-shadow: inset 0 0 0 1px var(--ink-2); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile, .card { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 14px 16px; }
.tile .label { color: var(--ink-2); font-size: 13px; }
.tile .value { font-size: 26px; font-weight: 600; margin-top: 2px; }
.tile.hero .value { font-size: 48px; line-height: 1.1; }
.tile .sub { color: var(--muted); font-size: 12px; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-top: 12px; }
.card { margin-top: 12px; }
.card h2 { font-size: 15px; margin: 0 0 2px; font-weight: 600; }
.card .desc { color: var(--ink-2); font-size: 13px; margin: 0 0 10px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 8px; color: var(--ink-2); font-size: 12px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
svg { display: block; width: 100%; overflow: visible; }
svg text { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
svg .val { fill: var(--ink-2); }
.mark:hover, .mark:focus { opacity: 0.8; outline: none; }
.empty { color: var(--muted); padding: 24px 0; }
#tip { position: fixed; pointer-events: none; background: var(--surface); color: var(--ink); border: 1px solid var(--ring); border-radius: 8px; padding: 8px 10px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); display: none; z-index: 10; min-width: 160px; }
#tip .t { color: var(--ink-2); margin-bottom: 4px; }
#tip .row { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
#tip .row b { font-variant-numeric: tabular-nums; }
#tip .key { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); }
#tip .key i { width: 12px; height: 2px; display: inline-block; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--grid); white-space: nowrap; }
th { color: var(--ink-2); font-weight: 600; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
footer { color: var(--muted); font-size: 12px; margin-top: 16px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Kaizen cost — <span id="repo"></span></h1>
    <p>Work and autopilot cycles closed by <code>gate off</code> on this machine. Generated <span id="gen"></span>.</p>
  </header>
  <div class="filters" role="group" aria-label="Period">
    <button data-days="7">Last 7 days</button>
    <button data-days="30">Last 30 days</button>
    <button data-days="90">Last 90 days</button>
    <button data-days="0">All</button>
  </div>
  <section class="tiles" id="tiles"></section>
  <section class="card">
    <h2>Tokens per cycle</h2>
    <p class="desc">Main session and subagents, by role. Hover a column for the breakdown.</p>
    <div class="legend" id="legend"></div>
    <div id="cycles"></div>
  </section>
  <div class="grid2">
    <section class="card"><h2>Cost by model</h2><p class="desc">Relative cost units, from the tokens of each model family.</p><div id="models"></div></section>
    <section class="card"><h2>Tokens by role</h2><p class="desc">Where the tokens of the period went.</p><div id="roles"></div></section>
  </div>
  <section class="card">
    <h2>Cycles</h2>
    <div class="table-wrap"><table id="table"></table></div>
  </section>
  <footer id="foot"></footer>
</main>
<div id="tip" role="tooltip"></div>
<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const NAMES = { main: 'Main session', implement: 'Implementation', research: 'Research', review: 'Code review', plan_review: 'Plan review', other: 'Other' };
  const COLOR = Object.fromEntries(D.groups.map((g, i) => [g, 'var(--s' + (i + 1) + ')']));
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, text) => {
    const e = tag === 'svg' || ['rect', 'path', 'line', 'text', 'g'].includes(tag) ? document.createElementNS(NS, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const compact = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));
  const planName = (p) => (p ? p.split(/[\\/]/).pop().replace(/\.md$/, '') : null);
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= v) return f * p; return 10 * p; };

  const tip = $('tip');
  const showTip = (ev, title, rows) => {
    tip.replaceChildren(el('div', { class: 't' }, title));
    for (const r of rows) {
      const row = el('div', { class: 'row' });
      const key = el('span', { class: 'key' });
      if (r.color) { const i = el('i'); i.style.background = r.color; key.append(i); }
      key.append(document.createTextNode(r.label));
      row.append(key, el('b', {}, r.value));
      tip.append(row);
    }
    tip.style.display = 'block';
    const box = ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : { left: 0, top: 0 };
    const x = ev.clientX || box.left + 8, y = ev.clientY || box.top;
    tip.style.left = Math.min(x + 12, innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
  };
  const hideTip = () => { tip.style.display = 'none'; };
  const hover = (node, title, rows) => {
    node.setAttribute('tabindex', '0');
    node.setAttribute('class', 'mark');
    node.setAttribute('aria-label', title + ': ' + rows.map((r) => r.label + ' ' + r.value).join(', '));
    node.addEventListener('pointermove', (e) => showTip(e, title, rows));
    node.addEventListener('focus', (e) => showTip(e, title, rows));
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('blur', hideTip);
  };

  // Rounded data-end (4px) on top, square on the baseline.
  const topRounded = (x, y, w, h, r) => { r = Math.min(r, w / 2, h); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; };
  const rightRounded = (x, y, w, h, r) => { r = Math.min(r, h / 2, w); return 'M' + x + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) + 'H' + x + 'Z'; };

  function stackedColumns(host, rows) {
    host.replaceChildren();
    if (!rows.length) { host.append(el('p', { class: 'empty' }, 'No cycle in this period.')); return; }
    const W = Math.max(280, host.clientWidth), H = 240, L = 44, B = 22, T = 8;
    const max = niceMax(Math.max(...rows.map((r) => r.tokens)));
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img', 'aria-label': 'Tokens per cycle, stacked by role' });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, y = T + (H - T - B) * (1 - v / max);
      svg.append(el('line', { x1: L, x2: W, y1: y, y2: y, stroke: i ? 'var(--grid)' : 'var(--axis)', 'stroke-width': 1 }));
      svg.append(el('text', { x: L - 6, y: y + 4, 'text-anchor': 'end' }, compact(v)));
    }
    const band = (W - L) / rows.length, bw = Math.max(2, Math.min(24, band * 0.7)), gap = bw >= 6 ? 2 : 0;
    const every = Math.ceil(rows.length / Math.max(1, Math.floor((W - L) / 64)));
    rows.forEach((r, i) => {
      const x = L + band * i + (band - bw) / 2;
      const g = el('g');
      let y = H - B;
      const parts = D.groups.filter((k) => r.groups[k] > 0);
      parts.forEach((k, j) => {
        const h = ((H - T - B) * r.groups[k]) / max;
        const top = j === parts.length - 1;
        const hh = Math.max(0, h - (top ? 0 : gap));
        y -= h;
        g.append(top ? el('path', { d: topRounded(x, y, bw, hh, 4), fill: COLOR[k] }) : el('rect', { x, y: y + gap, width: bw, height: hh, fill: COLOR[k] }));
      });
      // Hit target: the whole band, taller than the marks.
      g.append(el('rect', { x: L + band * i, y: T, width: band, height: H - T - B, fill: 'transparent' }));
      hover(g, day(r.ended) + (r.plan ? ' — ' + planName(r.plan) : ''), [
        ...D.groups.filter((k) => r.groups[k] > 0).reverse().map((k) => ({ label: NAMES[k], value: compact(r.groups[k]), color: COLOR[k] })),
        { label: 'Total', value: compact(r.tokens) },
        ...(r.cost !== null ? [{ label: 'Cost', value: r.cost.toFixed(2) }] : []),
      ]);
      svg.append(g);
      if (i % every === 0) svg.append(el('text', { x: L + band * i + band / 2, y: H - 6, 'text-anchor': 'middle' }, day(r.ended)));
    });
    host.append(svg);
  }

  function hbars(host, items, fmt, empty) {
    host.replaceChildren();
    items = items.filter((it) => it.value > 0);
    if (!items.length) { host.append(el('p', { class: 'empty' }, empty)); return; }
    const W = Math.max(260, host.clientWidth), row = 30, LBL = 110, R = 56, H = items.length * row;
    const max = Math.max(...items.map((it) => it.value));
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img' });
    items.forEach((it, i) => {
      const y = i * row + (row - 18) / 2, w = Math.max(2, ((W - LBL - R) * it.value) / max);
      const g = el('g');
      g.append(el('text', { x: 0, y: y + 13, class: 'val' }, it.label));
      g.append(el('path', { d: rightRounded(LBL, y, w, 18, 4), fill: 'var(--s1)' }));
      g.append(el('text', { x: LBL + w + 6, y: y + 13, class: 'val' }, fmt(it.value)));
      g.append(el('rect', { x: 0, y: i * row, width: W, height: row, fill: 'transparent' }));
      hover(g, it.label, [{ label: it.detail || 'Value', value: fmt(it.value) }]);
      svg.append(g);
    });
    host.append(svg);
  }

  function tile(label, value, sub, hero) {
    const t = el('div', { class: 'tile' + (hero ? ' hero' : '') });
    t.append(el('div', { class: 'label' }, label), el('div', { class: 'value' }, value));
    if (sub) t.append(el('div', { class: 'sub' }, sub));
    return t;
  }

  function render(days) {
    const from = days ? Date.now() - days * 864e5 : 0;
    const rows = D.rows.filter((r) => Date.parse(r.ended) >= from);
    for (const b of document.querySelectorAll('.filters button')) b.setAttribute('aria-pressed', String(Number(b.dataset.days) === days));
    const priced = rows.filter((r) => r.cost !== null);
    const tokens = rows.reduce((n, r) => n + r.tokens, 0);
    const sub = rows.reduce((n, r) => n + r.tokens - r.groups.main, 0);
    $('tiles').replaceChildren(
      tile('Cost', priced.length ? priced.reduce((n, r) => n + r.cost, 0).toFixed(2) : '—', priced.length < rows.length ? priced.length + ' of ' + rows.length + ' cycles priced' : 'relative units', true),
      tile('Cycles', String(rows.length), rows.length ? 'median ' + Math.round(median(rows.map((r) => r.minutes))) + ' min' : ''),
      tile('Tokens', compact(tokens), rows.length ? 'median ' + compact(median(rows.map((r) => r.tokens))) + ' per cycle' : ''),
      tile('Subagent share', tokens ? Math.round((sub / tokens) * 100) + '%' : '—', 'of tokens'),
      tile('Gate blocks', String(rows.reduce((n, r) => n + r.gate_blocks, 0)), rows.length ? rows.filter((r) => r.gate_blocks).length + ' cycle(s) blocked' : ''),
    );
    const legend = $('legend');
    legend.replaceChildren();
    for (const g of D.groups) {
      if (!rows.some((r) => r.groups[g] > 0)) continue;
      const s = el('span'); const i = el('i'); i.style.background = COLOR[g];
      s.append(i, document.createTextNode(NAMES[g])); legend.append(s);
    }
    stackedColumns($('cycles'), rows);
    const models = {};
    for (const r of rows) for (const [m, t] of Object.entries(r.models)) models[m] = (models[m] || 0) + t;
    const weightOf = (m) => D.weights[m] ?? Math.max(...Object.values(D.weights));
    hbars($('models'), Object.entries(models).map(([m, t]) => ({ label: m, value: (t / 1e6) * weightOf(m), detail: compact(t) + ' tokens × ' + weightOf(m) })).sort((a, b) => b.value - a.value), (v) => v.toFixed(2), 'No cycle recorded tokens per model yet (Kaizen 3.7+).');
    hbars($('roles'), D.groups.map((g) => ({ label: NAMES[g], value: rows.reduce((n, r) => n + r.groups[g], 0), detail: 'Tokens' })).sort((a, b) => b.value - a.value), compact, 'No cycle in this period.');
    const table = $('table');
    table.replaceChildren();
    const head = el('tr');
    for (const [h, n] of [['Ended', 0], ['Plan', 0], ['Minutes', 1], ['Tokens', 1], ['Cost', 1], ['Agents', 1], ['Gate blocks', 1]]) head.append(el('th', n ? { class: 'n' } : {}, h));
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const body = el('tbody');
    for (const r of [...rows].reverse()) {
      const tr = el('tr');
      tr.append(el('td', {}, new Date(r.ended).toLocaleString()), el('td', { title: r.plan || '' }, planName(r.plan) || '—'), el('td', { class: 'n' }, String(r.minutes)), el('td', { class: 'n' }, compact(r.tokens)), el('td', { class: 'n' }, r.cost === null ? '—' : r.cost.toFixed(2)), el('td', { class: 'n' }, String(r.agents)), el('td', { class: 'n' }, String(r.gate_blocks)));
      body.append(tr);
    }
    table.append(body);
    current = days;
  }

  let current = 30;
  $('repo').textContent = D.repo;
  $('gen').textContent = new Date(D.generated).toLocaleString();
  $('foot').textContent = 'Cost = tokens per model family × weight per million tokens (' + Object.entries(D.weights).map(([m, w]) => m + ' ' + w).join(', ') + '; review.cost_weights in .kaizen/config.json). Cache reads dominate subagent tokens: an order of magnitude, not a bill. Local to this machine.';
  for (const b of document.querySelectorAll('.filters button')) b.addEventListener('click', () => render(Number(b.dataset.days)));
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => render(current), 120); });
  render(D.rows.some((r) => Date.parse(r.ended) >= Date.now() - 30 * 864e5) ? 30 : 0);
})();
</script>
</body>
</html>
`;
}
