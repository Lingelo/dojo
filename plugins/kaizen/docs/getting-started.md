# Getting started: a first complete cycle

This guide walks through a real Kaizen cycle on an example: adding an **orders CSV export** to an
application. Count on an hour the first time, most of it in discussion with Claude.

For an overview before starting: [the presentation video](media/kaizen-presentation.mp4) (80 seconds,
voice-over and [subtitles](media/kaizen-presentation.srt)).

At any time, **`/kaizen:help`** tells you where the repo stands and which command to run next
(`/kaizen:help I want to ship my branch`, `/kaizen:help I have a bug`…).

Kaizen's instructions are written in English, but Claude talks to you in **your** language and writes
the plans, learnings and PR descriptions in the language of the conversation (or the one set in
[`language`](configuration.md#language)).

## 0. Prerequisites

- Claude Code, Node ≥ 18, git.
- An authenticated `gh` (`gh auth status`) to open and follow PRs. Without it, everything works except
  `ship`, `address-feedback` and `watch-pr`.
- Optional: the marketplace's `playwright` plugin, so that Claude can see the interface.

## 1. Install

In Claude Code's settings (the project's or the user's `.claude/settings.json`):

```json
{
  "extraKnownMarketplaces": {
    "angelo-plugins": { "source": { "source": "github", "repo": "Lingelo/marketplace-claude-code" } }
  },
  "enabledPlugins": { "kaizen@angelo-plugins": true }
}
```

Or interactively: `/plugin marketplace add Lingelo/marketplace-claude-code`, then
`/plugin install kaizen@angelo-plugins`. Check that `/kaizen:setup` appears in the list of commands.

## 2. Prepare the repo: `/kaizen:setup`

```text
/kaizen:setup
```

Existing project? Start with `/kaizen:setup audit`: it scores what is in place (CI, tests, secrets,
review, deployment, monitoring) and fixes the most important things first.

Claude creates `.kaizen/config.json` and the `docs/plans`, `docs/learnings` and `docs/ideation`
folders. It detects the stack and shows you the verification commands it found (`npm test`,
`npm run -s lint`…). **Check them**: they are what the quality gate will run. It then offers a short
section in `CLAUDE.md`, so that any agent knows where to find the learnings, then a **profile**: `lean`
is recommended for a first cycle (less ceremony, same gates).

What changes in the repo: `.kaizen/config.json`, `docs/…/.gitkeep`, one line in `.gitignore`. Commit
them.

## 3. Write the principles: `/kaizen:constitution`

```text
/kaizen:constitution
```

Claude starts by reading the repo (CI, tools, existing learnings), then interviews you: "When a change
hurt here, what should have prevented it upstream?". It proposes 5 to 8 starting articles, and each
article kept gets a **verifiable check**. If it judges an answer vague ("quality code"), it pushes
back.

It ends with a stress test: concrete cases ("an urgent fix without a test, on a Friday night?") to
check that your principles really decide. Result: `CONSTITUTION.md`, version 1.0.0.

> No time right now? Skip this step: everything works without a constitution. You only lose the checks
> specific to your project.

## 4. Define what to build: `/kaizen:brainstorm`

```text
/kaizen:brainstorm CSV export of orders from the list, for store managers
```

Claude reads the orders list code and looks for learnings about exports. It then asks **one question
at a time**: who exports? with which filters? what volume? It proposes 2 or 3 approaches (synchronous
export, or asynchronous by email…) and you choose.

It then writes `docs/plans/2026-…-feat-orders-csv-export-plan.md`, which only contains the
requirements (R1…R5) and the acceptance examples (AE1…AE3) for now. Points still fuzzy are marked
`[NEEDS CLARIFICATION: …]`.

## 5. Decide how: `/kaizen:plan`

Choose "Plan" at the end of the brainstorm, or run:

```text
/kaizen:plan docs/plans/2026-…-feat-orders-csv-export-plan.md
```

Claude launches research agents in parallel: repo patterns to imitate, past learnings, git history if
the area is old. Then it **enriches the same file**:
- justified technical decisions (KTD);
- a check of each constitution article;
- STRIDE threats if the area is sensitive;
- rollout and rollback;
- work units (U1…U3), each with its files, evidence strategy and tests, grouped into PR-sized slices.

Two checks follow automatically:
- `plan check`, deterministic: is each requirement covered by a unit? are fuzzy areas left?
- `/kaizen:doc-review`: 2 to 6 reviewers read the plan and fix what is mechanical. The remaining
  decisions are put to you.

> At this point, **read the plan**. This is when a correction costs a sentence.
> [Full plan example](../templates/plan-example.md).

## 6. Build: `/kaizen:work`

```text
/kaizen:work
```

Claude creates a branch (`feat/SHOP-412-orders-csv-export` if a Jira key is known), then turns on the
**quality gate**. For each unit, it:
1. writes the test and watches it fail;
2. implements;
3. reruns the checks;
4. commits the unit.

As long as tests or lint are red, the hook prevents it from stopping.

At the end, it checks the diff size, simplifies, then **always** runs `/kaizen:review`. It fixes the
P0/P1 findings and offers to ship.

## 7. Ship and follow: `/kaizen:ship` then `/kaizen:watch-pr`

`ship` pushes the branch and opens the PR. The description comes from the plan: why, what changes,
**reviewer guide**, evidence, rollback.

The push is only accepted with a recorded review: a hook refuses it otherwise. To push without a review
(hotfix, throwaway branch), tell Claude; it gives you a code that **you** type (`kaizen waive <code>`),
and the PR reports it in a "Review waived" section.

`watch-pr` then follows the PR until it looks ready to merge:
- it handles review comments before CI;
- it repairs CI;
- it updates the branch when GitHub asks for it;
- it waits without consuming tokens.

**You merge.** Kaizen never merges.

## 8. Remember: `/kaizen:learn`

If the cycle revealed a trap, for example "Excel shows broken accents without a UTF-8 BOM":

```text
/kaizen:learn
```

Claude only writes a learning if it passes the durability test: without this document, would a future
developer make the mistake again? The learning goes into `docs/learnings/runtime-errors/…`, with a
validated frontmatter.

**This is where the loop closes.** The next `/kaizen:plan` touching exports will find it, cite it, and
turn it into a test.

## What next

- Deploy: declare your commands and signals (`/kaizen:setup`, or `node $K deploy detect`), then
  `/kaizen:deploy staging` and `/kaizen:deploy production`. The signals cited by the plan are watched
  after the deployment, with a rollback if a threshold is breached. See [deploy](guides/deploy.md) and
  [monitor](guides/monitor.md).
- Lost about what to run: `/kaizen:help` looks at the repo's state (`node $K status`) and recommends
  the next command.
- Chain everything: after a brainstorm, `/kaizen:autopilot` executes the plan, the review, the
  delivery and the PR follow-up without interrupting you.
- Measure after a few weeks: `/kaizen:metrics` (PR size, lead time, rework rate, learnings actually
  reused, cycle cost).
- An incident? `/kaizen:postmortem`. A heavy decision? `/kaizen:decide`.
