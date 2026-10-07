# `/kaizen:review`

> A code review by specialized reviewers, chosen by what the diff touches, whose every blocking finding
> is verified before being reported.

## At a glance

| | |
|---|---|
| **What it does** | Scope → intent and plan → reviewer selection → parallel launch → merge, confidence filtering, P0/P1 verification → report with a verdict |
| **When to use it** | Before shipping (mandatory in `work`); on a PR to review; after a non-trivial fix |
| **When not to use it** | Reviewing a **plan** (→ [doc-review](doc-review.md)); handling comments already posted on a PR (→ [address-feedback](address-feedback.md)) |
| **What it produces** | A report: verdict ✅ ready / ⚠️ concerns / ⛔ not ready, numbered findings, constitution compliance, plan conformance, test gaps, risks, pre-existing problems, what deserves a learning |
| **What next** | `apply` to apply the fixes, or "apply 1, 3 and 4" |

## Examples

```text
/kaizen:review                              # current branch vs its base (uncommitted included)
/kaizen:review 42                           # PR #42 (without switching branches)
/kaizen:review base:release/2.3
/kaizen:review plan:docs/plans/…-plan.md    # check conformance to this plan
/kaizen:review apply                        # review then apply the fixes
```

![The multi-agent review pipeline from scope to recorded verdict](../media/diagrams/review-pipeline.svg)

In depth: [review](../concepts/review.md).

## The reviewers

`correctness` always, then only the reviewers whose area the diff touches: `standards` (constitution,
packs, learnings), `testing`, `security`, `performance`, `reliability`, `api-contract`,
`data-migration`, `maintainability`, `adversarial`. Each chosen reviewer is justified in one line; a diff
of 20 lines or fewer, without risk, is reviewed directly. Selection rules:
[review](../concepts/review.md#3-selection).

## What makes the findings reliable

Every reviewer follows one contract (severity P0–P3, confidence 50/75/100, a concrete fix), must quote
the verbatim `file:line` behind any confident finding, and the orchestrator rereads the lines of each P0
and P1 itself before reporting it. Details: [the reviewer contract](../concepts/review.md#5-the-reviewer-contract)
and [synthesis](../concepts/review.md#6-synthesis).

Real example, from an evaluation: a diff with `execSync(\`grep "${customer}" …\`)` and
`Math.floor(total / size)` gives the ⛔ verdict. The command injection comes out as **P0** (100) and the
lost last page as **P1**.

## Options

| Option | Effect |
|---|---|
| `apply` | applies the `gated_auto` fixes, one by one, verifying again after each; the `manual` ones stay listed |
| `mode:agent` | JSON return without prose or changes (used by `work` and `autopilot`) |
| `plan:<path>` | reference plan for conformance |
| `base:<ref>` | comparison base |

## Good to know

- The review is **recorded** for the current branch (`node $K review record`): that is what the push
  hook requires before any `git push`. After more than `review.max_unreviewed_lines` changed lines (80
  by default), a new review is needed. Recording requires that reviewers actually ran (logged by a
  hook), except for a light review of 20 lines at most.
- The profile (`lean`, `standard`, `full`) adjusts the number of reviewers, never the review
  obligation.
- **Report only by default**, never a push. A PR passed as argument sets the **scope**, not the
  permission to switch branches.
- The reviewers' raw returns are kept in `.kaizen/state/reviews/<timestamp>/`.

## See also

[doc-review](doc-review.md) · [work](work.md) · [constitution](constitution.md) · [ship](ship.md)
