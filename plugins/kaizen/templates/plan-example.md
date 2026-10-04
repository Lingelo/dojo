---
title: Orders CSV export - Plan
type: feat
date: 2026-10-02
topic: orders-csv-export
artifact: kaizen-plan/v1
source: brainstorm
jira: SHOP-412
---

# Orders CSV export - Plan

<!-- kaizen:goal -->
## Goal capsule

**Goal:** from the orders list, a store manager gets in one click a file that opens directly in Excel
with the orders they see on screen.
**Product authority:** scope decided by the user during the session (2026-10-02).
**Open blockers:** none.

<!-- kaizen:product -->
## Product contract

### Summary
An "Export" button on the orders list downloads a CSV of the orders matching the active filters,
readable as is in Excel.

### Requirements

**Content**
- R1. The export contains exactly the orders matching the list's active filters.
- R2. One row per order: number, date, customer, status, total incl. tax, item count.
- R3. Accents and special characters display correctly when opened in Excel.

**Access and volume**
- R4. Only users allowed to see orders can export.
- R5. Beyond 10,000 orders, the export is refused with a message asking to narrow the filters.

### Key decisions
- **Synchronous, capped at 10,000 rows** — covers the observed need without a job queue. Governs R5.
  (decided in session: chosen over an asynchronous export by email — too heavy for current volume)

### Acceptance examples
- AE1. (covers R1) Given a "status = shipped" filter, when I export, then the file only contains
  shipped orders.
- AE2. (covers R3) Given a customer "Hélène Müller", when I open the file in Excel, then the name
  displays as "Hélène Müller".
- AE3. (covers R5) Given 10,001 filtered orders, when I export, then I see "Too many orders (10,001):
  narrow the filters (max 10,000)" and no file is produced.

### Out of scope
- Later: scheduled export, column selection, XLSX format.

<!-- kaizen:planning -->
## Planning contract

### Key technical decisions
- KTD1. Stream the CSV (`send_stream`) rather than building it in memory — 10,000-row exports stay
  under 5 MB of RAM. Rejected alternative: whole string in memory. Covers R5.
- KTD2. Reuse the filtered `OrdersQuery` used by the list — guarantees R1 by construction. Covers R1.

### Context and patterns to follow
- `app/exports/customers_csv.rb` — existing export to imitate (headers, amount formatting).
- `app/queries/orders_query.rb` — list filters, to reuse as is.

### Learnings and rules applied
- `docs/learnings/runtime-errors/csv-export-excel-accents.md` — Excel needs a UTF-8 BOM: without it,
  R3 fails. → BOM at the start of the stream, tested by AE2.
- (pack: house-rules, csv-exports.md) — `;` separator for European locales. → applied.

### Risks
- Slow query on 10,000 orders with customer joins → `includes(:customer)` (avoids an N+1).

<!-- kaizen:constitution -->
## Constitution check

| Article | Verdict | Justification / evidence |
|---|---|---|
| I. Evidence first | ✅ | U1–U3 test first |
| II. Simplicity | ✅ | capped synchronous export, no job queue (KTD1) |
| III. Small batches | ✅ | one slice, ~250 lines estimated |
| IV. Secure by default | ✅ | same authorization guard as the list (U2), see Threats |
| V. Agent autonomy | ✅ | no migration or dependency added |

<!-- kaizen:threats -->
## Threats

- **Information disclosure** · exported customer data · a user without the right calls the export URL
  directly → `authorize_orders!` on the endpoint, 403 test (U2).
- **Denial of service** · database · repeated large exports → 10,000 cap (R5) and streamed generation
  (KTD1).

<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure**: direct (button visible to authorized roles only), no flag — read-only feature.
- **Order**: no migration.
- **Rollback**: revert the PR; nothing irreversible (no writes).
- **Signal**: 5xx error rate of `Orders::ExportsController` and p95 duration; > 1 % errors or
  p95 > 10 s → revert.

<!-- kaizen:units -->
## Implementation units

### U1. Orders CSV serializer
- **Goal:** turn an orders relation into CSV rows (R2, R3).
- **Covers:** R2, R3, AE2
- **Depends on:** —
- **Files:** `app/exports/orders_csv.rb` (new), `spec/exports/orders_csv_spec.rb` (new)
- **Approach:** follows `app/exports/customers_csv.rb`; `﻿` BOM first; `;` separator.
- **Evidence:** test first.
- **Test scenarios:** columns and order; formatted total; accented name (AE2, BOM bytes); order
  without items.
- **Verification:** `bundle exec rspec spec/exports/orders_csv_spec.rb`
- **Slice:** S1

### U2. Export endpoint with filters, permissions and cap
- **Goal:** expose the filtered, authorized and capped export (R1, R4, R5).
- **Covers:** R1, R4, R5, AE1, AE3
- **Depends on:** U1
- **Files:** `app/controllers/orders/exports_controller.rb` (new), `config/routes.rb`,
  `spec/requests/orders/exports_spec.rb` (new)
- **Approach:** same `before_action :authorize_orders!` as `OrdersController`; `OrdersQuery`; count
  before generating; streaming per KTD1.
- **Evidence:** test first (request spec).
- **Test scenarios:** status filter (AE1); user without permission → 403; 10,001 orders → 422 with a
  message (AE3); `Content-Type` and `Content-Disposition` headers.
- **Verification:** `bundle exec rspec spec/requests/orders/exports_spec.rb`
- **Slice:** S1

### U3. "Export" button on the list
- **Goal:** trigger the export with the current filters.
- **Covers:** R1
- **Depends on:** U2
- **Files:** `app/views/orders/index.html.erb`, `spec/system/orders_export_spec.rb` (new)
- **Approach:** link that carries over `request.query_parameters`.
- **Evidence:** system test.
- **Verification:** `bundle exec rspec spec/system/orders_export_spec.rb`
- **Slice:** S1

<!-- kaizen:verification -->
## Verification contract
- `bundle exec rspec` · `bundle exec rubocop`
- AE2 also checked by hand once: opening the file in Excel.

<!-- kaizen:done -->
## Definition of done
- U1–U3 shipped, each with its evidence.
- R1–R5 and AE1–AE3 covered by green tests.
- `/kaizen:review` with no open P0/P1; diff under `pr.max_lines` (`node "$K" size`).
- Learning captured if the implementation revealed an undocumented trap.
