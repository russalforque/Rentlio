-- =============================================================================
-- Tenant accounts: manual tenants, self-registration and landlord approval.
--
-- Identity model
--   * A tenant RECORD (profiles row) and a LOGIN (auth.users row) are now
--     separate. profiles.user_id links them, and is unique, so one login maps
--     to at most one record and one record to at most one login.
--   * Manual tenants have a record but no login (user_id is null).
--   * Every new login that is not the landlord starts as a PENDING
--     registration request with no record and therefore no data access.
--     A login gains tenant access only when the landlord approves it (linking
--     an existing record or creating a new one), or when it was created by the
--     invite-tenant edge function for a specific record.
--   * Rental data is reachable only through current_tenant_id(), which
--     resolves to a record only for a linked, active, unsuspended tenant.
--     Pending, rejected and suspended users therefore see nothing, whatever
--     the frontend does.
--   * The landlord's record keeps id = user_id (enforced below), so the
--     existing auth.uid() audit columns (recorded_by, reviewed_by, ...) stay
--     valid.
-- =============================================================================

create type public.registration_status as enum ('pending', 'approved', 'rejected');
create type public.registration_source as enum ('self_signup', 'invitation');
-- How the landlord confirmed who the applicant is before approving.
create type public.identity_check      as enum ('existing_record', 'in_person', 'invitation');
create type public.account_event       as enum (
  'login_created', 'email_verified', 'registration_approved', 'registration_rejected',
  'account_linked', 'portal_invited', 'manual_tenant_created', 'account_suspended', 'account_unsuspended'
);

-- Profiles: records without logins --------------------------------------------------
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

alter table public.profiles
  add column user_id uuid references auth.users (id) on delete restrict,
  add column suspended_at timestamptz,
  add column suspension_reason text check (suspension_reason is null or char_length(suspension_reason) <= 500);

-- Existing profiles were all keyed by their login.
update public.profiles set user_id = id;

alter table public.profiles add constraint profiles_user_id_key unique (user_id);
alter table public.profiles
  add constraint profiles_landlord_login check (role <> 'landlord' or user_id = id),
  add constraint profiles_suspension_needs_login check (suspended_at is null or user_id is not null);

alter table public.profiles alter column email drop not null;
update public.profiles set email = null where btrim(email) = '';
alter table public.profiles
  add constraint profiles_email_check check (email is null or char_length(email) between 3 and 320);
create unique index profiles_email_key on public.profiles (lower(email)) where email is not null;

-- Registration requests ----------------------------------------------------------
create table public.registration_requests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  email              text not null check (char_length(email) between 3 and 320),
  full_name          text not null default '' check (char_length(full_name) <= 120),
  phone              text check (phone is null or char_length(phone) <= 40),
  requested_room     text check (requested_room is null or char_length(requested_room) <= 20),
  source             public.registration_source not null default 'self_signup',
  status             public.registration_status not null default 'pending',
  email_verified_at  timestamptz,
  tenant_id          uuid references public.profiles (id) on delete restrict,
  identity_check     public.identity_check,
  review_note        text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by        uuid references public.profiles (id) on delete restrict,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint registration_requests_user_key unique (user_id),
  check (status = 'pending' or reviewed_at is not null),
  check (status <> 'approved' or (tenant_id is not null and identity_check is not null)),
  check (status <> 'rejected' or review_note is not null)
);
-- One open request per email address.
create unique index registration_requests_pending_email
  on public.registration_requests (lower(email)) where status = 'pending';
create index registration_requests_status_idx on public.registration_requests (status, created_at desc);

create trigger registration_requests_updated_at before update on public.registration_requests
  for each row execute function public.set_updated_at();

-- Audit log (append-only) ----------------------------------------------------------
create table public.account_audit_log (
  id          bigint generated always as identity primary key,
  event       public.account_event not null,
  actor_id    uuid,              -- auth user who acted; null for system events
  request_id  uuid references public.registration_requests (id) on delete set null,
  tenant_id   uuid references public.profiles (id) on delete restrict,
  user_id     uuid,              -- login affected; kept even if the login is deleted
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index account_audit_log_tenant_idx  on public.account_audit_log (tenant_id, created_at desc);
create index account_audit_log_request_idx on public.account_audit_log (request_id, created_at desc);

create function public._audit(
  p_event      public.account_event,
  p_request_id uuid,
  p_tenant_id  uuid,
  p_user_id    uuid,
  p_details    jsonb default '{}'::jsonb,
  p_actor_id   uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.account_audit_log (event, actor_id, request_id, tenant_id, user_id, details)
  values (p_event, coalesce(p_actor_id, auth.uid()), p_request_id, p_tenant_id, p_user_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Identity helpers ----------------------------------------------------------------
create or replace function public.is_landlord()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'landlord' and is_active
  );
$$;

/** The caller's tenant record, only while it may use the portal. */
create function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles
  where user_id = auth.uid() and role = 'tenant' and is_active and suspended_at is null;
$$;

/** The caller's own record (any role, any state). */
create function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles where user_id = auth.uid();
$$;

-- Returns the caller's record id if it is active and not suspended.
create or replace function public._assert_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiles
  where user_id = auth.uid() and is_active and suspended_at is null;
  if v_id is null then
    raise exception 'Your account is not active' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

create or replace function public.mark_account_activated()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set activated_at = now()
  where user_id = auth.uid() and activated_at is null;
$$;

-- New logins ------------------------------------------------------------------------
-- No login becomes a landlord or tenant on its own. Self-registration metadata
-- (name, phone, requested room) is stored as an unverified claim for review.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_request_id uuid;
begin
  insert into public.registration_requests (user_id, email, full_name, phone, requested_room, email_verified_at)
  values (
    new.id,
    lower(btrim(coalesce(new.email, ''))),
    left(btrim(coalesce(v_meta ->> 'full_name', '')), 120),
    nullif(left(btrim(coalesce(v_meta ->> 'phone', '')), 40), ''),
    nullif(left(btrim(coalesce(v_meta ->> 'requested_room', '')), 20), ''),
    new.email_confirmed_at
  )
  returning id into v_request_id;
  perform public._audit('login_created', v_request_id, null, new.id, '{}'::jsonb, new.id);
  return new;
end;
$$;

create function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  update public.registration_requests set email_verified_at = new.email_confirmed_at
  where user_id = new.id and email_verified_at is null
  returning id into v_request_id;
  if v_request_id is not null then
    perform public._audit('email_verified', v_request_id, null, new.id, '{}'::jsonb, new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_email_confirmed();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = nullif(lower(btrim(coalesce(new.email, ''))), '') where user_id = new.id;
  update public.registration_requests set email = lower(btrim(coalesce(new.email, '')))
  where user_id = new.id and status = 'pending';
  return new;
end;
$$;

-- One-time setup: make an existing login the landlord. Run from the SQL editor
-- (service role only), once, after creating the landlord in Auth.
create function public.bootstrap_landlord(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users;
begin
  if exists (select 1 from public.profiles where role = 'landlord') then
    raise exception 'A landlord account already exists' using errcode = '23505';
  end if;
  select * into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if not found then
    raise exception 'No login with email %', p_email using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles where user_id = v_user.id) then
    raise exception 'This login is already linked to a tenant record' using errcode = '23505';
  end if;
  delete from public.registration_requests where user_id = v_user.id;
  insert into public.profiles (id, user_id, role, full_name, email, activated_at)
  values (v_user.id, v_user.id, 'landlord',
          left(coalesce(v_user.raw_user_meta_data ->> 'full_name', ''), 120), lower(v_user.email), now());
  return v_user.id;
end;
$$;

-- Manual tenants -------------------------------------------------------------------
-- A tenant record with no login, optionally housed in the same transaction.
create function public.create_manual_tenant(
  p_full_name      text,
  p_phone          text default null,
  p_room_id        uuid default null,
  p_start_date     date default null,
  p_monthly_rent   numeric default null,
  p_deposit_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public._assert_landlord();
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'Enter the tenant name' using errcode = '22023';
  end if;
  if char_length(btrim(p_full_name)) > 120 then
    raise exception 'Name is too long' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_phone, ''))) > 40 then
    raise exception 'Phone number is too long' using errcode = '22023';
  end if;

  insert into public.profiles (role, full_name, phone)
  values ('tenant', btrim(p_full_name), nullif(btrim(p_phone), ''))
  returning id into v_id;

  if p_room_id is not null then
    perform public.assign_tenant(v_id, p_room_id, p_start_date, p_monthly_rent, p_deposit_amount, null);
  end if;

  perform public._audit('manual_tenant_created', null, v_id, null, jsonb_build_object('room_id', p_room_id));
  return v_id;
end;
$$;

-- Invitations (called only by the invite-tenant edge function, as service role) ----
-- Links a login the edge function has just created and invited, to an existing
-- record without a login, or to a new record. The login must be brand new and
-- unverified, so an older self-registration can never be attached this way.
create function public._link_invited_user(
  p_user_id   uuid,
  p_actor_id  uuid,
  p_tenant_id uuid default null,
  p_full_name text default null,
  p_phone     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.registration_requests;
  v_tenant  public.profiles;
  v_actor   uuid;
begin
  select id into v_actor from public.profiles
  where user_id = p_actor_id and role = 'landlord' and is_active;
  if v_actor is null then
    raise exception 'Only the landlord can invite tenants' using errcode = '42501';
  end if;

  select * into v_request from public.registration_requests where user_id = p_user_id for update;
  if not found or v_request.status <> 'pending' or v_request.email_verified_at is not null
     or v_request.created_at < now() - interval '15 minutes' then
    raise exception 'This login cannot be linked by invitation' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'This login is already linked to a tenant record' using errcode = '23505';
  end if;

  if p_tenant_id is not null then
    select * into v_tenant from public.profiles where id = p_tenant_id for update;
    if not found or v_tenant.role <> 'tenant' then
      raise exception 'Tenant not found' using errcode = 'P0002';
    end if;
    if v_tenant.user_id is not null then
      raise exception 'This tenant already has portal access' using errcode = '23505';
    end if;
    if not v_tenant.is_active then
      raise exception 'Reactivate this tenant before enabling portal access' using errcode = '22023';
    end if;
    update public.profiles
    set user_id = p_user_id, email = v_request.email, invited_at = now(), activated_at = null
    where id = p_tenant_id;
  else
    -- New record: keyed by the login id, like tenants invited before this change.
    insert into public.profiles (id, user_id, role, full_name, email, phone, invited_at)
    values (p_user_id, p_user_id, 'tenant',
            left(btrim(coalesce(p_full_name, v_request.full_name)), 120), v_request.email,
            nullif(left(btrim(coalesce(p_phone, '')), 40), ''), now())
    returning * into v_tenant;
  end if;

  update public.registration_requests
  set status = 'approved', source = 'invitation', identity_check = 'invitation',
      tenant_id = coalesce(p_tenant_id, v_tenant.id), reviewed_by = v_actor, reviewed_at = now()
  where id = v_request.id;

  perform public._audit('portal_invited', v_request.id, coalesce(p_tenant_id, v_tenant.id), p_user_id,
                        jsonb_build_object('existing_record', p_tenant_id is not null), p_actor_id);
  return coalesce(p_tenant_id, v_tenant.id);
end;
$$;

-- Registration review -------------------------------------------------------------
-- Approves a verified registration atomically: either links the login to an
-- existing tenant record that has none, or creates a new record. Never assigns
-- a room. The landlord must state how the applicant's identity was confirmed.
create function public.approve_registration(
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
    insert into public.profiles (id, user_id, role, full_name, email, phone, activated_at)
    values (v_request.user_id, v_request.user_id, 'tenant', v_request.full_name, v_request.email,
            v_request.phone, now())
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

create function public.reject_registration(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.registration_requests;
begin
  perform public._assert_landlord();
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for the rejection' using errcode = '22023';
  end if;
  if char_length(btrim(p_reason)) > 500 then
    raise exception 'The reason is too long' using errcode = '22023';
  end if;
  select * into v_request from public.registration_requests where id = p_request_id for update;
  if not found then
    raise exception 'Registration request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request was already %', v_request.status using errcode = '22023';
  end if;
  update public.registration_requests
  set status = 'rejected', review_note = btrim(p_reason),
      reviewed_by = public.current_profile_id(), reviewed_at = now()
  where id = p_request_id;
  perform public._audit('registration_rejected', p_request_id, null, v_request.user_id,
                        jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- Suspension blocks portal access but keeps the tenancy and billing running.
create function public.set_portal_suspended(p_tenant_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.profiles;
begin
  perform public._assert_landlord();
  select * into v_tenant from public.profiles where id = p_tenant_id for update;
  if not found or v_tenant.role <> 'tenant' then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;
  if v_tenant.user_id is null then
    raise exception 'This tenant has no portal access to suspend' using errcode = '22023';
  end if;
  if p_suspended then
    if v_tenant.suspended_at is not null then
      raise exception 'Portal access is already suspended' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Give a reason for the suspension' using errcode = '22023';
    end if;
    update public.profiles
    set suspended_at = now(), suspension_reason = left(btrim(p_reason), 500)
    where id = p_tenant_id;
    perform public._audit('account_suspended', null, p_tenant_id, v_tenant.user_id,
                          jsonb_build_object('reason', btrim(p_reason)));
  else
    if v_tenant.suspended_at is null then
      raise exception 'Portal access is not suspended' using errcode = '22023';
    end if;
    update public.profiles set suspended_at = null, suspension_reason = null where id = p_tenant_id;
    perform public._audit('account_unsuspended', null, p_tenant_id, v_tenant.user_id);
  end if;
end;
$$;

-- What a signed-in login without a record sees about its own registration.
create function public.my_registration()
returns table (
  status           public.registration_status,
  full_name        text,
  email            text,
  requested_room   text,
  submitted_at     timestamptz,
  email_verified   boolean,
  rejection_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.status, r.full_name, r.email, r.requested_room, r.created_at, r.email_verified_at is not null,
         case when r.status = 'rejected' then r.review_note end
  from public.registration_requests r
  where r.user_id = auth.uid();
$$;

-- Tenant list read model ---------------------------------------------------------------
-- Same columns as before (email may now be null) with portal state appended.
-- Lists manual tenants, invited tenants and approved registrations; logins
-- left over from before this change without an invitation stay hidden.
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
    where b.tenant_id = p.id and b.status in ('unpaid', 'partial')
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

-- Row level security: rental data only for the caller's own active record ----------
alter table public.registration_requests enable row level security;
alter table public.account_audit_log     enable row level security;

drop policy "profiles: read own or landlord reads all" on public.profiles;
create policy "profiles: read own or landlord reads all"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_landlord()));

drop policy "profiles: update own or landlord updates tenants" on public.profiles;
create policy "profiles: update own or landlord updates tenants"
  on public.profiles for update to authenticated
  using (id = (select public.current_tenant_id()) or (select public.is_landlord()))
  with check (id = (select public.current_tenant_id()) or (select public.is_landlord()));

-- Rates, payment instructions and house rules are rental information too.
drop policy "settings: read" on public.app_settings;
create policy "settings: landlord or tenant reads"
  on public.app_settings for select to authenticated
  using ((select public.is_landlord()) or (select public.current_tenant_id()) is not null);

drop policy "rooms: landlord reads all, tenant reads own rooms" on public.rooms;
create policy "rooms: landlord reads all, tenant reads own rooms"
  on public.rooms for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.leases l
      where l.room_id = rooms.id and l.tenant_id = (select public.current_tenant_id())
    )
  );

drop policy "room_beds: landlord reads all, tenant reads own rooms" on public.room_beds;
create policy "room_beds: landlord reads all, tenant reads own rooms"
  on public.room_beds for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.leases l
      where l.room_id = room_beds.room_id and l.tenant_id = (select public.current_tenant_id())
    )
  );

drop policy "bed_types: everyone reads" on public.bed_types;
create policy "bed_types: landlord or tenant reads"
  on public.bed_types for select to authenticated
  using ((select public.is_landlord()) or (select public.current_tenant_id()) is not null);

drop policy "leases: own or landlord" on public.leases;
create policy "leases: own or landlord"
  on public.leases for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_landlord()));

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
    )
  );

drop policy "bills: own or landlord" on public.bills;
create policy "bills: own or landlord"
  on public.bills for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_landlord()));

drop policy "bill_items: via own bill or landlord" on public.bill_items;
create policy "bill_items: via own bill or landlord"
  on public.bill_items for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.bills b
      where b.id = bill_items.bill_id and b.tenant_id = (select public.current_tenant_id())
    )
  );

drop policy "payments: own or landlord" on public.payments;
create policy "payments: own or landlord"
  on public.payments for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_landlord()));

drop policy "deposits: own or landlord" on public.deposit_transactions;
create policy "deposits: own or landlord"
  on public.deposit_transactions for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_landlord()));

drop policy "documents: own or landlord" on public.tenant_documents;
create policy "documents: own or landlord"
  on public.tenant_documents for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_landlord()));

create policy "registration_requests: landlord reads"
  on public.registration_requests for select to authenticated
  using ((select public.is_landlord()));

create policy "account_audit_log: landlord reads"
  on public.account_audit_log for select to authenticated
  using ((select public.is_landlord()));

-- Storage: folders are named after the tenant RECORD, not the login.
drop policy "payment-proofs: tenant uploads to own folder" on storage.objects;
create policy "payment-proofs: tenant uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
  );

drop policy "payment-proofs: owner or landlord reads" on storage.objects;
create policy "payment-proofs: owner or landlord reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = (select public.current_tenant_id())::text or (select public.is_landlord()))
  );

drop policy "tenant-documents: owner or landlord reads" on storage.objects;
create policy "tenant-documents: owner or landlord reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tenant-documents'
    and ((storage.foldername(name))[1] = (select public.current_tenant_id())::text or (select public.is_landlord()))
  );

drop policy "avatars: user uploads to own folder" on storage.objects;
create policy "avatars: user uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select public.current_profile_id())::text
  );

drop policy "avatars: user deletes own" on storage.objects;
create policy "avatars: user deletes own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select public.current_profile_id())::text
  );

drop policy "avatars: owner or landlord reads" on storage.objects;
create policy "avatars: owner or landlord reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select public.current_profile_id())::text or (select public.is_landlord()))
  );

-- Privileges (default deny: Supabase grants new objects to authenticated) ------------
revoke all on public.registration_requests, public.account_audit_log from public, anon, authenticated;
grant select on public.registration_requests, public.account_audit_log to authenticated;
revoke all on public.tenant_overview from anon;
grant select on public.tenant_overview to authenticated;

revoke execute on function
  public._audit(public.account_event, uuid, uuid, uuid, jsonb, uuid),
  public._link_invited_user(uuid, uuid, uuid, text, text),
  public.bootstrap_landlord(text),
  public.handle_new_user(),
  public.handle_user_email_confirmed(),
  public.handle_user_email_change()
from public, anon, authenticated;
grant execute on function public._link_invited_user(uuid, uuid, uuid, text, text) to service_role;

revoke execute on function
  public.current_tenant_id(),
  public.current_profile_id(),
  public.create_manual_tenant(text, text, uuid, date, numeric, numeric),
  public.approve_registration(uuid, uuid, public.identity_check, text),
  public.reject_registration(uuid, text),
  public.set_portal_suspended(uuid, boolean, text),
  public.my_registration()
from public, anon;
grant execute on function
  public.current_tenant_id(),
  public.current_profile_id(),
  public.create_manual_tenant(text, text, uuid, date, numeric, numeric),
  public.approve_registration(uuid, uuid, public.identity_check, text),
  public.reject_registration(uuid, text),
  public.set_portal_suspended(uuid, boolean, text),
  public.my_registration()
to authenticated;
