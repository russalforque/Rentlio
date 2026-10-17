-- Manual financial activity is kept separate from tenant billing. Verified
-- payments are projected from immutable payment allocations in the read model.

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  name text not null check (length(trim(name)) between 1 and 60),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint financial_categories_name_unique unique (transaction_type, name)
);
create unique index financial_categories_name_ci
  on public.financial_categories (transaction_type, lower(name));

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  amount numeric(12,2) not null check (amount > 0),
  category text not null check (length(trim(category)) between 1 and 60),
  transaction_date date not null,
  description text not null check (length(trim(description)) between 1 and 500),
  method public.payment_method not null,
  room_id uuid references public.rooms (id) on delete restrict,
  tenant_id uuid references public.profiles (id) on delete restrict,
  receipt_path text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint financial_transactions_receipts_expenses
    check (receipt_path is null or transaction_type = 'expense')
);
create index financial_transactions_date_idx
  on public.financial_transactions (transaction_date desc, created_at desc)
  where deleted_at is null;
create index financial_transactions_room_idx
  on public.financial_transactions (room_id) where deleted_at is null;

create table public.financial_transaction_audit (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.financial_transactions (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  event text not null check (event in ('created', 'updated', 'deleted')),
  old_record jsonb,
  new_record jsonb,
  created_at timestamptz not null default now()
);

alter table public.financial_categories enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.financial_transaction_audit enable row level security;

create policy "financial categories: landlord reads"
  on public.financial_categories for select to authenticated
  using ((select public.is_landlord()));
create policy "financial transactions: landlord reads"
  on public.financial_transactions for select to authenticated
  using ((select public.is_landlord()));
create policy "financial transaction audit: landlord reads"
  on public.financial_transaction_audit for select to authenticated
  using ((select public.is_landlord()));

revoke all on public.financial_categories, public.financial_transactions, public.financial_transaction_audit
  from public, anon, authenticated;
grant select on public.financial_categories, public.financial_transactions, public.financial_transaction_audit
  to authenticated;

create function public._financial_transaction_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.financial_transaction_audit (transaction_id, actor_id, event, old_record, new_record)
  values (
    new.id,
    (select public.current_profile_id()),
    case when tg_op = 'INSERT' then 'created' when new.deleted_at is distinct from old.deleted_at then 'deleted' else 'updated' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'created_by' - 'updated_by' end,
    to_jsonb(new) - 'created_by' - 'updated_by'
  );
  return new;
end;
$$;

create trigger financial_transactions_audit
  after insert or update on public.financial_transactions
  for each row execute function public._financial_transaction_audit();

create function public._financial_audit_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Financial transaction audit entries are permanent' using errcode = '42501';
end;
$$;
create trigger financial_transaction_audit_immutable
  before update or delete on public.financial_transaction_audit
  for each row execute function public._financial_audit_immutable();

create function public.add_financial_category(p_transaction_type text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_id uuid;
  v_builtin text[];
begin
  perform public._assert_landlord();
  if p_transaction_type is null or p_transaction_type not in ('income', 'expense')
     or v_name is null or length(v_name) not between 1 and 60 then
    raise exception 'Choose a valid category name and transaction type' using errcode = '22023';
  end if;
  v_builtin := case p_transaction_type
    when 'income' then array['Rental Income', 'Utility Payments', 'Other Income']
    else array['Maintenance', 'Repairs', 'Electricity', 'Water', 'Internet', 'Cleaning', 'Supplies', 'Salaries', 'Taxes', 'Other']
  end;
  if exists (select 1 from unnest(v_builtin) as c(name) where lower(c.name) = lower(v_name)) then
    raise exception 'That category already exists' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.financial_categories
    where transaction_type = p_transaction_type and lower(name) = lower(v_name)
  ) then
    raise exception 'That category already exists' using errcode = '23505';
  end if;
  insert into public.financial_categories (transaction_type, name, created_by)
  values (p_transaction_type, v_name, (select public.current_profile_id()))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.save_financial_transaction(
  p_transaction_type text,
  p_amount numeric,
  p_category text,
  p_transaction_date date,
  p_description text,
  p_method public.payment_method,
  p_room_id uuid default null,
  p_tenant_id uuid default null,
  p_receipt_path text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_category text := trim(p_category);
  v_description text := trim(p_description);
  v_actor uuid := (select public.current_profile_id());
  v_builtin text[];
begin
  perform public._assert_landlord();
  if p_transaction_type is null or p_transaction_type not in ('income', 'expense') then
    raise exception 'Choose income or expense' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 9999999999.99 then
    raise exception 'Enter a positive amount with no more than two decimal places' using errcode = '22023';
  end if;
  if v_category is null or length(v_category) not between 1 and 60
     or v_description is null or length(v_description) not between 1 and 500 then
    raise exception 'A category and description are required' using errcode = '22023';
  end if;
  if p_transaction_date is null or p_transaction_date > current_date then
    raise exception 'The transaction date cannot be in the future' using errcode = '22023';
  end if;
  if p_method is null then
    raise exception 'Choose a payment method' using errcode = '22023';
  end if;
  v_builtin := case p_transaction_type
    when 'income' then array['Rental Income', 'Utility Payments', 'Other Income']
    else array['Maintenance', 'Repairs', 'Electricity', 'Water', 'Internet', 'Cleaning', 'Supplies', 'Salaries', 'Taxes', 'Other']
  end;
  if not exists (
    select 1 from unnest(v_builtin) as c(name) where lower(c.name) = lower(v_category)
  ) and not exists (
    select 1 from public.financial_categories
    where transaction_type = p_transaction_type and lower(name) = lower(v_category)
  ) then
    raise exception 'Choose a built-in or saved category for this transaction type' using errcode = '22023';
  end if;
  if p_tenant_id is not null and not exists (
    select 1 from public.profiles where id = p_tenant_id and role = 'tenant'
  ) then
    raise exception 'Choose a tenant record' using errcode = '22023';
  end if;
  if p_receipt_path is not null and (
    p_transaction_type <> 'expense'
    or (storage.foldername(p_receipt_path))[1] <> v_actor::text
    or not exists (
      select 1 from storage.objects where bucket_id = 'financial-receipts' and name = p_receipt_path
    )
  ) then
    raise exception 'The receipt must be an uploaded file in your private receipts folder' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.financial_transactions (
      transaction_type, amount, category, transaction_date, description, method,
      room_id, tenant_id, receipt_path, created_by, updated_by
    ) values (
      p_transaction_type, p_amount, v_category, p_transaction_date, v_description, p_method,
      p_room_id, p_tenant_id, p_receipt_path, v_actor, v_actor
    ) returning id into v_id;
  else
    update public.financial_transactions
    set transaction_type = p_transaction_type,
        amount = p_amount,
        category = v_category,
        transaction_date = p_transaction_date,
        description = v_description,
        method = p_method,
        room_id = p_room_id,
        tenant_id = p_tenant_id,
        receipt_path = p_receipt_path,
        updated_by = v_actor,
        updated_at = now()
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'This manual transaction no longer exists' using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$$;

create function public.delete_financial_transaction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._assert_landlord();
  update public.financial_transactions
  set deleted_at = now(), updated_at = now(), updated_by = (select public.current_profile_id())
  where id = p_id and deleted_at is null;
  if not found then
    raise exception 'This manual transaction no longer exists' using errcode = '22023';
  end if;
end;
$$;

-- Each verified payment is surfaced exactly once per allocated bill-item kind,
-- preserving the split between rent and utilities without making it editable.
create or replace view public.financial_transaction_overview
with (security_invoker = true)
as
  select
    ft.id::text as id,
    'manual'::text as source,
    ft.transaction_type,
    ft.amount,
    ft.category,
    ft.transaction_date,
    ft.description,
    ft.method,
    ft.room_id,
    r.room_number,
    ft.tenant_id,
    p.full_name as tenant_name,
    ft.receipt_path,
    null::uuid as payment_id,
    ft.created_at
  from public.financial_transactions ft
  left join public.rooms r on r.id = ft.room_id
  left join public.profiles p on p.id = ft.tenant_id
  where ft.deleted_at is null and (select public.is_landlord())
  union all
  select
    pa.payment_id::text || ':' || pa.kind::text as id,
    'payment'::text as source,
    'income'::text as transaction_type,
    sum(pa.amount)::numeric(12,2) as amount,
    case pa.kind when 'rent' then 'Rental Income' when 'electricity' then 'Utility Payments'
      when 'water' then 'Utility Payments' else 'Other Income' end as category,
    pay.paid_on as transaction_date,
    ('Verified payment · Receipt #' || pay.receipt_number::text)::text as description,
    pay.method,
    b.room_id,
    r.room_number,
    pay.tenant_id,
    p.full_name as tenant_name,
    null::text as receipt_path,
    pa.payment_id,
    pay.created_at
  from public.payment_allocations pa
  join public.payments pay on pay.id = pa.payment_id and pay.status = 'verified'
  join public.bills b on b.id = pa.bill_id
  join public.rooms r on r.id = b.room_id
  join public.profiles p on p.id = pay.tenant_id
  group by pa.payment_id, pa.kind, pay.paid_on, pay.receipt_number, pay.method,
    b.room_id, r.room_number, pay.tenant_id, p.full_name, pay.created_at
  having (select public.is_landlord());

revoke all on public.financial_transaction_overview from public, anon;
grant select on public.financial_transaction_overview to authenticated;

revoke execute on function public._financial_transaction_audit(), public._financial_audit_immutable()
  from public, anon, authenticated;
revoke execute on function public.add_financial_category(text, text),
  public.save_financial_transaction(text, numeric, text, date, text, public.payment_method, uuid, uuid, text, uuid),
  public.delete_financial_transaction(uuid) from public, anon;
grant execute on function public.add_financial_category(text, text),
  public.save_financial_transaction(text, numeric, text, date, text, public.payment_method, uuid, uuid, text, uuid),
  public.delete_financial_transaction(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financial-receipts', 'financial-receipts', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "financial receipts: landlord uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'financial-receipts'
    and (storage.foldername(name))[1] = (select public.current_profile_id())::text
    and (select public.is_landlord())
  );
create policy "financial receipts: landlord reads own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'financial-receipts'
    and (storage.foldername(name))[1] = (select public.current_profile_id())::text
    and (select public.is_landlord())
  );
