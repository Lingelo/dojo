// Kaizen — sous-agents d'un cycle work/autopilot, pour en ventiler le coût par rôle.
//
// Le hook PostToolUse sur Agent (review-hooks.mjs --evidence) consigne chaque lancement pendant que le
// garde-fou est actif : type, rôle (politique de modèles), modèle demandé, identifiant d'agent quand la
// réponse de l'outil le donne, et début du prompt. Le hook Stop rapproche ces lancements des
// transcripts des sous-agents (lib.mjs → subagentUsage) ; `gate off` efface le journal.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promptKey } from './lib.mjs';
import { roleOf } from './models.mjs';

export const LAUNCHES = join('.kaizen', 'state', 'agent-runs.jsonl');

// Rôle d'un lancement : relecteur reconnu, agent Kaizen, sinon sous-agent général (implémentation
// déléguée par /kaizen:work), sinon `autre`.
export function launchRole(toolInput = {}, reviewer = null) {
  const type = String(toolInput.subagent_type || '');
  return roleOf(reviewer || type) || (!type || type === 'general-purpose' ? 'implement' : 'autre');
}

// Identifiant d'agent dans la réponse de l'outil : champ `agentId`, sinon mention « agentId: … ».
export function agentIdOf(response) {
  if (!response) return null;
  if (typeof response === 'object' && typeof response.agentId === 'string') return response.agentId;
  const m = /agentId["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/.exec(typeof response === 'string' ? response : JSON.stringify(response));
  return m ? m[1] : null;
}

export function recordLaunch(root, input, reviewer = null) {
  let gate;
  try {
    gate = JSON.parse(readFileSync(join(root, '.kaizen', 'state', 'gate.json'), 'utf8'));
  } catch {
    return;
  }
  if (!gate.active) return;
  if (gate.session && input.session_id && gate.session !== input.session_id) return;
  const ti = input.tool_input || {};
  const entry = {
    at: new Date().toISOString(),
    session: input.session_id || null,
    type: ti.subagent_type || null,
    role: launchRole(ti, reviewer),
    model: ti.model || null,
    agent_id: agentIdOf(input.tool_response),
    prompt: promptKey(ti.prompt),
  };
  appendFileSync(join(root, LAUNCHES), `${JSON.stringify(entry)}\n`);
}

export function readLaunches(root) {
  const file = join(root, LAUNCHES);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
