-- Reviewed local hardening only. Reconcile hosted schema/migration drift before
-- applying this transaction; never replay older migrations to force parity.
begin;

-- Refuse to overwrite a hosted function that differs from the reviewed source.
-- These are whitespace-normalized body hashes, not hashes of tenant data.
do $$
declare
  expected record;
  actual text;
begin
  for expected in select * from (values
    ('public.save_financial_transaction(text,numeric,text,date,text,public.payment_method,uuid,uuid,text,uuid)', '1a47f3ac8ace155ca26e8bc2d21e2968'),
    ('public.review_payment(uuid,boolean,numeric,text)', '722393b1665cfa518e4f77f0d0adcd6a'),
    ('public._confirm_provider_payment(text,text,text,numeric,public.payment_method,date)', '635bb89b6a768647e2328abf612e1c63')
  ) as definitions(signature, body_hash) loop
    select md5(regexp_replace(p.prosrc, '\s', '', 'g')) into actual
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(expected.signature);
    if actual is distinct from expected.body_hash then
      raise exception 'Production readiness migration stopped: schema drift in %. Review the deployed definition before applying this migration.', expected.signature
        using errcode = '55000';
    end if;
  end loop;
end;
$$;

-- A creating checkout can be returned to multiple concurrent Edge requests.
-- Only one request may call the provider to create its hosted session.
alter table public.payment_checkouts add column creation_claimed_at timestamptz;

create function public._claim_checkout_creation(p_checkout_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_checkouts set creation_claimed_at = now()
  where id = p_checkout_id and status = 'creating' and creation_claimed_at is null;
  return found;
end;
$$;
revoke all on function public._claim_checkout_creation(uuid) from public, anon, authenticated;
grant execute on function public._claim_checkout_creation(uuid) to service_role;

-- Manual income/expenses also need a retry identity: disabled UI buttons alone
-- cannot prevent a duplicate when a committed response is lost on the network.
alter table public.financial_transactions add column client_request_id uuid;
create unique index financial_transactions_request_key
  on public.financial_transactions(created_by, client_request_id)
  where client_request_id is not null;

create function public.save_financial_transaction_once(
  p_request_id uuid,
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
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_existing public.financial_transactions;
  v_id uuid;
begin
  perform public._assert_landlord();
  v_actor := public.current_profile_id();
  if p_request_id is null then
    raise exception 'A submission ID is required' using errcode = '22023';
  end if;
  if p_id is null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('finance-request:' || v_actor || ':' || p_request_id));
    select * into v_existing from public.financial_transactions
    where created_by = v_actor and client_request_id = p_request_id;
    if found then
      if v_existing.deleted_at is not null or
        (v_existing.transaction_type, v_existing.amount, v_existing.category,
         v_existing.transaction_date, v_existing.description, v_existing.method,
         v_existing.room_id, v_existing.tenant_id)
        is distinct from
        (p_transaction_type, p_amount, trim(p_category), p_transaction_date,
         trim(p_description), p_method, p_room_id, p_tenant_id) then
        raise exception 'This submission ID was already used for another transaction' using errcode = '23505';
      end if;
      -- A retry may have uploaded the same receipt to a fresh random path.
      -- Return the committed record without attaching any new file or writing.
      return v_existing.id;
    end if;
  end if;
  v_id := public.save_financial_transaction(p_transaction_type, p_amount, p_category,
    p_transaction_date, p_description, p_method, p_room_id, p_tenant_id, p_receipt_path, p_id);
  if p_id is null then
    update public.financial_transactions set client_request_id = p_request_id where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_financial_transaction_once(uuid,text,numeric,text,date,text,public.payment_method,uuid,uuid,text,uuid)
  from public, anon;
grant execute on function public.save_financial_transaction_once(uuid,text,numeric,text,date,text,public.payment_method,uuid,uuid,text,uuid)
  to authenticated;

create or replace function public.save_financial_transaction(
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
  if p_transaction_date is null or p_transaction_date > public.property_today() then
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

create or replace function public.review_payment(
  p_payment_id uuid,
  p_approve    boolean,
  p_amount     numeric default null,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_bill    public.bills;
  v_amount  numeric(12,2);
begin
  perform public._assert_landlord();
  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  -- Use the same bill-first lock order as recording, voiding and provider confirmation.
  perform 1 from public.bills where id = v_payment.bill_id for update;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.status <> 'pending' then
    raise exception 'This payment has already been %', v_payment.status using errcode = '22023';
  end if;

  if p_approve then
    select * into v_bill from public.bills where id = v_payment.bill_id for update;
    if v_bill.status = 'void' then
      raise exception 'The bill was voided' using errcode = '22023';
    end if;
    v_amount := round(coalesce(p_amount, v_payment.amount), 2);
    if v_amount <= 0 then
      raise exception 'Amount must be greater than zero' using errcode = '22023';
    end if;
    if v_amount > v_bill.balance then
      raise exception 'Amount % exceeds the outstanding balance of %', v_amount, v_bill.balance using errcode = '22023';
    end if;
    -- Serialize approval of legacy pending duplicates across different bills.
    if v_payment.method in ('gcash', 'maya', 'bank_transfer', 'check')
       and coalesce(btrim(v_payment.reference_number), '') <> '' then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('payment-ref:' || v_payment.method || ':' || lower(btrim(v_payment.reference_number))));
    end if;
    if exists (
      select 1 from public.payments
      where id <> v_payment.id and status = 'verified'
        and v_payment.method in ('gcash', 'maya', 'bank_transfer', 'check')
        and method = v_payment.method
        and lower(btrim(reference_number)) = lower(btrim(v_payment.reference_number))
    ) then
      raise exception 'Reference number % was already verified on another payment. Reject this one.',
        v_payment.reference_number using errcode = '23505';
    end if;
    update public.payments
    set status = 'verified', amount = v_amount, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id;
  else
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'Please give the tenant a reason for rejecting' using errcode = '22023';
    end if;
    update public.payments
    set status = 'rejected', rejection_reason = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_payment_id;
  end if;
end;
$$;

create or replace function public._confirm_provider_payment(
  p_provider            text,
  p_session_id          text,
  p_provider_payment_id text,
  p_amount              numeric,
  p_method              public.payment_method,
  p_paid_on             date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.payment_checkouts;
  v_bill     public.bills;
  v_amount   numeric(12,2) := round(p_amount, 2);
  v_review   text;
  v_id       uuid;
begin
  select * into v_checkout from public.payment_checkouts
  where provider = p_provider and provider_session_id = p_session_id;
  if not found then
    raise exception 'Unknown % checkout session %', p_provider, p_session_id using errcode = 'P0002';
  end if;
  -- All payment paths lock the bill before their checkout/payment rows.
  select * into v_bill from public.bills where id = v_checkout.bill_id for update;
  select * into v_checkout from public.payment_checkouts where id = v_checkout.id for update;
  -- After the lock, so concurrent deliveries of one webhook record it once.
  select id into v_id from public.payments where provider = p_provider and provider_payment_id = p_provider_payment_id;
  if found then
    return v_id;
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Invalid amount %', p_amount using errcode = '22023';
  end if;

  select * into v_bill from public.bills where id = v_checkout.bill_id for update;
  -- Money has moved, so it is always recorded; anything that cannot be applied
  -- as-is waits for the landlord.
  v_review := case
    when v_bill.status = 'void'
      then 'Paid online after the bill was cancelled. Refund the tenant, then reject this payment.'
    when v_bill.finalized_at is null
      then 'Paid online while the bill was being corrected. Verify it once the bill is finalized again.'
    when v_amount > v_bill.balance
      then format('Paid online, but more than the remaining balance of %s. Verify the amount to apply and refund the rest.',
                  public._fmt_money(v_bill.balance))
  end;

  insert into public.payments
    (bill_id, tenant_id, amount, method, reference_number, paid_on, status, notes, submitted_by,
     reviewed_at, provider, provider_payment_id)
  values
    (v_checkout.bill_id, v_checkout.tenant_id, v_amount, p_method, p_provider_payment_id, coalesce(p_paid_on, current_date),
     case when v_review is null then 'verified' else 'pending' end::public.payment_status, v_review,
     v_checkout.created_by, case when v_review is null then now() end, p_provider, p_provider_payment_id)
  returning id into v_id;

  update public.payment_checkouts
  set status = 'paid', payment_id = v_id, completed_at = now()
  where id = v_checkout.id;
  return v_id;
end;
$$;

-- Save the room and its bed configuration in one transaction. A deleted bed
-- type or failed bed validation must not leave a half-saved room behind.
create function public.save_room_with_beds(
  p_room_number text,
  p_floor smallint,
  p_monthly_rent numeric,
  p_capacity smallint,
  p_description text,
  p_is_under_maintenance boolean,
  p_electricity_meters text[],
  p_beds jsonb,
  p_room_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public._assert_landlord();
  if p_room_id is null then
    insert into public.rooms(room_number,floor,monthly_rent,capacity,description,is_under_maintenance,electricity_meters)
    values(btrim(p_room_number),p_floor,p_monthly_rent,p_capacity,nullif(btrim(p_description),''),p_is_under_maintenance,p_electricity_meters)
    returning id into v_id;
  else
    update public.rooms set room_number=btrim(p_room_number),floor=p_floor,
      monthly_rent=p_monthly_rent,capacity=p_capacity,description=nullif(btrim(p_description),''),
      is_under_maintenance=p_is_under_maintenance,electricity_meters=p_electricity_meters
    where id=p_room_id returning id into v_id;
    if v_id is null then raise exception 'Room not found' using errcode='P0002'; end if;
  end if;
  perform public.set_room_beds(v_id,p_beds);
  return v_id;
end;
$$;
revoke all on function public.save_room_with_beds(text,smallint,numeric,smallint,text,boolean,text[],jsonb,uuid) from public,anon;
grant execute on function public.save_room_with_beds(text,smallint,numeric,smallint,text,boolean,text[],jsonb,uuid) to authenticated;

commit;
