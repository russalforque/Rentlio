create or replace function public.submit_qr_payment(
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
  v_reference text := nullif(btrim(coalesce(p_reference_number, '')), '');
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
  if v_reference is not null
     and (char_length(v_reference) not between 3 and 100
       or v_reference !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,99}$') then
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
    p_bill_id, p_amount, v_method, p_paid_on, p_proof_path, v_reference, p_notes, p_request_id
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
