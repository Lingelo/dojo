# Tasks: Orders CSV export

## Task 1: Orders CSV serializer

**Description:** Serialize the filtered orders as CSV with a BOM.

**Acceptance criteria:**
- [x] One row per order
- [x] Accents display in Excel

**Verification:**
- [x] Tests pass: `bin/rails test test/exports/orders_csv_test.rb`
- [x] Manual check: open the file in Excel

**Dependencies:** None

**Files likely touched:**
- `app/exports/orders_csv.rb`
- `test/exports/orders_csv_test.rb`

**Estimated scope:** Small

## Task 2: Export endpoint

**Description:** `GET /orders/export.csv` applies the list filters.

**Acceptance criteria:**
- [x] Filters applied
- [ ] Over 10,000 orders refused with a message

**Verification:**
- [ ] Tests pass: `bin/rails test test/controllers/orders_controller_test.rb`
- [ ] Build succeeds: `bin/rails assets:precompile`

**Dependencies:** Task 1

**Files likely touched:**
- `app/controllers/orders_controller.rb`
- `config/routes.rb`

**Estimated scope:** Medium

## Checkpoint: After Tasks 1-2
- [ ] All tests pass
- [ ] Review with human before proceeding

## Task 3: Export button

**Description:** A button on the orders list.

**Acceptance criteria:**
- [ ] The button downloads the file

**Verification:**
- [ ] Manual check: click it

**Dependencies:** Tasks 1, 2

**Estimated scope:** XS
