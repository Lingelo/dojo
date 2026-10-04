# `/kaizen:polish`

> You look at the running feature, you say what is wrong, Claude adjusts it live.

`polish` is for **polishing** a feature that already works. You direct: no autonomous checklist, no
general QA. Claude starts the dev server, opens the page, waits for your feedback and applies each
touch-up to the surface concerned.

## At a glance

| | |
|---|---|
| **What it does** | Detects and starts the dev server, opens the page (Playwright), applies your touch-ups one by one, checks by screenshot, commits locally |
| **When to use it** | Before shipping a visible feature: spacing, copy, states, responsiveness, accessibility |
| **When not to use it** | The feature does not work yet (→ [work](work.md) or [debug](debug.md)); you want autonomous QA |
| **What it produces** | Local commits (`style(…)` or `fix(…)`), and the server left running |
| **What next** | `/kaizen:ship` to ship; `/kaizen:learn` if a touch-up reveals a UI rule worth keeping |

## Examples

```text
/kaizen:polish                         # current branch
/kaizen:polish 42                      # PR #42
/kaizen:polish feat/export /orders     # a branch, opening the /orders route
```

## How it goes

1. **Workspace**: never the default branch. On it, with a clean tree, Claude creates a local
   `polish/<topic>` branch and tells you. A PR or branch already checked out in another worktree is
   worked on there.
2. **Dev server**: `node $K dev detect` finds the command, folder and port. Recognized:
   - Next.js, Nuxt, SvelteKit, Remix, Astro, Angular, Vite, Gatsby, CRA, Storybook;
   - Rails, Django, Phoenix, Laravel, Procfile;
   - monorepos (`apps/*`, `packages/*`).

   `.claude/launch.json` wins if it exists. Then:
   - a port already in use is only reused if it really is this project. Otherwise Claude asks you, it
     never kills a process on its own;
   - the server is started in the background, then `node $K dev probe` checks that it answers. On
     failure, you see the last 20 lines of its log.
3. **Opening**: the page touched by the branch, through the `playwright` plugin's Playwright MCP if it
   is installed. Otherwise, the URL is given to you.
4. **Loop**: for each piece of feedback, touch-up of the surface concerned following the design system,
   then a screenshot if it is visual (at 375 px for mobile).
5. **Closing**, when you say it is done: `verify` must stay green, then a local commit of only the
   touched files. The report gives the server's URL, still running.

## `.claude/launch.json`

After a successful detection, Claude offers to save the server configuration:

```json
{
  "configurations": [
    { "name": "web", "runtimeExecutable": "pnpm", "runtimeArgs": ["dev"], "cwd": "apps/web", "port": 3000 }
  ]
}
```

## Good to know

- **Never a push or a PR**: that is `/kaizen:ship`'s job.
- The dev server is **always** started, even if you say you will not look: the served page is the
  evidence of the touch-up. The report gives its URL and `kill <pid>` to stop it.
- For a hand-written Node server (`node server.js`), the port is read from the file
  (`process.env.PORT || 5173`, `.listen(8080)`).
- Recurring feedback (empty, loading and error states, keyboard focus, contrast, truncated text) is
  suggested to you **once**, without being imposed.

## See also

[ship](ship.md) · [work](work.md)
