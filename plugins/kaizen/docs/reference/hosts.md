# Hosts: compatibility probe

Kaizen is built for Claude Code. Running it on Cursor and Codex (plan
[kaizen-multi-host](../../../../docs/plans/2026-10-07-1118-feat-kaizen-multi-host-plan.md)) depends on
how each host loads skills, runs hooks and launches subagents. Host docs move fast and do not always
agree with each other, so this page does not trust them: it gives a protocol that **measures** each
host with a throwaway plugin, and a matrix to fill with the results. Every later slice of the plan
starts only on the rows it needs being verified.

**Status:** not run yet.

## What the probe is

`evals/host-probe/` holds:

- `marketplace/` — a plugin marketplace for the three hosts (`.claude-plugin/`, `.cursor-plugin/`,
  `.agents/plugins/`) with one plugin, `kaizen-probe`:
  - one manifest and one hook file per host (`hooks/claude-hooks.json`, `cursor-hooks.json`,
    `codex-hooks.json`); every hook runs `scripts/dump.mjs`, which records what the host sends;
  - `SessionStart` also tries the other ways of naming the plugin root (`--via` in the records), to see
    which ones the host expands;
  - three skills: `probe-locate` (finds its script from its own directory and through the env vars),
    `probe-plain` (same without `allowed-tools`), `probe-subagents` (two subagents in parallel from a
    prompt file read by path, plus the plugin's `probe-reviewer` agent by name).
- `probe.mjs` — prepares the sandbox repo, writes the report and the test fixtures
  (`node evals/host-probe/probe.mjs help`).

The probe blocks only on purpose: a shell command containing `kaizen-probe-block`, and one stop after
`probe.mjs stop-once`. Records stay in the sandbox under `.probe/` (ignored by git).

## What you need

Node 18+, git, about 30 minutes per host, and the hosts at their current version: Cursor, Codex (CLI
or app), and Claude Code as the baseline. Note each version and your OS in the results. Run the
protocol once on macOS or Linux; Windows is a second pass (hook commands go through a different shell
there).

## Run the probe

From a clone of this repository:

```bash
node plugins/kaizen/evals/host-probe/probe.mjs init ~/kaizen-probe
```

The sandbox is both the marketplace and the project the agent works in. It has a local bare remote,
so `git push` works offline. Then, for each host, in this order: Claude Code (baseline), Codex,
Cursor.

### 1. Install the probe plugin

| Host | Install |
|---|---|
| Claude Code | in the sandbox: `/plugin marketplace add ~/kaizen-probe` then `/plugin install kaizen-probe@kaizen-probe-market`, restart |
| Codex | `codex plugin marketplace add ~/kaizen-probe`, then `codex plugin install kaizen-probe` (or Plugins in the app); the sandbox's `.agents/plugins/marketplace.json` may also list it directly. Hooks are not trusted by default: approve them with `/hooks` |
| Cursor | local install is not documented: try adding the sandbox folder as a plugin marketplace in Cursor's plugin settings; if that is not offered, push the sandbox to a private GitHub repository and use `/add-plugin` with its URL. Write down what worked |

Write down the exact steps that worked: they become the install section of the hosts guide.

### 2. Clear the records

```bash
node plugins/kaizen/evals/host-probe/probe.mjs reset ~/kaizen-probe
```

### 3. Session steps

Start a **new** session in `~/kaizen-probe`, then type these prompts one by one. Write down how you
invoked each skill (`/probe-locate`, `$probe-locate`, by asking…) and what the agent answered.

1. `Run the probe-locate skill.` Then `Run the probe-plain skill.`
2. `Run this shell command: echo kaizen-probe-block` — expected: refused, with the probe's message.
   Note whether the agent saw the message and whether it tried another way.
3. `Create note.txt containing hello, then run: git add note.txt && git commit -m "probe" && git push`
   — not blocked; it records what a commit and a push look like to a hook.
4. `kaizen-probe-confirm 1234 — just reply OK` — the prompt hook should see this text.
5. In a terminal: `node plugins/kaizen/evals/host-probe/probe.mjs stop-once ~/kaizen-probe`, then
   `Reply with the word DONE.` — expected: after DONE, the session goes on by itself and the agent
   replies `KAIZEN-PROBE-CONTINUED`.
6. `Run the probe-subagents skill.`

### 4. Headless CLI

```bash
node plugins/kaizen/evals/host-probe/probe.mjs headless ~/kaizen-probe --host codex
```

Presets: `claude -p`, `codex exec`, `cursor-agent -p`. If the CLI has another name or needs flags, pass
`--cmd "<command with a prompt asking to reply KAIZEN-PROBE-PONG>"`.

### 5. Report and fixtures

```bash
node plugins/kaizen/evals/host-probe/probe.mjs report ~/kaizen-probe --host codex
node plugins/kaizen/evals/host-probe/probe.mjs fixtures ~/kaizen-probe --host codex
```

The report is Markdown. `fixtures` writes one sanitized payload per event to
`tests/fixtures/hooks/<host>/`: sandbox path → `/repo`, home → `/home/probe`, emails replaced, host
env vars kept by name only (values only for plugin and project paths). Read them before committing.

### If nothing is recorded

- **No hook record at all**: look at which `SessionStart` variant ran (`--via` in the report). If
  only a variant ran, change the commands of that host's hook file to that form, reinstall, redo.
- **Codex, no hook record**: add `"hooks": "./hooks/codex-hooks.json"` at the top level of
  `.codex-plugin/plugin.json` (older manifest shape), reinstall, redo. Check `/hooks` trust.
- **A skill is not listed**: compare `probe-locate` and `probe-plain`; if only `probe-plain` shows,
  the `allowed-tools` field is the cause.

Each workaround that was needed goes into the matrix: it is a finding, not noise.

## Matrix

Fill one column per host from its report (**auto**) and your notes (**manual**). Write "yes",
"no", or the observed value, with the host version.

| # | Capability | Measured by | Needed by | Claude Code | Cursor | Codex |
|---|---|---|---|---|---|---|
| 1 | Install from this repository's marketplace | manual (install steps) | U9 | | | |
| 2 | Skill invocation syntax | manual | U3, U10 | | | |
| 3 | Skill with `allowed-tools` loads | auto: skills that ran | U3 | | | |
| 4 | Skill directory given to the model, resolves the plugin root | auto: skill dir → plugin root | U2 | | | |
| 5 | Plugin root env var visible to skill commands | auto: env-var forms in skills | U2 | | | |
| 6 | Plugin root form expanded in hook commands | auto: plugin root forms (`--via`) | U9 | | | |
| 7 | Shell pre-tool hook: event, tool name, command field | auto: shell tool name, where the command is | U4, U5 | | | |
| 8 | Hook exit 2 blocks the shell command; agent sees the message | auto: exit 2, blocked command still ran + manual | U5 | | | |
| 9 | `git commit` and `git push` reach the shell hook | auto: git commit/push seen | U5 | | | |
| 10 | Prompt hook sees the prompt text (waiver/deploy codes) | auto: prompt hook, field | U5 | | | |
| 11 | Stop hook fires; exit 2 makes the session go on | auto: stop rows + manual (`KAIZEN-PROBE-CONTINUED`) | U5 | | | |
| 12 | Session id field | auto: session id fields | U4 | | | |
| 13 | Transcript path and format (token metrics) | auto: transcript | later | | | |
| 14 | Two generic subagents run in parallel | auto: overlapped | U7 | | | |
| 15 | Plugin agent available by name | auto: named agent | U7 | | | |
| 16 | Subagent start/stop hook (review evidence) | auto: subagent hook events | U8 | | | |
| 17 | Headless CLI answers | auto: headless | U8 | | | |
| 18 | Same results on Windows | manual (second pass) | all | | | |

## Reading the results

The plan's slices adapt to what the matrix says, without reopening the goal:

- **Row 4 "no" and row 5 "no"** on a host → U2 has no portable way to find the CLI there; S1 is
  re-planned for that host (for example a `SessionStart` hook writing the path to a known file) before
  it starts.
- **Row 8 "no"** → U4 answers with the host's JSON decision instead of exit 2 (Cursor
  `permission: "deny"`, Codex `decision: "block"`).
- **Row 9 or 8 "no" on a host** → git hooks (U6) are the only gate there; the hosts guide says so.
- **Row 10 "no"** → waiver and deploy codes are confirmed by a terminal command on that host instead
  of a typed prompt.
- **Row 11 "no"** → the quality gate is advisory on that host (verify still runs in `/kaizen:work` and
  in CI); the guide says so.
- **Row 14 "no"** → reviews on that host go through the headless runner (U8); **row 17 "no" as well**
  → reviews there are light only, and the push gate refuses above the light limit unless waived.
- **Row 16 "yes"** → evidence comes from the hook, as on Claude Code; otherwise from the runner.

When done: paste each report into a "Results" section below with host versions and OS, commit the
fixtures, set the status at the top of this page, and update the plan where a row changed a slice.
