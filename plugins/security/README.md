# Security plugin

Blocks Claude Code's access to sensitive files and scans git commits for secrets before they leave the
machine.

## Installation

```bash
/plugin install security@angelo-plugins
```

Prerequisite: Node.js (any LTS version). No npm dependency.

## Features

### 1. Blocking sensitive files

A `PreToolUse` hook (`scripts/block-sensitive-files.js`) intercepts and blocks access to sensitive files.

#### Blocked file patterns

| Category | Patterns |
|---|---|
| Environment | `.env`, `.env.*` (`.env.local`, `.env.development`, `.env.production`, `.env.test`…) |
| Secrets | `secret/`, `secrets/`, `credential/`, `credentials/`, `.secret`, `.secrets`, `.credential`, `.credentials` |
| Keys and certificates | `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa` |
| Package managers and tools | `.npmrc`, `.pypirc`, `.netrc`, `.docker/config.json` |
| Cloud | `.aws/credentials`, `.aws/config`, `.kube/config`, `firebase*.json`, `service-account*.json` / `service_account*.json`, `gcloud*.json` |
| Other | `.htpasswd`, `.pgpass`, `.my.cnf` |

Allowed despite the patterns: `.env.example`.

#### Intercepted tools

- `Read` — reading files
- `Edit` — modifying files
- `Write` — creating files
- `Bash` — `cat`, `head`, `tail`, `less`, `more`, `vi`, `vim`, `nano`, `code`, `open` on a sensitive file

When access is refused, Claude is told to ask you for the information it needs directly.

### 2. Secret scanner (pre-commit)

A second `PreToolUse` hook (`scripts/secret-scanner.js`) scans the staged changes (`git diff --cached`)
before each `git commit` and blocks the commit if API keys, tokens or credentials are about to leak.

#### Detected secrets (~30 patterns)

| Category | Detected secrets |
|---|---|
| AI / ML | Anthropic API key (`sk-ant-api`), Anthropic admin key (`sk-ant-admin`), OpenAI (`sk-`), Hugging Face (`hf_`) |
| Cloud | AWS access key ID (`AKIA`), AWS secret key (`aws_secret_access_key=`), Google API (`AIza`), DigitalOcean (`dop_v1_`), HashiCorp Vault (`hvs.`, `hvb.`) |
| Git platforms | GitHub PAT (`ghp_`), OAuth (`gho_`), App (`ghs_`), fine-grained (`github_pat_`), GitLab PAT (`glpat-`), pipeline trigger (`glptt-`), runner (`glrt-`) |
| CI/CD and registries | npm (`npm_`), PyPI (`pypi-`) |
| Communication | Slack (`xox[bpars]-`, `xapp-`, `hooks.slack.com/services/…` webhooks), Discord bot tokens |
| Payments | Stripe (`sk_live_`, `pk_live_`), Shopify (`shpat_`, `shpca_`, `shppa_`, `shpss_`) |
| Auth | JWT (`eyJ…`), private keys (RSA, EC, DSA, OPENSSH), generic `api_key = "…"` assignments |
| Services | Twilio (`SK…`), SendGrid (`SG.`), Mailgun (`key-`), Sentry (`sntrys_`) |
| Data | Database URLs with an embedded password (postgres, mysql, mongodb) |

The report shows the secret type, the file and the first 8 characters of the match, never the whole
value.

#### Additional protections

- **`--no-verify` blocked**: Claude cannot bypass git hooks with `git commit --no-verify`.
- **False-positive mitigation**: matches containing `example`, `test`, `dummy`, `placeholder`,
  `changeme`, `xxx`, `todo`, `your_`, `insert_`, `replace_`, `fake`, `sample`, `mock` are ignored.
- **Path exclusions**: `vendor/`, `node_modules/`, `*.lock`, `*.sum`, `*.min.js`, `*.min.css`, `*.map`,
  `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`.
- **Fail-open**: if `git diff --cached` fails (not a git repo), the commit is allowed.
- **Additions only**: only the diff's `+` lines are scanned (removing a secret never blocks).

### 3. Circuit breaker (utility)

`scripts/circuit-breaker.js` is a reusable module (simplified Netflix Hystrix pattern) for hooks and
scripts calling an unreliable external service: after `threshold` consecutive failures it stops calling
for `cooldownMs`, then lets a single probe through.

```js
const { CircuitBreaker } = require('./circuit-breaker');
const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 10000 });
const result = await breaker.exec(() => callService(), (err) => fallbackValue);
```

States: `CLOSED` (normal) → `OPEN` (calls rejected, fallback used) → `HALF_OPEN` (one probe) → `CLOSED`.
The state lives in memory, per process; `getState()` and `reset()` are available.

## How it works

The plugin declares two `PreToolUse` hooks in `hooks/hooks.json`:

1. **block-sensitive-files.js** — runs on `Read`, `Edit`, `Write`, `Bash`. Blocks access to sensitive
   files.
2. **secret-scanner.js** — runs on `Bash` only. Intercepts `git commit`, scans the staged diff for
   secrets.

Both hooks exit with code `2` to block and write a message on stderr to inform Claude; any unexpected
error lets the operation through (exit `0`).

Why hooks rather than `deny` rules in `settings.json`: deny rules have
[known bugs](https://github.com/anthropics/claude-code/issues/6699); a hook is always run.

## Limits

- Bash detection reads the command's tokens: a path built dynamically (variables, `$(…)`) is not seen.
- The scanner relies on patterns: an unknown secret format, or a secret whose value contains one of
  the allowlisted words, goes through. It complements, not replaces, server-side secret scanning.

## Structure

```
security/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── scripts/
│   ├── block-sensitive-files.js
│   ├── secret-scanner.js
│   └── circuit-breaker.js
└── README.md
```
