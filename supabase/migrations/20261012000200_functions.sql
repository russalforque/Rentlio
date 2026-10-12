-- =============================================================================
-- Rentlio business logic
--
-- Every write that touches money, leases or accounts goes through a
-- SECURITY DEFINER function below. Each public function re-checks the caller's
-- role, so the database is the authority even if the frontend is bypassed.
-- Functions prefixed with "_" are internal and not executable by clients.
-- =============================================================================

-- Role helpers ------------------------------------------------------------------
create function public.is_landlord()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'landlord' and is_active
  );
$$;

create function public._assert_landlord()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_landlord() then
    raise exception 'Only the landlord can perform this action' using errcode = '42501';
  end if;
end;
$$;

create function public._assert_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'Your account is not active' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Auth user -> profile ---------------------------------------------------------
-- Public sign-up is disabled, so users only come from (a) the invite-tenant
-- edge function, which tags them as tenants, or (b) the Supabase dashboard.
-- The first non-invited user becomes the landlord; any later non-invited user
-- gets an inactive tenant profile with no access to anything.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invited boolean := coalesce(new.raw_user_meta_data ->> 'invited_as', '') = 'tenant';
  v_role public.user_role;
  v_active boolean := true;
begin
  if v_invited then
    v_role := 'tenant';
  elsif not exists (select 1 from public.profiles where role = 'landlord') then
    v_role := 'landlord';
  else
    v_role := 'tenant';
    v_active := false;
  end if;

  insert into public.profiles (id, role, full_name, email, phone, is_active, invited_at, activated_at)
  values (
    new.id,
    v_role,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    coalesce(new.email, ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 40), ''),
    v_active,
    case when v_invited then now() end,
    case when v_role = 'landlord' then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Called by the invite page once the tenant has set a password.
create function public.mark_account_activated()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set activated_at = now()
  where id = auth.uid() and activated_at is null;
$$;

-- Bill totals ---------------------------------------------------------------------
create function public._refresh_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(12,2);
  v_paid  numeric(12,2);
begin
  select coalesce(sum(amount), 0) into v_total from public.bill_items where bill_id = p_bill_id;
  select coalesce(sum(amount), 0) into v_paid
    from public.payments where bill_id = p_bill_id and status = 'verified';

  update public.bills
  set total_amount = v_total,
      amount_paid  = v_paid,
      status = case
        when status = 'void' then 'void'::public.bill_status
        when v_paid >= v_total and v_total > 0 then 'paid'::public.bill_status
        when v_paid > 0 then 'partial'::public.bill_status
        else 'unpaid'::public.bill_status
      end
  where id = p_bill_id;
end;
$$;

create function public._bill_items_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._refresh_bill(coalesce(new.bill_id, old.bill_id));
  return null;
end;
$$;

create trigger bill_items_refresh_bill
  after insert or update or delete on public.bill_items
  for each row execute function public._bill_items_changed();

create function public._payments_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._refresh_bill(new.bill_id);
  return null;
end;
$$;

create trigger payments_refresh_bill
  after insert or update of status, amount on public.payments
  for each row execute function public._payments_changed();

-- Utility charges -------------------------------------------------------------
-- Creates/updates the electricity and water lines of a bill from that room's
-- meter reading for the bill's period. A rate is captured when the line is first
-- created; later reading corrections reuse the captured rate.
create function public._sync_bill_utilities(p_bill_id uuid)
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
  if not found or v_bill.status = 'void' then
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
    if v_settings.water_flat_fee > 0 then
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

-- Bill generation -----------------------------------------------------------------
-- Idempotent: the partial unique index on (lease_id, period) makes a second run
-- for the same month a no-op, even when two runs race.
create function public._generate_bills(p_period date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings   public.app_settings;
  v_period     date := date_trunc('month', p_period)::date;
  v_period_end date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_issue      date;
  v_due        date;
  v_lease      record;
  v_bill_id    uuid;
  v_count      integer := 0;
begin
  select * into v_settings from public.app_settings where id;
  v_issue := v_period + (v_settings.billing_day - 1);
  v_due   := v_issue + v_settings.due_days;

  for v_lease in
    select l.id, l.tenant_id, l.room_id, l.monthly_rent
    from public.leases l
    -- Any lease overlapping the month, including one ended mid-month before
    -- its final bill was generated.
    where l.start_date <= v_period_end
      and (l.status = 'active' or l.end_date >= v_period)
  loop
    v_bill_id := null;
    insert into public.bills (lease_id, tenant_id, room_id, period, issue_date, due_date)
    values (v_lease.id, v_lease.tenant_id, v_lease.room_id, v_period, v_issue, v_due)
    on conflict (lease_id, period) where status <> 'void' do nothing
    returning id into v_bill_id;

    if v_bill_id is not null then
      insert into public.bill_items (bill_id, kind, description, quantity, unit_price, amount, sort_order)
      values (v_bill_id, 'rent', 'Monthly rent: ' || to_char(v_period, 'FMMonth YYYY'),
              1, v_lease.monthly_rent, v_lease.monthly_rent, 0);
      perform public._sync_bill_utilities(v_bill_id);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create function public.generate_bills(p_period date)
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
  v_count := public._generate_bills(p_period);
  insert into public.billing_runs (period, triggered_by, bills_created, run_by)
  values (date_trunc('month', p_period)::date, 'manual', v_count, auth.uid());
  return v_count;
end;
$$;

-- Invoked by pg_cron. Safe to run as often as you like: it only acts on or
-- after the configured billing day and generation is idempotent, so a missed
-- or delayed cron tick catches up on the next one.
create function public.run_scheduled_billing()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_today    date;
  v_count    integer;
begin
  select * into v_settings from public.app_settings where id;
  if not v_settings.auto_billing_enabled then
    return 0;
  end if;

  v_today := (now() at time zone v_settings.timezone)::date;
  if extract(day from v_today) < v_settings.billing_day then
    return 0;
  end if;

  v_count := public._generate_bills(v_today);
  if v_count > 0 then
    insert into public.billing_runs (period, triggered_by, bills_created)
    values (date_trunc('month', v_today)::date, 'schedule', v_count);
  end if;
  return v_count;
end;
$$;

-- Bill adjustments ------------------------------------------------------------
create function public.add_bill_charge(p_bill_id uuid, p_description text, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public._assert_landlord();
  if p_amount is null or p_amount <= 0 then
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

-- Adjust rent (e.g. pro-rating a move-in month) or an extra charge.
-- Utility lines are derived from readings and are corrected via the readings.
create function public.update_bill_item(p_item_id uuid, p_description text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.bill_items;
begin
  perform public._assert_landlord();
  select bi.* into v_item
  from public.bill_items bi join public.bills b on b.id = bi.bill_id
  where bi.id = p_item_id and b.status <> 'void';
  if not found then
    raise exception 'Bill item not found or bill voided' using errcode = 'P0002';
  end if;
  if v_item.kind not in ('rent', 'other') then
    raise exception 'Utility charges are updated by correcting the meter reading' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Amount cannot be negative' using errcode = '22023';
  end if;
  update public.bill_items
  set description = coalesce(nullif(btrim(p_description), ''), description),
      unit_price  = p_amount,
      quantity    = 1,
      amount      = round(p_amount, 2)
  where id = p_item_id;
end;
$$;

create function public.remove_bill_charge(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_landlord();
  delete from public.bill_items bi
  using public.bills b
  where bi.id = p_item_id and b.id = bi.bill_id and bi.kind = 'other' and b.status <> 'void';
  if not found then
    raise exception 'Only extra charges on an open bill can be removed' using errcode = '22023';
  end if;
end;
$$;

-- Voiding keeps the record but frees the month so a corrected bill can be issued.
-- Bills that already have verified payments cannot be voided.
create function public.void_bill(p_bill_id uuid, p_reason text)
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

  update public.bills
  set status = 'void', void_reason = btrim(p_reason), voided_at = now()
  where id = p_bill_id and status <> 'void';
  if not found then
    raise exception 'Bill not found or already voided' using errcode = 'P0002';
  end if;
end;
$$;

-- Meter readings ------------------------------------------------------------------
-- p_readings: [{ "room_id": uuid, "electricity_current": n, "water_current": n,
--               "electricity_previous": n?, "water_previous": n? }]
-- Previous values default to the room's latest earlier reading, so a landlord
-- normally types only the current meter values.
create function public.record_meter_readings(p_period date, p_readings jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period  date := date_trunc('month', p_period)::date;
  v_row     jsonb;
  v_room_id uuid;
  v_prev    public.meter_readings;
  v_e_prev  numeric(12,2);
  v_e_curr  numeric(12,2);
  v_w_prev  numeric(12,2);
  v_w_curr  numeric(12,2);
  v_bill_id uuid;
  v_count   integer := 0;
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

-- Leases -------------------------------------------------------------------------------
create function public.assign_tenant(
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
  if p_monthly_rent is not null and p_monthly_rent < 0 then
    raise exception 'Rent cannot be negative' using errcode = '22023';
  end if;

  insert into public.leases (room_id, tenant_id, start_date, monthly_rent, notes)
  values (p_room_id, p_tenant_id, p_start_date, coalesce(p_monthly_rent, v_room.monthly_rent), nullif(btrim(p_notes), ''))
  returning id into v_lease_id;

  if coalesce(p_deposit_amount, 0) > 0 then
    insert into public.deposit_transactions (lease_id, tenant_id, type, amount, transaction_date, notes, recorded_by)
    values (v_lease_id, p_tenant_id, 'received', round(p_deposit_amount, 2), p_start_date, 'Deposit on move-in', auth.uid());
  end if;

  return v_lease_id;
end;
$$;

create function public.update_lease_rent(p_lease_id uuid, p_monthly_rent numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_landlord();
  if p_monthly_rent is null or p_monthly_rent < 0 then
    raise exception 'Rent cannot be negative' using errcode = '22023';
  end if;
  update public.leases set monthly_rent = round(p_monthly_rent, 2)
  where id = p_lease_id and status = 'active';
  if not found then
    raise exception 'Active lease not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.end_lease(p_lease_id uuid, p_end_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_landlord();
  if p_end_date is null then
    raise exception 'End date is required' using errcode = '22023';
  end if;
  update public.leases
  set status = 'ended', end_date = p_end_date
  where id = p_lease_id and status = 'active' and start_date <= p_end_date;
  if not found then
    raise exception 'Active lease not found, or end date is before the start date' using errcode = 'P0002';
  end if;
end;
$$;

-- Payments ------------------------------------------------------------------------
-- Tenant submits a payment with proof. It does not count until verified.
create function public.submit_payment(
  p_bill_id          uuid,
  p_amount           numeric,
  p_method           public.payment_method,
  p_paid_on          date,
  p_proof_path       text,
  p_reference_number text default null,
  p_notes            text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public._assert_active_user();
  v_bill public.bills;
  v_id   uuid;
begin
  select * into v_bill from public.bills where id = p_bill_id and tenant_id = v_uid;
  if not found then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if v_bill.status in ('void', 'paid') then
    raise exception 'This bill is already %', v_bill.status using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if round(p_amount, 2) > v_bill.balance then
    raise exception 'Amount exceeds the outstanding balance of %', v_bill.balance using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 then
    raise exception 'Payment date is invalid' using errcode = '22023';
  end if;
  -- Proof must be a file the tenant uploaded into their own storage folder.
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> v_uid::text then
    raise exception 'Proof of payment is required' using errcode = '22023';
  end if;

  insert into public.payments
    (bill_id, tenant_id, amount, method, reference_number, paid_on, proof_path, notes, submitted_by)
  values
    (p_bill_id, v_uid, round(p_amount, 2), p_method, nullif(btrim(p_reference_number), ''),
     p_paid_on, p_proof_path, nullif(btrim(p_notes), ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- Landlord records a payment received directly (e.g. cash). Verified at once.
create function public.record_payment(
  p_bill_id          uuid,
  p_amount           numeric,
  p_method           public.payment_method,
  p_paid_on          date,
  p_reference_number text default null,
  p_notes            text default null,
  p_proof_path       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_id   uuid;
begin
  perform public._assert_landlord();
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.status = 'void' then
    raise exception 'Bill not found or voided' using errcode = 'P0002';
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

  insert into public.payments
    (bill_id, tenant_id, amount, method, reference_number, paid_on, proof_path, notes,
     status, submitted_by, reviewed_by, reviewed_at)
  values
    (p_bill_id, v_bill.tenant_id, round(p_amount, 2), p_method, nullif(btrim(p_reference_number), ''),
     p_paid_on, p_proof_path, nullif(btrim(p_notes), ''), 'verified', auth.uid(), auth.uid(), now())
  returning id into v_id;
  return v_id;
end;
$$;

-- Approve (optionally correcting the amount) or reject a pending payment.
create function public.review_payment(
  p_payment_id uuid,
  p_approve    boolean,
  p_amount     numeric default null,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_bill    public.bills;
  v_amount  numeric(12,2);
begin
  perform public._assert_landlord();
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'This payment has already been %', v_payment.status using errcode = '22023';
  end if;

  if p_approve then
    select * into v_bill from public.bills where id = v_payment.bill_id for update;
    if v_bill.status = 'void' then
      raise exception 'The bill was voided' using errcode = '22023';
    end if;
    v_amount := round(coalesce(p_amount, v_payment.amount), 2);
    if v_amount <= 0 then
      raise exception 'Amount must be greater than zero' using errcode = '22023';
    end if;
    if v_amount > v_bill.balance then
      raise exception 'Amount % exceeds the outstanding balance of %', v_amount, v_bill.balance using errcode = '22023';
    end if;
    update public.payments
    set status = 'verified', amount = v_amount, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id;
  else
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Please give the tenant a reason for rejecting' using errcode = '22023';
    end if;
    update public.payments
    set status = 'rejected', rejection_reason = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id;
  end if;
end;
$$;

-- Deposits ------------------------------------------------------------------------
create function public.record_deposit_transaction(
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
  v_id      uuid;
begin
  perform public._assert_landlord();
  select * into v_lease from public.leases where id = p_lease_id for update;
  if not found then
    raise exception 'Lease not found' using errcode = 'P0002';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if p_type <> 'received' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'Please note the reason for this deduction or refund' using errcode = '22023';
  end if;

  select coalesce(sum(case when type = 'received' then amount else -amount end), 0)
    into v_balance from public.deposit_transactions where lease_id = p_lease_id;
  if p_type <> 'received' and round(p_amount, 2) > v_balance then
    raise exception 'Amount exceeds the deposit balance of %', v_balance using errcode = '22023';
  end if;

  insert into public.deposit_transactions (lease_id, tenant_id, type, amount, transaction_date, notes, recorded_by)
  values (p_lease_id, v_lease.tenant_id, p_type, round(p_amount, 2), coalesce(p_date, current_date),
          nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Read models (security_invoker: callers only see rows RLS allows) -------------------
create view public.room_overview
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
    where b.room_id = r.id and b.status in ('unpaid', 'partial')
  ), 0)::numeric(12,2) as outstanding_balance
from public.rooms r
left join public.leases l on l.room_id = r.id and l.status = 'active'
left join public.profiles p on p.id = l.tenant_id;

create view public.deposit_balances
with (security_invoker = true)
as
select
  l.id as lease_id,
  l.tenant_id,
  l.room_id,
  coalesce(sum(d.amount) filter (where d.type = 'received'), 0)::numeric(12,2)  as total_received,
  coalesce(sum(d.amount) filter (where d.type = 'deduction'), 0)::numeric(12,2) as total_deducted,
  coalesce(sum(d.amount) filter (where d.type = 'refund'), 0)::numeric(12,2)    as total_refunded,
  coalesce(sum(case when d.type = 'received' then d.amount else -d.amount end), 0)::numeric(12,2) as balance
from public.leases l
left join public.deposit_transactions d on d.lease_id = l.id
group by l.id, l.tenant_id, l.room_id;
