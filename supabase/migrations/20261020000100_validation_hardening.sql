-- =============================================================================
-- Validation hardening (validation and data-integrity audit).
--
-- Each rule below closes a gap that was reproduced against the previous
-- migrations, so it holds even for requests that bypass the app:
--
--   * NaN: Postgres numeric accepts 'NaN', and NaN passes every ">= 0" check
--     (it sorts above all numbers). One NaN rate, reading or charge turned a
--     bill's total and balance into NaN. Every money, rate and reading column
--     now rejects it.
--   * Overlapping tenancies: ending a lease with a future move-out date freed
--     the room at once, so a second tenant could be housed there and both were
--     billed for the same months. A room, and a tenant, can now hold only one
--     tenancy on any given day (a same-day handover is allowed).
--   * Ending a tenancy before months that were already billed left those bills
--     live for a terminated agreement. The live bills must be voided first.
--   * generate_bills accepted any future month, producing bills years ahead.
--   * Clearing a meter reading left its old charge on the draft bill.
--   * A reading could exceed the next month's starting reading, implying
--     negative consumption.
--   * Payments and deposits could be dated in the future; a negative deposit
--     on move-in was silently ignored.
--   * void_bill did not lock the bill, so a payment confirmed at the same
--     moment (e.g. the online-payment webhook) could leave a verified payment
--     on a voided bill.
--   * Two payments submitted at the same moment on different bills could reuse
--     one provider reference or proof file (check-then-insert without a lock).
--   * Names could be saved blank, and phone numbers were free text.
-- =============================================================================

-- NaN guards ----------------------------------------------------------------------
-- NOT VALID first so the constraint is enforced for every new write even if a
-- legacy NaN exists; then validated when the data is clean (a warning names
-- the column otherwise, without blocking the upgrade).
do $$
declare
  v_col record;
  v_name text;
begin
  for v_col in
    select * from (values
      ('rooms', 'monthly_rent'),
      ('leases', 'monthly_rent'),
      ('meter_readings', 'electricity_previous'),
      ('meter_readings', 'electricity_current'),
      ('meter_readings', 'water_previous'),
      ('meter_readings', 'water_current'),
      ('bills', 'total_amount'),
      ('bills', 'amount_paid'),
      ('bill_items', 'quantity'),
      ('bill_items', 'unit_price'),
      ('bill_items', 'amount'),
      ('payments', 'amount'),
      ('deposit_transactions', 'amount'),
      ('app_settings', 'electricity_rate'),
      ('app_settings', 'water_rate'),
      ('app_settings', 'water_flat_fee'),
      ('payment_checkouts', 'amount'),
      ('payment_allocations', 'amount')
    ) as t (tbl, col)
  loop
    v_name := format('%s_%s_not_nan', v_col.tbl, v_col.col);
    execute format('alter table public.%I add constraint %I check (%I <> ''NaN''::numeric) not valid',
                   v_col.tbl, v_name, v_col.col);
    begin
      execute format('alter table public.%I validate constraint %I', v_col.tbl, v_name);
    exception when check_violation then
      raise warning 'public.%.% holds NaN values; fix them, then run: alter table public.% validate constraint %',
        v_col.tbl, v_col.col, v_col.tbl, v_name;
    end;
  end loop;
end;
$$;

-- Phone numbers ----------------------------------------------------------------------
-- Philippine mobile and landline numbers (09xx xxx xxxx, +63 9xx xxx xxxx,
-- (02) 8xxx xxxx, (032) xxx xxxx) or any international number written with a
-- leading +. Spaces, dots, hyphens and parentheses are ignored. Mirrors
-- isValidPhone() in src/lib/validation.ts.
create function public._valid_phone(p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_phone is null
      or regexp_replace(p_phone, '[\s().-]', '', 'g') ~ '^((\+?63|0)[0-9]{9,10}|\+[1-9][0-9]{7,14})$';
$$;

-- Tenant record fields ---------------------------------------------------------------
-- Covers every way a record is written: functions, the invite edge function,
-- and direct updates by the landlord or the tenant themselves. Fields are only
-- checked when they change, so an old value never blocks an unrelated edit.
create function public._profiles_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.full_name is distinct from old.full_name then
    new.full_name := btrim(coalesce(new.full_name, ''));
    -- The landlord's own record may start without a name (set up from Auth).
    if new.full_name = '' and (new.role = 'tenant' or tg_op = 'UPDATE') then
      raise exception 'Enter a full name' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' or new.phone is distinct from old.phone then
    new.phone := nullif(btrim(new.phone), '');
    if not public._valid_phone(new.phone) then
      raise exception 'Enter a valid phone number, e.g. 0917 123 4567 or +63 917 123 4567' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' or new.emergency_contact_phone is distinct from old.emergency_contact_phone then
    new.emergency_contact_phone := nullif(btrim(new.emergency_contact_phone), '');
    if not public._valid_phone(new.emergency_contact_phone) then
      raise exception 'Enter a valid emergency contact phone number' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' or new.emergency_contact_name is distinct from old.emergency_contact_name then
    new.emergency_contact_name := nullif(btrim(new.emergency_contact_name), '');
  end if;
  return new;
end;
$$;

create trigger profiles_validate
  before insert or update of full_name, phone, emergency_contact_name, emergency_contact_phone on public.profiles
  for each row execute function public._profiles_validate();

-- Tenancies ----------------------------------------------------------------------------
-- end_date is the last day of the tenancy (move_tenant ends the old lease the
-- day before the move; _generate_bills bills a lease while end_date >= period).
-- Two tenancies of one room or one tenant may not overlap, except that one may
-- start on the day the other ends (a same-day handover).
create function public._leases_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room   text;
  v_other  public.leases;
  v_bill   public.bills;
begin
  if tg_op = 'INSERT' then
    -- Serialises assignments to this room.
    select room_number into v_room from public.rooms where id = new.room_id for update;

    select * into v_other from public.leases l
    where l.room_id = new.room_id and l.id <> new.id
      and l.start_date < coalesce(new.end_date, 'infinity'::date)
      and new.start_date < coalesce(l.end_date, 'infinity'::date)
    order by l.start_date desc limit 1;
    if found then
      if v_other.end_date is not null and v_other.end_date > new.start_date and v_other.start_date <= new.start_date then
        raise exception 'Room % is occupied until %. Choose a move-in date on or after that day.',
          v_room, to_char(v_other.end_date, 'FMMonth FMDD, YYYY') using errcode = '23505';
      end if;
      raise exception 'Room % already has a tenancy that overlaps these dates', v_room using errcode = '23505';
    end if;

    if exists (
      select 1 from public.leases l
      where l.tenant_id = new.tenant_id and l.id <> new.id
        and l.start_date < coalesce(new.end_date, 'infinity'::date)
        and new.start_date < coalesce(l.end_date, 'infinity'::date)
    ) then
      raise exception 'This tenant already has a tenancy that overlaps these dates' using errcode = '23505';
    end if;
  elsif new.end_date is not null and new.end_date is distinct from old.end_date then
    -- A month that starts after the tenancy's last day was never occupied.
    -- Drafts the tenant never received (and nobody paid) are cancelled here;
    -- a bill the tenant was sent, or one with any payment, needs the landlord.
    select * into v_bill from public.bills b
    where b.lease_id = new.id and b.status <> 'void' and b.period > new.end_date
      and (b.finalized_at is not null or exists (select 1 from public.payments p where p.bill_id = b.id))
    order by b.period limit 1;
    if found then
      select room_number into v_room from public.rooms where id = new.room_id;
      raise exception 'Room % already has a % bill for this tenancy (bill #%). Void it first, or choose a later move-out date.',
        v_room, to_char(v_bill.period, 'FMMonth YYYY'), v_bill.bill_number using errcode = '22023';
    end if;
    update public.bills
    set status = 'void', voided_at = now(),
        void_reason = format('Tenancy ended on %s, before this month', to_char(new.end_date, 'FMMonth FMDD, YYYY'))
    where lease_id = new.id and status <> 'void' and period > new.end_date and finalized_at is null;
  end if;
  return new;
end;
$$;

create trigger leases_guard
  before insert or update of end_date on public.leases
  for each row execute function public._leases_guard();

-- assign_tenant: as before, plus a negative deposit is refused instead of ignored.
create or replace function public.assign_tenant(
  p_tenant_id      uuid,
  p_room_id        uuid,
  p_start_date     date,
  p_monthly_rent   numeric default null,
  p_deposit_amount numeric default null,
  p_notes          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room     public.rooms;
  v_lease_id uuid;
begin
  perform public._assert_landlord();

  if not exists (select 1 from public.profiles where id = p_tenant_id and role = 'tenant' and is_active) then
    raise exception 'Tenant not found or inactive' using errcode = 'P0002';
  end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;
  if v_room.is_under_maintenance then
    raise exception 'Room % is under maintenance', v_room.room_number using errcode = '22023';
  end if;
  if exists (select 1 from public.leases where room_id = p_room_id and status = 'active') then
    raise exception 'Room % is already occupied', v_room.room_number using errcode = '23505';
  end if;
  if exists (select 1 from public.leases where tenant_id = p_tenant_id and status = 'active') then
    raise exception 'This tenant already has an active room. End that lease first.' using errcode = '23505';
  end if;
  if p_start_date is null then
    raise exception 'Start date is required' using errcode = '22023';
  end if;
  if p_monthly_rent is not null and (p_monthly_rent < 0 or p_monthly_rent = 'NaN'::numeric) then
    raise exception 'Rent cannot be negative' using errcode = '22023';
  end if;
  if p_deposit_amount is not null and (p_deposit_amount < 0 or p_deposit_amount = 'NaN'::numeric) then
    raise exception 'The deposit cannot be negative' using errcode = '22023';
  end if;

  insert into public.leases (room_id, tenant_id, start_date, monthly_rent, notes)
  values (p_room_id, p_tenant_id, p_start_date, round(coalesce(p_monthly_rent, v_room.monthly_rent), 2), nullif(btrim(p_notes), ''))
  returning id into v_lease_id;

  if coalesce(p_deposit_amount, 0) > 0 then
    insert into public.deposit_transactions (lease_id, tenant_id, type, amount, transaction_date, notes, recorded_by)
    values (v_lease_id, p_tenant_id, 'received', round(p_deposit_amount, 2), p_start_date, 'Deposit on move-in', auth.uid());
  end if;

  return v_lease_id;
end;
$$;

-- Bill generation: only for the current month or earlier. Next month's bills
-- are generated automatically on its billing day.
create or replace function public.generate_bills(p_period date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public._assert_landlord();
  if p_period is null then
    raise exception 'Billing period is required' using errcode = '22023';
  end if;
  if date_trunc('month', p_period) > date_trunc('month', public.property_today()) then
    raise exception '% has not started yet. Bills can be generated for this month or earlier.',
      to_char(p_period, 'FMMonth YYYY') using errcode = '22023';
  end if;
  v_count := public._generate_bills(p_period);
  insert into public.billing_runs (period, triggered_by, bills_created, run_by)
  values (date_trunc('month', p_period)::date, 'manual', v_count, auth.uid());
  return v_count;
end;
$$;

-- Bill adjustments: readable messages instead of constraint errors.
create or replace function public.add_bill_charge(p_bill_id uuid, p_description text, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public._assert_landlord();
  if char_length(btrim(coalesce(p_description, ''))) = 0 then
    raise exception 'Describe the charge' using errcode = '22023';
  end if;
  if char_length(btrim(p_description)) > 200 then
    raise exception 'The description is too long (200 characters at most)' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount = 'NaN'::numeric then
    raise exception 'Charge amount must be greater than zero' using errcode = '22023';
  end if;
  if not exists (select 1 from public.bills where id = p_bill_id and status <> 'void') then
    raise exception 'Bill not found or voided' using errcode = 'P0002';
  end if;
  insert into public.bill_items (bill_id, kind, description, quantity, unit_price, amount, sort_order)
  values (p_bill_id, 'other', btrim(p_description), 1, p_amount, round(p_amount, 2), 10)
  returning id into v_id;
  return v_id;
end;
$$;

-- Voiding locks the bill first, so it cannot interleave with a payment being
-- recorded or confirmed on it.
create or replace function public.void_bill(p_bill_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  perform public._assert_landlord();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to void a bill' using errcode = '22023';
  end if;
  if char_length(btrim(p_reason)) > 500 then
    raise exception 'The reason is too long (500 characters at most)' using errcode = '22023';
  end if;
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.status = 'void' then
    raise exception 'Bill not found or already voided' using errcode = 'P0002';
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
  where id = p_bill_id;
end;
$$;

-- Utilities on a draft follow the reading exactly: a cleared reading removes
-- its charge instead of leaving the old amount on the bill.
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
  else
    delete from public.bill_items where bill_id = p_bill_id and kind = 'electricity';
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
  else
    -- Metered water with no complete reading: no metered charge.
    delete from public.bill_items where bill_id = p_bill_id and kind = 'water' and meter_reading_id is not null;
  end if;
end;
$$;

-- Meter readings: as before, plus each value must be a finite, non-negative
-- number, and a month's reading cannot pass the next month's starting reading.
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
  v_room     text;
  v_prev     public.meter_readings;
  v_next     public.meter_readings;
  v_existing public.meter_readings;
  v_e_prev   numeric(12,2);
  v_e_curr   numeric(12,2);
  v_w_prev   numeric(12,2);
  v_w_curr   numeric(12,2);
  v_key      text;
  v_bill_id  uuid;
  v_count    integer := 0;
begin
  perform public._assert_landlord();
  if p_period is null or jsonb_typeof(p_readings) <> 'array' then
    raise exception 'A period and a list of readings are required' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_readings)
  loop
    begin
      v_room_id := (v_row ->> 'room_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Unknown room %', v_row ->> 'room_id' using errcode = 'P0002';
    end;
    select room_number into v_room from public.rooms where id = v_room_id;
    if not found then
      raise exception 'Unknown room %', v_room_id using errcode = 'P0002';
    end if;

    -- Each value: absent/null, or a finite number >= 0 (JSON number or numeric text).
    foreach v_key in array array['electricity_previous', 'electricity_current', 'water_previous', 'water_current']
    loop
      if jsonb_typeof(v_row -> v_key) not in ('number', 'string', 'null')
         or (jsonb_typeof(v_row -> v_key) = 'string'
             and (v_row ->> v_key) !~ '^\s*[0-9]+(\.[0-9]+)?\s*$') then
        raise exception 'Room %: % must be a number', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
      if (v_row ->> v_key)::numeric < 0 then
        raise exception 'Room %: % cannot be negative', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
    end loop;

    select * into v_prev from public.meter_readings
      where room_id = v_room_id and period < v_period
      order by period desc limit 1;
    select * into v_next from public.meter_readings
      where room_id = v_room_id and period > v_period
      order by period limit 1;
    select * into v_existing from public.meter_readings
      where room_id = v_room_id and period = v_period;

    v_e_curr := (v_row ->> 'electricity_current')::numeric;
    v_w_curr := (v_row ->> 'water_current')::numeric;
    v_e_prev := coalesce((v_row ->> 'electricity_previous')::numeric, v_prev.electricity_current);
    v_w_prev := coalesce((v_row ->> 'water_previous')::numeric, v_prev.water_current);

    if v_e_curr is not null and v_e_prev is not null and v_e_curr < v_e_prev then
      raise exception 'Room %: electricity reading % is lower than previous %', v_room, v_e_curr, v_e_prev
        using errcode = '22023';
    end if;
    if v_w_curr is not null and v_w_prev is not null and v_w_curr < v_w_prev then
      raise exception 'Room %: water reading % is lower than previous %', v_room, v_w_curr, v_w_prev
        using errcode = '22023';
    end if;
    if v_e_curr is not null and v_next.electricity_previous is not null and v_e_curr > v_next.electricity_previous then
      raise exception 'Room %: electricity reading % is higher than the % reading starts from (%). Correct that month first.',
        v_room, v_e_curr, to_char(v_next.period, 'FMMonth YYYY'), v_next.electricity_previous using errcode = '22023';
    end if;
    if v_w_curr is not null and v_next.water_previous is not null and v_w_curr > v_next.water_previous then
      raise exception 'Room %: water reading % is higher than the % reading starts from (%). Correct that month first.',
        v_room, v_w_curr, to_char(v_next.period, 'FMMonth YYYY'), v_next.water_previous using errcode = '22023';
    end if;

    if exists (select 1 from public.bills
               where room_id = v_room_id and period = v_period and status <> 'void' and finalized_at is not null) then
      -- Re-saving the grid with this room unchanged is fine; changing it is not.
      if (v_e_prev, v_e_curr, v_w_prev, v_w_curr) is distinct from
         (v_existing.electricity_previous, v_existing.electricity_current, v_existing.water_previous, v_existing.water_current) then
        raise exception 'Room %: the % bill is already finalized. Reopen it to change this reading.',
          v_room, to_char(v_period, 'FMMonth YYYY') using errcode = '22023';
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

-- Payment dates -------------------------------------------------------------------------
-- Not in the future (property time), and not more than a year before the bill's month.
create function public._assert_payment_date(p_paid_on date, p_period date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_paid_on is null then
    raise exception 'Payment date is required' using errcode = '22023';
  end if;
  if p_paid_on > public.property_today() then
    raise exception 'The payment date cannot be in the future' using errcode = '22023';
  end if;
  if p_paid_on < p_period - interval '1 year' then
    raise exception 'The payment date is more than a year before this bill''s month' using errcode = '22023';
  end if;
end;
$$;

-- Duplicate references and proofs: the check and the insert that follows are
-- serialised per reference / per file, so concurrent submissions cannot both pass.
create or replace function public._assert_reference_unused(p_method public.payment_method, p_reference text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_method not in ('gcash', 'maya', 'bank_transfer', 'check') or coalesce(btrim(p_reference), '') = '' then
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('payment-ref:' || p_method || ':' || lower(btrim(p_reference))));
  if exists (
    select 1 from public.payments
    where method = p_method
      and lower(btrim(reference_number)) = lower(btrim(p_reference))
      and status <> 'rejected'
  ) then
    raise exception 'Reference number % has already been used for another payment', btrim(p_reference)
      using errcode = '23505';
  end if;
end;
$$;

create or replace function public._assert_proof_usable(p_proof_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('payment-proof:' || p_proof_path));
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_proof_path) then
    raise exception 'The proof of payment file was not found. Please upload it again.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where proof_path = p_proof_path and status <> 'rejected') then
    raise exception 'This proof of payment is already attached to another payment' using errcode = '23505';
  end if;
end;
$$;

create or replace function public.submit_payment(
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
  if p_amount is null or p_amount <= 0 or p_amount = 'NaN'::numeric then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if p_method is null or p_method = 'card' then
    raise exception 'Choose how you paid' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into v_pending from public.payments where bill_id = p_bill_id and status = 'pending';
  if round(p_amount, 2) > v_bill.balance then
    raise exception 'Amount exceeds the outstanding balance of %', v_bill.balance using errcode = '22023';
  end if;
  if round(p_amount, 2) > v_bill.balance - v_pending then
    raise exception 'Amount exceeds the balance still owed (%) once the % awaiting verification is counted',
      v_bill.balance - v_pending, v_pending using errcode = '22023';
  end if;
  perform public._assert_payment_date(p_paid_on, v_bill.period);
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

create or replace function public.record_payment(
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
  if p_amount is null or p_amount <= 0 or p_amount = 'NaN'::numeric then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if round(p_amount, 2) > v_bill.balance then
    raise exception 'Amount exceeds the outstanding balance of %', v_bill.balance using errcode = '22023';
  end if;
  if p_method is null or p_method = 'card' then
    raise exception 'Choose how the payment was made' using errcode = '22023';
  end if;
  perform public._assert_payment_date(p_paid_on, v_bill.period);
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

-- Deposits: not dated in the future.
create or replace function public.record_deposit_transaction(
  p_lease_id uuid,
  p_type     public.deposit_txn_type,
  p_amount   numeric,
  p_date     date,
  p_notes    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease   public.leases;
  v_balance numeric(12,2);
  v_date    date := coalesce(p_date, public.property_today());
  v_id      uuid;
begin
  perform public._assert_landlord();
  select * into v_lease from public.leases where id = p_lease_id;
  if not found then
    raise exception 'Lease not found' using errcode = 'P0002';
  end if;
  -- Serialise concurrent deposit changes for this tenant.
  perform 1 from public.profiles where id = v_lease.tenant_id for update;

  if p_type is null then
    raise exception 'Choose the type of deposit transaction' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount = 'NaN'::numeric then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if v_date > public.property_today() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;
  if p_type <> 'received' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'Please note the reason for this deduction or refund' using errcode = '22023';
  end if;

  select coalesce(sum(case when type = 'received' then amount else -amount end), 0)
    into v_balance from public.deposit_transactions where tenant_id = v_lease.tenant_id;
  if p_type <> 'received' and round(p_amount, 2) > v_balance then
    raise exception 'Amount exceeds the deposit balance of %', v_balance using errcode = '22023';
  end if;

  insert into public.deposit_transactions (lease_id, tenant_id, type, amount, transaction_date, notes, recorded_by)
  values (p_lease_id, v_lease.tenant_id, p_type, round(p_amount, 2), v_date,
          nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Registration approval: a new record needs the applicant's name; an
-- unverifiable phone claim is dropped rather than blocking the approval.
create or replace function public.approve_registration(
  p_request_id     uuid,
  p_tenant_id      uuid,
  p_identity_check public.identity_check,
  p_note           text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.registration_requests;
  v_tenant  public.profiles;
  v_id      uuid;
begin
  perform public._assert_landlord();

  if p_identity_check is null or p_identity_check = 'invitation' then
    raise exception 'Choose how you verified the applicant''s identity' using errcode = '22023';
  end if;
  if p_identity_check = 'existing_record' and p_tenant_id is null then
    raise exception 'Select the tenant record you verified the applicant against' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Describe how you verified the applicant' using errcode = '22023';
  end if;
  if char_length(btrim(p_note)) > 500 then
    raise exception 'The note is too long' using errcode = '22023';
  end if;

  -- Lock the request first: concurrent reviews of the same request serialise here.
  select * into v_request from public.registration_requests where id = p_request_id for update;
  if not found then
    raise exception 'Registration request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request was already %', v_request.status using errcode = '22023';
  end if;
  if v_request.email_verified_at is null then
    raise exception 'The applicant has not verified their email address yet' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where user_id = v_request.user_id) then
    raise exception 'This login is already linked to a tenant record' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles
             where lower(email) = v_request.email and (p_tenant_id is null or id <> p_tenant_id)) then
    raise exception 'Another tenant record already uses %', v_request.email using errcode = '23505';
  end if;

  if p_tenant_id is not null then
    select * into v_tenant from public.profiles where id = p_tenant_id for update;
    if not found or v_tenant.role <> 'tenant' then
      raise exception 'Tenant record not found' using errcode = 'P0002';
    end if;
    if v_tenant.user_id is not null then
      raise exception 'This tenant record is already linked to a login' using errcode = '23505';
    end if;
    if not v_tenant.is_active then
      raise exception 'Reactivate this tenant record before linking it' using errcode = '22023';
    end if;
    update public.profiles
    set user_id = v_request.user_id, email = v_request.email, activated_at = now()
    where id = p_tenant_id;
    v_id := p_tenant_id;
  else
    if btrim(v_request.full_name) = '' then
      raise exception 'This applicant did not give a name. Add them as a tenant first, then link this login to that record.'
        using errcode = '22023';
    end if;
    insert into public.profiles (id, user_id, role, full_name, email, phone, activated_at)
    values (v_request.user_id, v_request.user_id, 'tenant', v_request.full_name, v_request.email,
            case when public._valid_phone(v_request.phone) then v_request.phone end, now())
    returning id into v_id;
  end if;

  update public.registration_requests
  set status = 'approved', tenant_id = v_id, identity_check = p_identity_check,
      review_note = btrim(p_note), reviewed_by = public.current_profile_id(), reviewed_at = now()
  where id = p_request_id;

  perform public._audit('registration_approved', p_request_id, v_id, v_request.user_id,
                        jsonb_build_object('identity_check', p_identity_check, 'note', btrim(p_note)));
  if p_tenant_id is not null then
    perform public._audit('account_linked', p_request_id, v_id, v_request.user_id,
                          jsonb_build_object('existing_record', true));
  end if;
  return v_id;
end;
$$;

-- Privileges: new helpers and triggers are internal. CREATE OR REPLACE keeps
-- the existing grants on the replaced functions.
revoke execute on function
  public._valid_phone(text),
  public._profiles_validate(),
  public._leases_guard(),
  public._assert_payment_date(date, date)
from public, anon, authenticated;
