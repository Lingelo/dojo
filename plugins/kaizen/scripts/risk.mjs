// Kaizen — the profile is a floor, the risk raises it.
//
// The repo's profile follows its stakes; one change can carry more than the repo does (the billing module
// of an internal tool, a migration in a prototype). A change touching a **risk surface** is handled one
// profile up for its cycle: prototype → product → critical. Detection is deterministic, from paths: the
// branch's changed files, a plan's **Files:**, or a given list. Built-in surfaces, plus the team's own
// globs in `.kaizen/config.json → risk.paths`; `risk.ignore` drops paths, `risk.escalate: false` keeps
// the surfaces reported without raising the profile.

import { readFileSync } from 'node:fs';
import { PROFILES, changedFiles, diffBase, globToRegex } from './lib.mjs';

// A path segment, or a word inside a file name: `src/auth/x.ts`, `auth.ts`, `user_session.py`, never
// `author.md`.
const word = (alts) => new RegExp(`(^|[/_.-])(${alts})([/_.-]|$)`, 'i');

export const SURFACES = {
  auth: [word('auth|authn|authz|authentication|authorization|oauth2?|oidc|saml|sso|login|logout|signin|signup|sessions?|permissions?|roles?|rbac|acl|jwt|passwords?|credentials?|mfa|2fa|totp')],
  payment: [word('payments?|billing|checkout|invoices?|invoicing|stripe|paypal|adyen|subscriptions?|refunds?|payouts?|wallets?|ledger')],
  sensitive_data: [word('pii|gdpr|privacy|personal[-_]?data|medical|health[-_]?records?|patients?|ssn|kyc|consents?|encryption|crypto')],
  migration: [word('migrations?|migrate|alembic|flyway|liquibase'), /\.sql$/i, /(^|\/)schema\.(prisma|rb|graphql)$/i, /(^|\/)db\/schema/i],
  public_api: [/(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/i, /\.(proto|graphql|gql|avsc)$/i],
  dependencies: [/(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|Gemfile|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|composer\.json|[^/]+\.csproj|mix\.exs|pubspec\.yaml)$/],
};

// Kaizen's own state and deliverables are never a risk surface (a plan about auth is not auth code).
const ALWAYS_IGNORED = [/(^|\/)\.kaizen\//, /(^|\/)docs\/(plans|learnings|adr|postmortems)\//, /\.md$/i];

export function nextProfile(profile) {
  const i = PROFILES.indexOf(profile);
  return PROFILES[Math.min(i + 1, PROFILES.length - 1)];
}

// { surface: [files] } for the files touching a risk surface.
export function riskSurfaces(files, risk = {}) {
  const ignore = (risk.ignore || []).map(globToRegex);
  const team = Object.fromEntries(Object.entries(risk.paths || {}).map(([s, globs]) => [s, [].concat(globs).map(globToRegex)]));
  const surfaces = {};
  for (const file of files.map((f) => f.replace(/\\/g, '/'))) {
    if (ALWAYS_IGNORED.some((r) => r.test(file)) || ignore.some((r) => r.test(file))) continue;
    for (const [s, res] of [...Object.entries(SURFACES), ...Object.entries(team)]) {
      if (res.some((r) => r.test(file))) (surfaces[s] ||= []).push(file);
    }
  }
  return surfaces;
}

// Paths named in a plan's units (**Files:**): backticked, or tokens that look like a path.
export function planFiles(text) {
  const files = new Set();
  const re = /\*\*(Files|Fichiers)\s*:\*\*([\s\S]*?)(?=\n\s*-\s+\*\*|\n#{1,4}\s|$)/gi;
  for (let m; (m = re.exec(text)); ) {
    for (const t of m[2].match(/`[^`]+`|[\w./-]+/g) || []) {
      const p = t.replace(/^`|`$/g, '').replace(/[),.;:]+$/, '').replace(/\s*\(.*$/, '');
      if (/[/.]/.test(p) && !/^\.+$/.test(p)) files.add(p);
    }
  }
  return [...files];
}

// The profile for this cycle: the repo's, raised one step when the change touches a risk surface.
// from: { files } | { plan } | {} (the branch's changed files against base).
export function effectiveProfile(root, config, { files, plan, base } = {}) {
  let source = 'branch';
  let list = files;
  if (plan) {
    source = 'plan';
    list = planFiles(readFileSync(plan, 'utf8'));
  } else if (list) source = 'files';
  else list = changedFiles(root, diffBase(root, base));
  const risk = config.risk || {};
  const surfaces = riskSurfaces(list, risk);
  const touched = Object.keys(surfaces).length > 0;
  const escalate = risk.escalate !== false;
  const effective = touched && escalate ? nextProfile(config.profile) : config.profile;
  return {
    profile: config.profile,
    effective,
    escalated: effective !== config.profile,
    source,
    files: list.length,
    surfaces,
    reason: touched
      ? `${Object.keys(surfaces).join(', ')} touched${escalate ? (effective !== config.profile ? ` — ${config.profile} → ${effective} for this cycle` : ' — already the highest profile') : ' — escalation off (risk.escalate: false)'}`
      : 'no risk surface touched',
  };
}
