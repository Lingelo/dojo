// Outils communs aux tests : dépôts git jetables et exécution du CLI.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = join(PLUGIN, 'scripts', 'kaizen.mjs');
export const GATE = join(PLUGIN, 'scripts', 'quality-gate.mjs');
export const FAKE_GH = join(PLUGIN, 'tests', 'fixtures', 'fake-gh.mjs');

export function tempRepo(files = {}, { branch = 'main', commit = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kaizen-test-'));
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  writeFiles(dir, files);
  if (commit && Object.keys(files).length) gitc(dir, ['add', '-A'], ['commit', '-qm', 'chore: init']);
  return dir;
}

export function writeFiles(dir, files) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
}

export function gitc(dir, ...cmds) {
  for (const args of cmds) execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
}

export function cli(dir, args, { env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env }, input });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {}
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}
