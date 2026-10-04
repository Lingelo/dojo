---
title: {{What happened, in one factual line}}
date: {{YYYY-MM-DD}}
severity: {{SEV1 | SEV2 | SEV3}}
detected: {{YYYY-MM-DDTHH:MM:SSZ}}
resolved: {{YYYY-MM-DDTHH:MM:SSZ}}
services: [{{service}}]
artifact: kaizen-postmortem/v1
---

# {{Title}}

> **Blameless** postmortem: everyone did their best with the information they had.
> "Human error" is the start of the analysis, never its conclusion.

## Summary
{{3 to 5 lines: what, who was affected, for how long, how it came back.}}

## Impact
- Users / customers affected: …
- Duration: from {{detection}} to {{resolution}} ({{duration}}) — estimated real start: …
- Data: lost / corrupted / exposed: …

## Timeline (UTC)
| Time | Event | Source |
|---|---|---|
| … | deployment of `<sha>` | git / CI |

## Contributing factors
{{Usually several. For each one: what made it possible (process, tool, missing test, missing alert,
documentation), not who.}}

## What went well
## Near misses

## Actions
| Action | Type | Owner | Due | Tracking |
|---|---|---|---|---|
| … | prevention / detection / mitigation / process | … | … | ticket / PR |

## Kaizen loop
- Learning(s): `docs/learnings/…` (via /kaizen:learn)
- Proposed pack rule or constitution amendment: …
- Test or check added so it does not happen again: …
