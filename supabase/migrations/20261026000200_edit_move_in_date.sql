-- Landlords can correct the active tenancy's move-in date. Historical bills,
-- payments and deposit transaction dates remain as recorded; future bills use
-- the corrected anniversary through _generate_bills.
create function public.update_lease_start_date(p_lease_id uuid, p_start_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases;
begin
  perform public._assert_landlord();
  if p_start_date is null or not isfinite(p_start_date) then
    raise exception 'Choose a valid move-in date' using errcode = '22023';
  end if;

  select * into v_lease from public.leases
  where id = p_lease_id and status = 'active' for update;
  if not found then
    raise exception 'Active lease not found' using errcode = 'P0002';
  end if;
  if v_lease.end_date is not null and p_start_date > v_lease.end_date then
    raise exception 'Move-in date must be on or before the move-out date' using errcode = '22023';
  end if;

  -- Use the same room lock and same-day handover rules as assignments.
  perform 1 from public.rooms where id = v_lease.room_id for update;
  if exists (
    select 1 from public.leases l
    where l.room_id = v_lease.room_id and l.id <> v_lease.id
      and l.start_date < coalesce(v_lease.end_date, 'infinity'::date)
      and p_start_date < coalesce(l.end_date, 'infinity'::date)
  ) then
    raise exception 'This room already has a tenancy that overlaps these dates' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.leases l
    where l.tenant_id = v_lease.tenant_id and l.id <> v_lease.id
      and l.start_date < coalesce(v_lease.end_date, 'infinity'::date)
      and p_start_date < coalesce(l.end_date, 'infinity'::date)
  ) then
    raise exception 'This tenant already has a tenancy that overlaps these dates' using errcode = '23505';
  end if;

  update public.leases set start_date = p_start_date where id = v_lease.id;
end;
$$;

revoke all on function public.update_lease_start_date(uuid, date) from public, anon;
grant execute on function public.update_lease_start_date(uuid, date) to authenticated;
