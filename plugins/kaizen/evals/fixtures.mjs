// Demo project shared by the evaluations: a small shop (orders, totals), in dependency-free
// JavaScript, tested with node:test.

export const CONSTITUTION = `---
name: Shop
version: 1.0.0
ratified: 2026-09-01
last_amended: 2026-09-01
artifact: kaizen-constitution/v1
---
# Constitution

## Articles

### I. Evidence first — NON-NEGOTIABLE
Every behavior change comes with a test that failed before.
**Check:** does each unit have a test-first evidence strategy?

### II. Simplicity
No dependency or mechanism nobody asked for.
**Check:** no dependency added without justification?

### III. Small batches
A change fits in a reviewable PR.
**Check:** does the diff stay under the size limit?

## AI policy

### IV. Agent autonomy
Agents never merge, never force push and never publish a release on their own.
**Check:** no reserved action taken alone?
`;

export const SHOP = {
  'package.json': { name: 'shop', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } },
  'src/orders.js': `export const orders = [];

export function addOrder({ customer, items, status = 'new' }) {
  const order = { id: orders.length + 1, customer, items, status, date: '2026-09-15' };
  orders.push(order);
  return order;
}

// Total including tax, in cents: unit price (cents) × quantity, 20 % VAT.
export function totalCents(order) {
  const net = order.items.reduce((sum, it) => sum + it.priceCents * it.qty, 0);
  return Math.round(net * 1.2);
}

export function byStatus(status) {
  return orders.filter((o) => o.status === status);
}
`,
  'src/orders.test.js': `import test from 'node:test';
import assert from 'node:assert/strict';
import { addOrder, totalCents, byStatus } from './orders.js';

test('total including tax', () => {
  const o = addOrder({ customer: 'Ana', items: [{ priceCents: 1000, qty: 2 }] });
  assert.equal(totalCents(o), 2400);
});

test('filter by status', () => {
  addOrder({ customer: 'Bo', items: [], status: 'shipped' });
  assert.equal(byStatus('shipped').length, 1);
});
`,
  'CONSTITUTION.md': CONSTITUTION,
  '.gitignore': 'node_modules\n.kaizen/runs\n',
};

// Implementation-ready plan (passes `plan check`): orders CSV export, library version.
export const CSV_PLAN = `---
title: Orders CSV export - Plan
type: feat
date: 2026-10-02
topic: orders-csv-export
artifact: kaizen-plan/v1
source: brainstorm
---

# Orders CSV export - Plan

<!-- kaizen:goal -->
## Goal capsule

**Goal:** produce, from a list of orders, a CSV text that Excel opens correctly.
**Product authority:** scope decided by the user (2026-10-02).
**Open blockers:** none.

<!-- kaizen:product -->
## Product contract

### Summary
A function \`ordersToCsv(orders)\` returns the CSV of the given orders.

### Requirements
- R1. A header line then one line per order: id, date, customer, status, total including tax in euros.
- R2. Accents display correctly in Excel (UTF-8 BOM, \`;\` separator).
- R3. Beyond 10,000 orders, the function throws an error "Too many orders (N): max 10,000".

### Acceptance examples
- AE1. (covers R1) Given an order of 2 items at 10.00 €, when I export, then the line contains \`24,00\`.
- AE2. (covers R2) Given the customer "Hélène Müller", when I export, then the text starts with the BOM and contains "Hélène Müller".
- AE3. (covers R3) Given 10,001 orders, when I export, then an error mentions "10,001" or "10001".

### Out of scope
- HTTP endpoint, button, column selection.

<!-- kaizen:planning -->
## Planning contract

### Key technical decisions
- KTD1. Pure function in \`src/csv.js\`, no dependency; reuses \`totalCents\`. Covers R1.

### Context and patterns to follow
- \`src/orders.js\` — \`totalCents\` gives the total including tax in cents.

### Risks
- Fields containing \`;\` or quotes → standard CSV escaping (doubled quotes).

<!-- kaizen:constitution -->
## Constitution check

| Article | Verdict | Justification / evidence |
|---|---|---|
| I. Evidence first | ✅ | U1–U2 test first |
| II. Simplicity | ✅ | pure function, no dependency |
| III. Small batches | ✅ | ~80 lines |
| IV. Agent autonomy | ✅ | nothing reserved |

<!-- kaizen:threats -->
## Threats

- **Formula injection** · file opened in Excel · a name starting with \`=\` → prefix with an apostrophe (U1).

<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure**: internal library, no caller yet.
- **Rollback**: revert the commit.

<!-- kaizen:units -->
## Implementation units

### U1. CSV serializer
- **Goal:** turn orders into CSV (R1, R2).
- **Covers:** R1, R2, AE1, AE2
- **Depends on:** —
- **Files:** \`src/csv.js\` (new), \`src/csv.test.js\` (new)
- **Approach:** BOM, \`;\` separator, amount with a decimal comma, escaping.
- **Evidence:** test first.
- **Test scenarios:** header; total \`24,00\` (AE1); BOM and accents (AE2); field with \`;\`.
- **Verification:** \`node --test src/csv.test.js\`
- **Slice:** S1

### U2. Volume cap
- **Goal:** refuse exports that are too big (R3).
- **Covers:** R3, AE3
- **Depends on:** U1
- **Files:** \`src/csv.js\`, \`src/csv.test.js\`
- **Approach:** check the length before serializing.
- **Evidence:** test first.
- **Test scenarios:** 10,000 passes; 10,001 throws the error (AE3).
- **Verification:** \`node --test src/csv.test.js\`
- **Slice:** S1

<!-- kaizen:verification -->
## Verification contract
- \`npm test\`

<!-- kaizen:done -->
## Definition of done
- U1–U2 shipped, each with its evidence; R1–R3 and AE1–AE3 covered by green tests.
`;

// No maintainer to answer: interactive skills must move forward on their recommendations.
export const HEADLESS = 'Nobody is available to answer your questions during this session: whenever you would ask, take your recommendation and record it as an assumption in the deliverable.';
