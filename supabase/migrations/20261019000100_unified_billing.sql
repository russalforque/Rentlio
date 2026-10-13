-- =============================================================================
-- Unified monthly billing and payment collection.
--
-- One consolidated bill per tenancy per month (rent + electricity + water +
-- any extra charges), paid with one or more payments.
--
-- Bill lifecycle
--   * draft      Generated automatically with the rent line. The landlord adds
--                meter readings (electricity, water) and extra charges. Drafts
--                are invisible to tenants and cannot take payments.
--   * finalized  finalize_bill() checks the required charges are present,
--                locks the charges and notifies the tenant. Payments are only
--                accepted from here on. reopen_bill() returns a bill to draft,
--                but only while it has no payments, so a charge that money was
--                allocated to can never change.
--   * void       Unchanged: kept for history, frees the month for a new bill.
--
-- Payment allocation policy (partial payments)
--   Every verified payment is split across the bill's lines when it is
--   verified, and the split is stored in payment_allocations, never
--   recomputed. Lines are paid in this fixed order:
--       1. electricity   2. water   3. extra charges   4. rent
--   oldest line first within a kind. Utilities come first because they are
--   pass-through costs the landlord must remit to the utility providers; any
--   shortfall is left on rent, which the lease lets the landlord pursue. A
--   payment never exceeds the bill's balance, so it is always fully allocated.
--   Collections reports sum payment_allocations by kind, so rent, electricity
--   and water collected always add up to exactly what was paid.
--
-- Online payments
--   A tenant starts a checkout (start_online_payment) through the
--   online-payment edge function, which opens a hosted checkout at the payment
--   provider (PayMongo). The provider's signed webhook, re-confirmed against
--   the provider's API, records the payment as verified through
--   _confirm_provider_payment (service role only). The provider's payment id
--   is unique, so webhook retries can never record a payment twice. Payments
--   that arrive for a cancelled bill or for more than the balance are kept as
--   pending for the landlord to review instead of being applied.
--
-- Duplicate submissions
--   submit_payment / record_payment take a client request id: resubmitting the
--   same request returns the original payment instead of creating another.
--   Tenants cannot submit more than the balance minus payments still waiting
--   for verification, and only one online checkout can be open per bill.
--
-- Receipts
--   Every verified payment gets a sequential receipt number. payment_receipt()
--   returns the payment with the bill's charges, what this payment paid on each
--   line, and the balance before and after.
-- =============================================================================

alter type public.payment_method add value if not exists 'card' before 'other';
create type public.checkout_status as enum ('creating', 'open', 'paid', 'expired', 'failed', 'cancelled');

alter table public.app_settings
  add column online_payments_enabled boolean not null default false;

-- Bills: draft / finalized -------------------------------------------------------------
alter table public.bills
  add column finalized_at timestamptz,
  add column finalized_by uuid references public.profiles (id) on delete restrict,
  -- How many times the bill has been finalized; > 1 means it was corrected after issue.
  add column revision smallint not null default 0 check (revision >= 0);

-- Every existing bill was already issued to its tenant.
update public.bills set finalized_at = created_at, revision = 1;

alter table public.bills
  add constraint bills_draft_unpaid check (finalized_at is not null or amount_paid = 0),
  add constraint bills_finalized_revision check (finalized_at is null or revision > 0);
-- Enforced for every new write; NOT VALID so a legacy over-payment cannot block the upgrade.
alter table public.bills
  add constraint bills_paid_within_total check (status = 'void' or amount_paid <= total_amount) not valid;

create index bills_draft_idx on public.bills (period) where finalized_at is null and status <> 'void';

-- Required charges ------------------------------------------------------------------------
-- What a bill still lacks before it can be finalized: rent always, electricity
-- always (every room is metered), water unless water is a flat fee of zero.
-- Security invoker: callers only learn about bills they can already read.
create function public.bill_missing_charges(p_bill_id uuid)
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select array_remove(array[
    case when not exists (select 1 from public.bill_items where bill_id = p_bill_id and kind = 'rent')
      then 'rent' end,
    case when not exists (select 1 from public.bill_items where bill_id = p_bill_id and kind = 'electricity')
      then 'electricity' end,
    case when (s.water_billing_mode = 'metered' or s.water_flat_fee > 0)
          and not exists (select 1 from public.bill_items where bill_id = p_bill_id and kind = 'water')
      then 'water' end
  ], null)
  from public.app_settings s
  where s.id;
$$;

-- Charges on a finalized bill are locked ---------------------------------------------
-- The single backstop behind every function that edits charges. A no-op update
-- (re-saving identical values) is allowed.
create function public._bill_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_room text;
begin
  select * into v_bill from public.bills where id = case when tg_op = 'DELETE' then old.bill_id else new.bill_id end;
  if v_bill.finalized_at is not null and not (
    tg_op = 'UPDATE'
    and (new.bill_id, new.kind, new.description, new.quantity, new.unit_price, new.amount, new.meter_reading_id)
        is not distinct from
        (old.bill_id, old.kind, old.description, old.quantity, old.unit_price, old.amount, old.meter_reading_id)
  ) then
    select room_number into v_room from public.rooms where id = v_bill.room_id;
    raise exception 'Room %''s % bill is finalized. Reopen it before changing its charges.',
      v_room, to_char(v_bill.period, 'FMMonth YYYY') using errcode = '22023';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger bill_items_guard
  before insert or update or delete on public.bill_items
  for each row execute function public._bill_items_guard();

-- Utilities are no longer synced onto finalized bills (their lines are locked);
-- record_meter_readings refuses a reading change for a finalized bill instead.
create or replace function public._sync_bill_utilities(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill     public.bills;
  v_settings public.app_settings;
  v_reading  public.meter_readings;
  v_qty      numeric(12,2);
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found or v_bill.status = 'void' or v_bill.finalized_at is not null then
    return;
  end if;

  select * into v_settings from public.app_settings where id;
  select * into v_reading from public.meter_readings
    where room_id = v_bill.room_id and period = v_bill.period;

  -- Electricity (always metered)
  if v_reading.id is not null
     and v_reading.electricity_previous is not null
     and v_reading.electricity_current is not null then
    v_qty := v_reading.electricity_current - v_reading.electricity_previous;
    insert into public.bill_items as bi
      (bill_id, kind, description, quantity, unit_price, amount, meter_reading_id, sort_order)
    values (
      p_bill_id, 'electricity',
      format('Electricity: %s to %s kWh', v_reading.electricity_previous, v_reading.electricity_current),
      v_qty, v_settings.electricity_rate, round(v_qty * v_settings.electricity_rate, 2), v_reading.id, 1
    )
    on conflict (bill_id, kind) where kind <> 'other' do update
      set description      = excluded.description,
          quantity         = excluded.quantity,
          amount           = round(excluded.quantity * bi.unit_price, 2),
          meter_reading_id = excluded.meter_reading_id;
  end if;

  -- Water
  if v_settings.water_billing_mode = 'flat' then
    if v_settings.water_flat_fee > 0
       and not exists (select 1 from public.bill_items where bill_id = p_bill_id and kind = 'water') then
      insert into public.bill_items (bill_id, kind, description, quantity, unit_price, amount, sort_order)
      values (p_bill_id, 'water', 'Water (flat rate)', 1, v_settings.water_flat_fee, v_settings.water_flat_fee, 2)
      on conflict (bill_id, kind) where kind <> 'other' do nothing;
    end if;
  elsif v_reading.id is not null
        and v_reading.water_previous is not null
        and v_reading.water_current is not null then
    v_qty := v_reading.water_current - v_reading.water_previous;
    insert into public.bill_items as bi
      (bill_id, kind, description, quantity, unit_price, amount, meter_reading_id, sort_order)
    values (
      p_bill_id, 'water',
      format('Water: %s to %s m³', v_reading.water_previous, v_reading.water_current),
      v_qty, v_settings.water_rate, round(v_qty * v_settings.water_rate, 2), v_reading.id, 2
    )
    on conflict (bill_id, kind) where kind <> 'other' do update
      set description      = excluded.description,
          quantity         = excluded.quantity,
          amount           = round(excluded.quantity * bi.unit_price, 2),
          meter_reading_id = excluded.meter_reading_id;
  end if;
end;
$$;

-- Same as before, plus: a reading that feeds a finalized bill cannot change.
create or replace function public.record_meter_readings(p_period date, p_readings jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period   date := date_trunc('month', p_period)::date;
  v_row      jsonb;
  v_room_id  uuid;
  v_prev     public.meter_readings;
  v_existing public.meter_readings;
  v_e_prev   numeric(12,2);
  v_e_curr   numeric(12,2);
  v_w_prev   numeric(12,2);
  v_w_curr   numeric(12,2);
  v_bill_id  uuid;
  v_count    integer := 0;
begin
  perform public._assert_landlord();
  if p_period is null or jsonb_typeof(p_readings) <> 'array' then
    raise exception 'A period and a list of readings are required' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_readings)
  loop
    v_room_id := (v_row ->> 'room_id')::uuid;
    if not exists (select 1 from public.rooms where id = v_room_id) then
      raise exception 'Unknown room %', v_room_id using errcode = 'P0002';
    end if;

    select * into v_prev from public.meter_readings
      where room_id = v_room_id and period < v_period
      order by period desc limit 1;
    select * into v_existing from public.meter_readings
      where room_id = v_room_id and period = v_period;

    v_e_curr := (v_row ->> 'electricity_current')::numeric;
    v_w_curr := (v_row ->> 'water_current')::numeric;
    v_e_prev := coalesce((v_row ->> 'electricity_previous')::numeric, v_prev.electricity_current);
    v_w_prev := coalesce((v_row ->> 'water_previous')::numeric, v_prev.water_current);

    if v_e_curr is not null and v_e_prev is not null and v_e_curr < v_e_prev then
      raise exception 'Room %: electricity reading % is lower than previous %',
        (select room_number from public.rooms where id = v_room_id), v_e_curr, v_e_prev
        using errcode = '22023';
    end if;
    if v_w_curr is not null and v_w_prev is not null and v_w_curr < v_w_prev then
      raise exception 'Room %: water reading % is lower than previous %',
        (select room_number from public.rooms where id = v_room_id), v_w_curr, v_w_prev
        using errcode = '22023';
    end if;

    if exists (select 1 from public.bills
               where room_id = v_room_id and period = v_period and status <> 'void' and finalized_at is not null) then
      -- Re-saving the grid with this room unchanged is fine; changing it is not.
      if (v_e_prev, v_e_curr, v_w_prev, v_w_curr) is distinct from
         (v_existing.electricity_previous, v_existing.electricity_current, v_existing.water_previous, v_existing.water_current) then
        raise exception 'Room %: the % bill is already finalized. Reopen it to change this reading.',
          (select room_number from public.rooms where id = v_room_id), to_char(v_period, 'FMMonth YYYY')
          using errcode = '22023';
      end if;
      v_count := v_count + 1;
      continue;
    end if;

    insert into public.meter_readings
      (room_id, period, electricity_previous, electricity_current, water_previous, water_current, recorded_by)
    values (v_room_id, v_period, v_e_prev, v_e_curr, v_w_prev, v_w_curr, auth.uid())
    on conflict (room_id, period) do update
      set electricity_previous = excluded.electricity_previous,
          electricity_current  = excluded.electricity_current,
          water_previous       = excluded.water_previous,
          water_current        = excluded.water_current,
          recorded_by          = excluded.recorded_by;

    for v_bill_id in
      select id from public.bills where room_id = v_room_id and period = v_period and status <> 'void'
    loop
      perform public._sync_bill_utilities(v_bill_id);
    end loop;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Finalize / reopen -----------------------------------------------------------------------
-- Returns the charges still missing (and finalizes nothing) unless the bill is
-- complete or p_skip_missing is set. A bill finalized after its scheduled
-- issue date gets the full payment window from the day it is finalized.
create function public._finalize_bill(p_bill_id uuid, p_skip_missing boolean)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill     public.bills;
  v_settings public.app_settings;
  v_missing  text[];
  v_today    date := public.property_today();
  v_issue    date;
begin
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.status = 'void' then
    raise exception 'Bill not found or voided' using errcode = 'P0002';
  end if;
  if v_bill.finalized_at is not null then
    raise exception 'Bill #% is already finalized', v_bill.bill_number using errcode = '22023';
  end if;

  -- Pick up a flat water fee or a reading saved since the last sync.
  perform public._sync_bill_utilities(p_bill_id);
  v_missing := public.bill_missing_charges(p_bill_id);
  if cardinality(v_missing) > 0 and not coalesce(p_skip_missing, false) then
    return v_missing;
  end if;

  select * into v_bill from public.bills where id = p_bill_id;
  if v_bill.total_amount <= 0 then
    raise exception 'Bill #% has nothing to pay. Void it instead.', v_bill.bill_number using errcode = '22023';
  end if;

  select * into v_settings from public.app_settings where id;
  v_issue := greatest(v_bill.issue_date, v_today);
  update public.bills
  set finalized_at = now(),
      finalized_by = public.current_profile_id(),
      revision     = revision + 1,
      issue_date   = v_issue,
      due_date     = greatest(due_date, v_issue + v_settings.due_days)
  where id = p_bill_id;
  return '{}'::text[];
end;
$$;

create function public.finalize_bill(p_bill_id uuid, p_skip_missing boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[];
begin
  perform public._assert_landlord();
  v_missing := public._finalize_bill(p_bill_id, p_skip_missing);
  if cardinality(v_missing) > 0 then
    raise exception 'This bill has no % charge yet. Add the meter reading, or finalize without it.',
      array_to_string(v_missing, ' or ') using errcode = '22023';
  end if;
end;
$$;

-- Finalizes every complete draft for the month; incomplete drafts are left as they are.
create function public.finalize_bills(p_period date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  perform public._assert_landlord();
  if p_period is null then
    raise exception 'Billing period is required' using errcode = '22023';
  end if;
  for v_id in
    select id from public.bills
    where period = date_trunc('month', p_period)::date and status <> 'void' and finalized_at is null
      and total_amount > 0
    order by bill_number
  loop
    if cardinality(public._finalize_bill(v_id, false)) = 0 then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Back to draft to correct a charge. Only before any money is involved: a bill
-- with payments (pending or verified) or an online checkout in progress stays locked.
create function public.reopen_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  perform public._assert_landlord();
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.status = 'void' then
    raise exception 'Bill not found or voided' using errcode = 'P0002';
  end if;
  if v_bill.finalized_at is null then
    raise exception 'This bill is still a draft' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where bill_id = p_bill_id and status in ('pending', 'verified')) then
    raise exception 'This bill has payments, so its charges can no longer change. Add a correction to next month''s bill instead.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_checkouts
             where bill_id = p_bill_id and status in ('creating', 'open') and expires_at > now()) then
    raise exception 'The tenant is paying this bill online right now. Try again in an hour.' using errcode = '22023';
  end if;
  update public.bills set finalized_at = null, finalized_by = null where id = p_bill_id;
end;
$$;

-- Online checkouts ----------------------------------------------------------------------
create table public.payment_checkouts (
  id                   uuid primary key default gen_random_uuid(),
  bill_id              uuid not null references public.bills (id) on delete restrict,
  tenant_id            uuid not null references public.profiles (id) on delete restrict,
  amount               numeric(12,2) not null check (amount > 0),
  currency_code        text not null check (currency_code ~ '^[A-Z]{3}$'),
  provider             text not null default 'paymongo' check (provider in ('paymongo')),
  provider_session_id  text check (provider_session_id is null or char_length(provider_session_id) between 1 and 100),
  checkout_url         text check (checkout_url is null or (checkout_url ~ '^https://' and char_length(checkout_url) <= 2000)),
  status               public.checkout_status not null default 'creating',
  failure_reason       text check (failure_reason is null or char_length(failure_reason) <= 300),
  payment_id           uuid references public.payments (id) on delete restrict,
  created_by           uuid not null references public.profiles (id) on delete restrict,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null default now() + interval '1 hour',
  completed_at         timestamptz,
  updated_at           timestamptz not null default now(),
  constraint payment_checkouts_session_key unique (provider, provider_session_id),
  check (status <> 'open' or (provider_session_id is not null and checkout_url is not null)),
  check (status <> 'paid' or payment_id is not null)
);
-- One checkout in progress per bill: a double tap cannot open two.
create unique index payment_checkouts_one_open on public.payment_checkouts (bill_id) where status in ('creating', 'open');
create index payment_checkouts_tenant_idx on public.payment_checkouts (tenant_id, created_at desc);

create trigger payment_checkouts_updated_at before update on public.payment_checkouts
  for each row execute function public.set_updated_at();

-- Payments: provider, idempotency, receipts -------------------------------------------------
alter table public.payments
  add column provider            text check (provider is null or provider in ('paymongo')),
  add column provider_payment_id text check (provider_payment_id is null or char_length(provider_payment_id) between 1 and 100),
  add column client_request_id   uuid,
  add column receipt_number      bigint;

alter table public.payments
  add constraint payments_provider_complete check ((provider is null) = (provider_payment_id is null));
create unique index payments_provider_payment_key on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;
create unique index payments_client_request_key on public.payments (submitted_by, client_request_id)
  where client_request_id is not null;

-- A provider-verified payment has no human reviewer.
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_catalog.pg_constraint
  where conrelid = 'public.payments'::regclass and contype = 'c'
    and pg_catalog.pg_get_constraintdef(oid) like '%reviewed_by IS NOT NULL%';
  if v_name is not null then
    execute format('alter table public.payments drop constraint %I', v_name);
  end if;
end;
$$;
alter table public.payments
  add constraint payments_reviewed check (
    status = 'pending' or (reviewed_at is not null and (reviewed_by is not null or provider is not null))
  );

-- Receipt numbers follow verification order.
create sequence public.payment_receipt_seq as bigint start with 1001;
update public.payments p
set receipt_number = 1000 + o.rn
from (
  select id, row_number() over (order by coalesce(reviewed_at, created_at), created_at, id) as rn
  from public.payments where status = 'verified'
) o
where p.id = o.id;
select setval('public.payment_receipt_seq',
              coalesce((select max(receipt_number) + 1 from public.payments), 1001), false);

alter table public.payments
  add constraint payments_receipt_number_key unique (receipt_number),
  add constraint payments_verified_receipt check (status <> 'verified' or receipt_number is not null);

-- Reviewed payments are final; verified payments need a finalized bill and get
-- their receipt number here.
create function public._payments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'pending'
     and (new.status, new.amount, new.bill_id, new.tenant_id, new.method, new.provider, new.provider_payment_id)
         is distinct from
         (old.status, old.amount, old.bill_id, old.tenant_id, old.method, old.provider, old.provider_payment_id) then
    raise exception 'This payment was already % and cannot be changed', old.status using errcode = '22023';
  end if;
  if new.status = 'verified' then
    if not exists (select 1 from public.bills where id = new.bill_id and finalized_at is not null and status <> 'void') then
      raise exception 'Payments can only be applied to a finalized bill' using errcode = '22023';
    end if;
    if new.receipt_number is null then
      new.receipt_number := nextval('public.payment_receipt_seq');
    end if;
  end if;
  return new;
end;
$$;

create trigger payments_guard
  before insert or update on public.payments
  for each row execute function public._payments_guard();

-- Allocation ------------------------------------------------------------------------------
create table public.payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments (id) on delete restrict,
  bill_id       uuid not null references public.bills (id) on delete restrict,
  bill_item_id  uuid not null references public.bill_items (id) on delete restrict,
  kind          public.bill_item_kind not null,
  amount        numeric(12,2) not null check (amount > 0),
  created_at    timestamptz not null default now(),
  constraint payment_allocations_once unique (payment_id, bill_item_id)
);
create index payment_allocations_bill_idx on public.payment_allocations (bill_id);
create index payment_allocations_item_idx on public.payment_allocations (bill_item_id);

/** The allocation order documented at the top of this file. */
create function public._allocation_priority(p_kind public.bill_item_kind)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_kind when 'electricity' then 1 when 'water' then 2 when 'other' then 3 else 4 end::smallint;
$$;

create function public._allocate_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_left    numeric(12,2);
  v_item    record;
  v_take    numeric(12,2);
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.status is distinct from 'verified'
     or exists (select 1 from public.payment_allocations where payment_id = p_payment_id) then
    return;
  end if;
  -- Allocations for one bill are made one payment at a time.
  perform 1 from public.bills where id = v_payment.bill_id for update;

  v_left := v_payment.amount;
  for v_item in
    select bi.id, bi.kind,
           bi.amount - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.bill_item_id = bi.id), 0)
             as remaining
    from public.bill_items bi
    where bi.bill_id = v_payment.bill_id
    order by public._allocation_priority(bi.kind), bi.sort_order, bi.created_at, bi.id
  loop
    exit when v_left <= 0;
    continue when v_item.remaining <= 0;
    v_take := least(v_left, v_item.remaining);
    insert into public.payment_allocations (payment_id, bill_id, bill_item_id, kind, amount)
    values (p_payment_id, v_payment.bill_id, v_item.id, v_item.kind, v_take);
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'This payment is % more than what is still owed on the bill', public._fmt_money(v_left)
      using errcode = '22023';
  end if;
end;
$$;

create function public._payments_allocate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    perform public._allocate_payment(new.id);
  end if;
  return null;
end;
$$;

-- Fires before payments_notify and payments_refresh_bill (triggers run in name order).
create trigger payments_allocate
  after insert or update of status on public.payments
  for each row execute function public._payments_allocate();

-- Backfill: existing verified payments, in the order they were verified.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.payments where status = 'verified' order by receipt_number
  loop
    begin
      perform public._allocate_payment(v_id);
    exception when others then
      raise warning 'Payment % could not be fully allocated: %', v_id, sqlerrm;
    end;
  end loop;
end;
$$;

-- Integrity checks at commit: a verified payment is allocated in full, each
-- line is never allocated beyond its amount, and allocations are permanent.
create function public._check_payment_allocated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_sum     numeric(12,2);
begin
  select * into v_payment from public.payments where id = new.id;
  if v_payment.status = 'verified' then
    select coalesce(sum(amount), 0) into v_sum from public.payment_allocations where payment_id = new.id;
    if v_sum <> v_payment.amount then
      raise exception 'Payment % is allocated % of %', new.id, v_sum, v_payment.amount using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger payments_allocated
  after insert or update of status, amount on public.payments
  deferrable initially deferred
  for each row execute function public._check_payment_allocated();

create function public._check_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
       select 1 from public.payments
       where id = new.payment_id and bill_id = new.bill_id and status = 'verified')
     or not exists (
       select 1 from public.bill_items
       where id = new.bill_item_id and bill_id = new.bill_id and kind = new.kind)
     or (select sum(amount) from public.payment_allocations where bill_item_id = new.bill_item_id)
        > (select amount from public.bill_items where id = new.bill_item_id) then
    raise exception 'Payment allocation % does not match its payment and charge', new.id using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger payment_allocations_consistent
  after insert on public.payment_allocations
  deferrable initially deferred
  for each row execute function public._check_allocation();

create function public._allocations_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Payment allocations are permanent' using errcode = '42501';
end;
$$;

create trigger payment_allocations_immutable
  before update or delete on public.payment_allocations
  for each row execute function public._allocations_immutable();

-- Tenant payment submission ----------------------------------------------------------------
drop function public.submit_payment(uuid, numeric, public.payment_method, date, text, text, text);
create function public.submit_payment(
  p_bill_id          uuid,
  p_amount           numeric,
  p_method           public.payment_method,
  p_paid_on          date,
  p_proof_path       text,
  p_reference_number text default null,
  p_notes            text default null,
  p_request_id       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public._assert_active_user();
  v_bill    public.bills;
  v_pending numeric(12,2);
  v_id      uuid;
begin
  select * into v_bill from public.bills
  where id = p_bill_id and tenant_id = v_uid and finalized_at is not null
  for update;
  if not found then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  -- Checked after the lock, so a resubmitted request always finds the first one.
  if p_request_id is not null then
    select id into v_id from public.payments where submitted_by = v_uid and client_request_id = p_request_id;
    if found then
      return v_id;
    end if;
  end if;
  if v_bill.status in ('void', 'paid') then
    raise exception 'This bill is already %', v_bill.status using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_pending from public.payments where bill_id = p_bill_id and status = 'pending';
  if round(p_amount, 2) > v_bill.balance then
    raise exception 'Amount exceeds the outstanding balance of %', v_bill.balance using errcode = '22023';
  end if;
  if round(p_amount, 2) > v_bill.balance - v_pending then
    raise exception 'Amount exceeds the balance still owed (%) once the % awaiting verification is counted',
      v_bill.balance - v_pending, v_pending using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 then
    raise exception 'Payment date is invalid' using errcode = '22023';
  end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> v_uid::text then
    raise exception 'Proof of payment is required' using errcode = '22023';
  end if;
  perform public._assert_proof_usable(p_proof_path);
  perform public._assert_reference_unused(p_method, p_reference_number);

  insert into public.payments
    (bill_id, tenant_id, amount, method, reference_number, paid_on, proof_path, notes, submitted_by, client_request_id)
  values
    (p_bill_id, v_uid, round(p_amount, 2), p_method, nullif(btrim(p_reference_number), ''),
     p_paid_on, p_proof_path, nullif(btrim(p_notes), ''), v_uid, p_request_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Landlord-recorded payment (cash in hand) -------------------------------------------------
drop function public.record_payment(uuid, numeric, public.payment_method, date, text, text, text);
create function public.record_payment(
  p_bill_id          uuid,
  p_amount           numeric,
  p_method           public.payment_method,
  p_paid_on          date,
  p_reference_number text default null,
  p_notes            text default null,
  p_proof_path       text default null,
  p_request_id       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_landlord uuid;
  v_bill     public.bills;
  v_id       uuid;
begin
  perform public._assert_landlord();
  v_landlord := public.current_profile_id();
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.status = 'void' then
    raise exception 'Bill not found or voided' using errcode = 'P0002';
  end if;
  if p_request_id is not null then
    select id into v_id from public.payments where submitted_by = v_landlord and client_request_id = p_request_id;
    if found then
      return v_id;
    end if;
  end if;
  if v_bill.finalized_at is null then
    raise exception 'Finalize this bill before recording payments on it' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if round(p_amount, 2) > v_bill.balance then
    raise exception 'Amount exceeds the outstanding balance of %', v_bill.balance using errcode = '22023';
  end if;
  if p_paid_on is null then
    raise exception 'Payment date is required' using errcode = '22023';
  end if;
  if p_proof_path is not null then
    perform public._assert_proof_usable(p_proof_path);
  end if;
  perform public._assert_reference_unused(p_method, p_reference_number);

  insert into public.payments
    (bill_id, tenant_id, amount, method, reference_number, paid_on, proof_path, notes,
     status, submitted_by, reviewed_by, reviewed_at, client_request_id)
  values
    (p_bill_id, v_bill.tenant_id, round(p_amount, 2), p_method, nullif(btrim(p_reference_number), ''),
     p_paid_on, p_proof_path, nullif(btrim(p_notes), ''), 'verified', v_landlord, v_landlord, now(), p_request_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Voiding also closes any online checkout in progress.
create or replace function public.void_bill(p_bill_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_landlord();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to void a bill' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where bill_id = p_bill_id and status = 'verified') then
    raise exception 'This bill has verified payments and cannot be voided' using errcode = '22023';
  end if;

  update public.payments
  set status = 'rejected', rejection_reason = 'Bill was voided', reviewed_by = auth.uid(), reviewed_at = now()
  where bill_id = p_bill_id and status = 'pending';
  update public.payment_checkouts
  set status = 'cancelled', completed_at = now()
  where bill_id = p_bill_id and status in ('creating', 'open');

  update public.bills
  set status = 'void', void_reason = btrim(p_reason), voided_at = now()
  where id = p_bill_id and status <> 'void';
  if not found then
    raise exception 'Bill not found or already voided' using errcode = 'P0002';
  end if;
end;
$$;

-- Online payment functions ------------------------------------------------------------------
-- Tenant (through the online-payment edge function, with the tenant's JWT).
-- Returns the checkout to send the tenant to: the one already in progress for
-- the same amount, or a new one in 'creating' state for the edge function to open.
create function public.start_online_payment(p_bill_id uuid, p_amount numeric)
returns public.payment_checkouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_settings public.app_settings;
  v_bill     public.bills;
  v_amount   numeric(12,2) := round(p_amount, 2);
  v_pending  numeric(12,2);
  v_checkout public.payment_checkouts;
begin
  if v_tenant is null then
    raise exception 'Your account is not active' using errcode = '42501';
  end if;
  select * into v_settings from public.app_settings where id;
  if not v_settings.online_payments_enabled then
    raise exception 'Online payments are not available. Pay in person, or upload proof of a transfer.' using errcode = '22023';
  end if;
  select * into v_bill from public.bills
  where id = p_bill_id and tenant_id = v_tenant and finalized_at is not null
  for update;
  if not found then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if v_bill.status in ('void', 'paid') then
    raise exception 'This bill is already %', v_bill.status using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;

  -- Abandoned checkouts free the bill after they expire.
  update public.payment_checkouts
  set status = case when status = 'open' then 'expired' else 'failed' end::public.checkout_status,
      completed_at = now(),
      failure_reason = case when status = 'creating' then 'Checkout was never opened' end
  where bill_id = p_bill_id
    and ((status = 'open' and expires_at <= now())
         or (status = 'creating' and created_at < now() - interval '2 minutes'));

  select * into v_checkout from public.payment_checkouts where bill_id = p_bill_id and status in ('creating', 'open');
  if found then
    if v_checkout.amount = v_amount then
      return v_checkout;
    end if;
    raise exception 'You already started an online payment of % for this bill. Finish it or cancel it first.',
      public._fmt_money(v_checkout.amount) using errcode = '23505';
  end if;

  select coalesce(sum(amount), 0) into v_pending from public.payments where bill_id = p_bill_id and status = 'pending';
  if v_amount > v_bill.balance - v_pending then
    raise exception 'Amount exceeds the balance still owed (%)', public._fmt_money(v_bill.balance - v_pending)
      using errcode = '22023';
  end if;

  insert into public.payment_checkouts (bill_id, tenant_id, amount, currency_code, created_by)
  values (p_bill_id, v_tenant, v_amount, v_settings.currency_code, v_tenant)
  returning * into v_checkout;
  return v_checkout;
end;
$$;

-- Tenant gives up on a checkout (e.g. pressed "back" at the provider). If the
-- provider still completes it, the webhook records the payment regardless.
create function public.cancel_online_payment(p_checkout_id uuid)
returns public.payment_checkouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.payment_checkouts;
begin
  update public.payment_checkouts
  set status = 'cancelled', completed_at = now()
  where id = p_checkout_id and tenant_id = public.current_tenant_id() and status in ('creating', 'open')
  returning * into v_checkout;
  if not found then
    select * into v_checkout from public.payment_checkouts
    where id = p_checkout_id and tenant_id = public.current_tenant_id();
    if not found then
      raise exception 'Checkout not found' using errcode = 'P0002';
    end if;
  end if;
  return v_checkout;
end;
$$;

-- Service role: the edge function opened the provider's hosted checkout.
create function public._attach_checkout_session(
  p_checkout_id uuid,
  p_session_id  text,
  p_url         text,
  p_expires_at  timestamptz default null
)
returns public.payment_checkouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.payment_checkouts;
begin
  update public.payment_checkouts
  set status = 'open', provider_session_id = p_session_id, checkout_url = p_url,
      expires_at = coalesce(p_expires_at, expires_at)
  where id = p_checkout_id and status = 'creating'
  returning * into v_checkout;
  if not found then
    -- Another request opened it first: everyone gets the same checkout.
    select * into v_checkout from public.payment_checkouts where id = p_checkout_id;
  end if;
  return v_checkout;
end;
$$;

create function public._fail_checkout(p_checkout_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_checkouts
  set status = 'failed', failure_reason = left(coalesce(p_reason, 'Unknown error'), 300), completed_at = now()
  where id = p_checkout_id and status = 'creating';
$$;

-- Service role: the provider confirmed a payment (signed webhook, re-checked
-- against the provider's API). Idempotent on the provider's payment id.
create function public._confirm_provider_payment(
  p_provider            text,
  p_session_id          text,
  p_provider_payment_id text,
  p_amount              numeric,
  p_method              public.payment_method,
  p_paid_on             date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.payment_checkouts;
  v_bill     public.bills;
  v_amount   numeric(12,2) := round(p_amount, 2);
  v_review   text;
  v_id       uuid;
begin
  select * into v_checkout from public.payment_checkouts
  where provider = p_provider and provider_session_id = p_session_id
  for update;
  if not found then
    raise exception 'Unknown % checkout session %', p_provider, p_session_id using errcode = 'P0002';
  end if;
  -- After the lock, so concurrent deliveries of one webhook record it once.
  select id into v_id from public.payments where provider = p_provider and provider_payment_id = p_provider_payment_id;
  if found then
    return v_id;
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Invalid amount %', p_amount using errcode = '22023';
  end if;

  select * into v_bill from public.bills where id = v_checkout.bill_id for update;
  -- Money has moved, so it is always recorded; anything that cannot be applied
  -- as-is waits for the landlord.
  v_review := case
    when v_bill.status = 'void'
      then 'Paid online after the bill was cancelled. Refund the tenant, then reject this payment.'
    when v_bill.finalized_at is null
      then 'Paid online while the bill was being corrected. Verify it once the bill is finalized again.'
    when v_amount > v_bill.balance
      then format('Paid online, but more than the remaining balance of %s. Verify the amount to apply and refund the rest.',
                  public._fmt_money(v_bill.balance))
  end;

  insert into public.payments
    (bill_id, tenant_id, amount, method, reference_number, paid_on, status, notes, submitted_by,
     reviewed_at, provider, provider_payment_id)
  values
    (v_checkout.bill_id, v_checkout.tenant_id, v_amount, p_method, p_provider_payment_id, coalesce(p_paid_on, current_date),
     case when v_review is null then 'verified' else 'pending' end::public.payment_status, v_review,
     v_checkout.created_by, case when v_review is null then now() end, p_provider, p_provider_payment_id)
  returning id into v_id;

  update public.payment_checkouts
  set status = 'paid', payment_id = v_id, completed_at = now()
  where id = v_checkout.id;
  return v_id;
end;
$$;

-- Receipts -------------------------------------------------------------------------------------
-- Security invoker: RLS decides whose receipts a caller can open.
create function public.payment_receipt(p_payment_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pm as (
    select * from public.payments where id = p_payment_id and status = 'verified'
  ),
  earlier as (
    -- Payments on the same bill verified before this one.
    select e.id from public.payments e, pm
    where e.bill_id = pm.bill_id and e.status = 'verified' and e.receipt_number < pm.receipt_number
  )
  select jsonb_build_object(
    'receipt_number', pm.receipt_number,
    'payment', jsonb_build_object(
      'id', pm.id, 'amount', pm.amount, 'method', pm.method, 'paid_on', pm.paid_on,
      'reference_number', pm.reference_number, 'provider', pm.provider, 'verified_at', pm.reviewed_at,
      'recorded_by_landlord', pm.submitted_by <> pm.tenant_id),
    'bill', jsonb_build_object(
      'id', b.id, 'bill_number', b.bill_number, 'period', b.period, 'issue_date', b.issue_date,
      'due_date', b.due_date, 'total_amount', b.total_amount),
    'tenant_name', p.full_name,
    'room_number', r.room_number,
    'property', jsonb_build_object(
      'name', s.property_name, 'address', s.property_address, 'currency_code', s.currency_code,
      'contact_name', s.contact_name, 'contact_phone', s.contact_phone, 'contact_email', s.contact_email),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', bi.kind, 'description', bi.description, 'amount', bi.amount,
               'paid_before', l.before, 'applied', l.applied, 'remaining', bi.amount - l.before - l.applied)
             order by bi.sort_order, bi.created_at)
      from public.bill_items bi
      cross join lateral (
        select
          coalesce(sum(pa.amount) filter (where pa.payment_id in (select id from earlier)), 0)::numeric(12,2) as before,
          coalesce(sum(pa.amount) filter (where pa.payment_id = pm.id), 0)::numeric(12,2) as applied
        from public.payment_allocations pa where pa.bill_item_id = bi.id
      ) l
      where bi.bill_id = b.id
    ), '[]'::jsonb),
    'balance_before', b.total_amount - coalesce((select sum(e.amount) from public.payments e where e.id in (select id from earlier)), 0),
    'balance_after', b.total_amount - coalesce((select sum(e.amount) from public.payments e where e.id in (select id from earlier)), 0) - pm.amount
  )
  from pm
  join public.bills b    on b.id = pm.bill_id
  join public.profiles p on p.id = pm.tenant_id
  join public.rooms r    on r.id = b.room_id
  cross join public.app_settings s
  where s.id;
$$;

-- Read models -----------------------------------------------------------------------------------
-- Columns are appended so existing callers keep working.
create or replace view public.bill_overview
with (security_invoker = true)
as
select
  b.id,
  b.bill_number,
  b.lease_id,
  b.tenant_id,
  b.room_id,
  b.period,
  b.issue_date,
  b.due_date,
  b.total_amount,
  b.amount_paid,
  b.balance,
  b.status,
  b.void_reason,
  b.voided_at,
  b.notes,
  b.created_at,
  r.room_number,
  p.full_name as tenant_name,
  p.email     as tenant_email,
  (b.finalized_at is not null and b.status in ('unpaid', 'partial') and b.due_date < public.property_today()) as is_overdue,
  coalesce((select count(*) from public.payments pm
            where pm.bill_id = b.id and pm.status = 'pending'), 0)::integer as pending_payments,
  coalesce((select sum(pm.amount) from public.payments pm
            where pm.bill_id = b.id and pm.status = 'pending'), 0)::numeric(12,2) as pending_amount,
  (b.finalized_at is not null) as is_finalized,
  b.finalized_at,
  b.revision,
  case when b.finalized_at is null and b.status <> 'void'
    then public.bill_missing_charges(b.id) else '{}'::text[] end as missing_charges,
  coalesce(i.rent, 0)::numeric(12,2)        as rent_amount,
  coalesce(i.electricity, 0)::numeric(12,2) as electricity_amount,
  coalesce(i.water, 0)::numeric(12,2)       as water_amount,
  coalesce(i.other, 0)::numeric(12,2)       as other_amount,
  coalesce(a.rent, 0)::numeric(12,2)        as rent_paid,
  coalesce(a.electricity, 0)::numeric(12,2) as electricity_paid,
  coalesce(a.water, 0)::numeric(12,2)       as water_paid,
  coalesce(a.other, 0)::numeric(12,2)       as other_paid
from public.bills b
join public.rooms r    on r.id = b.room_id
join public.profiles p on p.id = b.tenant_id
left join lateral (
  select sum(amount) filter (where kind = 'rent')        as rent,
         sum(amount) filter (where kind = 'electricity') as electricity,
         sum(amount) filter (where kind = 'water')       as water,
         sum(amount) filter (where kind = 'other')       as other
  from public.bill_items where bill_id = b.id
) i on true
left join lateral (
  select sum(amount) filter (where kind = 'rent')        as rent,
         sum(amount) filter (where kind = 'electricity') as electricity,
         sum(amount) filter (where kind = 'water')       as water,
         sum(amount) filter (where kind = 'other')       as other
  from public.payment_allocations where bill_id = b.id
) a on true;

create or replace view public.payment_overview
with (security_invoker = true)
as
select
  pm.id,
  pm.bill_id,
  pm.tenant_id,
  pm.amount,
  pm.method,
  pm.reference_number,
  pm.paid_on,
  pm.proof_path,
  pm.status,
  pm.notes,
  pm.submitted_by,
  pm.reviewed_by,
  pm.reviewed_at,
  pm.rejection_reason,
  pm.created_at,
  (pm.submitted_by <> pm.tenant_id) as recorded_by_landlord,
  b.bill_number,
  b.period,
  b.balance as bill_balance,
  b.status  as bill_status,
  r.room_number,
  p.full_name as tenant_name,
  pm.receipt_number,
  pm.provider
from public.payments pm
join public.bills b    on b.id = pm.bill_id
join public.rooms r    on r.id = b.room_id
join public.profiles p on p.id = pm.tenant_id;

-- Outstanding balances count only bills the tenant has actually been sent.
create or replace view public.room_overview
with (security_invoker = true)
as
select
  r.id,
  r.room_number,
  r.floor,
  r.monthly_rent,
  r.capacity,
  r.description,
  r.is_under_maintenance,
  l.id           as lease_id,
  l.start_date   as lease_start_date,
  l.monthly_rent as lease_rent,
  p.id           as tenant_id,
  p.full_name    as tenant_name,
  p.email        as tenant_email,
  p.phone        as tenant_phone,
  case
    when r.is_under_maintenance then 'maintenance'
    when l.id is not null then 'occupied'
    else 'vacant'
  end as occupancy,
  coalesce((
    select sum(b.balance) from public.bills b
    where b.room_id = r.id and b.status in ('unpaid', 'partial') and b.finalized_at is not null
  ), 0)::numeric(12,2) as outstanding_balance
from public.rooms r
left join public.leases l on l.room_id = r.id and l.status = 'active'
left join public.profiles p on p.id = l.tenant_id;

create or replace view public.tenant_overview
with (security_invoker = true)
as
select
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.emergency_contact_name,
  p.emergency_contact_phone,
  p.is_active,
  p.invited_at,
  p.activated_at,
  p.created_at,
  case
    when not p.is_active then 'inactive'
    when p.user_id is null then 'no_portal'
    when p.suspended_at is not null then 'suspended'
    when p.activated_at is null then 'invited'
    else 'active'
  end as account_status,
  l.id           as lease_id,
  l.room_id,
  r.room_number,
  l.start_date   as lease_start_date,
  l.monthly_rent as lease_rent,
  coalesce((
    select sum(b.balance) from public.bills b
    where b.tenant_id = p.id and b.status in ('unpaid', 'partial') and b.finalized_at is not null
  ), 0)::numeric(12,2) as outstanding_balance,
  coalesce((
    select sum(case when d.type = 'received' then d.amount else -d.amount end)
    from public.deposit_transactions d where d.tenant_id = p.id
  ), 0)::numeric(12,2) as deposit_balance,
  p.avatar_path,
  (p.user_id is not null) as has_portal_access,
  p.suspended_at,
  p.suspension_reason
from public.profiles p
left join public.leases l on l.tenant_id = p.id and l.status = 'active'
left join public.rooms r on r.id = l.room_id
where p.role = 'tenant'
  and (p.user_id is null or p.invited_at is not null or p.activated_at is not null);

-- The reading grid also says which rooms' bills are already finalized (locked).
drop function public.meter_reading_sheet(date);
create function public.meter_reading_sheet(p_period date)
returns table (
  room_id              uuid,
  room_number          text,
  floor                smallint,
  tenant_name          text,
  is_billable          boolean,
  reading_id           uuid,
  electricity_previous numeric,
  electricity_current  numeric,
  water_previous       numeric,
  water_current        numeric,
  bill_id              uuid,
  bill_finalized       boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with per as (
    select date_trunc('month', p_period)::date as p,
           (date_trunc('month', p_period) + interval '1 month - 1 day')::date as p_end
  )
  select
    r.id,
    r.room_number,
    r.floor,
    pr.full_name,
    l.id is not null,
    mr.id,
    coalesce(mr.electricity_previous, prev.electricity_current),
    mr.electricity_current,
    coalesce(mr.water_previous, prev.water_current),
    mr.water_current,
    bl.id,
    coalesce(bl.finalized_at is not null, false)
  from public.rooms r
  cross join per
  left join lateral (
    select l.id, l.tenant_id from public.leases l
    where l.room_id = r.id and l.start_date <= per.p_end and (l.status = 'active' or l.end_date >= per.p)
    order by l.start_date desc limit 1
  ) l on true
  left join public.profiles pr on pr.id = l.tenant_id
  left join public.meter_readings mr on mr.room_id = r.id and mr.period = per.p
  left join lateral (
    select m.electricity_current, m.water_current from public.meter_readings m
    where m.room_id = r.id and m.period < per.p
    order by m.period desc limit 1
  ) prev on true
  left join lateral (
    select b.id, b.finalized_at from public.bills b
    where b.room_id = r.id and b.period = per.p and b.status <> 'void'
    order by b.created_at desc limit 1
  ) bl on true;
$$;

-- Notifications ---------------------------------------------------------------------------------
-- "Bill ready" now goes out when a bill is finalized (not when its draft is
-- generated), listing the charges. A corrected bill is announced again.
create or replace function public._bill_issued_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill  public.bills;
  v_lines text;
begin
  select * into v_bill from public.bills where id = new.id;
  if not found or v_bill.status = 'void' or v_bill.finalized_at is null then
    return null;
  end if;
  select string_agg(
           format('%s %s', case kind when 'rent' then 'Rent' when 'electricity' then 'Electricity'
                                     when 'water' then 'Water' else 'Other charges' end,
                  public._fmt_money(total)),
           ' · ' order by case kind when 'rent' then 1 when 'electricity' then 2 when 'water' then 3 else 4 end)
    into v_lines
  from (select kind, sum(amount) as total from public.bill_items where bill_id = v_bill.id group by kind) k;

  perform public._notify(
    public._tenant_user_id(v_bill.tenant_id), 'bill_issued',
    case when v_bill.revision > 1 then format('%s bill updated', public._fmt_period(v_bill.period))
         else format('%s bill is ready', public._fmt_period(v_bill.period)) end,
    format('Your bill #%s for %s is due on %s.%s', v_bill.bill_number, public._fmt_money(v_bill.total_amount),
           public._fmt_date(v_bill.due_date), coalesce(' ' || v_lines || '.', '')),
    'bill', v_bill.id, format('bill_issued:%s:%s', v_bill.id, v_bill.revision));
  return null;
end;
$$;

-- A draft the tenant never received is cancelled silently.
create or replace function public._bill_voided_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'void' and old.status <> 'void' and old.finalized_at is not null then
    perform public._notify(
      public._tenant_user_id(new.tenant_id), 'bill_voided', 'Bill cancelled',
      format('Your %s bill #%s was cancelled: %s. You do not need to pay it.',
             public._fmt_period(new.period), new.bill_number, rtrim(new.void_reason, '.')),
      'bill', new.id, 'bill_voided:' || new.id);
  end if;
  return null;
end;
$$;

create constraint trigger bills_finalized_notify
  after update of finalized_at on public.bills
  deferrable initially deferred
  for each row
  when (old.finalized_at is null and new.finalized_at is not null)
  execute function public._bill_issued_notify();

create or replace function public._method_label(p_method public.payment_method)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_method::text
    when 'cash' then 'cash' when 'bank_transfer' then 'bank transfer' when 'gcash' then 'GCash'
    when 'maya' then 'Maya' when 'check' then 'check' when 'card' then 'card' else 'other means'
  end;
$$;

-- Online payments confirmed by the provider get their own wording.
create or replace function public._payments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill     public.bills;
  v_tenant   public.profiles;
  v_room     text;
  v_period   text;
  v_balance  numeric(12,2);
  v_after    text;
begin
  select * into v_bill from public.bills where id = new.bill_id;
  select * into v_tenant from public.profiles where id = new.tenant_id;
  select room_number into v_room from public.rooms where id = v_bill.room_id;
  v_period := public._fmt_period(v_bill.period);

  -- Tenant submitted proof, or an online payment needs a decision.
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public._notify(
      public._landlord_user_id(), 'payment_submitted', 'Payment to verify',
      format('%s (Room %s) %s %s by %s for the %s bill.%s',
             coalesce(nullif(v_tenant.full_name, ''), 'A tenant'), v_room,
             case when new.provider is not null then 'paid' else 'sent' end,
             public._fmt_money(new.amount), public._method_label(new.method), v_period,
             case when new.provider is not null then ' ' || new.notes else '' end),
      'payment', new.id, 'payment_submitted:' || new.id);

  -- Verified: recorded by the landlord, approved after review, or confirmed by the provider.
  elsif new.status = 'verified' and (tg_op = 'INSERT' or old.status = 'pending') then
    select v_bill.total_amount - coalesce(sum(amount), 0) into v_balance
    from public.payments where bill_id = new.bill_id and status = 'verified';
    v_after := case when v_balance <= 0 then 'Your bill is now fully paid.'
                    else format('Remaining balance: %s.', public._fmt_money(v_balance)) end;

    if tg_op = 'INSERT' and new.provider is not null then
      perform public._notify(
        v_tenant.user_id, 'payment_verified', 'Payment received',
        format('Your online payment of %s by %s for the %s bill went through. %s Your receipt is ready.',
               public._fmt_money(new.amount), public._method_label(new.method), v_period, v_after),
        'bill', new.bill_id, 'payment_verified:' || new.id);
    elsif tg_op = 'INSERT' then
      perform public._notify(
        v_tenant.user_id, 'payment_recorded', 'Payment recorded',
        format('Your %s payment of %s for the %s bill was recorded. %s It now shows in your bill''s payment history.',
               public._method_label(new.method), public._fmt_money(new.amount), v_period, v_after),
        'bill', new.bill_id, 'payment_recorded:' || new.id);
    else
      perform public._notify(
        v_tenant.user_id, 'payment_verified', 'Payment confirmed',
        format('Your payment of %s for the %s bill was confirmed. %s It now shows in your bill''s payment history.',
               public._fmt_money(new.amount), v_period, v_after),
        'bill', new.bill_id, 'payment_verified:' || new.id);
    end if;
    -- Only reaches the landlord when someone else did the verifying.
    perform public._notify(
      public._landlord_user_id(),
      case when tg_op = 'INSERT' and new.provider is null then 'payment_recorded' else 'payment_verified' end::public.notification_type,
      case when new.provider is not null then 'Online payment received' else 'Payment verified' end,
      format('%s from %s (Room %s) was %s for the %s bill.',
             public._fmt_money(new.amount), coalesce(nullif(v_tenant.full_name, ''), 'a tenant'), v_room,
             case when new.provider is not null then 'paid online by ' || public._method_label(new.method) else 'verified' end,
             v_period),
      'payment', new.id, 'payment_verified:' || new.id);

  elsif tg_op = 'UPDATE' and new.status = 'rejected' and old.status = 'pending'
        and new.rejection_reason is distinct from 'Bill was voided' then
    perform public._notify(
      v_tenant.user_id, 'payment_rejected', 'Payment not accepted',
      format('Your payment of %s for the %s bill was not accepted: %s. Please check the details and submit it again.',
             public._fmt_money(new.amount), v_period, rtrim(new.rejection_reason, '.')),
      'bill', new.bill_id, 'payment_rejected:' || new.id);
  end if;
  return null;
end;
$$;

-- Reminders and summaries only concern bills tenants have received.
create or replace function public._send_rent_reminders(p_settings public.app_settings, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill   record;
  v_stage  text;
  v_days   integer;
  v_count  integer := 0;
  v_before smallint := p_settings.reminder_days_before;
  v_after  smallint := p_settings.reminder_days_after;
begin
  if not p_settings.rent_reminders_enabled then
    return 0;
  end if;

  for v_bill in
    select b.id, b.period, b.due_date, b.balance, coalesce(b.finalized_at, b.created_at) as issued_at, p.user_id
    from public.bills b
    join public.profiles p on p.id = b.tenant_id
    where b.status in ('unpaid', 'partial') and b.balance > 0 and b.finalized_at is not null
      and p.user_id is not null and p.is_active
      and b.due_date between p_today - (v_after + 7) and p_today + v_before
  loop
    v_days := v_bill.due_date - p_today;
    v_stage := case
      -- Skipped for a bill issued in the last day: its "bill ready" notice gave the date.
      when v_before > 0 and v_days between 1 and v_before and v_bill.issued_at < now() - interval '1 day' then 'due_soon'
      when p_settings.reminder_on_due_date and v_days = 0 then 'due_today'
      when v_after > 0 and -v_days between v_after and v_after + 6 then 'overdue'
    end;
    continue when v_stage is null;

    if public._notify(
      v_bill.user_id,
      ('rent_' || v_stage)::public.notification_type,
      case v_stage
        when 'due_soon' then case when v_days = 1 then 'Rent due tomorrow' else format('Rent due in %s days', v_days) end
        when 'due_today' then 'Rent due today'
        else 'Rent overdue'
      end,
      case v_stage
        when 'due_soon' then format('%s is due on %s for your %s bill.',
                                    public._fmt_money(v_bill.balance), public._fmt_date(v_bill.due_date), public._fmt_period(v_bill.period))
        when 'due_today' then format('%s is due today for your %s bill.',
                                     public._fmt_money(v_bill.balance), public._fmt_period(v_bill.period))
        else format('Your %s bill was due on %s and %s is still unpaid. Please pay as soon as you can, or contact your landlord.',
                    public._fmt_period(v_bill.period), public._fmt_date(v_bill.due_date), public._fmt_money(v_bill.balance))
      end,
      'bill', v_bill.id, format('rent_%s:%s', v_stage, v_bill.id)
    ) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public._send_landlord_digests(p_settings public.app_settings, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_landlord uuid := public._landlord_user_id();
  v_ahead    integer := greatest(p_settings.reminder_days_before, 1);
  v_n        integer;
  v_sum      numeric(12,2);
  v_rooms    text[];
  v_total    integer;
  v_lease    record;
  v_count    integer := 0;
begin
  if v_landlord is null then
    return 0;
  end if;

  select count(*), sum(b.balance), array_agg(r.room_number order by r.room_number)
    into v_n, v_sum, v_rooms
  from public.bills b join public.rooms r on r.id = b.room_id
  where b.status in ('unpaid', 'partial') and b.balance > 0 and b.finalized_at is not null
    and b.due_date = p_today + v_ahead;
  if v_n > 0 and public._notify(
    v_landlord, 'bills_due_soon',
    format('%s %s due on %s', v_n, case when v_n = 1 then 'bill' else 'bills' end, public._fmt_date(p_today + v_ahead)),
    format('%s still open across %s.', public._fmt_money(v_sum), public._room_list(v_rooms)),
    'billing', null, 'bills_due_soon:' || p_today) is not null then
    v_count := v_count + 1;
  end if;

  select count(*), sum(b.balance), array_agg(r.room_number order by r.room_number)
    into v_n, v_sum, v_rooms
  from public.bills b join public.rooms r on r.id = b.room_id
  where b.status in ('unpaid', 'partial') and b.balance > 0 and b.finalized_at is not null
    and b.due_date = p_today - 1;
  if v_n > 0 then
    select count(*) into v_total from public.bills
    where status in ('unpaid', 'partial') and balance > 0 and finalized_at is not null and due_date < p_today;
    if public._notify(
      v_landlord, 'bills_overdue',
      format('%s %s now overdue', v_n, case when v_n = 1 then 'bill is' else 'bills are' end),
      format('%s unpaid from %s.%s', public._fmt_money(v_sum), public._room_list(v_rooms),
             case when v_total > v_n then format(' %s overdue bills in total.', v_total) else '' end),
      'billing', null, 'bills_overdue:' || p_today) is not null then
      v_count := v_count + 1;
    end if;
  end if;

  for v_lease in
    select l.id, l.tenant_id, l.start_date = p_today and l.status = 'active' as moving_in,
           r.room_number, p.full_name
    from public.leases l
    join public.rooms r on r.id = l.room_id
    join public.profiles p on p.id = l.tenant_id
    where (l.start_date = p_today and l.status = 'active') or l.end_date = p_today
  loop
    if public._notify(
      v_landlord,
      case when v_lease.moving_in then 'move_in_today' else 'move_out_today' end::public.notification_type,
      case when v_lease.moving_in then 'Move-in today' else 'Move-out today' end,
      case when v_lease.moving_in
        then format('%s moves into Room %s today.', coalesce(nullif(v_lease.full_name, ''), 'A tenant'), v_lease.room_number)
        else format('%s moves out of Room %s today. Remember the final meter reading.',
                    coalesce(nullif(v_lease.full_name, ''), 'A tenant'), v_lease.room_number)
      end,
      'tenant', v_lease.tenant_id,
      format('%s:%s', case when v_lease.moving_in then 'move_in' else 'move_out' end, v_lease.id)) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.run_scheduled_billing()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_today    date;
  v_period   date;
  v_count    integer;
  v_run_id   uuid;
begin
  select * into v_settings from public.app_settings where id;
  if not v_settings.auto_billing_enabled then
    return 0;
  end if;

  v_today := (now() at time zone v_settings.timezone)::date;
  if extract(day from v_today) < v_settings.billing_day then
    return 0;
  end if;
  v_period := date_trunc('month', v_today)::date;

  begin
    v_count := public._generate_bills(v_today);
  exception when others then
    raise warning 'Scheduled billing failed: %', sqlerrm;
    perform public._notify(
      public._landlord_user_id(), 'billing_failed', 'Automatic billing failed',
      format('%s bills could not be generated: %s. Generate them from Billing, or they will be retried within the hour.',
             public._fmt_period(v_period), left(sqlerrm, 200)),
      'billing', null, format('billing_failed:%s:%s', v_period, v_today));
    return 0;
  end;

  if v_count > 0 then
    insert into public.billing_runs (period, triggered_by, bills_created)
    values (v_period, 'schedule', v_count)
    returning id into v_run_id;
    perform public._notify(
      public._landlord_user_id(), 'bills_generated', format('%s bills drafted', public._fmt_period(v_period)),
      format('%s draft %s with this month''s rent. Add the meter readings, then finalize the bills to send them to tenants.',
             v_count, case when v_count = 1 then 'bill was created' else 'bills were created' end),
      'billing', null, 'bills_generated:' || v_run_id);
  end if;
  return v_count;
end;
$$;

-- Row level security ------------------------------------------------------------------------------
-- Tenants see a bill (and its charges and readings) only once it is finalized.
drop policy "bills: own or landlord" on public.bills;
create policy "bills: own finalized or landlord"
  on public.bills for select to authenticated
  using (
    (select public.is_landlord())
    or (tenant_id = (select public.current_tenant_id()) and finalized_at is not null)
  );

drop policy "bill_items: via own bill or landlord" on public.bill_items;
create policy "bill_items: via own finalized bill or landlord"
  on public.bill_items for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.bills b
      where b.id = bill_items.bill_id and b.tenant_id = (select public.current_tenant_id()) and b.finalized_at is not null
    )
  );

drop policy "meter_readings: billed tenant or landlord" on public.meter_readings;
create policy "meter_readings: billed tenant or landlord"
  on public.meter_readings for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.bills b
      where b.room_id = meter_readings.room_id
        and b.period = meter_readings.period
        and b.tenant_id = (select public.current_tenant_id())
        and b.finalized_at is not null
    )
  );

alter table public.payment_allocations enable row level security;
alter table public.payment_checkouts   enable row level security;

create policy "payment_allocations: via own bill or landlord"
  on public.payment_allocations for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.bills b
      where b.id = payment_allocations.bill_id and b.tenant_id = (select public.current_tenant_id())
    )
  );

create policy "payment_checkouts: own or landlord"
  on public.payment_checkouts for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_landlord()));

-- Privileges (Supabase grants new objects to authenticated by default) ----------------------------
revoke all on public.payment_allocations, public.payment_checkouts from public, anon, authenticated;
grant select on public.payment_allocations, public.payment_checkouts to authenticated;
revoke all on sequence public.payment_receipt_seq from public, anon, authenticated;
revoke all on public.bill_overview, public.payment_overview, public.room_overview, public.tenant_overview from anon;
grant select on public.bill_overview, public.payment_overview, public.room_overview, public.tenant_overview to authenticated;
grant update (online_payments_enabled) on public.app_settings to authenticated;

revoke execute on function
  public._bill_items_guard(),
  public._finalize_bill(uuid, boolean),
  public._payments_guard(),
  public._allocation_priority(public.bill_item_kind),
  public._allocate_payment(uuid),
  public._payments_allocate(),
  public._check_payment_allocated(),
  public._check_allocation(),
  public._allocations_immutable(),
  public._attach_checkout_session(uuid, text, text, timestamptz),
  public._fail_checkout(uuid, text),
  public._confirm_provider_payment(text, text, text, numeric, public.payment_method, date)
from public, anon, authenticated;
grant execute on function
  public._attach_checkout_session(uuid, text, text, timestamptz),
  public._fail_checkout(uuid, text),
  public._confirm_provider_payment(text, text, text, numeric, public.payment_method, date)
to service_role;

revoke execute on function
  public.bill_missing_charges(uuid),
  public.finalize_bill(uuid, boolean),
  public.finalize_bills(date),
  public.reopen_bill(uuid),
  public.submit_payment(uuid, numeric, public.payment_method, date, text, text, text, uuid),
  public.record_payment(uuid, numeric, public.payment_method, date, text, text, text, uuid),
  public.start_online_payment(uuid, numeric),
  public.cancel_online_payment(uuid),
  public.payment_receipt(uuid),
  public.meter_reading_sheet(date)
from public, anon;
grant execute on function
  public.bill_missing_charges(uuid),
  public.finalize_bill(uuid, boolean),
  public.finalize_bills(date),
  public.reopen_bill(uuid),
  public.submit_payment(uuid, numeric, public.payment_method, date, text, text, text, uuid),
  public.record_payment(uuid, numeric, public.payment_method, date, text, text, text, uuid),
  public.start_online_payment(uuid, numeric),
  public.cancel_online_payment(uuid),
  public.payment_receipt(uuid),
  public.meter_reading_sheet(date)
to authenticated;
