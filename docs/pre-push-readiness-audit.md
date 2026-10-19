# Rentlio pre-push readiness audit

Audit date: 20 October 2026 (Australia/Perth).

**Final GitHub status: READY WITH WARNINGS.** Local changes can be submitted for
review. This is not clearance to deploy the frontend before its database/RPC
dependencies are installed and the hosted schema is reconciled.

No GitHub push, Vercel deployment, production SQL execution, real payment,
production-record modification, database reset, or bottom-navigation edit was
performed during this audit. Existing uncommitted design/demo work was preserved.

## A. Issues found

| Severity | Confirmed finding | Resolution |
| --- | --- | --- |
| Critical | No unresolved critical flaw was confirmed in the locally reviewed and tested paths. | Hosted configuration and independent-connection concurrency remain outside verification. |
| High | Query caches survived external logout/account switching. A second login could receive the previous login's cached bills/payments until refetch. | Reset private state before publishing every changed identity; prevent a late profile refresh from replacing another account's loaded profile. |
| High | Financial, payment, deposit and tenant-history queries could silently stop at the API row cap. | Fetch complete, uniquely ordered pages with exact counts. Reject detected count changes, repeated row IDs and incomplete/error pages instead of presenting partial totals. |
| High | Several simultaneous Edge requests could each create a provider session for one `creating` checkout. | Added a service-only atomic creation claim and a stable provider idempotency header. An unclaimed request returns a retryable conflict before contacting the provider. |
| High | Manual income/expense creation had no retry identity. A committed request with a lost response could be submitted twice. | Added a landlord-checked, advisory-locked idempotent RPC and a retained form request ID. Changed or deleted request reuse is rejected. |
| High | The repository's earlier catalog review records hosted migration-history drift. A blanket `db push` could replay already-present changes. | Documented the release blocker and added preflight body hashes before replacing functions. Current hosted parity is still unverified. |
| Medium | Review and provider confirmation used different row-lock ordering from bill recording/voiding. Approval of legacy duplicate references also lacked the submission path's reference lock. | Standardized bill-first locking and serialized reference approval across bills. |
| Medium | Provider amounts were divided by 100 without validating their currency/integer precision. A timezone-read failure silently selected a fallback date zone. | Require positive safe-integer PHP centavos and successfully loaded property timezone before recording. |
| Medium | Payment mutations and payment notices did not invalidate finance/cash-report caches. | Invalidate the financial queries along with billing, tenant and room balances. |
| Medium | A failed bed update could leave a room's other fields committed even though the form reported failure. | Save room and bed configuration in one landlord-checked SQL transaction. |
| Medium | Manual finance date validation used database `current_date` rather than `property_today()`. | Use the property's date, matching payment and cash-opening rules. |
| Medium | Report summary/occupancy failures could display zero/empty totals instead of an error. | Render explicit retryable errors. |
| Medium | Build configuration did not reject a service-role credential accidentally placed in a public Vite variable. | Added build-time key-role/name validation and regression coverage. |
| Low | Ending-cash arithmetic converted to floating currency units before its last addition/subtraction; date inputs accepted impossible dates syntactically. | Keep the final operation in centavos and validate real ISO calendar dates. |
| Low | `.env.example` contained real deployment URL/publishable values; an obsolete demo command referenced missing files; setup instructions described older billing/Auth behavior. | Use placeholders, remove the broken command, add explicit Edge/release check commands, and correct setup instructions. A publishable key is public, not a service-role secret. |
| Low | Production build reports a roughly 505 kB initial JavaScript chunk. | Non-blocking performance follow-up; warning retained, not suppressed. |

## B. Fixes implemented

Audit changes are grouped below; unrelated earlier working-tree edits are not
claimed as audit fixes.

| Files | Changes |
| --- | --- |
| `src/providers/auth-provider.tsx`, `src/lib/auth-session.ts` | Identity-bound cache reset, removal of competing initial session reads, late-profile guard, visible sign-out errors. |
| `src/lib/pagination.ts`; APIs under `features/finances`, `payments`, `portal`, `registrations`, `reports`, `tenants` | Complete history/report reads with API-cap and detected concurrent-change handling. |
| `src/features/billing/api.ts`, `src/features/notifications/use-notifications-realtime.ts` | Finance invalidation after payment changes; stable invalidation callback for bounded checkout-return polling. |
| `src/features/finances/{api,transaction-dialog,daily-cash-report-model,daily-cash-report}.tsx/ts` | Retry identity, exact ending cash, corrected refresh behavior. |
| `src/features/rooms/api.ts`, `src/lib/database.generated.ts` | Atomic room/bed save and updated RPC/table type signatures. |
| `src/pages/landlord/reports.tsx`, `src/lib/form-fields.ts`, `src/features/tenants/tenancy-dialogs.tsx` | Report error states, calendar-date validation, move-in error association. |
| `supabase/functions/_shared/paymongo.ts`, `online-payment/index.ts`, `paymongo-webhook/index.ts` | Checkout creation claim/idempotency, provider amount/currency validation, timezone failure handling. |
| `supabase/migrations/20261026000300_production_readiness.sql` | Transactional database fixes, role grants and drift preflight. No tenant balances are backfilled or historical financial rows rewritten by this migration. |
| `config/public-env.ts`, `vite.config.ts`, `.env.example`, `.gitignore`, `scripts/check-release.mjs`, `package.json`, `README.md` | Public-environment guard, placeholder configuration, secret/dump exclusions, repeatable checks and safer release instructions. |
| `supabase/audits/prepush-readiness.sql` | Optional read-only catalog/invariant report with metadata and violation counts, without tenant identities or payment details. Tested locally. |

New regression coverage includes external account switching and late requests,
history beyond 1,000 rows/lower server caps, detected pagination races, exact cash,
real dates, private keys in public configuration, manual-finance retries, checkout
creation ownership, room-save rollback, security catalog rules, read-only audit
non-interference, migration refusal, provider currency/precision and forged
webhooks. The existing move-in editor and its two database tests remain intact.

## C. Verification results

All results below were executed, not inferred from code inspection.

| Check | Result |
| --- | --- |
| `npm run typecheck` / production TypeScript compilation | PASS |
| `npm run lint` | PASS, repository-wide ESLint |
| `npm run build` | PASS; bundle-size warning remains |
| `npm run test:unit` | PASS, 38 tests |
| `npm run test:db` | PASS, 178 tests |
| `npm run typecheck:edge` | PASS, all four Edge entry points |
| `deno lint supabase/functions` | PASS, eight files |
| `npm run test:edge` | PASS, 3 tests; provider requests mocked, no payment initiated |
| `npm audit --json` | PASS, zero known advisories returned for the npm dependency graph |
| `deno audit --lock supabase/functions/deno.lock` | PASS, no known vulnerabilities returned for the separate Edge dependency lock |
| `npm ls --depth=0` | PASS |
| `npm run check:release` | PASS, no configured private-key/JWT/dump patterns found among commit-eligible files |
| Git environment ignore checks and `git diff --check` | PASS |

Total: **219 passing tests** (38 unit + 178 database + 3 Edge).
The database suite applies the SQL migrations in disposable in-process PostgreSQL
(PGlite), with Supabase Auth/Storage stand-ins. The pg_cron migration is excluded
there; scheduler business functions and isolation-gate behavior are tested, not a
running hosted cron installation. The two registry audits needed network access;
the initial sandbox attempts failed and their permitted reruns succeeded.

The security tests exercise anonymous/tenant/landlord/service permissions, tenant
isolation, suspension, approval, storage folder access, receipts, allocation
consistency, immutable financial history and the single-landlord constraint.
One combined rent/electricity/water collection remains one `payments` record;
immutable charge allocations reconcile to that payment, and the daily cash report
groups its cash allocations into one collection entry. Multiple partial payments
and overpayment rejection are covered. This is not a new cross-bill payment feature.

Demo tests cover batch ownership, composite foreign keys, forged production and
cross-batch IDs, pending/verified/rejected payments, private receipts/cash,
idempotency, stale deletion previews, selected-batch cleanup and injected rollback.
They compare production tables/views/sequences before and after demo operations.
The isolation gate blocks unexpected hooks, grants, publications and scheduler
commands. It does not claim protection from a malicious database owner.

Repository configuration exposes only public Supabase settings in the frontend;
the service key remains an Edge/server concern. `.env` files and `.vercel` are
ignored, and `.env.example` now uses placeholders. No production data export was
found among source candidates; inspected public/profile/receipt images are
illustrations. The scan is a high-confidence pattern check, not a certification
of every historical Git blob, binary artifact or arbitrary personal-data format.

Pagination and auth behavior were checked against the
[Supabase select](https://supabase.com/docs/reference/javascript/select),
[range](https://supabase.com/docs/reference/javascript/range), and
[Auth event](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
references. The provider retry header follows
[PayMongo's idempotency guidance](https://docs.paymongo.com/docs/developer-tools-best-practices-1).

## D. Remaining risks and release gates

1. **Hosted schema parity is a deployment blocker.** The prior catalog report is
   evidence of earlier drift, not a fresh production inspection. Review actual
   deployed definitions and migration ledger before applying any migration. Do
   not bypass the new hash check or replay old migrations to make it pass.
   The read-only readiness SQL can help an authorized owner identify missing RPCs
   and financial invariant violations; this audit did not run it against production.
2. **Coordinate the database, Edge and frontend release.** The current frontend
   requires `save_financial_transaction_once`, `save_room_with_beds`, and the
   move-in RPC. Updated online checkout requires `_claim_checkout_creation`.
   These are fail-closed errors if missing, not fallbacks to unsafe writes. Apply
   reviewed database changes before activating their callers. No migration was
   installed remotely during this audit.
3. **One property/landlord per Supabase project.** A unique index prevents a second
   landlord, and local tests confirm it. There are no property-owner foreign keys
   to support multiple landlords in one project. Multi-landlord isolation cannot
   be claimed or enabled without a separate schema/RLS design and migration.
4. **Independent-connection contention is untested.** No local PostgreSQL service,
   psql or Docker was available. Row/advisory locks and rollback are implemented
   and tested serially in PGlite, not through real concurrent connections. Before
   enabling provider changes, stress the checkout/payment/review/void paths in a
   separate staging project. Never use real tenant records for that test.
5. **Hosted Auth/payment configuration is unverified.** Confirm Vercel environment
   scope, owned Auth redirect URLs, SMTP/recovery/invitation delivery, secure
   password settings, webhook secret/mode, provider API compatibility and retry
   behavior in staging. Keep preview/staging Supabase projects and payment test
   credentials separate from production. The private demo workspace does not
   exercise live Auth emails, receiving accounts, proof uploads or provider webhooks.
6. **Browser/device verification is outstanding.** Computer-use inventory returned
   no browser or app. Responsive grids, safe-area padding, dark variables, labels,
   focus styles, dialog scrolling and error states were reviewed in source, but
   no mobile/tablet/desktop visual, touch, keyboard or print test was run. Check
   320/375 px phones, tablet portrait/landscape and desktop in both themes; verify
   dialogs, long financial amounts, receipts and the existing bottom navigation.
7. **Operational follow-ups:** the initial bundle warning remains; a failed/retried
   receipt upload may leave a private orphan file; multi-page reports are live
   reads rather than an accounting snapshot. Detected count/ID changes fail closed,
   but same-count in-place edits across pages still need a refreshed report or a
   future server-side snapshot export for audit-grade point-in-time reporting.

## E. Final GitHub readiness

**READY WITH WARNINGS** for source review/push. No confirmed critical local
security, payment or integrity defect is left unfixed in the examined paths.
The deployed application has not been certified: schema reconciliation, staged
concurrency/provider checks and visual verification remain release gates.

Reproduce local checks with:

```text
npm run check:release
npm run typecheck
npm run lint
npm run build
npm test
npm run typecheck:edge
deno lint supabase/functions
npm run test:edge
npm audit
deno audit --lock supabase/functions/deno.lock
```

`npm test` runs unit and database tests; run the explicit Edge commands as well.
No push or deployment is implied or authorized by these verification commands.
