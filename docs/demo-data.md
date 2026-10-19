# Demo Data

Rentlio now has an admin demo workspace under **Settings → Demo Data**. It uses
the existing Supabase project and a separate, private `rentlio_demo` schema.
Fictional tenants are not production profiles or Auth users. Existing production
tables, policies, business functions, reports, provider endpoints, and bottom
navigation are unchanged.

## Installation on the audited deployment

The exported migration ledger stops at `20261021000100`, while the catalog already
contains later financial objects and several older payment-account definitions.
**Do not run a blanket `supabase db push` to install this feature.** That could
replay unrelated migrations against an already diverged production schema.

1. In the intended project's SQL editor, apply the entire
   [`20261026000100_demo_sandbox.sql`](../supabase/migrations/20261026000100_demo_sandbox.sql)
   file as one transaction. It creates only the private schema, its tables and
   helpers, and eight new landlord-checked public RPCs. It does not seed records,
   invoke payment providers, change application settings, repair older schema
   drift, or alter existing production functions or RLS policies. It needs only
   existing helpers verified in the supplied catalog, including the pure
   allocation priority helper and landlord authorization check.
2. Run [`demo-sandbox-verification.sql`](../supabase/audits/demo-sandbox-verification.sql).
   It is read-only and does not generate data. Expect `isolation_check: passed`,
   `read_only: on`, `private_table_count: 10`, `wrapper_count: 8`, and all four
   permission/search-path flags `true`. A failed gate must be investigated before
   demo generation; do not disable triggers, weaken RLS, or expand the allowlist
   to bypass an unexplained failure.
3. Deploy the frontend containing this change through the usual frontend release
   process. Sign in as the active landlord and open **Settings → Demo Data**.
   The controls stay disabled with an installation message if the RPCs are absent.

SQL-editor installation does not reconcile Supabase CLI migration history. Keep
that history reconciliation separate from testing this feature; do not mark older
unapplied migrations as successful or replay them as part of demo setup. On a
fresh local database, the ordinary test/migration sequence includes this file.

No production migration or frontend deployment was performed by the coding agent.

## Initial fictional scenarios

Each generated batch contains four tenants, four rooms, four rental agreements,
four monthly consolidated bills and ten rent/utility lines. A month-boundary
generation uses the appropriate prior period for the overdue examples.

| Room | Initial scenario | Initial bill / balance |
| --- | --- | --- |
| DEMO-1 / Ava | Combined bill awaiting payment | Rent 5,000 + electricity 245 + water 100 = **5,345** |
| DEMO-2 / Ben | Yesterday's partial cash collection of 1,000 | **4,345** outstanding; utilities already allocated first |
| DEMO-3 / Cora | Rent-only bill awaiting full payment | **5,000** outstanding |
| DEMO-4 / Dina | Combined cash collection already paid today | **5,345** collected, zero outstanding, receipt available |

Yesterday's opening cash is 1,000; yesterday's partial cash payment carries 1,000
forward. Today's initial report therefore shows beginning cash **2,000**, income
**5,345**, expenses **250** for fictional supplies, and ending cash **7,095**.
All demo money uses PHP; dates use the existing property clock.

## Test workflow

1. Select **Generate Demo Data**, then **View Demo Records**. Each batch has its
   own displayed UUID. Up to five batches may coexist.
2. Pay Ava **5,345** once. History shows one collection with electricity 245,
   water 100, and rent 5,000 allocations. The balance becomes zero. Pay Cora
   **5,000** to test a full rent-only payment.
3. Use another batch or Ben's remaining balance for additional partial payments.
   Allocation follows production's existing electricity → water → other → rent
   priority. Payments above the remaining balance are rejected without a balance,
   receipt-counter, allocation, or cash change. This feature does not introduce
   an overpayment-credit ledger.
4. Choose **Simulated proof for review** to create a pending entry. It reserves
   availability for other pending submissions but adds no collection, allocation,
   receipt or cash income. Approve it to apply its amount to the current balance,
   or reject it with a reason. An approval that would now overpay is refused.
   GCash, Maya and bank-transfer choices are labels for simulated methods only;
   no transfer, proof upload, receiving-account selection, checkout or webhook is
   initiated. Non-cash collections do not enter the cash-on-hand report.
5. Use **Receipt / Print PDF** for verified entries and the browser's Save as PDF
   option. Every receipt is marked **DEMO** with the batch UUID and a private
   counter. It records the collection's allocations and its stored balance before
   and after, so later collections do not rewrite the earlier receipt. Print
   content uses `textContent`, so record descriptions are not interpreted as HTML.
6. Inspect the demo report by date, record a fictional cash expense, or save an
   opening cash amount. A saved opening takes precedence for its date and anchors
   later carry-forward, using the same cash calculation function as production.

This tests the admin billing/collection scenarios in an isolated ledger. It does
not log a fictional tenant into the production tenant portal, test real receiving
accounts or uploaded proof validation, or exercise deployed payment-provider Edge
Functions. Those paths are deliberately unreachable from the demo workspace.
Production payment calculation is protected from edits: allocation priority is
shared, the allocation algorithm is checked against the production engine with
matching collections, and the cash-report engine is reused directly.

## Cleanup and concurrency

Choose the batch in Settings and select **Delete Demo Data**. The confirmation
fetches a fresh record count for every table and names the selected batch. A
single RPC locks that batch, checks its preview revision, deletes child records
with bound batch predicates, then deletes the batch and reconciles actual counts
against the preview. The result lists the removed types and counts.

All payment, review, expense and opening mutations acquire the same batch row
lock before writing. A payment committed first changes the revision and makes an
older deletion confirmation fail; a deletion committed first leaves the waiting
writer with no batch to mutate. PostgreSQL's transaction rolls back every child
deletion and the batch deletion if any constraint or count check fails. Another
batch remains intact. Already deleted or unrelated IDs are refused.

No production audit guards are bypassed. There are no demo files in Storage,
demo Auth users, provider sessions or notifications to clean up outside the
transaction. After cleanup the installed empty schema and RPCs remain available
for future batches; no selected-batch records or receipt counters remain.

## Enforced boundary

- Composite foreign keys include the batch on every private relationship.
  Cross-batch bill, tenant, payment and allocation IDs cannot be linked.
- All ten tables have RLS, no client policies, and no direct client grants.
  Anonymous users and tenants cannot use the public RPCs. Even `service_role`
  lacks direct schema/table or wrapper execution grants; a database owner remains
  the trusted administrator, as with the existing production database.
- The eight public RPCs are security-definer functions with empty search paths.
  They call the existing landlord check and access only explicit private tables.
  The production profile and property settings are read solely by the existing
  authorization/clock helpers, never modified by demo operations.
- Private receipt numbering, openings, expenses and request IDs never use a
  production ledger or sequence. Production reports and scheduled jobs explicitly
  read their existing `public` tables and cannot see private demo records.
- Before each mutation the database rejects unexpected private tables, user
  triggers/rules, cross-schema foreign keys, views that expose demo tables, direct
  grants, unfamiliar functions that reference the private namespace, broad or
  demo Realtime publications, a filtered Cron inventory, and active scheduled
  commands outside the two audited Rentlio jobs. The guard reads command text;
  it never executes it. Unexpected future integration changes therefore require
  another review instead of silently admitting demo writes.
- The guard assumes the trusted database owner does not deliberately rewrite
  installed security functions to bypass it. It is not a defense against a
  malicious project administrator or undisclosed external access using owner
  credentials. No schema design within one database can provide that boundary.

## Verification

The database suite exercises authorization, exact collection allocation,
rent-only/full/partial payments, overpayment rejection, pending review, expense
idempotency, cross-batch and production IDs, scheduler non-interference, changed
deletion previews, complete cleanup, injected mid-cleanup rollback, and isolation
gate failures. It compares every normal public table/view and sequence before and
after demo operations. The notification-job comparison allows only the exact
sequence increments observed in a separate no-demo control run: existing
deduplicated notification INSERT attempts consume IDs even without new notices.

A differential test feeds the same partial collections to production and sandbox
engines in a disposable database and compares allocations and receipt balances.
Unit tests verify one combined collection is counted once, cash carry-forward,
opening overrides, and the marked receipt amounts. An additional local run
reconstructed the supplied payment-account drift, the hosted RLS event trigger,
and the two exact cron commands; generation, review and cleanup left existing
public definitions, rows, reports and counters unchanged.

PGlite supplies local PostgreSQL execution; real multi-connection contention and
the hosted deployment were not exercised. The row-lock/transaction behavior is
implemented in SQL, and stale revisions and rollback are tested locally. Run the
read-only post-install verification on the intended project before using the UI.

Final local checks: **169 database tests**, **28 unit tests**, production build
and ESLint pass. No browser surface was available for interactive UI verification;
the print dialog and responsive layout were not browser-tested in this session.
