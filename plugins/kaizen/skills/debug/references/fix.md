# Fix (phase 3)

## Test-first sequence

1. **The right home for the regression test** — where existing coverage already owns this behavior:
   start from the existing tests, not from a new file. Name the test after the behavior ("exports
   accents readable in Excel"), not after the ticket.
2. **Red** — write or strengthen the test, run it, observe that it fails **for the root cause's
   reason** (not because of a setup error).
3. **Minimal fix** at the root cause, not at the symptom.
4. **Green** — the test passes; then run the area's tests then `node "$K" verify`.
5. **Recurrence elsewhere?** — search (`Grep`) for the same faulty pattern in the repo. Same cause
   elsewhere → fix it too if it is the same fix; otherwise list it in the summary.

A test failing because the change **deliberately reverses** the behavior it asserts does not have a
wrong expectation: it is the divergent case — to be decided, not "updated".

## Failed fix

3 fixes without success → stop. The stated root cause is probably wrong: go back to phase 2 with what
the failures taught. Do not stack fixes: revert those that did not work before trying something else.

## Defense in depth (when justified)

If the bug came from an invalid value that crossed several layers, consider a validation at the
boundary where it enters (a single one, the furthest upstream) rather than guards everywhere. Only if
the invalid value can really come back through another path.

## Light postmortem

The bug reached production, touched data, or showed a process gap (a whole category of tests missing,
CI not running a folder) → add a "Structural prevention" line to the summary and recommend
`/kaizen:learn`.
