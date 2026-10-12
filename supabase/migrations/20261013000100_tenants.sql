-- =============================================================================
-- Phase 2: tenant management
--
--   * set_tenant_active: deactivate / reactivate a tenant account (the
--     manage-tenant edge function pairs this with an auth ban/unban).
--   * move_tenant: atomically end the current lease and start one in another room.
--   * Deposits are held per tenant (not per room), so a deposit follows the
--     tenant when they move rooms. The ledger rows still reference the lease
--     they were recorded against.
--   * tenant_overview: one row per invited tenant for the landlord's lists.
-- =============================================================================

-- New objects must not be reachable by anon by default. Supabase's default
-- privileges grant anon access to every new table/function in public.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- Accounts ------------------------------------------------------------------------
create function public.set_tenant_active(p_tenant_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_landlord();
  if not exists (select 1 from public.profiles where id = p_tenant_id and role = 'tenant') then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;
  if not p_active and exists (select 1 from public.leases where tenant_id = p_tenant_id and status = 'active') then
    raise exception 'End this tenant''s tenancy before deactivating the account' using errcode = '22023';
  end if;
  update public.profiles set is_active = p_active where id = p_tenant_id;
end;
$$;

-- Room moves -------------------------------------------------------------------------
-- The old lease ends the day before the move date. If the move falls mid-month
-- both rooms are billed that month; moving on the 1st avoids that.
create function public.move_tenant(
  p_lease_id     uuid,
  p_room_id      uuid,
  p_move_date    date,
  p_monthly_rent numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases;
begin
  perform public._assert_landlord();
  select * into v_lease from public.leases where id = p_lease_id and status = 'active' for update;
  if not found then
    raise exception 'Active lease not found' using errcode = 'P0002';
  end if;
  if v_lease.room_id = p_room_id then
    raise exception 'The tenant is already in this room' using errcode = '22023';
  end if;
  if p_move_date is null or p_move_date <= v_lease.start_date then
    raise exception 'The move date must be after the current lease start date (%)', v_lease.start_date
      using errcode = '22023';
  end if;

  update public.leases set status = 'ended', end_date = p_move_date - 1 where id = p_lease_id;
  return public.assign_tenant(v_lease.tenant_id, p_room_id, p_move_date, p_monthly_rent, null,
                              'Moved from previous room');
end;
$$;

-- Deposits, per tenant ----------------------------------------------------------
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
  v_id      uuid;
begin
  perform public._assert_landlord();
  select * into v_lease from public.leases where id = p_lease_id;
  if not found then
    raise exception 'Lease not found' using errcode = 'P0002';
  end if;
  -- Serialise concurrent deposit changes for this tenant.
  perform 1 from public.profiles where id = v_lease.tenant_id for update;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
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
  values (p_lease_id, v_lease.tenant_id, p_type, round(p_amount, 2), coalesce(p_date, current_date),
          nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

drop view public.deposit_balances;
create view public.deposit_balances
with (security_invoker = true)
as
select
  d.tenant_id,
  coalesce(sum(d.amount) filter (where d.type = 'received'), 0)::numeric(12,2)  as total_received,
  coalesce(sum(d.amount) filter (where d.type = 'deduction'), 0)::numeric(12,2) as total_deducted,
  coalesce(sum(d.amount) filter (where d.type = 'refund'), 0)::numeric(12,2)    as total_refunded,
  coalesce(sum(case when d.type = 'received' then d.amount else -d.amount end), 0)::numeric(12,2) as balance
from public.deposit_transactions d
group by d.tenant_id;

-- Tenant list read model ----------------------------------------------------------
create view public.tenant_overview
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
    where b.tenant_id = p.id and b.status in ('unpaid', 'partial')
  ), 0)::numeric(12,2) as outstanding_balance,
  coalesce((
    select sum(case when d.type = 'received' then d.amount else -d.amount end)
    from public.deposit_transactions d where d.tenant_id = p.id
  ), 0)::numeric(12,2) as deposit_balance
from public.profiles p
left join public.leases l on l.tenant_id = p.id and l.status = 'active'
left join public.rooms r on r.id = l.room_id
-- Only real tenants: invited ones. Stray dashboard-created users are excluded.
where p.role = 'tenant' and p.invited_at is not null;

-- Privileges for the new objects ------------------------------------------------
revoke all on public.deposit_balances, public.tenant_overview from anon;
grant select on public.deposit_balances, public.tenant_overview to authenticated;

revoke execute on function
  public.set_tenant_active(uuid, boolean),
  public.move_tenant(uuid, uuid, date, numeric),
  public.record_deposit_transaction(uuid, public.deposit_txn_type, numeric, date, text)
from public, anon;
grant execute on function
  public.set_tenant_active(uuid, boolean),
  public.move_tenant(uuid, uuid, date, numeric),
  public.record_deposit_transaction(uuid, public.deposit_txn_type, numeric, date, text)
to authenticated;
