-- Three independently configured electricity meters per room. Legacy readings
-- remain in meter_readings and are copied to Aircon without altering history.

alter table public.rooms
  add column electricity_meters text[] not null default array['aircon', 'outlet', 'light'],
  add constraint rooms_electricity_meters_valid
    check (electricity_meters <@ array['aircon', 'outlet', 'light']::text[]);

-- Existing rooms had one shared meter. Keep their behavior by assigning that
-- meter to Aircon; landlords can opt into the other meters room by room.
update public.rooms set electricity_meters = array['aircon'];

create table public.electricity_meter_readings (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms (id) on delete restrict,
  period        date not null check (extract(day from period) = 1),
  meter         text not null check (meter in ('aircon', 'outlet', 'light')),
  previous      numeric(12,2) check (previous >= 0),
  current       numeric(12,2) check (current >= 0),
  meter_reset   boolean not null default false,
  recorded_by   uuid references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (room_id, period, meter),
  check (current is null or previous is null or current >= previous),
  check (not meter_reset or (previous is not null and current is not null))
);

create index electricity_meter_readings_room_period_idx
  on public.electricity_meter_readings (room_id, period desc);
create trigger electricity_meter_readings_updated_at
  before update on public.electricity_meter_readings
  for each row execute function public.set_updated_at();

alter table public.electricity_meter_readings enable row level security;
grant select on public.electricity_meter_readings to authenticated;
create policy "electricity readings: billed tenant or landlord"
  on public.electricity_meter_readings for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.bills b
      where b.room_id = electricity_meter_readings.room_id
        and b.period = electricity_meter_readings.period
        and b.tenant_id = (select auth.uid())
    )
  );

insert into public.electricity_meter_readings
  (room_id, period, meter, previous, current, recorded_by, created_at, updated_at)
select room_id, period, 'aircon', electricity_previous, electricity_current, recorded_by, created_at, updated_at
from public.meter_readings
where electricity_previous is not null or electricity_current is not null
on conflict (room_id, period, meter) do nothing;

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
  v_meters     text[];
  v_details    text;
  v_qty        numeric(12,2);
  v_aircon     numeric(12,2);
  v_outlet     numeric(12,2);
  v_light      numeric(12,2);
  v_complete   boolean;
  v_water_rate numeric(12,2);
  v_occupants  smallint;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found or v_bill.status = 'void' or v_bill.finalized_at is not null then
    return;
  end if;

  select * into v_settings from public.app_settings where id;
  select * into v_reading from public.meter_readings
    where room_id = v_bill.room_id and period = v_bill.period;
  select electricity_meters into v_meters from public.rooms where id = v_bill.room_id;

  select
    count(distinct emr.meter) filter (where emr.previous is not null and emr.current is not null)
      = cardinality(v_meters),
    coalesce(sum(emr.current - emr.previous) filter (where emr.meter = 'aircon'), 0),
    coalesce(sum(emr.current - emr.previous) filter (where emr.meter = 'outlet'), 0),
    coalesce(sum(emr.current - emr.previous) filter (where emr.meter = 'light'), 0),
    string_agg(
      format('%s %s kWh', initcap(emr.meter), emr.current - emr.previous),
      ', ' order by case emr.meter when 'aircon' then 1 when 'outlet' then 2 else 3 end
    )
  into v_complete, v_aircon, v_outlet, v_light, v_details
  from (
    select meter, previous, current
    from public.electricity_meter_readings
    where room_id = v_bill.room_id and period = v_bill.period and meter = any(v_meters)
    union all
    select 'aircon', mr.electricity_previous, mr.electricity_current
    from public.meter_readings mr
    where mr.room_id = v_bill.room_id and mr.period = v_bill.period
      and 'aircon' = any(v_meters)
      and not exists (
        select 1 from public.electricity_meter_readings emr
        where emr.room_id = mr.room_id and emr.period = mr.period and emr.meter = 'aircon'
      )
  ) emr;

  if cardinality(v_meters) > 0 and v_complete then
    v_qty := v_aircon + v_outlet + v_light;
    insert into public.bill_items as bi
      (bill_id, kind, description, quantity, unit_price, amount, meter_reading_id, sort_order)
    values (
      p_bill_id, 'electricity',
      format('Electricity: %s; Total %s kWh', v_details, v_qty),
      v_qty, v_settings.electricity_rate, round(v_qty * v_settings.electricity_rate, 2),
      v_reading.id, 1
    )
    on conflict (bill_id, kind) where kind <> 'other' do update
      set description = excluded.description,
          quantity = excluded.quantity,
          unit_price = excluded.unit_price,
          amount = round(excluded.quantity * excluded.unit_price, 2),
          meter_reading_id = excluded.meter_reading_id;
  else
    delete from public.bill_items where bill_id = p_bill_id and kind = 'electricity';
  end if;

  select l.occupant_count into v_occupants from public.leases l where l.id = v_bill.lease_id;
  select wr.monthly_rate into v_water_rate
  from public.water_rate_schedule wr
  where wr.effective_from <= v_bill.issue_date
  order by wr.effective_from desc limit 1;
  if v_water_rate is null then
    raise exception 'No water rate is configured for bill #%s', v_bill.bill_number using errcode = '22023';
  end if;
  insert into public.bill_items as bi
    (bill_id, kind, description, quantity, unit_price, amount, sort_order)
  values (
    p_bill_id, 'water',
    format('Water: %s %s × %s per person / month',
      v_occupants, case when v_occupants = 1 then 'occupant' else 'occupants' end,
      public._fmt_money(v_water_rate)),
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
    case when exists (
           select 1 from public.bills b join public.rooms r on r.id = b.room_id
           where b.id = p_bill_id and cardinality(r.electricity_meters) > 0
         )
         and not exists (select 1 from public.bill_items where bill_id = p_bill_id and kind = 'electricity')
      then 'electricity' end,
    case when (s.water_billing_mode = 'metered' or s.water_flat_fee > 0)
          and not exists (select 1 from public.bill_items where bill_id = p_bill_id and kind = 'water')
      then 'water' end
  ], null)
  from public.app_settings s
  where s.id;
$$;

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
  bill_finalized       boolean,
  electricity_meters   text[],
  aircon_previous      numeric,
  aircon_current       numeric,
  aircon_reset         boolean,
  outlet_previous      numeric,
  outlet_current       numeric,
  outlet_reset         boolean,
  light_previous       numeric,
  light_current        numeric,
  light_reset          boolean
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
    case when ac.id is not null then ac.previous
      else coalesce(mr.electricity_previous, prev.electricity_current) end,
    case when ac.id is not null then ac.current else mr.electricity_current end,
    coalesce(mr.water_previous, prev.water_current),
    mr.water_current,
    bl.id,
    coalesce(bl.finalized_at is not null, false),
    r.electricity_meters,
    case when ac.id is not null then ac.previous
      else coalesce(mr.electricity_previous, prev.electricity_current) end,
    case when ac.id is not null then ac.current else mr.electricity_current end,
    coalesce(ac.meter_reset, false),
    coalesce(ot.previous, case when 'outlet' = any(r.electricity_meters) then op.current end),
    ot.current,
    coalesce(ot.meter_reset, false),
    coalesce(li.previous, case when 'light' = any(r.electricity_meters) then lp.current end),
    li.current,
    coalesce(li.meter_reset, false)
  from public.rooms r
  cross join per
  left join lateral (
    select l.id, l.tenant_id from public.leases l
    where l.room_id = r.id and l.start_date <= per.p_end and (l.status = 'active' or l.end_date >= per.p)
    order by l.start_date desc limit 1
  ) l on true
  left join public.profiles pr on pr.id = l.tenant_id
  left join public.meter_readings mr on mr.room_id = r.id and mr.period = per.p
  left join public.electricity_meter_readings ac
    on ac.room_id = r.id and ac.period = per.p and ac.meter = 'aircon'
  left join public.electricity_meter_readings ot
    on ot.room_id = r.id and ot.period = per.p and ot.meter = 'outlet'
  left join public.electricity_meter_readings li
    on li.room_id = r.id and li.period = per.p and li.meter = 'light'
  left join lateral (
    select current from public.electricity_meter_readings
    where room_id = r.id and period < per.p and meter = 'outlet'
    order by period desc limit 1
  ) op on true
  left join lateral (
    select current from public.electricity_meter_readings
    where room_id = r.id and period < per.p and meter = 'light'
    order by period desc limit 1
  ) lp on true
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

create or replace function public.record_room_readings(p_period date, p_readings jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_row jsonb;
  v_room_id uuid;
  v_room text;
  v_meters text[];
  v_meter text;
  v_prev public.electricity_meter_readings;
  v_next public.electricity_meter_readings;
  v_existing public.electricity_meter_readings;
  v_legacy public.meter_readings;
  v_value_previous numeric(12,2);
  v_value_current numeric(12,2);
  v_reset boolean;
  v_water_previous numeric(12,2);
  v_water_current numeric(12,2);
  v_next_legacy public.meter_readings;
  v_key text;
  v_bill_id uuid;
  v_count integer := 0;
begin
  perform public._assert_landlord();
  if p_period is null or jsonb_typeof(p_readings) is distinct from 'array' then
    raise exception 'A period and a list of readings are required' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_readings)) <>
     (select count(distinct value ->> 'room_id') from jsonb_array_elements(p_readings)) then
    raise exception 'A room can only appear once in the readings list' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_readings)
  loop
    begin
      v_room_id := (v_row ->> 'room_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Unknown room %', v_row ->> 'room_id' using errcode = 'P0002';
    end;
    select room_number, electricity_meters into v_room, v_meters
    from public.rooms where id = v_room_id;
    if not found then
      raise exception 'Unknown room %', v_room_id using errcode = 'P0002';
    end if;
    select * into v_legacy from public.meter_readings
      where room_id = v_room_id and period = v_period;
    select * into v_next_legacy from public.meter_readings
      where room_id = v_room_id and period > v_period order by period limit 1;
    v_water_current := coalesce((v_row ->> 'water_current')::numeric, v_legacy.water_current);
    v_water_previous := coalesce((v_row ->> 'water_previous')::numeric, v_legacy.water_previous,
      (select water_current from public.meter_readings
       where room_id = v_room_id and period < v_period order by period desc limit 1));

    foreach v_key in array array['water_previous', 'water_current']
    loop
      if v_row ? v_key and jsonb_typeof(v_row -> v_key) not in ('number', 'string', 'null') then
        raise exception 'Room %: % must be a number', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
      if jsonb_typeof(v_row -> v_key) = 'string'
         and (v_row ->> v_key) !~ '^\s*[0-9]+(\.[0-9]{1,2})?\s*$' then
        raise exception 'Room %: % must be a number', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
      if (v_row ->> v_key)::numeric < 0 then
        raise exception 'Room %: % cannot be negative', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
    end loop;
    if v_water_current is not null and v_water_previous is not null and v_water_current < v_water_previous then
      raise exception 'Room %: water reading % is lower than previous %', v_room, v_water_current, v_water_previous using errcode = '22023';
    end if;
    if v_water_current is not null and v_next_legacy.water_previous is not null
       and v_water_current > v_next_legacy.water_previous then
      raise exception 'Room %: water reading is higher than the next reading starts from; correct that month first.',
        v_room using errcode = '22023';
    end if;

    foreach v_meter in array array['aircon', 'outlet', 'light']
    loop
      if not v_meter = any(v_meters) then
        if nullif(v_row ->> (v_meter || '_previous'), '') is not null
           or nullif(v_row ->> (v_meter || '_current'), '') is not null
           or coalesce((v_row ->> (v_meter || '_reset'))::boolean, false) then
          raise exception 'Room %: % is not configured as an electricity meter', v_room, initcap(v_meter)
            using errcode = '22023';
        end if;
        continue;
      end if;
      v_key := v_meter || '_previous';
      if v_row ? v_key and jsonb_typeof(v_row -> v_key) not in ('number', 'string', 'null') then
        raise exception 'Room %: % must be a number', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
      if jsonb_typeof(v_row -> v_key) = 'string' and (v_row ->> v_key) !~ '^\s*[0-9]+(\.[0-9]{1,2})?\s*$' then
        raise exception 'Room %: % must be a number', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
      v_key := v_meter || '_current';
      if v_row ? v_key and jsonb_typeof(v_row -> v_key) not in ('number', 'string', 'null') then
        raise exception 'Room %: % must be a number', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
      if jsonb_typeof(v_row -> v_key) = 'string' and (v_row ->> v_key) !~ '^\s*[0-9]+(\.[0-9]{1,2})?\s*$' then
        raise exception 'Room %: % must be a number', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
      v_key := v_meter || '_reset';
      if v_row ? v_key and jsonb_typeof(v_row -> v_key) <> 'boolean' then
        raise exception 'Room %: % must be true or false', v_room, replace(v_key, '_', ' ') using errcode = '22023';
      end if;
      v_reset := coalesce((v_row ->> v_key)::boolean, false);

      select * into v_prev from public.electricity_meter_readings
        where room_id = v_room_id and period < v_period and meter = v_meter
        order by period desc limit 1;
      select * into v_next from public.electricity_meter_readings
        where room_id = v_room_id and period > v_period and meter = v_meter
        order by period limit 1;
      select * into v_existing from public.electricity_meter_readings
        where room_id = v_room_id and period = v_period and meter = v_meter;
      v_key := v_meter || '_previous';
      v_value_previous := coalesce((v_row ->> v_key)::numeric, v_existing.previous, v_prev.current);
      v_key := v_meter || '_current';
      v_value_current := (v_row ->> v_key)::numeric;

      if v_reset and (v_value_previous is null or v_value_current is null) then
        raise exception 'Room %: enter both readings when marking a meter reset or replacement', v_room using errcode = '22023';
      end if;
      if v_value_current is not null and v_value_previous is not null and v_value_current < v_value_previous then
        raise exception 'Room %: % reading % is lower than previous %; enable reset/replacement and enter its starting reading.',
          v_room, initcap(v_meter), v_value_current, v_value_previous using errcode = '22023';
      end if;
      if not v_reset and v_value_current is not null and v_next.previous is not null
         and not v_next.meter_reset and v_value_current > v_next.previous then
        raise exception 'Room %: % reading is higher than the next reading starts from; correct that month first.',
          v_room, initcap(v_meter) using errcode = '22023';
      end if;

      if exists (select 1 from public.bills
                 where room_id = v_room_id and period = v_period and status <> 'void' and finalized_at is not null)
         and (v_value_previous, v_value_current, v_reset) is distinct from
             (v_existing.previous, v_existing.current, v_existing.meter_reset) then
        raise exception 'Room %: the % bill is already finalized. Reopen it to change this reading.',
          v_room, to_char(v_period, 'FMMonth YYYY') using errcode = '22023';
      end if;

      insert into public.electricity_meter_readings
        (room_id, period, meter, previous, current, meter_reset, recorded_by)
      values (v_room_id, v_period, v_meter, v_value_previous, v_value_current, v_reset, public.current_profile_id())
      on conflict (room_id, period, meter) do update
        set previous = excluded.previous, current = excluded.current,
            meter_reset = excluded.meter_reset, recorded_by = excluded.recorded_by;
    end loop;

    if exists (select 1 from public.bills
               where room_id = v_room_id and period = v_period and status <> 'void' and finalized_at is not null)
       and (v_water_previous, v_water_current) is distinct from
           (v_legacy.water_previous, v_legacy.water_current) then
      raise exception 'Room %: the % bill is already finalized. Reopen it to change this reading.',
        v_room, to_char(v_period, 'FMMonth YYYY') using errcode = '22023';
    end if;
    if v_water_current is not null and v_next_legacy.water_previous is not null
       and v_water_current > v_next_legacy.water_previous then
      raise exception 'Room %: water reading is higher than the next reading starts from; correct that month first.',
        v_room using errcode = '22023';
    end if;

    insert into public.meter_readings
      (room_id, period, electricity_previous, electricity_current, water_previous, water_current, recorded_by)
    values (v_room_id, v_period, v_legacy.electricity_previous, v_legacy.electricity_current,
            v_water_previous, v_water_current, public.current_profile_id())
    on conflict (room_id, period) do update
      set electricity_previous = public.meter_readings.electricity_previous,
          electricity_current = public.meter_readings.electricity_current,
          water_previous = excluded.water_previous,
          water_current = excluded.water_current,
          recorded_by = excluded.recorded_by;

    for v_bill_id in select id from public.bills
      where room_id = v_room_id and period = v_period and status <> 'void' and finalized_at is null
    loop
      perform public._sync_bill_utilities(v_bill_id);
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Reset periods deliberately break continuity with the previous meter counter.
create or replace function public._electricity_room_config_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_bill_id uuid;
begin
  if new.electricity_meters is not distinct from old.electricity_meters then return new; end if;
  for v_bill_id in select id from public.bills where room_id = new.id and finalized_at is null and status <> 'void'
  loop perform public._sync_bill_utilities(v_bill_id); end loop;
  return new;
end;
$$;
create trigger rooms_electricity_config_changed
  after update of electricity_meters on public.rooms
  for each row execute function public._electricity_room_config_changed();

create or replace function public._electricity_rate_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_bill_id uuid;
begin
  if new.electricity_rate is not distinct from old.electricity_rate then return new; end if;
  for v_bill_id in select id from public.bills where finalized_at is null and status <> 'void'
  loop perform public._sync_bill_utilities(v_bill_id); end loop;
  return new;
end;
$$;
create trigger app_settings_electricity_rate_changed
  after update of electricity_rate on public.app_settings
  for each row execute function public._electricity_rate_changed();

revoke execute on function public._electricity_room_config_changed(), public._electricity_rate_changed()
  from public, anon, authenticated;
revoke execute on function public.record_room_readings(date, jsonb) from public, anon;
grant execute on function public.record_room_readings(date, jsonb) to authenticated;
revoke execute on function public.meter_reading_sheet(date) from public, anon;
grant execute on function public.meter_reading_sheet(date) to authenticated;
