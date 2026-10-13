# Rentlio

Rent, utilities and payments for a 28-room rental property. The landlord manages rooms, tenants, monthly bills and payment verification. Tenants see their own bills, pay, and upload proof of payment.

**Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Lucide, React Router, TanStack Query. **Backend:** Supabase only (Postgres, Auth, Storage, RLS, Edge Functions, Cron). **Hosting:** Vercel for the frontend.

## Build phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: full database schema, RLS, storage, scheduled billing job, TypeScript/Tailwind/shadcn setup, auth (login, invite activation, password reset), role-based app shell, **Rooms**, **Account** | ✅ Built |
| 2 | Tenants: `invite-tenant` / `manage-tenant` Edge Functions, tenant list and detail, assign / move / end tenancy, change rent, deactivate / reactivate, deposit ledger | ✅ Built |
| 3 | Billing: **Settings** (rates, billing day, due days, payment instructions), monthly **meter-reading grid**, generate bills, **bill detail** with rent adjustment, extra charges and voiding | ✅ Built |
| 4 | Payments: **verification queue** with proof viewer, approve (with amount correction) / reject with reason, record cash payments with receipt, payment history | ✅ Built |
| 5 | Tenant portal: **Home** (amount due, pay now, rejection alerts), **Bills** with breakdown, pay with proof upload, **Payment history**, **My room** (terms, deposit, landlord contact, house rules), mobile bottom tabs | ✅ Built |
| 6 | Landlord **Dashboard** (KPIs, "needs your attention", overdue), **Reports** (12-month billed vs collected chart + table, arrears, occupancy, CSV export) | ✅ Built — Vercel deploy pending a live Supabase project |

### Pages

| Landlord | Tenant |
| --- | --- |
| `/dashboard`, `/rooms`, `/tenants`, `/tenants/:id`, `/billing`, `/billing/readings`, `/billing/bills/:id`, `/payments`, `/reports`, `/settings`, `/account` | `/home`, `/my/bills`, `/my/bills/:id`, `/my/payments`, `/my/room`, `/account` |

### A landlord's month

1. Day 1 (configurable): one **draft** bill per occupied room is generated automatically, with that month's rent.
2. Open **Billing → Meter readings**, type each room's current meter values, save. Electricity and water are added to the drafts.
3. **Billing → Finalize ready bills** (or **Finalize and send** on one bill). The charges lock and each tenant is notified that their one consolidated bill is ready.
4. Tenants **Pay online** (PayMongo checkout, confirmed automatically) or upload proof of a transfer, or **Pay in person**. Proofs show under **Payments → To verify**.
5. Cash in hand? Open the bill → **Record payment**. Every verified payment gets a receipt.
6. The **Dashboard** shows this month's collections by rent, electricity and water, plus unpaid and partially paid rooms.

## Architecture

### Security model

- **Database is the authority.** Every write involving money, leases or accounts goes through a `SECURITY DEFINER` Postgres function that re-checks the caller's role. Tables themselves are read-only to clients (except rooms/settings for the landlord and a tenant's own contact details, enforced by column-level grants + RLS).
- **Row Level Security** on every table. Tenants can only read rows where `tenant_id = current_tenant_id()`, which resolves the caller's login to their tenant record only while that record is active and not suspended (pending, rejected and suspended users get nothing); all read-model views (`room_overview`, `tenant_overview`, `bill_overview`, `payment_overview`, `deposit_balances`) use `security_invoker` so the same rules apply.
- **Tenant records vs logins:** a tenant record (`profiles`) and a login (`auth.users`) are linked by the unique `profiles.user_id`. There are three ways in:
  - **Manual tenant** (no email, no login): created by the landlord with `create_manual_tenant`. Fully billed; the landlord records their payments.
  - **Invitation:** the `invite-tenant` Edge Function (service role, server-side) creates the login, emails the invite and links it to a new record or to an existing manual record ("Enable portal access"), keeping all history.
  - **Self-registration** (`/register`): creates only a *pending* `registration_requests` row, never a record. The landlord reviews it under **Registrations**, states how they verified the person's identity, and either links an existing record or creates a new one (`approve_registration`, atomic, row-locked). Room numbers and names typed by the applicant are unverified hints and never grant access.
- **Landlord:** exactly one, set up explicitly with `bootstrap_landlord` (service role only). No sign-up, invitation or metadata can produce a landlord.
- **Audit:** every registration, email verification, approval, rejection, link, invitation, manual tenant and suspension is written to the append-only `account_audit_log`.
- **Storage:** private buckets. Proofs live at `payment-proofs/<tenant record id>/…`; tenants can upload only into their own folder and can never overwrite or delete a proof.
- **History is never deleted:** bills are voided (with a reason), leases are ended, tenants are deactivated. Foreign keys are `ON DELETE RESTRICT`, and clients have no delete permission on financial tables.

### Database schema

```
profiles ─┬─< leases >── rooms
          │      │
          │      ├─< bills ─< bill_items >── meter_readings (room, period)
          │      │     └─< payments
          │      └─< deposit_transactions
          └─< tenant_documents
app_settings (singleton)   billing_runs (log)
```

| Table | Purpose |
| --- | --- |
| `profiles` | Tenant records and the landlord. `user_id` links a login (null for manual tenants); `role`, `is_active`, `invited_at`, `activated_at`, `suspended_at`. |
| `registration_requests` | One per self-registered login: claimed name, phone, requested room, email verification, status (pending / approved / rejected) and the landlord's identity check. |
| `account_audit_log` | Append-only history of account events. Landlord-readable. |
| `app_settings` | Single row: property name, currency, timezone, billing day, due days, electricity rate, water mode (metered/flat) and rate, payment instructions, landlord contact, house rules. |
| `rooms` | 28 seeded rooms (101–114, 201–214). Standard rent, floor, capacity, maintenance flag. |
| `leases` | Tenant ↔ room assignment with agreed rent. Partial unique indexes: one active lease per room and per tenant. |
| `meter_readings` | Electricity/water readings per room per month. Previous reading auto-fills from last month. |
| `bills` | One consolidated bill per lease per month. **Unique `(lease_id, period)` where not void** prevents duplicates even under concurrent runs. Draft until `finalized_at` is set. `total_amount`, `amount_paid`, `balance` and `status` are maintained by triggers. |
| `payment_allocations` | How each verified payment was split across the bill's lines (allocation policy below). Permanent. |
| `payment_checkouts` | Online checkouts at the payment provider: one in progress per bill. |
| `bill_items` | Rent, electricity, water and extra-charge lines. Rates are captured on the line, so later rate changes do not rewrite history. |
| `payments` | Tenant-submitted (pending → verified/rejected by the landlord) or landlord-recorded (verified). Only verified payments count. Multiple payments per bill = partial payments. |
| `deposit_transactions` | Separate ledger: received / deduction / refund. Never mixed with rent. Balance is per tenant (follows them on a room move) and cannot go negative. |
| `tenant_documents` | Lease contracts, IDs, stored in the `tenant-documents` bucket. |
| `billing_runs` | Log of manual and scheduled bill generation. |
| `notifications` | In-app notices per login. Written only by database triggers and scheduled jobs; recipients read their own (RLS) and mark them read via `mark_notifications_read` / `mark_all_notifications_read`. Unique `(recipient_user_id, deduplication_key)` makes duplicates impossible. Published to Supabase Realtime. |
| `notification_preferences` | Optional per-login opt-outs (payments, reminders, announcements, general updates). Account, new-bill, cancelled-bill and rejected-payment notices are always sent. |

### Notifications

* **Events:** triggers on payments, bills, leases, registrations and profiles create notices as part of the same transaction, so a notice only exists if the business change committed. Whoever caused an event is not notified about it.
* **Landlord:** registrations to review, payment proofs to verify, tenants activating their portal, daily summaries of bills due soon and newly overdue, move-ins/move-outs today, automatic billing results and failures.
* **Tenants:** account approved/rejected, bill issued or cancelled, rent reminders, payment confirmed/recorded/rejected, move-in, rent change, tenancy ending, landlord announcements.
* **Rent reminders:** `pg_cron` calls `run_notification_jobs()` hourly. From 8 AM property time it sends reminders before the due date, on it, and after it if unpaid (configured under Settings → Rent reminders), using the remaining balance and skipping paid bills. It also deletes read notices after 90 days and all notices after a year.

### Billing flow (one consolidated bill per tenancy per month)

1. **Automatic:** `pg_cron` calls `run_scheduled_billing()` hourly. It acts only on/after the configured billing day (in the property's timezone) and generation is idempotent, so missed ticks self-heal and mid-month move-ins are picked up.
2. **Draft:** each bill starts with its rent line. Electricity and water lines come from that month's meter readings (saved before or after generation); extra charges can be added. Drafts are invisible to tenants and cannot take payments.
3. **Finalize:** `finalize_bill` / `finalize_bills` require rent, electricity and water (unless water is a flat fee of zero). A room with no meter can be finalized without a utility after an explicit confirmation. Finalizing locks every charge (enforced by a trigger on `bill_items`), notifies the tenant with the itemized total, and, if it happens after the scheduled issue date, gives the tenant the full payment window from that day.
4. **Reopen:** `reopen_bill` returns a finalized bill to draft for corrections, only while it has no pending or verified payments and no online checkout in progress. The tenant is notified again ("bill updated") when it is re-sent. Once money is applied to a bill its charges never change; corrections go on next month's bill.
5. Status is derived: `unpaid` → `partial` → `paid`; `void` keeps the record and frees the month for a corrected bill. Bills with verified payments cannot be voided. `is_overdue`, reminders and outstanding balances only consider finalized bills.

### Payments and the allocation policy

* **One payment can cover the whole bill**, or several partial payments can. A payment can never exceed the remaining balance (tenants: the balance minus payments still awaiting verification).
* **Allocation policy.** When a payment is verified it is split across the bill's lines in a fixed order, and the split is stored in `payment_allocations` (permanent, never recomputed):
  1. electricity, 2. water, 3. extra charges, 4. rent — oldest line first within a kind.

  Utilities come first because they are pass-through costs the landlord remits to the utility providers; any shortfall stays on rent, which the lease lets the landlord pursue. Example: a ₱6,700 bill (rent 5,000, electricity 1,200, water 300, parking 200) paid ₱1,000 then ₱800 shows electricity 1,200/1,200, water 300/300, parking 200/200, rent 100/5,000. Because every verified payment is allocated in full and lines are locked, **rent + electricity + water + other collected always equals the total collected** (checked by deferred constraint triggers at commit and by the test suite).
* **Duplicate prevention:** one live bill per lease per month (unique index); payment forms send a request id, so a double tap or a retried request returns the first payment instead of recording a second (`unique (submitted_by, client_request_id)`); provider references and proof files cannot back two payments; one online checkout per bill at a time; provider payment ids are unique.
* **Receipts:** every verified payment gets a sequential receipt number. `/receipts/:id` shows the payment and what it paid on each charge, with the balance before and after; **Download PDF** uses the browser's save-as-PDF.
* **Deposits** stay in their own ledger and never appear in bills, allocations, collections or receipts.

### Online payments (PayMongo)

The `online-payment` Edge Function opens a hosted PayMongo checkout (GCash, Maya, card, QR Ph) for an amount the database has already validated (`start_online_payment`, run as the tenant). The payment is recorded only by `paymongo-webhook`: it checks the `Paymongo-Signature` HMAC, then re-fetches the checkout session from PayMongo's API with the secret key and records each payment PayMongo reports as paid through `_confirm_provider_payment` (service role only). Recording is idempotent on PayMongo's payment id, so retried webhooks are harmless. Money that cannot be applied as-is (the bill was paid in cash meanwhile, cancelled, or is being corrected) is kept as a **pending** payment with an explanation for the landlord, never silently applied or dropped.

Setup:

```bash
npx supabase secrets set PAYMONGO_SECRET_KEY=sk_live_... PAYMONGO_WEBHOOK_SECRET=whsk_... APP_URL=https://your-app.vercel.app
npx supabase functions deploy online-payment paymongo-webhook
```

In the PayMongo dashboard, add a webhook for `checkout_session.payment.paid` pointing at `https://<project-ref>.supabase.co/functions/v1/paymongo-webhook`, and copy its secret into `PAYMONGO_WEBHOOK_SECRET`. Then turn on **Settings → Payments → Online payments**. Without it, "Pay online" falls back to uploading proof of a transfer.

## Setup

### 1. Supabase project

```bash
npx supabase login
npx supabase projects create rentlio      # or create one in the dashboard
npx supabase link --project-ref <ref>
npx supabase db push                      # applies supabase/migrations
npx supabase functions deploy invite-tenant manage-tenant online-payment paymongo-webhook
npm run db:types                          # regenerate src/lib/database.types.ts
```

The Edge Functions use the built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` secrets; nothing else to configure. They verify the caller's JWT themselves (`verify_jwt = false` in `config.toml`).

Auth settings (sign-up disabled, password policy, site URL, redirect URLs) live in `supabase/config.toml`:

```bash
npx supabase config diff    # review
npx supabase config push
```

Then in the Supabase dashboard:

- **Authentication → Users → Add user:** create the landlord account (email + password, auto-confirm). Then in the **SQL editor** run `select public.bootstrap_landlord('you@example.com');` once. (Existing projects that already have a landlord need nothing.)
- **Tenant self-registration** needs email sign-up enabled with confirmations on (both set in `config.toml`; or Authentication → Sign In / Providers → Email). Add your production `/auth/confirm` URL to the redirect URLs. Consider enabling CAPTCHA (`[auth.captcha]`) against sign-up spam: a spam sign-up can only ever create a pending request.
- When deployed, set the **Site URL** in `config.toml` to the Vercel URL and push again.
- **Email:** the default Supabase emails work (the app accepts both link styles). The built-in sender allows only a few emails per hour, so for real use configure custom SMTP (Authentication → Emails → SMTP). With SMTP set, you can also enable the branded templates in `supabase/templates` by uncommenting them in `config.toml`; Supabase blocks custom templates on the free tier without SMTP.

### 2. Frontend

```bash
cp .env.example .env.local   # fill in project URL and publishable key
npm install
npm run dev
```

### 3. Vercel

Import the repo, framework preset **Vite**, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables. `vercel.json` handles SPA routing and security headers.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | ESLint |
| `npm run test:db` | Run every migration in an in-process Postgres (PGlite) and run 128 tests: consolidated bills (draft, finalize, lock, reopen), payment allocation by charge type, complete/partial/overdue payments, duplicate submissions, provider-confirmed online payments, receipts, RLS isolation, notifications (delivery, reminders, de-duplication, privacy), registration and approval security, manual tenants, account linking, duplicate-bill prevention, partial payments, deposits, voiding, room moves, deactivation, read models and storage rules. No Docker needed |
| `npm run db:types` | Regenerate database types from the linked project |

## Common problems

| Symptom | Fix |
| --- | --- |
| "Connect Supabase" screen | `.env.local` is missing or the dev server was not restarted after creating it. |
| Landlord login shows "Waiting for approval" | The landlord was never set up: run `select public.bootstrap_landlord('<email>');` in the SQL editor. |
| A rejected applicant wants to try again | Their email is taken by the rejected login. Delete that user under Authentication → Users (the request goes with it; the audit entries remain), then they can register again. |
| Invite/reset link says it can't be used | The email template still uses the default `{{ .ConfirmationURL }}`; paste the templates from `supabase/templates`. Links are single-use. |
| Bills not generated automatically | Check `auto_billing_enabled` and `billing_day` in settings, and that the `rentlio-monthly-billing` job exists under **Integrations → Cron**. |
| No rent reminders or notifications in real time | Check that `rentlio-notifications` exists under **Integrations → Cron**, and that `notifications` is listed under **Database → Publications → supabase_realtime**. |
