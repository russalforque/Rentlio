-- Landlord-managed transfer accounts and QR proofs.

create table public.landlord_payment_accounts (
  id               uuid primary key default gen_random_uuid(),
  landlord_id      uuid not null references public.profiles (id) on delete restrict,
  method           public.payment_method not null
                   check (method in ('gcash', 'maya', 'bank_transfer')),
  account_holder   text not null check (char_length(btrim(account_holder)) between 1 and 120),
  account_number   text not null check (char_length(btrim(account_number)) between 3 and 50),
  bank_name        text check (bank_name is null or char_length(btrim(bank_name)) between 1 and 120),
  qr_path          text not null,
  is_active        boolean not null default true,
  is_default       boolean not null default false,
  created_by       uuid not null references public.profiles (id) on delete restrict,
  updated_by       uuid not null references public.profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint landlord_payment_accounts_bank_name
    check ((method = 'bank_transfer') = (bank_name is not null)),
  constraint landlord_payment_accounts_default_active
    check (not is_default or is_active)
);

drop policy if exists "payment-proofs: tenant uploads to own folder" on storage.objects;
create policy "payment-proofs: tenant uploads to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = (select public.current_profile_id())::text
);

drop policy if exists "payment-proofs: owner or landlord reads" on storage.objects;
create policy "payment-proofs: owner or landlord reads"
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and ((storage.foldername(name))[1] = (select public.current_profile_id())::text or (select public.is_landlord()))
);

create unique index landlord_payment_accounts_one_default
  on public.landlord_payment_accounts (landlord_id)
  where is_active and is_default;
create index landlord_payment_accounts_active_idx
  on public.landlord_payment_accounts (landlord_id, is_active, created_at);

create trigger landlord_payment_accounts_updated_at
  before update on public.landlord_payment_accounts
  for each row execute function public.set_updated_at();

create table public.payment_account_audit (
  id          bigint generated always as identity primary key,
  account_id  uuid not null,
  landlord_id uuid not null references public.profiles (id) on delete restrict,
  actor_id    uuid not null references public.profiles (id) on delete restrict,
  event       text not null check (event in ('created', 'updated')),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index payment_account_audit_account_idx on public.payment_account_audit (account_id, created_at desc);

create function public._payment_account_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_event text;
  v_tenant record;
begin
  v_event := case when tg_op = 'INSERT' then 'created' else 'updated' end;
  if tg_op = 'UPDATE'
     and (old.method, old.account_holder, old.account_number, old.bank_name, old.qr_path, old.is_active, old.is_default)
         is not distinct from
         (new.method, new.account_holder, new.account_number, new.bank_name, new.qr_path, new.is_active, new.is_default) then
    return new;
  end if;

  insert into public.payment_account_audit (account_id, landlord_id, actor_id, event, details)
  values (
    new.id, new.landlord_id, v_actor, v_event,
    jsonb_build_object(
      'before', case when tg_op = 'UPDATE' then
        jsonb_build_object('method', old.method, 'account_holder', old.account_holder,
          'account_number', old.account_number, 'bank_name', old.bank_name, 'qr_path', old.qr_path,
          'is_active', old.is_active, 'is_default', old.is_default)
        else null end,
      'after', jsonb_build_object('method', new.method, 'account_holder', new.account_holder,
        'account_number', new.account_number, 'bank_name', new.bank_name, 'qr_path', new.qr_path,
        'is_active', new.is_active, 'is_default', new.is_default)
    )
  );

  for v_tenant in
    select distinct p.user_id
    from public.leases l
    join public.profiles p on p.id = l.tenant_id
    where l.status = 'active' and p.is_active and p.user_id is not null
  loop
    perform public._notify(
      v_tenant.user_id, 'payment_account_updated', 'Payment details changed',
      'Your landlord updated the available transfer accounts. Review the current account details before sending your next payment.',
      'billing', null, 'payment_account_updated:' || new.id || ':' || new.updated_at
    );
  end loop;
  return new;
end;
$$;

create trigger landlord_payment_accounts_changed
  after insert or update on public.landlord_payment_accounts
  for each row execute function public._payment_account_changed();

alter table public.payments
  add column payment_account_id uuid references public.landlord_payment_accounts (id) on delete restrict,
  add column payment_account_snapshot jsonb
    check (payment_account_snapshot is null or jsonb_typeof(payment_account_snapshot) = 'object');

create function public._payment_account_snapshot_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.payment_account_id is not null
     and (old.payment_account_id, old.payment_account_snapshot)
         is distinct from (new.payment_account_id, new.payment_account_snapshot) then
    raise exception 'The receiving account recorded for this payment is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger payments_account_snapshot_immutable
  before update on public.payments
  for each row execute function public._payment_account_snapshot_immutable();

alter table public.landlord_payment_accounts enable row level security;
alter table public.payment_account_audit enable row level security;

create policy "payment accounts: landlord or active tenant reads"
  on public.landlord_payment_accounts for select to authenticated
  using (
    (select public.is_landlord())
    or (
      is_active
      and exists (
        select 1 from public.leases l
        where l.tenant_id = (select public.current_profile_id())
          and l.status = 'active'
      )
    )
  );

create policy "payment account audit: landlord reads"
  on public.payment_account_audit for select to authenticated
  using ((select public.is_landlord()));

revoke all on public.landlord_payment_accounts, public.payment_account_audit from public, anon, authenticated;
grant select on public.landlord_payment_accounts, public.payment_account_audit to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr-codes', 'payment-qr-codes', false, 4194304,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "payment QR: landlord uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-qr-codes'
    and (storage.foldername(name))[1] = (select public.current_profile_id())::text
    and (select public.is_landlord())
  );

create policy "payment QR: landlord replaces or removes"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-qr-codes'
    and (storage.foldername(name))[1] = (select public.current_profile_id())::text
    and (select public.is_landlord())
  )
  with check (
    bucket_id = 'payment-qr-codes'
    and (storage.foldername(name))[1] = (select public.current_profile_id())::text
    and (select public.is_landlord())
  );
create policy "payment QR: landlord deletes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-qr-codes'
    and (storage.foldername(name))[1] = (select public.current_profile_id())::text
    and (select public.is_landlord())
  );

create policy "payment QR: landlord or tenant with active account reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-qr-codes'
    and (
      (select public.is_landlord())
      or exists (
        select 1
        from public.landlord_payment_accounts a
        join public.leases l on l.status = 'active'
          and l.tenant_id = (select public.current_profile_id())
        where a.qr_path = storage.objects.name and a.is_active
      )
    )
  );

create function public.save_payment_account(
  p_account_id uuid,
  p_method public.payment_method,
  p_account_holder text,
  p_account_number text,
  p_bank_name text,
  p_qr_path text,
  p_is_active boolean,
  p_is_default boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_landlord uuid := public.current_profile_id();
  v_number text := regexp_replace(btrim(coalesce(p_account_number, '')), '[ ()-]', '', 'g');
  v_bank text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_existing public.landlord_payment_accounts;
  v_id uuid;
begin
  perform public._assert_landlord();
  if p_method not in ('gcash', 'maya', 'bank_transfer') then
    raise exception 'Choose GCash, Maya, or bank transfer' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_account_holder, ''))) not between 1 and 120 then
    raise exception 'Enter a valid account holder name' using errcode = '22023';
  end if;
  if p_method in ('gcash', 'maya') then
    if v_number !~ '^(09[0-9]{9}|\+639[0-9]{9})$' then
      raise exception 'Enter a valid Philippine mobile wallet number' using errcode = '22023';
    end if;
    v_bank := null;
  elsif v_number !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,49}$' or v_bank is null then
    raise exception 'Enter a valid bank account number and bank name' using errcode = '22023';
  end if;
  if p_qr_path is null
     or split_part(p_qr_path, '/', 1) <> v_landlord::text
     or lower(p_qr_path) !~ '\.(jpg|jpeg|png|webp)$'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'payment-qr-codes' and o.name = p_qr_path
         and o.metadata ->> 'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
         and coalesce(nullif(o.metadata ->> 'size', '')::bigint, 4194305) <= 4194304
     ) then
    raise exception 'Upload a valid QR code image before saving' using errcode = '22023';
  end if;

  if p_account_id is not null then
    select * into v_existing
    from public.landlord_payment_accounts
    where id = p_account_id and landlord_id = v_landlord
    for update;
    if not found then
      raise exception 'Payment account not found' using errcode = 'P0002';
    end if;
  end if;

  if p_is_default and not p_is_active then
    raise exception 'An inactive account cannot be the default' using errcode = '22023';
  end if;

  if p_is_default then
    update public.landlord_payment_accounts
    set is_default = false, updated_by = v_landlord
    where landlord_id = v_landlord and is_default and id is distinct from p_account_id;
  end if;

  if p_account_id is null then
    insert into public.landlord_payment_accounts
      (landlord_id, method, account_holder, account_number, bank_name, qr_path,
       is_active, is_default, created_by, updated_by)
    values
      (v_landlord, p_method, btrim(p_account_holder), v_number, v_bank, p_qr_path,
       coalesce(p_is_active, true),
       coalesce(p_is_default, false) or not exists (
         select 1 from public.landlord_payment_accounts where landlord_id = v_landlord and is_active
       ),
       v_landlord, v_landlord)
    returning id into v_id;
  else
    update public.landlord_payment_accounts
    set method = p_method, account_holder = btrim(p_account_holder), account_number = v_number,
        bank_name = v_bank, qr_path = p_qr_path, is_active = coalesce(p_is_active, true),
        is_default = coalesce(p_is_default, false), updated_by = v_landlord
    where id = p_account_id and landlord_id = v_landlord
    returning id into v_id;
  end if;

  if not exists (
    select 1 from public.landlord_payment_accounts
    where landlord_id = v_landlord and is_active and is_default
  ) then
    update public.landlord_payment_accounts
    set is_default = true, updated_by = v_landlord
    where id = (
      select id from public.landlord_payment_accounts
      where landlord_id = v_landlord and is_active
      order by created_at, id limit 1
    );
  end if;
  return v_id;
end;
$$;

create function public.submit_qr_payment(
  p_bill_id uuid,
  p_payment_account_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_proof_path text,
  p_reference_number text,
  p_notes text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._assert_active_user();
  v_method public.payment_method;
  v_payment_id uuid;
  v_existing_account uuid;
  v_mime text;
  v_size bigint;
  v_account public.landlord_payment_accounts;
begin
  if p_request_id is not null then
    select id, payment_account_id into v_payment_id, v_existing_account
    from public.payments where submitted_by = v_uid and client_request_id = p_request_id;
    if found then
      if v_existing_account is distinct from p_payment_account_id then
        raise exception 'This submission key was already used for a different payment account' using errcode = '23505';
      end if;
      return v_payment_id;
    end if;
  end if;

  select * into v_account
  from public.landlord_payment_accounts
  where id = p_payment_account_id and is_active
  for share;
  if not found then
    raise exception 'This payment account is no longer active. Refresh and choose an available account.' using errcode = '22023';
  end if;
  v_method := v_account.method;
  if char_length(btrim(coalesce(p_reference_number, ''))) not between 3 and 100
     or btrim(p_reference_number) !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,99}$' then
    raise exception 'Enter a valid transaction reference (3 to 100 letters, numbers, or separators)' using errcode = '22023';
  end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> v_uid::text then
    raise exception 'A screenshot or receipt image is required' using errcode = '22023';
  end if;
  select metadata ->> 'mimetype', nullif(metadata ->> 'size', '')::bigint into v_mime, v_size
  from storage.objects
  where bucket_id = 'payment-proofs' and name = p_proof_path;
  if v_mime is null or v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')
     or v_size is null or v_size > 5242880 then
    raise exception 'Upload a JPG, PNG, WebP, or HEIC screenshot' using errcode = '22023';
  end if;

  v_payment_id := public.submit_payment(
    p_bill_id, p_amount, v_method, p_paid_on, p_proof_path, btrim(p_reference_number), p_notes, p_request_id
  );
  update public.payments
  set payment_account_id = p_payment_account_id,
      payment_account_snapshot = jsonb_build_object(
        'method', v_account.method,
        'account_holder', v_account.account_holder,
        'account_number', v_account.account_number,
        'bank_name', v_account.bank_name
      )
  where id = v_payment_id and submitted_by = v_uid and status = 'pending'
    and (payment_account_id is null or payment_account_id = p_payment_account_id);
  if not found then
    raise exception 'Payment submission did not match its receiving account' using errcode = '23514';
  end if;
  return v_payment_id;
end;
$$;

create function public.review_payment_confirmed(
  p_payment_id uuid,
  p_approve boolean,
  p_amount numeric default null,
  p_reason text default null,
  p_money_received boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_landlord();
  if p_approve and not coalesce(p_money_received, false) then
    raise exception 'Confirm that the money was received in the corresponding payment account before approving' using errcode = '22023';
  end if;
  perform public.review_payment(p_payment_id, p_approve, p_amount, p_reason);
end;
$$;

create or replace view public.payment_overview
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
  b.status as bill_status,
  r.room_number,
  p.full_name as tenant_name,
  pm.receipt_number,
  pm.provider,
  pm.payment_account_id,
  pm.payment_account_snapshot
from public.payments pm
join public.bills b on b.id = pm.bill_id
join public.rooms r on r.id = b.room_id
join public.profiles p on p.id = pm.tenant_id;

create or replace function public._notification_meta(
  p_type public.notification_type,
  out category public.notification_category,
  out topic text,
  out audience text
)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when p_type in ('payment_submitted', 'payment_verified', 'payment_recorded', 'payment_rejected',
                      'payment_account_updated') then 'payment'
      when p_type in ('bill_issued', 'bill_voided', 'rent_due_soon', 'rent_due_today', 'rent_overdue',
                      'bills_due_soon', 'bills_overdue', 'bills_generated', 'water_rate_changed') then 'billing'
      when p_type in ('registration_submitted', 'registration_approved', 'registration_rejected', 'tenant_activated')
        then 'account'
      when p_type in ('billing_failed', 'system_error') then 'system'
      else 'rental'
    end::public.notification_category,
    case
      when p_type in ('payment_submitted', 'payment_verified', 'payment_recorded', 'payment_account_updated')
        then 'payment_updates'
      when p_type in ('rent_due_soon', 'rent_due_today', 'rent_overdue', 'bills_due_soon', 'bills_overdue')
        then 'rent_reminders'
      when p_type = 'announcement' then 'announcements'
      when p_type in ('lease_started', 'lease_updated', 'lease_ended', 'tenant_activated', 'bills_generated',
                      'move_in_today', 'move_out_today', 'water_rate_changed') then 'general_updates'
    end,
    case
      when p_type in ('registration_submitted', 'payment_submitted', 'tenant_activated', 'move_in_today',
                      'move_out_today', 'bills_due_soon', 'bills_overdue', 'bills_generated',
                      'billing_failed', 'system_error') then 'landlord'
      when p_type in ('payment_verified', 'payment_recorded') then 'any'
      else 'tenant'
    end;
$$;

revoke execute on function public._payment_account_changed(), public._payment_account_snapshot_immutable()
  from public, anon, authenticated;
revoke execute on function public.save_payment_account(uuid, public.payment_method, text, text, text, text, boolean, boolean)
  from public, anon;
revoke execute on function public.submit_qr_payment(uuid, uuid, numeric, date, text, text, text, uuid)
  from public, anon;
revoke execute on function public.review_payment_confirmed(uuid, boolean, numeric, text, boolean)
  from public, anon;
revoke execute on function public.review_payment(uuid, boolean, numeric, text) from public, anon, authenticated;
grant execute on function public.save_payment_account(uuid, public.payment_method, text, text, text, text, boolean, boolean)
  to authenticated;
grant execute on function public.submit_qr_payment(uuid, uuid, numeric, date, text, text, text, uuid)
  to authenticated;
grant execute on function public.review_payment_confirmed(uuid, boolean, numeric, text, boolean)
  to authenticated;
