-- =============================================================================
-- Read models for billing, payments and reports (Phases 3-6).
-- All views are security_invoker, so RLS on the underlying tables decides what
-- each caller sees: tenants get their own rows, the landlord gets everything.
-- =============================================================================

-- Today's date at the property, so "overdue" flips at local midnight.
create function public.property_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone timezone)::date from public.app_settings where id;
$$;

create view public.bill_overview
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
  (b.status in ('unpaid', 'partial') and b.due_date < public.property_today()) as is_overdue,
  coalesce((select count(*) from public.payments pm
            where pm.bill_id = b.id and pm.status = 'pending'), 0)::integer as pending_payments,
  coalesce((select sum(pm.amount) from public.payments pm
            where pm.bill_id = b.id and pm.status = 'pending'), 0)::numeric(12,2) as pending_amount
from public.bills b
join public.rooms r    on r.id = b.room_id
join public.profiles p on p.id = b.tenant_id;

create view public.payment_overview
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
  p.full_name as tenant_name
from public.payments pm
join public.bills b    on b.id = pm.bill_id
join public.rooms r    on r.id = b.room_id
join public.profiles p on p.id = pm.tenant_id;

-- One row per room for the monthly meter-reading grid: the reading already
-- saved for the period (if any) and the previous reading to start from.
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
  water_current        numeric
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
    mr.water_current
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
  ) prev on true;
$$;

revoke all on public.bill_overview, public.payment_overview from anon;
grant select on public.bill_overview, public.payment_overview to authenticated;
revoke execute on function public.property_today(), public.meter_reading_sheet(date) from public, anon;
grant execute on function public.property_today(), public.meter_reading_sheet(date) to authenticated;
