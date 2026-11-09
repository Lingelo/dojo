# Spec: Orders CSV export

## Objective
A store manager exports the orders they see on screen as a CSV that opens in Excel.

## Tech Stack
Rails 7.1, PostgreSQL 15.

## Commands
`bin/rails test`

## Project Structure
`app/exports/` — exporters.

## Code Style
Follow `app/exports/customers_csv.rb`.

## Testing Strategy
Unit tests per exporter.

## Boundaries
- Always: run `bin/rails test` before commits
- Ask first: database schema changes, adding dependencies
- Never: commit secrets
- Never: edit `vendor/`

## Success Criteria
- Exported rows match the active filters.

## Open Questions
- None.
