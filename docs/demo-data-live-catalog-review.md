# Review of the supplied production catalog

Review date: 2026-10-19 (Australia/Perth).

Implementation update: the subsequent scheduler export closes the configuration
gap identified below. The isolated demo feature is now complete locally; see
[`demo-data.md`](demo-data.md). It has not been installed on production.

Decision: **Do not generate demo rows in the existing production business tables.**
The supplied catalog confirms the isolation and cleanup blockers from the source
audit. This is a review of the user's exported snapshot, not a new connection to
production or certification of a completed demo implementation.

## Evidence reviewed

The attached JSON parses successfully and contains all 20 expected catalog
sections plus `audit_format_version: 1`. Its metadata reports PostgreSQL 17.11,
the `postgres` inspecting role, and `transaction_read_only: on`.

Source file SHA-256:
`af86f0d904c2f6106fda94cc8f6ca4d606eeeeba2e3c94d35fbedbd21c231d16`.

Reviewed 33 public base tables, 116 public routines, 44 public non-internal
triggers, six public views, 45 public RLS policies, and seven database event
triggers. The original export also inventories Auth, Storage, Realtime, Cron,
other schemas, ACLs, dependencies, and publications. No raw export or receiving
account values were copied into the repository.

The public definitions were compared against a fresh in-memory PGlite database
created from the repository migrations using the existing tests' Auth/Storage
stand-ins. The pg_cron installation migration is excluded from that environment;
this comparison does not execute live jobs or Edge Functions.

## Confirmed production boundaries

- All 33 public base tables have RLS enabled. The existing production RLS
  policies distinguish tenants and the landlord, but contain no demo batch scope.
  No public demo tables or demo batch columns were found.
- `_refresh_bill`, `_payments_guard`, `_allocate_payment`, payment receipt logic,
  and notification functions match the local definitions after line-ending
  normalization. They operate on production `public` tables. Verified payments
  allocate actual charges, update balances, and consume the shared receipt counter.
- `financial_transaction_overview` matches locally and projects verified payment
  allocations into income without a demo exclusion. `bill_overview`,
  `room_overview`, and `tenant_overview` also match locally. The app's cash and
  report queries therefore have the contamination paths described in the source
  audit. The exported daily opening balances remain keyed by date only.
- The live payment-allocation, finance-audit, and daily-opening-audit immutability
  triggers are enabled. Finalized bill items also have their deletion guard.
  Verified demo payments placed in this graph would not be completely removable
  through the existing authorized operations.
- Scheduled billing, rent-reminder and landlord-digest function bodies have no
  demo exclusion. The `cron.job` relation exists, but its rows are not included
  in this catalog export. Function definitions do not establish which commands
  are scheduled or enabled.
- Both payment provider database entry points remain production paths. They have
  no demo scope. The export does not describe deployed Edge Function versions or
  their provider configuration. No provider endpoint was called during review.
- Realtime's application publication explicitly includes `public.notifications`;
  neither publication is `FOR ALL TABLES`. Notifications created by the ordinary
  business triggers can therefore reach real connected users.
- The seven event-trigger definitions were examined. They handle automatic RLS
  on new public tables, extension grants/wrappers, and PostgREST schema reloads.
  They do not provide demo isolation or batch cleanup. The automatic RLS trigger
  enforces only `public`, so a new private sandbox schema must explicitly set its
  own privileges and RLS; it cannot rely on this trigger.

## Actual drift from repository migrations

| Object | Exported production state | Local migration state / implication |
| --- | --- | --- |
| `payments.payment_account_snapshot` | Absent. | JSON snapshot column exists locally. The corresponding `payment_overview` column is also absent live. |
| `_payment_account_snapshot_immutable()` and its trigger | Absent. | Present locally. The live database does not have that specific receiving-account snapshot guard. |
| `submit_qr_payment(...)` | Stores only `payment_account_id`; checks image MIME type; requires a transaction reference. | Local definitions also snapshot the receiving account, check proof file size, and later allow optional references. Do not assume those local protections and optional-reference behavior are deployed. |
| `save_payment_account(...)` | Validates that the QR image exists at the expected path. | Local implementation also validates stored image MIME type and the 4 MB file-size limit. |
| `_payment_account_changed()` | Sends the account-change notice with a null related-entity type. | Local definition supplies the `billing` related-entity type. Both definitions still send real tenant notices. |
| `tenant_walkthrough`, its policy, and `save_tenant_walkthrough(...)` | Exist live, absent from this repository's migrations. | Additional tenant dependency: its FK references `profiles(id)` with `ON DELETE CASCADE`. The RPC checks for an active tenant. Do not delete or rewrite it to force schema parity. |
| `rls_auto_enable()` and `ensure_rls` event trigger | Exist live. | Hosted environment behavior not installed by the local application migrations. Explicit sandbox security must account for its public-only scope. |

The four financial/account-related differences in routine/view definitions were
inspected in full: three differing public routine definitions and
`payment_overview`. Shared public trigger definitions otherwise match; the one
missing local trigger is the payment-account snapshot guard above. Public policies
otherwise match, with the additional walkthrough policy live. Shared column
definitions match, with the two missing snapshot columns and four walkthrough
columns accounting for the column differences.

In total, 111 shared public routine definitions, 44 shared trigger definitions,
five shared view definitions, and 265 shared non-NOT-NULL constraint definitions
match after line-ending normalization. This is definition comparison, not proof
that live data or external integrations behave identically to local fixtures.

PostgreSQL catalog version differences must not be misclassified as missing
constraints: the local PGlite catalog lists NOT NULL constraints separately.
Column nullability was compared through `pg_attribute.attnotnull` instead. No
automatic schema repair, replacement of a live function, or migration push was
performed.

## Safe continuation

A separate Supabase project has not been shown necessary. A candidate design in
this project is a private sandbox schema with its own fictional records, batch
ownership, ledger, cash openings, and receipt counter, accessible only through
landlord-checked RPCs. It needs no production business-row foreign keys, Auth
users, proof uploads, payment accounts, notification writes, or provider calls.
Reusing the calculation rules must be explicit and tested; a separate simulator
must not be presented as proof that the existing production payment endpoints
were exercised.

That design was not implemented at the catalog-review stage. It is now implemented
in `20261026000100_demo_sandbox.sql` and the Settings demo workspace, with local
verification described in `demo-data.md`. Adding labels and UI filters alone to
the existing financial graph would still leave the confirmed production paths
intact and would not satisfy the requested complete deletion guarantee.

The remaining database evidence is deliberately narrow: run
`supabase/audits/demo-isolation-automation.sql` and export its single
`demo_isolation_automation` JSON result. It selects scheduler commands and
migration version/name metadata only. It does not select migration statements,
tenant rows, financial rows, or secrets, and does not execute the job commands.
Review commands for embedded integration secrets before sharing. The result
records whether Cron RLS is active for the inspecting role, so a filtered list
cannot silently be treated as a complete job inventory.

The main catalog script originally checked the existence of these two relations
without exporting their configuration rows. This supplemental query closes that
specific collection gap without rerunning the large catalog export. Deployed
Edge Function/provider configuration and external consumers still need review
before any path that shares the production payment endpoints can be enabled.

Only the audit tooling and review documentation changed. Authentication, RLS,
production data, business functions, application screens, and bottom navigation
remain untouched by this work.

The preceding statement describes the catalog-review stage. The later feature
adds a private schema, eight new public RPCs, and Settings controls; it does not
alter existing production tables, functions, RLS policies or bottom navigation.

## Scheduler and migration supplement received

The user supplied `demo_isolation_automation` with `read_only: on` and
`cron_rls_active: false`. The inventory was not filtered by Cron RLS and contains
only two active jobs, both in the current database as `postgres`:

| Job | Schedule | Command |
| --- | --- | --- |
| `rentlio-monthly-billing` | `5 * * * *` | `select public.run_scheduled_billing();` |
| `rentlio-notifications` | `20 * * * *` | `select public.run_notification_jobs();` |

Both function bodies were already reviewed. They explicitly use the production
tables and do not scan arbitrary schemas. The private sandbox adds no jobs or
rows that those functions can process. Its mutation guard rejects active
scheduled commands outside these two audited commands.

The supplement lists 15 recorded migrations through `20261021000100`. The catalog
nevertheless contains objects defined in later local migrations. Migration ledger
parity is therefore not established: later objects may have been applied through
other paths, and changed definitions cannot be inferred from version numbers.
The implementation adds a standalone transaction compatible with the inspected
helper definitions. Do not replay unrelated migrations to force parity.

No more catalog exports are required for this private-schema design against the
supplied snapshot. Deployed provider settings are outside its execution path;
the demo code neither imports nor calls the provider Edge Functions. Production
provider testing remains outside this feature.

## Verification of the supplemental query

Executed the supplemental script against local in-memory scheduler and migration
metadata fixtures after applying the application migrations. Confirmed one JSON
result, a read-only transaction, job commands returned as text, migration versions
and names returned without migration statements, and no fixture changes. Repeated
with empty metadata tables to verify empty arrays. No live scheduler, deployment,
notification, or payment operation was executed.
