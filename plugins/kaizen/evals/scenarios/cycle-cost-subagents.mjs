// Pendant un cycle (garde-fou actif), un sous-agent Kaizen est lancé : le hook Agent consigne son
// lancement, et le hook Stop compte ses tokens, rattachés à son rôle (research). Vérifie aussi, sur une
// vraie session, que la réponse de l'outil Agent donne l'identifiant d'agent.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'cycle-cost-subagents',
  timeoutMinutes: 8,
  files: { ...SHOP, '.kaizen/config.json': { profile: 'lean', verify: { test: 'node --test' } } },
  steps: [{ run: ['gate', 'on'] }],
  prompt:
    "Avec l'outil Agent, lance le sous-agent kaizen:repo-researcher avec la question « où et comment est calculé le total TTC d'une commande ? ». " +
    'Puis réponds en une phrase. Ne modifie aucun fichier et ne lance pas `gate off`.',
  checks: [
    ['lancement consigné avec son rôle', (_, c) => {
      const runs = c.read('.kaizen/state/agent-runs.jsonl').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      return { ok: runs.some((r) => r.role === 'research'), note: JSON.stringify(runs.map((r) => [r.type, r.role, r.agent_id])) };
    }],
    ['identifiant d’agent capté dans la réponse de l’outil', (_, c) => c.read('.kaizen/state/agent-runs.jsonl').split('\n').filter(Boolean).some((l) => JSON.parse(l).agent_id)],
    ['tokens du sous-agent comptés et rattachés au rôle research', (_, c) => {
      const gate = JSON.parse(c.read('.kaizen/state/gate.json') || '{}');
      const s = gate.subagents;
      return { ok: Boolean(s?.agents >= 1 && s.by_role?.research?.output_tokens > 0 && gate.usage?.messages > 0), note: JSON.stringify(s && { agents: s.agents, roles: Object.keys(s.by_role) }) };
    }],
  ],
};
