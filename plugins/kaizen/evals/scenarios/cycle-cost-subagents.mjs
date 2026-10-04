// During a cycle (gate active), a Kaizen subagent is launched: the Agent hook logs its launch, and the
// Stop hook counts its tokens, attached to its role (research). Also checks, on a real session, that the
// Agent tool response gives the agent id.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'cycle-cost-subagents',
  timeoutMinutes: 8,
  files: { ...SHOP, '.kaizen/config.json': { profile: 'lean', verify: { test: 'node --test' } } },
  steps: [{ run: ['gate', 'on'] }],
  prompt:
    'With the Agent tool, launch the kaizen:repo-researcher subagent with the question "where and how is an order\'s total including tax computed?". ' +
    'Then answer in one sentence. Change no file and do not run `gate off`.',
  checks: [
    ['launch logged with its role', (_, c) => {
      const runs = c.read('.kaizen/state/agent-runs.jsonl').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      return { ok: runs.some((r) => r.role === 'research'), note: JSON.stringify(runs.map((r) => [r.type, r.role, r.agent_id])) };
    }],
    ['agent id captured from the tool response', (_, c) => c.read('.kaizen/state/agent-runs.jsonl').split('\n').filter(Boolean).some((l) => JSON.parse(l).agent_id)],
    ['subagent tokens counted and attached to the research role', (_, c) => {
      const gate = JSON.parse(c.read('.kaizen/state/gate.json') || '{}');
      const s = gate.subagents;
      return { ok: Boolean(s?.agents >= 1 && s.by_role?.research?.output_tokens > 0 && gate.usage?.messages > 0), note: JSON.stringify(s && { agents: s.agents, roles: Object.keys(s.by_role) }) };
    }],
  ],
};
