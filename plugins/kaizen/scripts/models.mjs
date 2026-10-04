// Kaizen — le bon modèle pour chaque tâche.
//
// Chaque agent du plugin a un **rôle** ; chaque rôle a un modèle selon le **profil** (lean, standard,
// full), que l'équipe peut ajuster dans `.kaizen/config.json → models` (par rôle ou par agent). Les
// skills lisent `kaizen.mjs models --json` et passent ce modèle à chaque appel de l'outil Agent.
//
// Principe : la lecture et la synthèse en volume (recherche) coûtent peu d'erreurs ; les jugements
// dont l'erreur coûte cher (sécurité, migrations de données, adversarial, décisions de plan) méritent
// le modèle le plus fort. `inherit` = le modèle de la session.

export const MODELS = ['haiku', 'sonnet', 'opus', 'inherit'];

export const ROLES = {
  research: ['repo-researcher', 'learnings-researcher', 'git-historian', 'docs-researcher', 'flow-analyst'],
  review: ['correctness-reviewer', 'testing-reviewer', 'performance-reviewer', 'reliability-reviewer', 'api-contract-reviewer', 'maintainability-reviewer', 'standards-reviewer'],
  review_critical: ['security-reviewer', 'data-migration-reviewer', 'adversarial-reviewer'],
  plan_review: ['plan-coherence-reviewer', 'plan-feasibility-reviewer', 'plan-scope-reviewer', 'plan-design-reviewer'],
  plan_review_critical: ['plan-security-reviewer', 'plan-adversarial-reviewer'],
  // Sous-agents general-purpose auxquels /kaizen:work confie des unités indépendantes.
  implement: [],
};

export const ROLE_LABELS = {
  research: 'recherche (repo, leçons, historique, doc)',
  review: 'revue de code courante',
  review_critical: 'revue critique (sécurité, migrations, adversarial)',
  plan_review: 'relecture de plan',
  plan_review_critical: 'relecture de plan critique (sécurité, adversarial)',
  implement: 'implémentation déléguée (work)',
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
    warnings.push(`${where} : modèle inconnu "${v}" (attendu : ${MODELS.join(', ')}) — ignoré`);
    return false;
  };
  for (const r of Object.keys(custom.roles || {})) if (!ROLES[r]) warnings.push(`models.roles.${r} : rôle inconnu (rôles : ${Object.keys(ROLES).join(', ')})`);
  for (const a of Object.keys(custom.agents || {})) if (!roleOf(a)) warnings.push(`models.agents.${a} : agent inconnu`);

  const roles = {};
  for (const r of Object.keys(ROLES)) {
    const own = custom.roles?.[r];
    roles[r] = valid(own, `models.roles.${r}`) ? { model: own, source: 'config' } : { model: PROFILE_MODELS[profile][r], source: `profil ${profile}` };
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
