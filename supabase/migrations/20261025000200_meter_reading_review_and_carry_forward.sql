-- Lower cumulative counters can be retained for review, but never billed as
-- negative use. Carry-forward uses finalized history only.

alter table public.electricity_meter_readings
  drop constraint electricity_meter_readings_check,
  add column reading_event text not null default 'normal'
    check (reading_event in ('normal', 'review', 'reset', 'replacement', 'rollover')),
  add column rollover_at numeric(12,2) check (rollover_at is null or rollover_at > 0);
revoke all on public.electricity_meter_readings from public, anon, authenticated;
grant select on public.electricity_meter_readings to authenticated;

create table public.electricity_meter_reading_audit (
  id          uuid primary key default gen_random_uuid(),
  reading_id  uuid not null references public.electricity_meter_readings (id) on delete restrict,
  room_id     uuid not null references public.rooms (id) on delete restrict,
  period      date not null,
  meter       text not null check (meter in ('aircon', 'outlet', 'light')),
  action      text not null check (action in ('recorded', 'corrected', 'reset', 'replacement', 'rollover', 'updated')),
  old_values  jsonb,
  new_values  jsonb not null,
  changed_by  uuid references public.profiles (id) on delete restrict,
  changed_at  timestamptz not null default now()
);
create index electricity_meter_reading_audit_room_period_idx
  on public.electricity_meter_reading_audit (room_id, period, changed_at desc);
alter table public.electricity_meter_reading_audit enable row level security;
revoke all on public.electricity_meter_reading_audit from public, anon, authenticated;
grant select on public.electricity_meter_reading_audit to authenticated;
create policy "electricity reading audit: billed tenant or landlord"
  on public.electricity_meter_reading_audit for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.bills b
      where b.room_id = electricity_meter_reading_audit.room_id
        and b.period = electricity_meter_reading_audit.period
        and b.tenant_id = (select auth.uid())
    )
  );

create function public._audit_electricity_meter_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := case new.reading_event
      when 'reset' then 'reset'
      when 'replacement' then 'replacement'
      when 'rollover' then 'rollover'
      else 'recorded'
    end;
    insert into public.electricity_meter_reading_audit
      (reading_id, room_id, period, meter, action, new_values, changed_by)
    values (
      new.id, new.room_id, new.period, new.meter, v_action,
      jsonb_build_object(
        'previous', new.previous, 'current', new.current,
        'reading_event', new.reading_event, 'rollover_at', new.rollover_at
      ), new.recorded_by
    );
    return new;
  end if;

  if (old.previous, old.current, old.reading_event, old.rollover_at)
       is not distinct from
     (new.previous, new.current, new.reading_event, new.rollover_at) then
    return new;
  end if;
  v_action := case
    when new.reading_event = 'reset' then 'reset'
    when new.reading_event = 'replacement' then 'replacement'
    when new.reading_event = 'rollover' then 'rollover'
    when old.previous is distinct from new.previous then 'corrected'
    else 'updated'
  end;
  insert into public.electricity_meter_reading_audit
    (reading_id, room_id, period, meter, action, old_values, new_values, changed_by)
  values (
    new.id, new.room_id, new.period, new.meter, v_action,
    jsonb_build_object(
      'previous', old.previous, 'current', old.current,
      'reading_event', old.reading_event, 'rollover_at', old.rollover_at
    ),
    jsonb_build_object(
      'previous', new.previous, 'current', new.current,
      'reading_event', new.reading_event, 'rollover_at', new.rollover_at
    ), new.recorded_by
  );
  return new;
end;
$$;
create trigger electricity_meter_readings_audit
  after insert or update on public.electricity_meter_readings
  for each row execute function public._audit_electricity_meter_reading();
revoke execute on function public._audit_electricity_meter_reading() from public, anon, authenticated;

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
    count(distinct emr.meter) filter (
      where emr.previous is not null and emr.current is not null and emr.reading_event <> 'review'
        and (emr.reading_event <> 'rollover'
          or (emr.rollover_at is not null and emr.rollover_at > emr.previous and emr.current < emr.previous))
        and (emr.reading_event = 'rollover' or emr.current >= emr.previous)
    ) = cardinality(v_meters),
    coalesce(sum(
      case emr.reading_event
        when 'rollover' then emr.rollover_at - emr.previous + emr.current
        else emr.current - emr.previous
      end
    ) filter (where emr.meter = 'aircon'), 0),
    coalesce(sum(
      case emr.reading_event
        when 'rollover' then emr.rollover_at - emr.previous + emr.current
        else emr.current - emr.previous
      end
    ) filter (where emr.meter = 'outlet'), 0),
    coalesce(sum(
      case emr.reading_event
        when 'rollover' then emr.rollover_at - emr.previous + emr.current
        else emr.current - emr.previous
      end
    ) filter (where emr.meter = 'light'), 0),
    string_agg(
      format('%s %s kWh', initcap(emr.meter),
        case emr.reading_event
          when 'rollover' then emr.rollover_at - emr.previous + emr.current
          else emr.current - emr.previous
        end),
      ', ' order by case emr.meter when 'aircon' then 1 when 'outlet' then 2 else 3 end
    ) filter (where emr.reading_event <> 'review')
  into v_complete, v_aircon, v_outlet, v_light, v_details
  from (
    select meter, previous, current, reading_event, rollover_at
    from public.electricity_meter_readings
    where room_id = v_bill.room_id and period = v_bill.period and meter = any(v_meters)
    union all
    select 'aircon', mr.electricity_previous, mr.electricity_current, 'normal', null
    from public.meter_readings mr
    where mr.room_id = v_bill.room_id and mr.period = v_bill.period
      and 'aircon' = any(v_meters)
      and not exists (
        select 1 from public.electricity_meter_readings emr
        where emr.room_id = mr.room_id and emr.period = mr.period and emr.meter = 'aircon'
      )
  ) emr;

  if cardinality(v_meters) > 0 and coalesce(v_complete, false) then
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

drop function public.meter_reading_sheet(date);
create function public.meter_reading_sheet(p_period date)
returns table (
  room_id uuid,
  room_number text,
  floor smallint,
  tenant_name text,
  is_billable boolean,
  reading_id uuid,
  electricity_previous numeric,
  electricity_current numeric,
  water_previous numeric,
  water_current numeric,
  bill_id uuid,
  bill_finalized boolean,
  electricity_meters text[],
  aircon_previous numeric,
  aircon_current numeric,
  aircon_reset boolean,
  outlet_previous numeric,
  outlet_current numeric,
  outlet_reset boolean,
  light_previous numeric,
  light_current numeric,
  light_reset boolean,
  aircon_event text,
  aircon_rollover_at numeric,
  outlet_event text,
  outlet_rollover_at numeric,
  light_event text,
  light_rollover_at numeric
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
    coalesce(ac.previous, mr.electricity_previous, prev.electricity_current),
    coalesce(ac.current, mr.electricity_current),
    coalesce(mr.water_previous, prev.water_current),
    mr.water_current,
    bl.id,
    coalesce(bl.finalized_at is not null, false),
    r.electricity_meters,
    coalesce(ac.previous, mr.electricity_previous, af.current),
    coalesce(ac.current, mr.electricity_current),
    coalesce(ac.meter_reset, false),
    coalesce(ot.previous, outlet_finalized.current),
    ot.current,
    coalesce(ot.meter_reset, false),
    coalesce(li.previous, lf.current),
    li.current,
    coalesce(li.meter_reset, false),
    coalesce(ac.reading_event, case when mr.electricity_current is not null then 'normal' end),
    ac.rollover_at,
    ot.reading_event,
    ot.rollover_at,
    li.reading_event,
    li.rollover_at
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
    select em.current from public.electricity_meter_readings em
    join public.bills b on b.room_id = em.room_id and b.period = em.period
      and b.finalized_at is not null and b.status <> 'void'
    where em.room_id = r.id and em.period < per.p and em.meter = 'aircon'
      and em.reading_event <> 'review'
    order by em.period desc limit 1
  ) af on true
  left join lateral (
    select em.current from public.electricity_meter_readings em
    join public.bills b on b.room_id = em.room_id and b.period = em.period
      and b.finalized_at is not null and b.status <> 'void'
    where em.room_id = r.id and em.period < per.p and em.meter = 'outlet'
      and em.reading_event <> 'review'
    order by em.period desc limit 1
  ) outlet_finalized on true
  left join lateral (
    select em.current from public.electricity_meter_readings em
    join public.bills b on b.room_id = em.room_id and b.period = em.period
      and b.finalized_at is not null and b.status <> 'void'
    where em.room_id = r.id and em.period < per.p and em.meter = 'light'
      and em.reading_event <> 'review'
    order by em.period desc limit 1
  ) lf on true
  left join lateral (
    select m.electricity_current, m.water_current from public.meter_readings m
    join public.bills b on b.room_id = m.room_id and b.period = m.period
      and b.finalized_at is not null and b.status <> 'void'
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
  v_rollover_at numeric(12,2);
  v_event text;
  v_reset boolean;
  v_water_previous numeric(12,2);
  v_water_current numeric(12,2);
  v_next_legacy public.meter_readings;
  v_finalized_previous numeric(12,2);
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
           or nullif(v_row ->> (v_meter || '_event'), '') is not null
           or coalesce((v_row ->> (v_meter || '_reset'))::boolean, false) then
          raise exception 'Room %: % is not configured as an electricity meter', v_room, initcap(v_meter)
            using errcode = '22023';
        end if;
        continue;
      end if;

      foreach v_key in array array[
        v_meter || '_previous', v_meter || '_current', v_meter || '_rollover_at'
      ]
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

      select em.* into v_prev from public.electricity_meter_readings em
      join public.bills b on b.room_id = em.room_id and b.period = em.period
        and b.finalized_at is not null and b.status <> 'void'
      where em.room_id = v_room_id and em.period < v_period and em.meter = v_meter
        and em.reading_event <> 'review'
      order by em.period desc limit 1;
      select * into v_next from public.electricity_meter_readings
        where room_id = v_room_id and period > v_period and meter = v_meter
        order by period limit 1;
      select * into v_existing from public.electricity_meter_readings
        where room_id = v_room_id and period = v_period and meter = v_meter;
      v_key := v_meter || '_previous';
      v_value_previous := coalesce((v_row ->> v_key)::numeric, v_existing.previous, v_prev.current);
      v_key := v_meter || '_current';
      v_value_current := coalesce((v_row ->> v_key)::numeric, v_existing.current);
      v_key := v_meter || '_rollover_at';
      v_rollover_at := (v_row ->> v_key)::numeric;
      if v_row ? v_key then
        v_rollover_at := coalesce(v_rollover_at, v_existing.rollover_at);
      else
        v_rollover_at := v_existing.rollover_at;
      end if;
      v_key := v_meter || '_event';
      v_event := coalesce(nullif(v_row ->> v_key, ''), v_existing.reading_event, 'normal');
      if v_event not in ('normal', 'review', 'reset', 'replacement', 'rollover') then
        raise exception 'Room %: unsupported % reading action', v_room, initcap(v_meter) using errcode = '22023';
      end if;
      v_key := v_meter || '_reset';
      if coalesce((v_row ->> v_key)::boolean, false) then
        v_event := 'reset';
      end if;
      if v_value_current is not null and v_value_previous is null then
        select em.current into v_finalized_previous
        from public.electricity_meter_readings em
        join public.bills b on b.room_id = em.room_id and b.period = em.period
          and b.finalized_at is not null and b.status <> 'void'
        where em.room_id = v_room_id and em.period < v_period and em.meter = v_meter
          and em.reading_event <> 'review'
        order by em.period desc limit 1;
        v_value_previous := v_finalized_previous;
      end if;
      if v_value_current is not null and v_value_previous is not null and v_value_current < v_value_previous then
        if v_event not in ('reset', 'replacement', 'rollover') then
          v_event := 'review';
        elsif v_event = 'rollover' then
          if v_rollover_at is null or v_rollover_at <= v_value_previous or v_rollover_at <= v_value_current then
            raise exception 'Room %: enter a rollover maximum greater than both readings', v_room using errcode = '22023';
          end if;
        else
          raise exception 'Room %: set the previous reading to the new meter starting value; consumption cannot be negative.',
            v_room using errcode = '22023';
        end if;
      elsif v_event = 'rollover' then
        raise exception 'Room %: rollover is only valid when the current reading is below the previous reading.',
          v_room using errcode = '22023';
      elsif v_event = 'review' and v_value_current is not null and v_value_previous is not null
            and v_value_current >= v_value_previous then
        v_event := 'normal';
        v_rollover_at := null;
      elsif v_event <> 'rollover' then
        v_rollover_at := null;
      end if;
      v_reset := v_event in ('reset', 'replacement');

      if v_value_current is not null and v_next.previous is not null
         and v_event not in ('review', 'rollover') and not v_next.meter_reset
         and v_value_current > v_next.previous then
        raise exception 'Room %: % reading is higher than the next reading starts from; correct that month first.',
          v_room, initcap(v_meter) using errcode = '22023';
      end if;
      if exists (
        select 1 from public.bills
        where room_id = v_room_id and period = v_period and status <> 'void' and finalized_at is not null
      ) and (v_value_previous, v_value_current, v_reset, v_event, v_rollover_at)
            is distinct from
            (v_existing.previous, v_existing.current, v_existing.meter_reset,
             v_existing.reading_event, v_existing.rollover_at) then
        raise exception 'Room %: the % bill is already finalized. Reopen it to change this reading.',
          v_room, to_char(v_period, 'FMMonth YYYY') using errcode = '22023';
      end if;

      insert into public.electricity_meter_readings
        (room_id, period, meter, previous, current, meter_reset, reading_event, rollover_at, recorded_by)
      values (v_room_id, v_period, v_meter, v_value_previous, v_value_current,
        v_reset, v_event, v_rollover_at, public.current_profile_id())
      on conflict (room_id, period, meter) do update
        set previous = excluded.previous,
            current = excluded.current,
            meter_reset = excluded.meter_reset,
            reading_event = excluded.reading_event,
            rollover_at = excluded.rollover_at,
            recorded_by = excluded.recorded_by;
    end loop;

    if exists (select 1 from public.bills
               where room_id = v_room_id and period = v_period and status <> 'void' and finalized_at is not null)
       and (v_water_previous, v_water_current) is distinct from
           (v_legacy.water_previous, v_legacy.water_current) then
      raise exception 'Room %: the % bill is already finalized. Reopen it to change this reading.',
        v_room, to_char(v_period, 'FMMonth YYYY') using errcode = '22023';
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

revoke execute on function public.record_room_readings(date, jsonb) from public, anon;
grant execute on function public.record_room_readings(date, jsonb) to authenticated;
revoke execute on function public.meter_reading_sheet(date) from public, anon;
grant execute on function public.meter_reading_sheet(date) to authenticated;
