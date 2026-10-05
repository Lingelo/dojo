// Kaizen — secret scanner (zero dependency): ~30 provider patterns over added lines only.
//
// Used by the secret-gate hook (before every `git commit` Claude runs) and by `kaizen.mjs secrets scan`
// (staged changes, working changes, or a branch range for CI). A finding never prints the secret:
// only its type, its place and a redacted preview.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git, globToRegex } from './lib.mjs';

export const SECRET_PATTERNS = [
  // AI / ML (Anthropic before OpenAI: both start with sk-)
  { name: 'Anthropic API key', regex: /sk-ant-(?:api|admin)\d*-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API key', regex: /sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,}/ },
  { name: 'Hugging Face token', regex: /hf_[A-Za-z0-9]{30,}/ },
  // Cloud
  { name: 'AWS access key ID', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'AWS secret access key', regex: /aws_secret_access_key\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}/i },
  { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Google OAuth client secret', regex: /GOCSPX-[A-Za-z0-9_-]{28}/ },
  { name: 'Azure storage key', regex: /AccountKey=[A-Za-z0-9+/=]{80,}/ },
  { name: 'DigitalOcean token', regex: /do[poar]_v1_[a-f0-9]{64}/ },
  { name: 'HashiCorp Vault token', regex: /\bhv[sb]\.[A-Za-z0-9_-]{24,}/ },
  // Git platforms and registries
  { name: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub fine-grained token', regex: /github_pat_[A-Za-z0-9_]{60,}/ },
  { name: 'GitLab token', regex: /\bgl(?:pat|ptt|rt|dt|oas)-[A-Za-z0-9_-]{20,}/ },
  { name: 'npm token', regex: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'PyPI token', regex: /pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/ },
  // Communication
  { name: 'Slack token', regex: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { name: 'Slack app token', regex: /\bxapp-\d-[A-Za-z0-9-]{10,}/ },
  { name: 'Slack webhook URL', regex: /hooks\.slack\.com\/(?:services|workflows)\/T[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/ },
  { name: 'Discord webhook URL', regex: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{60,}/ },
  { name: 'Telegram bot token', regex: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/ },
  // Payments and commerce
  { name: 'Stripe secret key', regex: /\b[sr]k_live_[A-Za-z0-9]{20,}/ },
  { name: 'Shopify token', regex: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/ },
  // Services
  { name: 'Twilio API key', regex: /\bSK[a-f0-9]{32}\b/ },
  { name: 'SendGrid API key', regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },
  { name: 'Mailgun API key', regex: /\bkey-[a-f0-9]{32}\b/ },
  { name: 'Sentry auth token', regex: /\bsntr[ysu]_[A-Za-z0-9_=-]{40,}/ },
  { name: 'Datadog API key', regex: /(?:dd|datadog)_?api_?key\s*[:=]\s*["']?[a-f0-9]{32}\b/i },
  // Keys and credentials
  { name: 'Private key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: 'JSON Web Token', regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Database URL with password', regex: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqps?):\/\/[^:/\s"'@]+:[^@\s"']{3,}@[^\s"']+/ },
  { name: 'Generic secret assignment', regex: /\b(?:api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{16,}["']/i },
];

// Obvious placeholders: a match containing one of these is not a secret.
const PLACEHOLDERS = /example|dummy|placeholder|changeme|change_me|your[_-]|insert[_-]|replace[_-]|fake|sample|redacted|xxxx|\*{4}|<[a-z_-]+>|\$\{|\{\{/i;

// Generated, vendored or minified files: noisy, and never where a secret is written by hand.
export const DEFAULT_IGNORE = ['*.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'go.sum', '*.min.*', '*.map', '*.snap', 'vendor/**', 'node_modules/**', 'dist/**'];

function ignored(file, ignore) {
  return ignore.some((g) => globToRegex(g).test(file));
}

// Redacted preview: enough to find the line, never enough to use the secret.
export function redact(value) {
  return `${value.slice(0, 4)}…(${value.length} chars)`;
}

// Scans one added line: at most one finding per line (the first matching pattern).
export function scanLine(text) {
  for (const p of SECRET_PATTERNS) {
    const m = p.regex.exec(text);
    if (m && !PLACEHOLDERS.test(m[0])) return { type: p.name, preview: redact(m[0]) };
  }
  return null;
}

// Unified diff → findings on added lines (file, line number in the new version).
export function scanDiff(diff, { ignore = [] } = {}) {
  const patterns = [...DEFAULT_IGNORE, ...ignore];
  const findings = [];
  let file = null;
  let line = 0;
  for (const raw of String(diff || '').split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.slice(4).replace(/^b\//, '').replace(/\t.*$/, '');
      if (file === '/dev/null') file = null;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!file || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) {
      if (!ignored(file, patterns)) {
        const f = scanLine(raw.slice(1));
        if (f) findings.push({ file, line, ...f });
      }
      line++;
    } else if (raw.startsWith(' ')) line++;
  }
  return findings;
}

// Whole files (untracked files about to be added): every line counts as added.
export function scanFiles(root, files, { ignore = [] } = {}) {
  const patterns = [...DEFAULT_IGNORE, ...ignore];
  const findings = [];
  for (const file of files) {
    if (ignored(file, patterns)) continue;
    let text;
    try {
      if (statSync(join(root, file)).size > 1024 * 1024) continue;
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue;
    text.split('\n').forEach((l, i) => {
      const f = scanLine(l);
      if (f) findings.push({ file, line: i + 1, ...f });
    });
  }
  return findings;
}

function diff(root, args) {
  return git(root, ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '-U0', ...args], { allowFail: true }) || '';
}

function untracked(root, paths = []) {
  const outp = git(root, ['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard', '--', ...paths], { allowFail: true });
  return outp ? outp.split('\n').filter(Boolean) : [];
}

// What a scan covers:
//   staged    the index (what `git commit` records)
//   worktree  tracked changes vs HEAD + untracked files, optionally limited to paths
//   base      the commits of the branch since its merge-base with <base> (CI, before a push)
export function scan(root, { staged = false, worktree = false, untrackedFiles = false, paths = [], base = null, ignore = [] } = {}) {
  const findings = [];
  if (base) {
    const mb = git(root, ['merge-base', base, 'HEAD'], { allowFail: true });
    if (!mb) throw new Error(`no merge-base between ${base} and HEAD`);
    findings.push(...scanDiff(diff(root, [`${mb}..HEAD`]), { ignore }));
  }
  if (staged) findings.push(...scanDiff(diff(root, ['--cached']), { ignore }));
  if (worktree) {
    const hasHead = Boolean(git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true }));
    findings.push(...scanDiff(diff(root, hasHead ? ['HEAD', '--', ...paths] : ['--', ...paths]), { ignore }));
  }
  if (untrackedFiles) findings.push(...scanFiles(root, untracked(root, paths), { ignore }));
  // The same line can be both staged and in the worktree diff.
  const seen = new Set();
  return findings.filter((f) => {
    const k = `${f.file}:${f.line}:${f.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Strips quoted strings (commit messages may contain anything) and splits on shell separators.
function segments(command) {
  return command
    .replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""')
    .split(/&&|\|\||[;|\n]/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean));
}

// git [-C dir] [-c k=v] <sub> args… → { sub, args } or null.
function gitCall(tokens) {
  const i = tokens.findIndex((t) => t === 'git' || t.endsWith('/git'));
  if (i < 0) return null;
  let j = i + 1;
  while (j < tokens.length && /^-[cC]$/.test(tokens[j])) j += 2;
  while (j < tokens.length && tokens[j].startsWith('-')) j++;
  return j < tokens.length ? { sub: tokens[j], args: tokens.slice(j + 1) } : null;
}

// What a Bash command is about to commit, so the hook scans before it happens:
// `git add …` earlier in the same command, `commit -a`, or paths passed to commit.
export function commitPlan(command) {
  const plan = { commit: false, noVerify: false, staged: true, worktree: false, untrackedFiles: false, paths: [] };
  const addPaths = [];
  let addAll = false;
  for (const tokens of segments(String(command || ''))) {
    const call = gitCall(tokens);
    if (!call) continue;
    if (call.sub === 'add' && !plan.commit) {
      const opts = call.args.filter((a) => a.startsWith('-'));
      const files = call.args.filter((a) => !a.startsWith('-'));
      if (opts.some((o) => /^(-A|--all|-u|--update)$/.test(o)) || files.includes('.') || !files.length) addAll = true;
      addPaths.push(...files.filter((f) => f !== '.'));
      plan.worktree = true;
      if (!opts.some((o) => /^(-u|--update)$/.test(o))) plan.untrackedFiles = true;
    }
    if (call.sub === 'commit') {
      plan.commit = true;
      const opts = call.args.filter((a) => a.startsWith('-') && a !== '--');
      if (opts.some((o) => o === '--no-verify' || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(o))) plan.noVerify = true;
      if (opts.some((o) => o === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(o))) {
        plan.worktree = true;
        addAll = true;
      }
      // Pathspecs after `--`, or bare arguments that are not option values (messages were stripped).
      const dd = call.args.indexOf('--');
      const bare = dd >= 0 ? call.args.slice(dd + 1) : call.args.filter((a, k) => !a.startsWith('-') && a !== '""' && !/^-[a-zA-Z]*[mFCcte]$|^--(message|file|author|date|fixup|squash|reuse-message|reedit-message|template|trailer)$/.test(call.args[k - 1] || ''));
      if (bare.length) {
        plan.worktree = true;
        addPaths.push(...bare);
      }
    }
  }
  plan.paths = addAll ? [] : addPaths;
  return plan;
}

export function formatFindings(findings) {
  return findings.map((f) => `  ${f.file}:${f.line} — ${f.type} (${f.preview})`).join('\n');
}
