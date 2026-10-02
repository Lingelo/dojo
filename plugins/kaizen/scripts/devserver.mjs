// Kaizen — détection et sonde du serveur de développement (pour /kaizen:polish).
//
//   detect [--dir d]   → candidats { name, framework, command, cwd, port, url, source }
//   probe --url U [--timeout-seconds 30]  → joignable ? (attend jusqu'au délai)
//
// Le lancement lui-même est fait par l'agent (Bash en arrière-plan) : la session garde la main sur le
// processus et ses logs.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function packageManager(dir, root) {
  for (const d of [dir, root]) {
    if (existsSync(join(d, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(d, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(d, 'bun.lockb')) || existsSync(join(d, 'bun.lock'))) return 'bun';
  }
  return 'npm';
}

const NODE_FRAMEWORKS = [
  ['next', 'Next.js', 3000],
  ['nuxt', 'Nuxt', 3000],
  ['@sveltejs/kit', 'SvelteKit', 5173],
  ['@remix-run/dev', 'Remix', 5173],
  ['@react-router/dev', 'React Router', 5173],
  ['astro', 'Astro', 4321],
  ['@angular/core', 'Angular', 4200],
  ['gatsby', 'Gatsby', 8000],
  ['react-scripts', 'Create React App', 3000],
  ['vite', 'Vite', 5173],
  ['@storybook/react', 'Storybook', 6006],
];

function portFromScript(script) {
  const m = /(?:--port[ =]|-p[ =]?|PORT=)(\d{2,5})/.exec(script || '');
  return m ? Number(m[1]) : null;
}

function nodeCandidates(dir, root) {
  const pkg = readJson(join(dir, 'package.json'));
  if (!pkg) return [];
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = pkg.scripts || {};
  const scriptName = ['dev', 'start:dev', 'serve', 'start'].find((s) => scripts[s]);
  if (!scriptName) return [];
  const fw = NODE_FRAMEWORKS.find(([dep]) => deps[dep]);
  const port = portFromScript(scripts[scriptName]) || fw?.[2] || 3000;
  const pm = packageManager(dir, root);
  return [
    {
      name: pkg.name || relative(root, dir) || '.',
      framework: fw?.[1] || 'node',
      command: pm === 'npm' ? `npm run ${scriptName}` : `${pm} run ${scriptName}`,
      cwd: relative(root, dir) || '.',
      port,
      url: `http://localhost:${port}`,
      source: `package.json scripts.${scriptName}`,
    },
  ];
}

function otherCandidates(dir, root) {
  const out = [];
  const rel = relative(root, dir) || '.';
  const has = (f) => existsSync(join(dir, f));
  const gemfile = has('Gemfile') ? readFileSync(join(dir, 'Gemfile'), 'utf8') : '';
  if (/gem ['"]rails['"]/.test(gemfile)) {
    out.push({ name: rel, framework: 'Rails', command: has('bin/dev') ? 'bin/dev' : 'bin/rails server', cwd: rel, port: 3000, url: 'http://localhost:3000', source: has('bin/dev') ? 'bin/dev' : 'Gemfile' });
  } else if (has('Procfile.dev')) {
    out.push({ name: rel, framework: 'Procfile', command: has('bin/dev') ? 'bin/dev' : 'foreman start -f Procfile.dev', cwd: rel, port: 5000, url: 'http://localhost:5000', source: 'Procfile.dev' });
  }
  if (has('manage.py')) out.push({ name: rel, framework: 'Django', command: 'python manage.py runserver', cwd: rel, port: 8000, url: 'http://localhost:8000', source: 'manage.py' });
  if (has('mix.exs') && /phoenix/.test(readFileSync(join(dir, 'mix.exs'), 'utf8'))) out.push({ name: rel, framework: 'Phoenix', command: 'mix phx.server', cwd: rel, port: 4000, url: 'http://localhost:4000', source: 'mix.exs' });
  if (has('artisan')) out.push({ name: rel, framework: 'Laravel', command: 'php artisan serve', cwd: rel, port: 8000, url: 'http://localhost:8000', source: 'artisan' });
  return out;
}

function launchJson(root) {
  const cfg = readJson(join(root, '.claude', 'launch.json'));
  if (!cfg?.configurations?.length) return [];
  return cfg.configurations
    .filter((c) => c.runtimeExecutable && c.port)
    .map((c) => ({
      name: c.name || c.runtimeExecutable,
      framework: 'launch.json',
      command: [c.runtimeExecutable, ...(c.runtimeArgs || [])].join(' '),
      cwd: c.cwd || '.',
      env: c.env || {},
      port: Number(c.port),
      url: `http://localhost:${c.port}`,
      source: '.claude/launch.json',
    }));
}

export function detectDevServers(root) {
  const declared = launchJson(root);
  if (declared.length) return declared;
  const dirs = [root];
  for (const group of ['apps', 'packages', 'web', 'frontend', 'client', 'services']) {
    const g = join(root, group);
    if (!existsSync(g)) continue;
    if (existsSync(join(g, 'package.json'))) dirs.push(g);
    for (const e of readdirSync(g, { withFileTypes: true })) if (e.isDirectory()) dirs.push(join(g, e.name));
  }
  const out = [];
  for (const d of dirs) out.push(...nodeCandidates(d, root), ...otherCandidates(d, root));
  // Un monorepo dont la racine ne fait que déléguer (turbo/nx) garde aussi ses apps.
  return out;
}

export async function probe(url, timeoutSeconds = 30) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
      clearTimeout(t);
      return { reachable: true, status: res.status, url };
    } catch (err) {
      last = err.cause?.code || err.name || String(err);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { reachable: false, url, error: last };
}
