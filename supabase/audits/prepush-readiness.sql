-- Optional deployment-owner verification. Run only in the intended project's
-- SQL editor; returns metadata and violation counts, never tenant identities,
-- payment references, balances, credentials or function source. No changes.
begin read only;

select jsonb_build_object(
  'read_only', current_setting('transaction_read_only'),
  'single_landlord', (select count(*) = 1 from public.profiles where role = 'landlord'),
  'tables_without_rls', (
    select coalesce(jsonb_agg(c.relname), '[]') from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  'anonymous_definer_functions', (
    select coalesce(jsonb_agg(p.proname), '[]') from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute')),
  'unsafe_definer_search_paths', (
    select coalesce(jsonb_agg(p.proname), '[]') from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)),
  'views_without_invoker_security', (
    select coalesce(jsonb_agg(c.relname), '[]') from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v' and not coalesce(c.reloptions @> array['security_invoker=true'],false)),
  'financial_violations', jsonb_build_object(
    'bill_paid_totals', (select count(*) from public.bills b where b.amount_paid <>
      coalesce((select sum(p.amount) from public.payments p where p.bill_id=b.id and p.status='verified'),0)),
    'verified_allocation_totals', (select count(*) from public.payments p where p.status='verified'
      and p.amount <> coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id=p.id),0)),
    'allocation_identity', (select count(*) from public.payment_allocations a
      join public.payments p on p.id=a.payment_id join public.bill_items i on i.id=a.bill_item_id
      where p.bill_id<>a.bill_id or i.bill_id<>a.bill_id or i.kind<>a.kind or p.status<>'verified'),
    'bill_tenant_identity', (select count(*) from public.bills b join public.leases l on l.id=b.lease_id
      where b.tenant_id<>l.tenant_id or b.room_id<>l.room_id),
    'payment_tenant_identity', (select count(*) from public.payments p join public.bills b on b.id=p.bill_id where p.tenant_id<>b.tenant_id),
    'overpaid_live_bills', (select count(*) from public.bills where status<>'void' and amount_paid>total_amount),
    'duplicate_verified_references', (select count(*) from (
      select method,lower(btrim(reference_number)) from public.payments
      where status='verified' and method in ('gcash','maya','bank_transfer','check') and nullif(btrim(reference_number),'') is not null
      group by method,lower(btrim(reference_number)) having count(*)>1) duplicates)),
  'required_rpcs', (
    select jsonb_object_agg(signature,to_regprocedure(signature) is not null) from (values
      ('public.update_lease_start_date(uuid,date)'),
      ('public._claim_checkout_creation(uuid)'),
      ('public.save_financial_transaction_once(uuid,text,numeric,text,date,text,public.payment_method,uuid,uuid,text,uuid)'),
      ('public.save_room_with_beds(text,smallint,numeric,smallint,text,boolean,text[],jsonb,uuid)'),
      ('public.review_payment_confirmed(uuid,boolean,numeric,text,boolean)'),
      ('public.submit_qr_payment(uuid,uuid,numeric,date,text,text,text,uuid)')) signatures(signature))
) as production_readiness;

rollback;
