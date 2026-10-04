# Merging and validating findings

## 1. Normalize

For each valid JSON return: keep the contract's fields. Value outside the enumeration → fix it if the
intent is obvious (`"high"` → `P1`), otherwise lower the confidence to 50. A finding without `evidence`
is rejected. A 75/100 whose first evidence is not a quoted line with `file:line` drops to 50 ("quote the
line" rule).

## 2. Deduplicate

Two findings are the same if they target the same file, lines within ± 3, and the **same failure mode**.
Merge: keep the highest severity, the best evidence, the most concrete fix, and list all reviewers
("security + adversarial"). Two independent reviewers converging raise confidence (+1 anchor, capped at
100) — it is a signal, not evidence.

Two **contradictory** findings on the same line (one wants to add, the other to remove): keep both,
report the tension, do not decide without evidence.

## 3. Confidence gate

| Confidence | Destination |
|---|---|
| 100, 75 | actionable finding |
| 50 + P0 | actionable finding (marked "unconfirmed") |
| 50 other | moved to `testing_gaps` or `residual_risks` if it has value, otherwise dropped |
| `pre_existing: true` | "Pre-existing" section, never in the verdict |

## 4. Validate each P0/P1

Before the report, **reread yourself** the quoted lines of each P0/P1 finding (and of the `gated_auto`
P2s that would be applied):
- does the quoted line exist verbatim at that place?
- does the guard, validation or test the reviewer says is missing really exist nowhere (caller,
  middleware, framework default)? A targeted search is enough.
- the intent: does a comment, a commit or the plan indicate it is deliberate?

Result per finding: **confirmed** (keep), **refuted** (remove, noting the reason in the coverage),
**unresolved** (keep, marked "to verify", does not count as a confirmed P1 for the verdict, except for a
protected topic below).

Protected topics — data loss, access control/authentication, injection, secret exposure, crypto,
concurrency, public contract: such a finding is only **refuted** on quoted evidence contradicting it.
Otherwise, it stays "unresolved" and counts for the verdict.

More than 8 findings to validate: hand the validation to a `general-purpose` subagent (read-only) per
batch, with the list of findings and these rules.

## 5. Plan conformance

For each `R` and `AE` of the plan: covered (file + test proving it), covered differently than planned
(to report), or not covered (P1 finding if the requirement is within the branch's scope, otherwise a
note). A `KTD` decision bypassed without explanation is a finding.

## 6. Rank

Sort: severity, then confidence, then number of concurring reviewers. Number the findings; the number
lets the user say "apply 1, 3 and 4".
