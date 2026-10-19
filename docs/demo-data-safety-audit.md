# Demo data safety audit

Date: 2026-10-19 (Australia/Perth)

Initial decision: **STOP before implementing demo writes in production tables.**

Current status: the catalog and automation exports have now been reviewed, and
the private sandbox implementation is complete locally. See
[`demo-data.md`](demo-data.md) for the final design, verification and installation
steps. Production business tables remain outside the demo workflow. The feature
has not been applied to the hosted database or deployed frontend.

Update: the subsequently supplied production catalog has been reviewed. See
[`demo-data-live-catalog-review.md`](demo-data-live-catalog-review.md) for confirmed
live blockers, actual schema drift, and the remaining automation evidence. The
source-only limitations below describe the initial audit phase.

At the initial audit stage no generator, cleanup RPC, migration or UI action was
implemented. No production data change or provider request has been executed at
any stage. The later implementation adds isolated objects and Settings controls;
existing authentication, production RLS, bottom navigation and unrelated working
tree changes were preserved.

## Scope and limits

Reviewed the repository migrations, foreign keys, money-related triggers and
functions, read models, billing and notification jobs, payment Edge Functions,
payment/report/finance queries, and daily cash calculation. Later replacement
definitions matter: for example, `record_payment` is replaced by validation
hardening, scheduled billing by anniversary billing, and `payment_overview` by
payment accounts.

The configured frontend has a public Supabase key. No privileged database
connection or database inspection connector is available in this session. A local
linked-project marker does not establish live schema parity or grant catalog
access. The local migrations cannot establish what is currently deployed, what
was edited in Studio, or which external integrations run against production.

This is a source audit, **not a successful live production safety audit**.

## Blocking findings

| Boundary | Source evidence | Consequence of inserting labeled demo rows into existing tables |
| --- | --- | --- |
| Batch identity | No demo batch field, demo table family, or database-enforced demo relationship boundary exists in the migrations. | Names such as `DEMO` cannot enforce ownership, prevent cross-links, or prove safe cleanup. |
| Bill balances | `_refresh_bill` in `20261016000100_payment_integrity.sql`; payment and bill-item refresh triggers in `20261012000200_functions.sql`. | Verified payments change their linked bill balances. There is no check preventing a supposed demo payment from targeting a real bill. |
| Allocations and receipts | `_payments_guard`, `_allocate_payment`, and payment allocation triggers in `20261019000100_unified_billing.sql`. | A verified payment allocates actual bill lines and takes a number from the shared `payment_receipt_seq`. A transaction rollback does not restore consumed PostgreSQL sequence numbers. |
| Income and expenses | `financial_transaction_overview` in `20261024000100_financial_management.sql`. | Every verified payment allocation is projected into income, grouped by charge kind. Manual demo income/expenses would also appear. No demo exclusion exists. |
| Daily cash and carry-forward | `src/features/finances/api.ts`, `daily-cash-report-model.ts`, daily cash adjustment/opening migrations. | Cash payments enter daily income, ending cash, and subsequent computed opening balances. Saved openings and adjustments are global to the property, not a batch. Saving a test opening for an existing date would update the production opening. |
| Billing, arrears, dashboards, occupancy | `bill_overview`, `payment_overview`, `room_overview`, `tenant_overview`; `src/features/reports/api.ts`, room/billing/payment APIs, dashboard and reports pages. | Demo bills, rooms, tenants, leases, and payments would be included in the corresponding real listings and aggregates. Filtering only a new demo page would not protect these consumers. |
| Notifications | `_payments_notify`, `_bill_issued_notify`, `_bill_voided_notify`, reminder/digest functions in unified billing; `_notify` in `20261018000100_notifications.sql`; lease/account notification triggers. | Normal event and scheduled-job paths have no demo suppression. Null-user manual tenants and the actor suppression in `_notify` avoid some notices, but pending proofs, jobs and landlord digests still create paths to real recipients. |
| Scheduled billing | `_generate_bills` and `run_scheduled_billing` in `20261022000200_anniversary_billing_and_per_person_water.sql`; cron configuration in scheduled billing and notification migrations. | Qualifying fictional leases participate in normal automatic generation, billing-run totals, and billing notices. |
| Online payments | `start_online_payment`, `_confirm_provider_payment`; `supabase/functions/online-payment`, `paymongo-webhook`, and `_shared/paymongo.ts`. | There is no database or Edge Function demo rejection. An eligible portal-linked fictional tenant could reach the configured provider. A disabled demo UI button alone would not enforce the boundary. No provider was called during this audit. |
| Cleanup | `payment_allocations_immutable`, `_bill_items_guard` in unified billing; finance and daily opening audit immutability triggers; restrictive FKs throughout migrations. | Normal deletion cannot remove verified allocations, finalized bill lines, or permanent finance/opening audits. The ordinary finance delete RPC only soft-deletes and retains audit history. A safe complete cleanup needs explicit batch-aware design. |
| Other dependencies | Account audits, occupant audits, water adjustments, meter-reading audits, deposits, checkouts, documents and storage references. | Payment/bill/tenant deletion alone is incomplete. Notifications use polymorphic entity IDs rather than FKs, so FK traversal alone would also miss generated notices. Storage objects require a separate lifecycle from a database transaction. |
| Access control | `is_landlord`, `_assert_landlord`, RLS policies, security-invoker views and security-definer RPCs. | The landlord can see all production business rows. Existing RLS distinguishes users and tenants; it does not distinguish demo batches from production. A client-side demo flag cannot secure these RPCs or direct reads. |

## Existing payment behavior to preserve

One collection already covers the rent, electricity, water, and other lines of
**one consolidated bill**. `payments.bill_id` associates each collection with one
bill; this is not an existing multi-bill collection ledger.

For a fictional bill with rent 5,000, electricity 245, and water 100, one 5,345
payment would create one payment and three allocations. The existing priority is
electricity, water, other, then rent. Partial payments leave the unpaid remainder
on later-priority lines. Receipts use stored allocations, and finance views
project the collection into charge categories; those projected rows are not
additional collections.

`record_payment` in validation hardening and the allocation checks reject an
amount greater than the bill balance. Overpayment testing should initially
verify rejection and unchanged balances/history. Accepting excess money as tenant
credit would require a separate ledger and an explicit business-logic change;
it must not be silently added as part of demo data.

## Next required evidence

1. Run `supabase/audits/demo-isolation-catalog.sql` through an authorized secure
   database connection or the Supabase SQL editor. Run the entire file: it returns
   one `demo_isolation_audit` JSON cell containing 20 named audit sections. Export
   or copy that complete value; the optional-relation presence check alone does
   not contain the financial definitions needed for this review. It uses a
   read-only transaction and reads catalog metadata only; it does not call application functions, read
   tenant/payment rows, or change database objects. Treat its output as internal
   because custom function definitions can contain embedded integration secrets.
2. Compare the live definitions and migration versions with the repository.
   Inspect scheduled job commands, database webhooks, event triggers, publications,
   custom schemas, enabled integrations, deployed Edge Function versions, and
   provider configuration. The catalog script lists optional relation presence;
   it deliberately does not read Vault secrets or invoke HTTP functions. Inspect
   cron commands in the dashboard without executing them. Review external
   consumers and exports that a local source audit cannot discover.
3. Choose and review the isolation design against that inventory. Do not insert
   demo business rows until database-enforced isolation and cleanup are proven.

A separate Supabase project has **not** been shown necessary yet. Options inside
the existing project include a dedicated sandbox table/schema family with no
production business-row references or integrations, or comprehensively enforced
batch separation across the existing financial graph. The former needs a design
for safely reusing payment calculation rules; the latter changes many existing
money and automation boundaries. Neither option is implemented or certified here.

## Acceptance gates for any implementation

- Keep authorization in the database: only the active landlord role may generate,
  inspect, pay, and clean up a batch. Tenants and anonymous users cannot do so.
  Preserve existing authentication and production RLS behavior.
- Give every demo-owned row and dependent audit/notification a non-null batch
  identity. Enforce same-batch relationships and forbid references from demo
  business records to real tenants, rooms, leases, bills, or allocations. Treat
  the authorized actor identity separately from demo business data ownership.
- Ensure production queries cannot include demo activity, including direct
  table reads, reports, CSV/print exports, occupancy, arrears, and cash carry-forward.
  Partition receipt numbering, opening balances, adjustments, reference uniqueness,
  request idempotency, and all generated dependencies.
- Reject demo IDs at database/provider entry points and Edge Functions before
  any provider call; suppress all notification and scheduled-job side effects.
  Do not create real Auth users, invitations, transfers, or uploaded proof files
  just to simulate a payment.
- Reuse allocation, receipt and cash calculation rules with explicit scoped
  inputs. Verify full and partial payments, one 5,345 collection and its exact
  split, outstanding balances, overpayment rejection, history and receipt totals,
  expenses, daily income and beginning/ending cash.
- Implement cleanup as one authorized database transaction locked to a selected
  batch. Preview counts by table/type; confirm in the UI; validate the ownership
  graph again under the lock; delete children in verified dependency order with
  explicit batch predicates; return actual counts. Serialize generation, payment
  and deletion for the batch. Refresh confirmation if the preview has changed.
- Do not disable triggers, use `session_replication_role`, reset shared sequences,
  weaken production audit immutability, perform unrestricted deletes, or substitute
  soft deletion for the promised complete removal. Keep sandbox file objects out
  of the initial feature unless a separate verifiable storage cleanup is designed.
- Prove in a disposable database that real business rows, report totals, cash,
  notification recipients and receipt sequences remain unchanged. Exercise
  concurrent payment/deletion, forged cross-batch IDs, deletion of an absent or
  already deleted batch, injected cleanup failure and full rollback, and all
  non-admin access paths. Test the exact live schema and integrations before
  enabling generation in production.

At the end of the initial audit, Generate/View/Delete remained unimplemented.
The subsequent private-schema implementation addresses these gates without
inserting rows in the production business graph; its checks and limitations are
documented in `demo-data.md`.

## Local verification performed

- Executed the catalog script against a fresh in-memory PGlite database containing
  the repository migrations and the existing test suite's Supabase Auth/Storage
  stand-ins. The pg_cron installation migration was excluded as in the existing
  database suite. Confirmed the transaction reports `transaction_read_only = on`
  and the inventory includes payment tables, payment RPC definitions, and the
  allocation deletion guard. The temporary verification process closed its
  in-memory database afterward; no production connection was used.
- `npm.cmd run test:db`: **154 passed**.
- `npm.cmd run test:unit`: **25 passed**, including daily cash carry-forward,
  allocation grouping and opening balances.
- After consolidating the SQL-editor output, reran catalog validation: exactly
  one row contains all 20 sections and the format version, complete payment and
  finance definitions, RLS policies, and optional-relation presence results.
  Empty sections remain arrays, and the transaction still reports read-only.

These are existing behavior checks and catalog-script validation. They do not
test an implemented demo feature, verify the live schema, simulate external
integrations, or satisfy the production-isolation acceptance gates above.
