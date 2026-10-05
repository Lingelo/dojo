// Kaizen — the right model for each task.
//
// Each agent of the plugin has a **role**; each role has a model per **profile** (lean, standard,
// full), which the team can adjust in `.kaizen/config.json → models` (per role or per agent). Skills
// read `kaizen.mjs models --json` and pass that model to every Agent tool call.
//
// Principle: bulk reading and synthesis (research) rarely cost much when wrong; judgments whose errors
// are expensive (security, data migrations, adversarial, plan decisions) deserve the strongest model.
// `inherit` = the session's model.

export const MODELS = ['haiku', 'sonnet', 'opus', 'inherit'];

export const ROLES = {
  research: ['repo-researcher', 'learnings-researcher', 'git-historian', 'docs-researcher', 'flow-analyst'],
  review: ['correctness-reviewer', 'testing-reviewer', 'performance-reviewer', 'reliability-reviewer', 'api-contract-reviewer', 'maintainability-reviewer', 'standards-reviewer'],
  review_critical: ['security-reviewer', 'data-migration-reviewer', 'adversarial-reviewer'],
  plan_review: ['plan-coherence-reviewer', 'plan-feasibility-reviewer', 'plan-scope-reviewer', 'plan-design-reviewer'],
  plan_review_critical: ['plan-security-reviewer', 'plan-adversarial-reviewer'],
  // general-purpose subagents to which /kaizen:work hands independent units.
  implement: [],
};

export const ROLE_LABELS = {
  research: 'research (repo, learnings, history, docs)',
  review: 'regular code review',
  review_critical: 'critical review (security, migrations, adversarial)',
  plan_review: 'plan review',
  plan_review_critical: 'critical plan review (security, adversarial)',
  implement: 'delegated implementation (work)',
};

export const PROFILE_MODELS = {
  lean: { research: 'haiku', review: 'sonnet', review_critical: 'sonnet', plan_review: 'haiku', plan_review_critical: 'sonnet', implement: 'sonnet' },
  standard: { research: 'sonnet', review: 'sonnet', review_critical: 'opus', plan_review: 'sonnet', plan_review_critical: 'opus', implement: 'sonnet' },
  full: { research: 'sonnet', review: 'opus', review_critical: 'opus', plan_review: 'opus', plan_review_critical: 'opus', implement: 'inherit' },
};

export function roleOf(agent) {
  const name = String(agent).replace(/^kaizen:/, '');
  return Object.keys(ROLES).find((r) => ROLES[r].includes(name)) || null;
}

// { profile, roles: {role: {model, source}}, agents: {agent: {role, model, source}}, warnings }
export function resolveModels(config) {
  const profile = PROFILE_MODELS[config.profile] ? config.profile : 'standard';
  const custom = config.models || {};
  const warnings = [];
  const valid = (v, where) => {
    if (v === undefined) return false;
    if (MODELS.includes(v)) return true;
    warnings.push(`${where}: unknown model "${v}" (expected: ${MODELS.join(', ')}) — ignored`);
    return false;
  };
  for (const r of Object.keys(custom.roles || {})) if (!ROLES[r]) warnings.push(`models.roles.${r}: unknown role (roles: ${Object.keys(ROLES).join(', ')})`);
  for (const a of Object.keys(custom.agents || {})) if (!roleOf(a)) warnings.push(`models.agents.${a}: unknown agent`);

  const roles = {};
  for (const r of Object.keys(ROLES)) {
    const own = custom.roles?.[r];
    roles[r] = valid(own, `models.roles.${r}`) ? { model: own, source: 'config' } : { model: PROFILE_MODELS[profile][r], source: `profile ${profile}` };
  }
  const agents = {};
  for (const [r, list] of Object.entries(ROLES)) {
    for (const a of list) {
      const own = custom.agents?.[a];
      agents[a] = valid(own, `models.agents.${a}`) ? { role: r, model: own, source: 'config' } : { role: r, ...roles[r] };
    }
  }
  return { profile, roles, agents, warnings };
}
