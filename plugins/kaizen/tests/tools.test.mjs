import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { INTENTS, inventory, onPath, pick } from '../scripts/tools.mjs';
import { cleanup, cli, tempRepo, writeFiles } from './helpers.mjs';

function setup() {
  const repo = tempRepo({
    'README.md': '# x\n',
    '.mcp.json': {
      mcpServers: {
        sentry: { command: 'npx', args: ['-y', '@sentry/mcp-server@0.12.0'] },
        figma: { type: 'http', url: 'https://mcp.figma.com/mcp?token=SECRET-IN-URL' },
        postgres: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
      },
    },
    '.claude/settings.json': { enabledMcpjsonServers: ['sentry'], disabledMcpjsonServers: ['postgres'] },
  });
  const configDir = mkdtempSync(join(tmpdir(), 'kaizen-claude-'));
  writeFileSync(join(configDir, '.claude.json'), JSON.stringify({
    mcpServers: {
      github: { command: 'docker', args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_secretvalue' } },
      context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] },
    },
    projects: { [realpathSync(repo)]: { mcpServers: { sentry: { command: 'npx', args: ['-y', '@sentry/mcp-server@0.12.0'] } } } },
  }));
  return { repo, configDir, env: { ...process.env, CLAUDE_CONFIG_DIR: configDir } };
}

test('inventory: every scope, its status and category, versions checked, no secret printed', () => {
  const { repo, configDir, env } = setup();
  try {
    const inv = inventory(realpathSync(repo), { env });
    const by = (name, scope) => inv.servers.find((s) => s.name === name && s.scope === scope);
    assert.equal(by('playwright', 'plugin:kaizen').category, 'browser');
    assert.equal(by('playwright', 'plugin:kaizen').pinned, true);
    assert.equal(by('sentry', 'project').status, 'enabled');
    assert.equal(by('sentry', 'project').category, 'observability');
    assert.equal(by('figma', 'project').status, 'needs approval');
    assert.equal(by('figma', 'project').url, 'https://mcp.figma.com/mcp');
    assert.equal(by('postgres', 'project').status, 'disabled');
    assert.equal(by('postgres', 'project').pinned, false);
    assert.equal(by('github', 'user').category, 'github');
    assert.equal(by('github', 'user').pinned, false);
    assert.equal(by('context7', 'user').category, 'docs');
    assert.equal(by('context7', 'user').pinned, false);
    assert.ok(by('sentry', 'local'));
    const text = JSON.stringify(inv);
    assert.ok(!text.includes('ghp_secretvalue') && !text.includes('SECRET-IN-URL'), 'env values and URL queries never printed');
    assert.ok(inv.warnings.some((w) => w.startsWith('context7') && w.includes('pin')));
    assert.ok(inv.warnings.some((w) => w.startsWith('figma') && w.includes('approved')));
    assert.ok(inv.warnings.some((w) => w.startsWith('sentry') && w.includes('several scopes')));
  } finally {
    cleanup(repo);
    cleanup(configDir);
  }
});

test('pick: first available preference wins, a disabled server does not count, nothing → ask', () => {
  const inv = {
    servers: [
      { name: 'playwright', category: 'browser', status: 'enabled' },
      { name: 'pg', category: 'database', status: 'disabled' },
    ],
    clis: { gh: false, curl: true, psql: true },
    playwright_test: false,
  };
  assert.equal(pick('see-page', inv).pick.tool, 'mcp:browser');
  assert.equal(pick('see-page', inv).pick.via, 'playwright');
  assert.equal(pick('ui-check', inv).pick.tool, 'ask', 'a browser session is not a repeatable check');
  assert.equal(pick('ui-check', { ...inv, playwright_test: true }).pick.tool, 'repo:playwright-test');
  assert.equal(pick('database', inv).pick.tool, 'cli:psql');
  assert.ok(pick('database', inv).missing.includes('mcp:database'));
  assert.equal(pick('github', inv).pick.tool, 'ask');
  assert.equal(pick('read-web', inv).pick.tool, 'builtin:WebFetch');
  assert.equal(pick('nope', inv), null);
  for (const [k, v] of Object.entries(INTENTS)) assert.ok(v.question && v.prefs.length && v.fallback, k);
});

test('onPath finds an executable in PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaizen-path-'));
  try {
    writeFiles(dir, { 'fakecli': '', 'fakecli.cmd': '' });
    assert.equal(onPath('fakecli', { PATH: dir, PATHEXT: '.CMD' }), true);
    assert.equal(onPath('absent', { PATH: dir, PATHEXT: '.CMD' }), false);
  } finally {
    cleanup(dir);
  }
});

test('CLI: tools --json, tools pick, unknown intent', () => {
  const { repo, configDir } = setup();
  try {
    const env = { CLAUDE_CONFIG_DIR: configDir };
    const inv = cli(repo, ['tools', '--json'], { env });
    assert.equal(inv.code, 0);
    assert.ok(inv.json.servers.some((s) => s.name === 'sentry'));
    const r = cli(repo, ['tools', 'pick', 'observability', '--json'], { env });
    assert.equal(r.code, 0);
    assert.equal(r.json.pick.tool, 'mcp:observability');
    assert.match(r.json.pick.via, /sentry/);
    assert.ok(cli(repo, ['tools', 'intents'], { env }).json['see-page']);
    const bad = cli(repo, ['tools', 'pick', 'teleport'], { env });
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /see-page/);
  } finally {
    cleanup(repo);
    cleanup(configDir);
  }
});
