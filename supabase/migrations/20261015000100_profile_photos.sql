-- =============================================================================
-- Profile photos for the landlord and tenants.
-- Photos live in the private "avatars" bucket at "<user_id>/<file>". Each user
-- manages only their own photo; the landlord can see everyone's, tenants only
-- their own.
-- =============================================================================

alter table public.profiles
  add column avatar_path text constraint profiles_avatar_path_check check (
    avatar_path is null
    or (char_length(avatar_path) <= 200 and avatar_path like id::text || '/%')
  );

grant update (avatar_path) on public.profiles to authenticated;

-- Same view as before with avatar_path appended, so the landlord's lists can
-- show tenant photos.
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
  ), 0)::numeric(12,2) as deposit_balance,
  p.avatar_path
from public.profiles p
left join public.leases l on l.tenant_id = p.id and l.status = 'active'
left join public.rooms r on r.id = l.room_id
-- Only real tenants: invited ones. Stray dashboard-created users are excluded.
where p.role = 'tenant' and p.invited_at is not null;

-- Storage -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: user uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: user deletes own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner or landlord reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_landlord()))
  );
