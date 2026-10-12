-- =============================================================================
-- Rentlio core schema
--
-- Design rules
--   * Money is numeric(12,2). Rates are numeric(12,4).
--   * Billing periods are stored as the first day of the month (date).
--   * Financial history is never deleted: bills are voided, leases are ended,
--     tenants are deactivated. Foreign keys use ON DELETE RESTRICT.
--   * Bill totals/status are derived by triggers from bill_items and verified
--     payments; clients can never write them directly.
--   * Deposits live in their own ledger and never touch bills.
-- =============================================================================

create type public.user_role          as enum ('landlord', 'tenant');
create type public.lease_status       as enum ('active', 'ended');
create type public.bill_status        as enum ('unpaid', 'partial', 'paid', 'void');
create type public.bill_item_kind     as enum ('rent', 'electricity', 'water', 'other');
create type public.payment_status     as enum ('pending', 'verified', 'rejected');
create type public.payment_method     as enum ('cash', 'bank_transfer', 'gcash', 'maya', 'check', 'other');
create type public.deposit_txn_type   as enum ('received', 'deduction', 'refund');
create type public.water_billing_mode as enum ('metered', 'flat');
create type public.billing_trigger    as enum ('schedule', 'manual');

-- Shared updated_at trigger ---------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Profiles --------------------------------------------------------------------
create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete restrict,
  role                     public.user_role not null default 'tenant',
  full_name                text not null default '' check (char_length(full_name) <= 120),
  email                    text not null,
  phone                    text check (phone is null or char_length(phone) <= 40),
  emergency_contact_name   text check (emergency_contact_name is null or char_length(emergency_contact_name) <= 120),
  emergency_contact_phone  text check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 40),
  is_active                boolean not null default true,
  invited_at               timestamptz,
  activated_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
-- Exactly one landlord account.
create unique index profiles_single_landlord on public.profiles (role) where role = 'landlord';
create index profiles_role_idx on public.profiles (role);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Settings (singleton row) ----------------------------------------------------
create table public.app_settings (
  id                    boolean primary key default true check (id),
  property_name         text not null default 'My Rental Property' check (char_length(property_name) between 1 and 120),
  property_address      text check (property_address is null or char_length(property_address) <= 300),
  currency_code         text not null default 'PHP' check (currency_code ~ '^[A-Z]{3}$'),
  timezone              text not null default 'Asia/Manila',
  billing_day           smallint not null default 1 check (billing_day between 1 and 28),
  due_days              smallint not null default 7 check (due_days between 0 and 60),
  electricity_rate      numeric(12,4) not null default 0 check (electricity_rate >= 0),
  water_billing_mode    public.water_billing_mode not null default 'metered',
  water_rate            numeric(12,4) not null default 0 check (water_rate >= 0),
  water_flat_fee        numeric(12,2) not null default 0 check (water_flat_fee >= 0),
  auto_billing_enabled  boolean not null default true,
  payment_instructions  text check (payment_instructions is null or char_length(payment_instructions) <= 2000),
  updated_at            timestamptz not null default now()
);

create function public.validate_settings_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger app_settings_timezone before insert or update of timezone on public.app_settings
  for each row execute function public.validate_settings_timezone();
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings default values;

-- Rooms -----------------------------------------------------------------------
create table public.rooms (
  id                    uuid primary key default gen_random_uuid(),
  room_number           text not null check (char_length(btrim(room_number)) between 1 and 20),
  floor                 smallint check (floor is null or floor between -5 and 200),
  monthly_rent          numeric(12,2) not null default 0 check (monthly_rent >= 0),
  capacity              smallint not null default 1 check (capacity between 1 and 20),
  description           text check (description is null or char_length(description) <= 1000),
  is_under_maintenance  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index rooms_room_number_key on public.rooms (lower(btrim(room_number)));

create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

-- 28 rooms across two floors. Rent starts at 0 so the landlord sets real values
-- in the app (bulk "set rent" is available) rather than inheriting a guess.
insert into public.rooms (room_number, floor)
select (f * 100 + n)::text, f
from generate_series(1, 2) as f, generate_series(1, 14) as n;

-- Leases (tenant <-> room assignments) ------------------------------------------
create table public.leases (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id) on delete restrict,
  tenant_id     uuid not null references public.profiles (id) on delete restrict,
  start_date    date not null,
  end_date      date,
  monthly_rent  numeric(12,2) not null check (monthly_rent >= 0),
  status        public.lease_status not null default 'active',
  notes         text check (notes is null or char_length(notes) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (status = 'active' or end_date is not null)
);
create unique index leases_one_active_per_room   on public.leases (room_id)   where status = 'active';
create unique index leases_one_active_per_tenant on public.leases (tenant_id) where status = 'active';
create index leases_tenant_idx on public.leases (tenant_id);
create index leases_room_idx   on public.leases (room_id);

create trigger leases_updated_at before update on public.leases
  for each row execute function public.set_updated_at();

-- Meter readings (one row per room per billing period) -------------------------
create table public.meter_readings (
  id                    uuid primary key default gen_random_uuid(),
  room_id               uuid not null references public.rooms (id) on delete restrict,
  period                date not null check (extract(day from period) = 1),
  electricity_previous  numeric(12,2) check (electricity_previous >= 0),
  electricity_current   numeric(12,2) check (electricity_current >= 0),
  water_previous        numeric(12,2) check (water_previous >= 0),
  water_current         numeric(12,2) check (water_current >= 0),
  recorded_by           uuid references public.profiles (id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (room_id, period),
  check (electricity_current is null or electricity_previous is null or electricity_current >= electricity_previous),
  check (water_current is null or water_previous is null or water_current >= water_previous)
);

create trigger meter_readings_updated_at before update on public.meter_readings
  for each row execute function public.set_updated_at();

-- Bills -------------------------------------------------------------------------
create table public.bills (
  id            uuid primary key default gen_random_uuid(),
  bill_number   bigint generated always as identity (start with 1001) unique,
  lease_id      uuid not null references public.leases (id) on delete restrict,
  tenant_id     uuid not null references public.profiles (id) on delete restrict,
  room_id       uuid not null references public.rooms (id) on delete restrict,
  period        date not null check (extract(day from period) = 1),
  issue_date    date not null,
  due_date      date not null,
  total_amount  numeric(12,2) not null default 0 check (total_amount >= 0),
  amount_paid   numeric(12,2) not null default 0 check (amount_paid >= 0),
  balance       numeric(12,2) generated always as (total_amount - amount_paid) stored,
  status        public.bill_status not null default 'unpaid',
  void_reason   text check (void_reason is null or char_length(void_reason) <= 500),
  voided_at     timestamptz,
  notes         text check (notes is null or char_length(notes) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (due_date >= issue_date),
  check (status <> 'void' or (void_reason is not null and voided_at is not null))
);
-- The duplicate-bill guard: one live bill per lease per month. A voided bill
-- frees the slot so a corrected bill can be issued.
create unique index bills_one_per_lease_period on public.bills (lease_id, period) where status <> 'void';
create index bills_tenant_idx on public.bills (tenant_id, period desc);
create index bills_period_idx on public.bills (period desc);
create index bills_room_idx   on public.bills (room_id, period desc);
create index bills_open_idx   on public.bills (due_date) where status in ('unpaid', 'partial');

create trigger bills_updated_at before update on public.bills
  for each row execute function public.set_updated_at();

create table public.bill_items (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references public.bills (id) on delete restrict,
  kind              public.bill_item_kind not null,
  description       text not null check (char_length(description) between 1 and 200),
  quantity          numeric(12,2) not null default 1 check (quantity >= 0),
  unit_price        numeric(12,4) not null default 0 check (unit_price >= 0),
  amount            numeric(12,2) not null check (amount >= 0),
  meter_reading_id  uuid references public.meter_readings (id) on delete restrict,
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index bill_items_one_per_kind on public.bill_items (bill_id, kind) where kind <> 'other';
create index bill_items_bill_idx on public.bill_items (bill_id);

create trigger bill_items_updated_at before update on public.bill_items
  for each row execute function public.set_updated_at();

-- Payments ----------------------------------------------------------------------
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references public.bills (id) on delete restrict,
  tenant_id         uuid not null references public.profiles (id) on delete restrict,
  amount            numeric(12,2) not null check (amount > 0),
  method            public.payment_method not null,
  reference_number  text check (reference_number is null or char_length(reference_number) <= 100),
  paid_on           date not null,
  proof_path        text check (proof_path is null or char_length(proof_path) <= 500),
  status            public.payment_status not null default 'pending',
  notes             text check (notes is null or char_length(notes) <= 1000),
  submitted_by      uuid not null references public.profiles (id) on delete restrict,
  reviewed_by       uuid references public.profiles (id) on delete restrict,
  reviewed_at       timestamptz,
  rejection_reason  text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (status <> 'rejected' or rejection_reason is not null),
  check (status = 'pending' or (reviewed_by is not null and reviewed_at is not null))
);
create index payments_bill_idx    on public.payments (bill_id);
create index payments_tenant_idx  on public.payments (tenant_id, created_at desc);
create index payments_pending_idx on public.payments (created_at) where status = 'pending';

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Security deposits (separate ledger) --------------------------------------------
create table public.deposit_transactions (
  id                uuid primary key default gen_random_uuid(),
  lease_id          uuid not null references public.leases (id) on delete restrict,
  tenant_id         uuid not null references public.profiles (id) on delete restrict,
  type              public.deposit_txn_type not null,
  amount            numeric(12,2) not null check (amount > 0),
  transaction_date  date not null,
  notes             text check (notes is null or char_length(notes) <= 500),
  recorded_by       uuid not null references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now()
);
create index deposit_transactions_lease_idx  on public.deposit_transactions (lease_id);
create index deposit_transactions_tenant_idx on public.deposit_transactions (tenant_id);

-- Tenant documents (lease contracts, IDs) ---------------------------------------
create table public.tenant_documents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.profiles (id) on delete restrict,
  lease_id     uuid references public.leases (id) on delete restrict,
  title        text not null check (char_length(title) between 1 and 150),
  file_path    text not null unique check (char_length(file_path) <= 500),
  uploaded_by  uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now()
);
create index tenant_documents_tenant_idx on public.tenant_documents (tenant_id);

-- Billing run log -------------------------------------------------------------
create table public.billing_runs (
  id             uuid primary key default gen_random_uuid(),
  period         date not null,
  triggered_by   public.billing_trigger not null,
  bills_created  integer not null check (bills_created >= 0),
  run_by         uuid references public.profiles (id) on delete restrict,
  ran_at         timestamptz not null default now()
);
create index billing_runs_ran_at_idx on public.billing_runs (ran_at desc);
