// Kaizen — subagents of a work/autopilot cycle, to break its cost down by role.
//
// The PostToolUse hook on Agent (review-hooks.mjs --evidence) logs each launch while the quality gate
// is active: type, role (model policy), requested model, agent id when the tool response provides it,
// and the start of the prompt. The Stop hook matches these launches with the subagent transcripts
// (lib.mjs → subagentUsage); `gate off` clears the log.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promptKey } from './lib.mjs';
import { roleOf } from './models.mjs';

export const LAUNCHES = join('.kaizen', 'state', 'agent-runs.jsonl');

// Role of a launch: known reviewer, Kaizen agent, otherwise general subagent (implementation delegated
// by /kaizen:work), otherwise `other`.
export function launchRole(toolInput = {}, reviewer = null) {
  const type = String(toolInput.subagent_type || '');
  return roleOf(reviewer || type) || (!type || type === 'general-purpose' ? 'implement' : 'other');
}

// Agent id in the tool response: `agentId` field, otherwise an "agentId: …" mention.
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
