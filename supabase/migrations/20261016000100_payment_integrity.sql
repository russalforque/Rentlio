-- =============================================================================
-- Payment and bill integrity hardening (production-readiness audit).
--
--   * A bill's total can never drop below what has already been paid. Before,
--     lowering rent, removing a charge or correcting a meter reading on a paid
--     bill produced a negative balance that silently absorbed the overpayment.
--   * Payment references from GCash / Maya / bank transfers / checks are issued
--     by the provider and are unique, so one reference cannot back two payments
--     (a reused screenshot or reference for a second bill is refused).
--   * A tenant's proof must be a file that was actually uploaded to the
--     payment-proofs bucket, and one file cannot back two payments.
--   * Tenant submissions lock the bill row, like landlord-side payment writes.
-- =============================================================================

-- Bill totals ---------------------------------------------------------------------
create or replace function public._refresh_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total  numeric(12,2);
  v_paid   numeric(12,2);
  v_status public.bill_status;
begin
  select status into v_status from public.bills where id = p_bill_id;
  select coalesce(sum(amount), 0) into v_total from public.bill_items where bill_id = p_bill_id;
  select coalesce(sum(amount), 0) into v_paid
    from public.payments where bill_id = p_bill_id and status = 'verified';

  if v_status <> 'void' and v_total < v_paid then
    raise exception 'This change would make the bill total (%) less than the % already paid', v_total, v_paid
      using errcode = '22023';
  end if;

  update public.bills
  set total_amount = v_total,
      amount_paid  = v_paid,
      status = case
        when status = 'void' then 'void'::public.bill_status
        when v_paid >= v_total and v_total > 0 then 'paid'::public.bill_status
        when v_paid > 0 then 'partial'::public.bill_status
        else 'unpaid'::public.bill_status
      end
  where id = p_bill_id;
end;
$$;

-- Payment references --------------------------------------------------------------
-- Raises if another live (pending or verified) payment already uses this
-- provider reference. Cash and "other" references are free-form notes, so they
-- are not checked.
create function public._assert_reference_unused(p_method public.payment_method, p_reference text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_method not in ('gcash', 'maya', 'bank_transfer', 'check') or coalesce(btrim(p_reference), '') = '' then
    return;
  end if;
  if exists (
    select 1 from public.payments
    where method = p_method
      and lower(btrim(reference_number)) = lower(btrim(p_reference))
      and status <> 'rejected'
  ) then
    raise exception 'Reference number % has already been used for another payment', btrim(p_reference)
      using errcode = '23505';
  end if;
end;
$$;

create index payments_reference_idx on public.payments (method, lower(btrim(reference_number)))
  where reference_number is not null;
create index payments_proof_path_idx on public.payments (proof_path) where proof_path is not null;

-- Raises unless the path names an uploaded payment-proofs object that no other
-- live payment already uses.
create function public._assert_proof_usable(p_proof_path text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_proof_path) then
    raise exception 'The proof of payment file was not found. Please upload it again.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where proof_path = p_proof_path and status <> 'rejected') then
    raise exception 'This proof of payment is already attached to another payment' using errcode = '23505';
  end if;
end;
$$;

-- Tenant submission -------------------------------------------------------------
create or replace function public.submit_payment(
  p_bill_id          uuid,
  p_amount           numeric,
  p_method           public.payment_method,
  p_paid_on          date,
  p_proof_path       text,
  p_reference_number text default null,
  p_notes            text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public._assert_active_user();
  v_bill public.bills;
  v_id   uuid;
begin
  select * into v_bill from public.bills where id = p_bill_id and tenant_id = v_uid for update;
  if not found then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;
  if v_bill.status in ('void', 'paid') then
    raise exception 'This bill is already %', v_bill.status using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if round(p_amount, 2) > v_bill.balance then
    raise exception 'Amount exceeds the outstanding balance of %', v_bill.balance using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > current_date + 1 then
    raise exception 'Payment date is invalid' using errcode = '22023';
  end if;
  -- Proof must be a file the tenant uploaded into their own storage folder.
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> v_uid::text then
    raise exception 'Proof of payment is required' using errcode = '22023';
  end if;
  perform public._assert_proof_usable(p_proof_path);
  perform public._assert_reference_unused(p_method, p_reference_number);

  insert into public.payments
    (bill_id, tenant_id, amount, method, reference_number, paid_on, proof_path, notes, submitted_by)
  values
    (p_bill_id, v_uid, round(p_amount, 2), p_method, nullif(btrim(p_reference_number), ''),
     p_paid_on, p_proof_path, nullif(btrim(p_notes), ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- Landlord-recorded payment -------------------------------------------------------
create or replace function public.record_payment(
  p_bill_id          uuid,
  p_amount           numeric,
  p_method           public.payment_method,
  p_paid_on          date,
  p_reference_number text default null,
  p_notes            text default null,
  p_proof_path       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_id   uuid;
begin
  perform public._assert_landlord();
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found or v_bill.status = 'void' then
    raise exception 'Bill not found or voided' using errcode = 'P0002';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if round(p_amount, 2) > v_bill.balance then
    raise exception 'Amount exceeds the outstanding balance of %', v_bill.balance using errcode = '22023';
  end if;
  if p_paid_on is null then
    raise exception 'Payment date is required' using errcode = '22023';
  end if;
  if p_proof_path is not null then
    perform public._assert_proof_usable(p_proof_path);
  end if;
  perform public._assert_reference_unused(p_method, p_reference_number);

  insert into public.payments
    (bill_id, tenant_id, amount, method, reference_number, paid_on, proof_path, notes,
     status, submitted_by, reviewed_by, reviewed_at)
  values
    (p_bill_id, v_bill.tenant_id, round(p_amount, 2), p_method, nullif(btrim(p_reference_number), ''),
     p_paid_on, p_proof_path, nullif(btrim(p_notes), ''), 'verified', auth.uid(), auth.uid(), now())
  returning id into v_id;
  return v_id;
end;
$$;

-- Review ----------------------------------------------------------------------------
-- Approval re-checks the reference, which also covers payments submitted before
-- this migration.
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
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
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

-- Privileges: internal helpers are not client-callable. CREATE OR REPLACE keeps
-- the existing grants on the replaced functions.
revoke execute on function
  public._assert_reference_unused(public.payment_method, text),
  public._assert_proof_usable(text)
from public, anon, authenticated;
