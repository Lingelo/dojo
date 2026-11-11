# Constraints

## Floor (always enforced, no setup required)
- No new suppression comments (`@ts-ignore`, `eslint-disable`)
- No skipped or deleted tests without a reason
- Do not weaken this file to make a change pass

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|---|---|---|---|
| Lint | Zero errors from our config | `bundle exec rubocop` | every edit |
| Coverage | Changed lines ≥ 80% covered | `bin/rails test` + git diff | task end, CI |

## Measured, not yet enforced

| Metric | Today | Direction |
|---|---|---|
| Project coverage | 62.4% | must not fall |

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|---|---|---|---|---|---|
| W1 | `Metrics/MethodLength` | `app/legacy/**` | Rewrite tracked in SHOP-441 | @ana | 2026-11-01 |
