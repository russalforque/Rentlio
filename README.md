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

1. Day 1 (configurable): bills are generated automatically for every occupied room.
2. Open **Billing → Meter readings**, type each room's current meter values, save. Bills update themselves.
3. Tenants pay and upload proof. **Payments → To verify** shows a count in the sidebar; approve or reject each one.
4. Cash in hand? Open the bill → **Record payment**.
5. The **Dashboard** lists anything still outstanding.

## Architecture

### Security model

- **Database is the authority.** Every write involving money, leases or accounts goes through a `SECURITY DEFINER` Postgres function that re-checks the caller's role. Tables themselves are read-only to clients (except rooms/settings for the landlord and a tenant's own contact details, enforced by column-level grants + RLS).
- **Row Level Security** on every table. Tenants can only read rows where `tenant_id = auth.uid()`; all read-model views (`room_overview`, `tenant_overview`, `bill_overview`, `payment_overview`, `deposit_balances`) use `security_invoker` so the same rules apply.
- **Accounts:** public sign-up is disabled. The first user created in the Supabase dashboard becomes the landlord (exactly one is allowed). Tenants are created only by the landlord through the `invite-tenant` Edge Function, which runs with the service-role key server-side.
- **Storage:** private buckets. Proofs live at `payment-proofs/<tenant_id>/…`; tenants can upload only into their own folder and can never overwrite or delete a proof.
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
| `profiles` | One per auth user. `role` is `landlord` or `tenant`; `is_active`, `invited_at`, `activated_at`. |
| `app_settings` | Single row: property name, currency, timezone, billing day, due days, electricity rate, water mode (metered/flat) and rate, payment instructions, landlord contact, house rules. |
| `rooms` | 28 seeded rooms (101–114, 201–214). Standard rent, floor, capacity, maintenance flag. |
| `leases` | Tenant ↔ room assignment with agreed rent. Partial unique indexes: one active lease per room and per tenant. |
| `meter_readings` | Electricity/water readings per room per month. Previous reading auto-fills from last month. |
| `bills` | One per lease per month. **Unique `(lease_id, period)` where not void** prevents duplicates even under concurrent runs. `total_amount`, `amount_paid`, `balance` and `status` are maintained by triggers. |
| `bill_items` | Rent, electricity, water and extra-charge lines. Rates are captured on the line, so later rate changes do not rewrite history. |
| `payments` | Tenant-submitted (pending → verified/rejected by the landlord) or landlord-recorded (verified). Only verified payments count. Multiple payments per bill = partial payments. |
| `deposit_transactions` | Separate ledger: received / deduction / refund. Never mixed with rent. Balance is per tenant (follows them on a room move) and cannot go negative. |
| `tenant_documents` | Lease contracts, IDs, stored in the `tenant-documents` bucket. |
| `billing_runs` | Log of manual and scheduled bill generation. |

### Billing flow

1. **Automatic:** `pg_cron` calls `run_scheduled_billing()` hourly. It acts only on/after the configured billing day (in the property's timezone) and generation is idempotent, so missed ticks self-heal and mid-month move-ins are picked up.
2. Each bill gets a rent line, plus utility lines if that month's meter readings exist. Readings recorded **after** the bill was generated update the bill automatically.
3. Status is derived: `unpaid` → `partial` → `paid`; `void` keeps the record and frees the month for a corrected bill. Bills with verified payments cannot be voided.

## Setup

### 1. Supabase project

```bash
npx supabase login
npx supabase projects create rentlio      # or create one in the dashboard
npx supabase link --project-ref <ref>
npx supabase db push                      # applies supabase/migrations
npx supabase functions deploy invite-tenant manage-tenant
npm run db:types                          # regenerate src/lib/database.types.ts
```

The Edge Functions use the built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` secrets; nothing else to configure. They verify the caller's JWT themselves (`verify_jwt = false` in `config.toml`).

Auth settings (sign-up disabled, password policy, site URL, redirect URLs) live in `supabase/config.toml`:

```bash
npx supabase config diff    # review
npx supabase config push
```

Then in the Supabase dashboard:

- **Authentication → Users → Add user:** create the landlord account (email + password, auto-confirm). The **first** user becomes the landlord; create it before anyone else.
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
| `npm run test:db` | Run every migration in an in-process Postgres (PGlite) and run 44 tests: RLS isolation, duplicate-bill prevention, partial payments, deposits, voiding, room moves, deactivation, read models and storage rules. No Docker needed |
| `npm run db:types` | Regenerate database types from the linked project |

## Common problems

| Symptom | Fix |
| --- | --- |
| "Connect Supabase" screen | `.env.local` is missing or the dev server was not restarted after creating it. |
| Login works but shows "Account not active" | The user has no landlord role: only the first dashboard-created user becomes landlord, later ones are inert. Tenants must be invited from the app. |
| Invite/reset link says it can't be used | The email template still uses the default `{{ .ConfirmationURL }}`; paste the templates from `supabase/templates`. Links are single-use. |
| Bills not generated automatically | Check `auto_billing_enabled` and `billing_day` in settings, and that the `rentlio-monthly-billing` job exists under **Integrations → Cron**. |
