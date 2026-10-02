#!/usr/bin/env node
// Kaizen — évaluations de bout en bout : chaque scénario prépare un dépôt piégé, lance une skill
// dans une session Claude Code headless (`claude -p --plugin-dir`), puis vérifie le résultat.
//
//   node evals/run.mjs                 tous les scénarios
//   node evals/run.mjs review-injection plan-valid
//   KAIZEN_EVAL_KEEP=1                 garde les dépôts temporaires pour inspection
//
// Coûteux (appels de modèle réels) : à lancer avant une release, pas dans la CI par défaut.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..');
const CLI = join(PLUGIN, 'scripts', 'kaizen.mjs');

function sh(cwd, cmd, args) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo(files, steps) {
  const dir = mkdtempSync(join(tmpdir(), 'kaizen-eval-'));
  sh(dir, 'git', ['init', '-q', '-b', 'main']);
  sh(dir, 'git', ['config', 'user.email', 'eval@example.com']);
  sh(dir, 'git', ['config', 'user.name', 'Eval']);
  const write = (fs) => {
    for (const [p, c] of Object.entries(fs)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), typeof c === 'string' ? c : JSON.stringify(c, null, 2));
    }
  };
  write(files);
  sh(dir, 'git', ['add', '-A']);
  sh(dir, 'git', ['commit', '-qm', 'chore: init']);
  for (const step of steps || []) {
    if (step.branch) sh(dir, 'git', ['checkout', '-qb', step.branch]);
    if (step.files) write(step.files);
    if (step.tag) sh(dir, 'git', ['tag', step.tag]);
    if (step.commit) {
      sh(dir, 'git', ['add', '-A']);
      sh(dir, 'git', ['commit', '-qm', step.commit]);
    }
  }
  return dir;
}

function runClaude(dir, prompt, timeoutMs) {
  return new Promise((resolve) => {
    const args = ['--plugin-dir', PLUGIN, '-p', prompt, '--allowedTools', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Agent', 'Skill', 'TaskCreate', 'TaskUpdate'];
    // Session isolée : sans cela, un claude -p lancé depuis une session Claude Code hérite de son
    // identifiant et écrit dans sa liste de tâches.
    const env = { ...process.env };
    for (const k of ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID', 'CLAUDE_CODE_CHILD_SESSION']) delete env[k];
    const child = spawn('claude', args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const ctx = (dir) => ({
  dir,
  kaizen: (...args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
    }
  },
  git: (...args) => sh(dir, 'git', args),
  run: (cmd, args) => {
    try {
      return { code: 0, out: execFileSync(cmd, args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }) };
    } catch (e) {
      return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
    }
  },
  read: (p) => {
    try {
      return readFileSync(join(dir, p), 'utf8');
    } catch {
      return '';
    }
  },
  lsRead: (p, re) => {
    try {
      return readdirSync(join(dir, p), { recursive: true }).filter((f) => re.test(f)).map((f) => readFileSync(join(dir, p, f), 'utf8')).join('\n');
    } catch {
      return '';
    }
  },
  ls: (p) => {
    try {
      return readdirSync(join(dir, p), { recursive: true }).filter((f) => !f.endsWith('.gitkeep'));
    } catch {
      return [];
    }
  },
});

const wanted = process.argv.slice(2);
const files = readdirSync(join(HERE, 'scenarios')).filter((f) => f.endsWith('.mjs')).sort();
let failed = 0;
for (const f of files) {
  const sc = (await import(join(HERE, 'scenarios', f))).default;
  if (wanted.length && !wanted.includes(sc.name)) continue;
  const dir = makeRepo(sc.files, sc.steps);
  const started = Date.now();
  const { out } = await runClaude(dir, sc.prompt, (sc.timeoutMinutes || 10) * 60000);
  const results = sc.checks.map(([label, fn]) => {
    let ok = false;
    let note = '';
    try {
      const r = fn(out, ctx(dir));
      ok = r === true || r?.ok === true;
      note = r?.note || '';
    } catch (e) {
      note = e.message;
    }
    return { label, ok, note };
  });
  const pass = results.every((r) => r.ok);
  if (!pass) failed++;
  console.log(`${pass ? '✔' : '✘'} ${sc.name} (${Math.round((Date.now() - started) / 1000)} s)`);
  for (const r of results) console.log(`    ${r.ok ? '✔' : '✘'} ${r.label}${r.note ? ` — ${r.note}` : ''}`);
  if (!pass || process.env.KAIZEN_EVAL_KEEP) {
    writeFileSync(join(dir, 'eval-output.txt'), out);
    console.log(`    dépôt gardé : ${dir} (sortie dans eval-output.txt)`);
  } else rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
