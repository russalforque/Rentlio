-- Lease-anniversary billing and effective-dated per-person water charges.
-- Existing bills and their finalized line items are deliberately untouched.

alter table public.leases
  add column occupant_count smallint not null default 1
    check (occupant_count between 1 and 20);

create table public.lease_occupant_audit (
  id                 uuid primary key default gen_random_uuid(),
  lease_id           uuid not null references public.leases (id) on delete restrict,
  previous_count     smallint not null check (previous_count between 1 and 20),
  new_count          smallint not null check (new_count between 1 and 20),
  changed_by         uuid not null references public.profiles (id) on delete restrict,
  changed_at         timestamptz not null default now()
);

create index lease_occupant_audit_lease_idx
  on public.lease_occupant_audit (lease_id, changed_at desc);

alter table public.lease_occupant_audit enable row level security;
revoke all on public.lease_occupant_audit from anon, authenticated;
grant select on public.lease_occupant_audit to authenticated;
create policy "occupant audit: landlord reads"
  on public.lease_occupant_audit for select to authenticated
  using ((select public.is_landlord()));

create function public._validate_lease_occupants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity smallint;
begin
  select capacity into v_capacity from public.rooms where id = new.room_id for update;
  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;
  if new.occupant_count > v_capacity then
    raise exception 'Billable occupants (%) cannot exceed room capacity (%)',
      new.occupant_count, v_capacity using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger leases_validate_occupants
  before insert or update of room_id, occupant_count on public.leases
  for each row execute function public._validate_lease_occupants();

create function public._validate_room_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occupants smallint;
begin
  if new.capacity < old.capacity then
    select max(occupant_count) into v_occupants
    from public.leases
    where room_id = new.id and status = 'active';
    if v_occupants > new.capacity then
      raise exception 'Room capacity cannot be less than its current billable occupant count (%)',
        v_occupants using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger rooms_validate_capacity
  before update of capacity on public.rooms
  for each row execute function public._validate_room_capacity();

create function public.set_lease_occupants(p_lease_id uuid, p_occupant_count smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases;
begin
  perform public._assert_landlord();
  if p_occupant_count is null or p_occupant_count < 1 or p_occupant_count > 20 then
    raise exception 'Occupant count must be a whole number between 1 and 20' using errcode = '22023';
  end if;

  select * into v_lease from public.leases where id = p_lease_id for update;
  if not found or v_lease.status <> 'active' then
    raise exception 'Active lease not found' using errcode = 'P0002';
  end if;
  if p_occupant_count = v_lease.occupant_count then
    return;
  end if;

  update public.leases set occupant_count = p_occupant_count where id = p_lease_id;
  insert into public.lease_occupant_audit (lease_id, previous_count, new_count, changed_by)
  values (p_lease_id, v_lease.occupant_count, p_occupant_count, auth.uid());

  -- Refresh only drafts. The bill-items guard keeps finalized history immutable.
  perform public._sync_bill_utilities(b.id)
  from public.bills b
  where b.lease_id = p_lease_id and b.status <> 'void' and b.finalized_at is null;
end;
$$;

-- The dated rate rows are the canonical configuration and its audit history.
create table public.water_rate_schedule (
  id             uuid primary key default gen_random_uuid(),
  monthly_rate   numeric(12,2) not null check (monthly_rate >= 0),
  effective_from date not null unique,
  changed_by     uuid references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now()
);

insert into public.water_rate_schedule (monthly_rate, effective_from)
values (150.00, current_date);

alter table public.water_rate_schedule enable row level security;
revoke all on public.water_rate_schedule from anon, authenticated;
grant select on public.water_rate_schedule to authenticated;
create policy "water rates: landlord reads"
  on public.water_rate_schedule for select to authenticated
  using ((select public.is_landlord()));

create function public._water_rate_schedule_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Water rate history is append-only' using errcode = '42501';
end;
$$;

create trigger water_rate_schedule_immutable
  before update or delete on public.water_rate_schedule
  for each row execute function public._water_rate_schedule_immutable();

create or replace function public._notification_meta(
  p_type       public.notification_type,
  out category public.notification_category,
  out topic    text,
  out audience text
)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when p_type in ('payment_submitted', 'payment_verified', 'payment_recorded', 'payment_rejected')
        then 'payment'
      when p_type in ('bill_issued', 'bill_voided', 'rent_due_soon', 'rent_due_today', 'rent_overdue',
                      'bills_due_soon', 'bills_overdue', 'bills_generated', 'water_rate_changed')
        then 'billing'
      when p_type in ('registration_submitted', 'registration_approved', 'registration_rejected', 'tenant_activated')
        then 'account'
      when p_type in ('billing_failed', 'system_error')
        then 'system'
      else 'rental'
    end::public.notification_category,
    case
      when p_type in ('payment_submitted', 'payment_verified', 'payment_recorded') then 'payment_updates'
      when p_type in ('rent_due_soon', 'rent_due_today', 'rent_overdue', 'bills_due_soon', 'bills_overdue') then 'rent_reminders'
      when p_type = 'announcement' then 'announcements'
      when p_type in ('lease_started', 'lease_updated', 'lease_ended', 'tenant_activated', 'bills_generated',
                      'move_in_today', 'move_out_today', 'water_rate_changed') then 'general_updates'
    end,
    case
      when p_type in ('registration_submitted', 'payment_submitted', 'tenant_activated', 'move_in_today', 'move_out_today',
                      'bills_due_soon', 'bills_overdue', 'bills_generated', 'billing_failed', 'system_error')
        then 'landlord'
      when p_type in ('payment_verified', 'payment_recorded') then 'any'
      else 'tenant'
    end;
$$;

create function public.set_water_rate(p_monthly_rate numeric, p_effective_from date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_settings public.app_settings;
  v_rate_text text;
  v_profile record;
begin
  perform public._assert_landlord();
  if p_monthly_rate is null or p_monthly_rate < 0 or p_monthly_rate > 9999999999.99
     or p_monthly_rate = 'NaN'::numeric
     or p_monthly_rate <> round(p_monthly_rate, 2) then
    raise exception 'Water rate must be a nonnegative amount with at most two decimal places'
      using errcode = '22023';
  end if;
  if p_effective_from is null or p_effective_from < public.property_today() then
    raise exception 'Water rates can only take effect today or on a future date' using errcode = '22023';
  end if;

  select * into v_settings from public.app_settings where id for update;
  insert into public.water_rate_schedule (monthly_rate, effective_from, changed_by)
  values (p_monthly_rate, p_effective_from, auth.uid())
  returning id into v_id;

  v_rate_text := public._fmt_money(p_monthly_rate);
  for v_profile in
    select p.user_id
    from public.leases l
    join public.profiles p on p.id = l.tenant_id
    where l.status = 'active' and p.user_id is not null and p.is_active
  loop
    perform public._notify(
      v_profile.user_id, 'water_rate_changed', 'Monthly water rate updated',
      format('The water rate is now %s per person per month, effective %s.',
             v_rate_text, public._fmt_date(p_effective_from)),
      'billing', null, 'water_rate_changed:' || v_id);
  end loop;
  return v_id;
end;
$$;

-- Change in occupant count is one room-level billable value. The existing
-- leases_one_active_per_room constraint means a shared room is never counted twice.
create or replace function public._sync_bill_utilities(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill       public.bills;
  v_settings   public.app_settings;
  v_reading    public.meter_readings;
  v_occupants  smallint;
  v_water_rate numeric(12,2);
  v_qty        numeric(12,2);
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found or v_bill.status = 'void' or v_bill.finalized_at is not null then
    return;
  end if;

  select * into v_settings from public.app_settings where id;
  select l.occupant_count into v_occupants from public.leases l where l.id = v_bill.lease_id;
  select * into v_reading from public.meter_readings
    where room_id = v_bill.room_id and period = v_bill.period;

  -- Electricity remains metered at the existing configured rate.
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
      set description = excluded.description,
          quantity = excluded.quantity,
          amount = round(excluded.quantity * bi.unit_price, 2),
          meter_reading_id = excluded.meter_reading_id;
  else
    delete from public.bill_items where bill_id = p_bill_id and kind = 'electricity';
  end if;

  select wr.monthly_rate into v_water_rate
  from public.water_rate_schedule wr
  where wr.effective_from <= v_bill.issue_date
  order by wr.effective_from desc
  limit 1;

  if v_water_rate is null then
    raise exception 'No water rate is configured for bill #%s', v_bill.bill_number using errcode = '22023';
  end if;

  insert into public.bill_items as bi
    (bill_id, kind, description, quantity, unit_price, amount, sort_order)
  values (
    p_bill_id, 'water',
    format('Water: %s %s × %s per person / month',
      v_occupants, case when v_occupants = 1 then 'occupant' else 'occupants' end, public._fmt_money(v_water_rate)),
    v_occupants, v_water_rate, round(v_occupants * v_water_rate, 2), 2
  )
  on conflict (bill_id, kind) where kind <> 'other' do update
    set description = excluded.description,
        quantity = excluded.quantity,
        unit_price = excluded.unit_price,
        amount = excluded.amount,
        meter_reading_id = null;
end;
$$;

create or replace function public._generate_bills(p_period date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period     date := date_trunc('month', p_period)::date;
  v_period_end date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_today      date := public.property_today();
  v_lease      record;
  v_issue      date;
  v_bill_id    uuid;
  v_count      integer := 0;
begin
  if p_period is null then
    raise exception 'Billing period is required' using errcode = '22023';
  end if;

  for v_lease in
    select l.id, l.tenant_id, l.room_id, l.monthly_rent, l.start_date
    from public.leases l
    where l.start_date <= v_period_end
      and (l.status = 'active' or l.end_date >= v_period)
  loop
    -- Calculate from the original start date every month, so a clamped February
    -- anniversary never shifts a 29th/30th/31st tenancy permanently.
    v_issue := case
      when date_trunc('month', v_period)::date = date_trunc('month', v_lease.start_date)::date
        then v_lease.start_date
      else make_date(
        extract(year from v_period)::integer,
        extract(month from v_period)::integer,
        least(
          extract(day from v_lease.start_date)::integer,
          extract(day from v_period_end)::integer
        )
      )
    end;
    if v_issue > v_today then
      continue;
    end if;

    v_bill_id := null;
    insert into public.bills (lease_id, tenant_id, room_id, period, issue_date, due_date)
    values (v_lease.id, v_lease.tenant_id, v_lease.room_id, v_period, v_issue, v_issue)
    on conflict (lease_id, period) where status <> 'void' do nothing
    returning id into v_bill_id;

    if v_bill_id is not null then
      -- Preserve the existing first-payment policy: the initial calendar-month
      -- bill includes full monthly rent; the landlord may pro-rate its draft.
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

  v_today := public.property_today();
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
      public._landlord_user_id(), 'bills_generated', format('%s bills drafted', public._fmt_period(v_today)),
      format('%s draft %s created for rental anniversaries reached today.',
             v_count, case when v_count = 1 then 'bill was' else 'bills were' end),
      'billing', null, 'bills_generated:' || v_run_id);
  end if;
  return v_count;
end;
$$;

create or replace function public._finalize_bill(p_bill_id uuid, p_skip_missing boolean)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill    public.bills;
  v_missing text[];
begin
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.status = 'void' then
    raise exception 'Bill not found or voided' using errcode = 'P0002';
  end if;
  if v_bill.finalized_at is not null then
    raise exception 'Bill #% is already finalized', v_bill.bill_number using errcode = '22023';
  end if;

  perform public._sync_bill_utilities(p_bill_id);
  v_missing := public.bill_missing_charges(p_bill_id);
  if cardinality(v_missing) > 0 and not coalesce(p_skip_missing, false) then
    return v_missing;
  end if;

  select * into v_bill from public.bills where id = p_bill_id;
  if v_bill.total_amount <= 0 then
    raise exception 'Bill #% has nothing to pay. Void it instead.', v_bill.bill_number using errcode = '22023';
  end if;

  update public.bills
  set finalized_at = now(),
      finalized_by = public.current_profile_id(),
      revision = revision + 1
  where id = p_bill_id;
  return '{}'::text[];
end;
$$;

create or replace function public.bill_missing_charges(p_bill_id uuid)
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
      then 'electricity' end
  ], null);
$$;

create table public.bill_due_date_audit (
  id             uuid primary key default gen_random_uuid(),
  bill_id        uuid not null references public.bills (id) on delete restrict,
  previous_date  date not null,
  new_date       date not null,
  reason         text not null check (char_length(reason) between 1 and 500),
  changed_by     uuid not null references public.profiles (id) on delete restrict,
  changed_at     timestamptz not null default now()
);

create index bill_due_date_audit_bill_idx on public.bill_due_date_audit (bill_id, changed_at desc);
alter table public.bill_due_date_audit enable row level security;
revoke all on public.bill_due_date_audit from anon, authenticated;
grant select on public.bill_due_date_audit to authenticated;
create policy "bill due audit: landlord reads"
  on public.bill_due_date_audit for select to authenticated
  using ((select public.is_landlord()));

create function public.override_bill_due_date(p_bill_id uuid, p_due_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  perform public._assert_landlord();
  if p_due_date is null then
    raise exception 'A due date is required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'Give a reason for changing the due date (500 characters at most)'
      using errcode = '22023';
  end if;

  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.status = 'void' then
    raise exception 'Bill not found or voided' using errcode = 'P0002';
  end if;
  if p_due_date < v_bill.issue_date then
    raise exception 'The due date cannot be before the issue date' using errcode = '22023';
  end if;
  if p_due_date = v_bill.due_date then
    raise exception 'The due date is already set to that date' using errcode = '22023';
  end if;

  insert into public.bill_due_date_audit
    (bill_id, previous_date, new_date, reason, changed_by)
  values (p_bill_id, v_bill.due_date, p_due_date, btrim(p_reason), auth.uid());
  update public.bills set due_date = p_due_date where id = p_bill_id;
end;
$$;

revoke execute on function public.set_lease_occupants(uuid, smallint),
  public.set_water_rate(numeric, date),
  public.override_bill_due_date(uuid, date, text)
from public, anon;
grant execute on function public.set_lease_occupants(uuid, smallint),
  public.set_water_rate(numeric, date),
  public.override_bill_due_date(uuid, date, text)
to authenticated;

revoke execute on function public._validate_lease_occupants(),
  public._validate_room_capacity(),
  public._water_rate_schedule_immutable(),
  public._notification_meta(public.notification_type)
from public, anon, authenticated;
revoke execute on function public._sync_bill_utilities(uuid),
  public._generate_bills(date),
  public._finalize_bill(uuid, boolean)
from public, anon, authenticated;
