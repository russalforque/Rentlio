-- Private demo ledger. No production business tables, policies, triggers,
-- sequences or money functions are altered. Compatible with the audited live
-- definitions; does not require replaying newer production migrations.
begin;

create schema rentlio_demo;
revoke all on schema rentlio_demo from public, anon, authenticated, service_role;

create table rentlio_demo.batches (
  id uuid primary key,
  label text not null,
  created_by uuid not null, -- Actor identity only; no FK to production records.
  created_at timestamptz not null default now(),
  starts_on date not null,
  revision bigint not null default 0,
  next_receipt integer not null default 1001
);
create table rentlio_demo.tenants (
  batch_id uuid not null references rentlio_demo.batches(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  full_name text not null,
  primary key(batch_id, id)
);
create table rentlio_demo.rooms (
  batch_id uuid not null references rentlio_demo.batches(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  room_number text not null,
  primary key(batch_id, id), unique(batch_id, room_number)
);
create table rentlio_demo.leases (
  batch_id uuid not null,
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null, room_id uuid not null,
  monthly_rent numeric(12,2) not null check(monthly_rent > 0),
  start_date date not null,
  primary key(batch_id, id), unique(batch_id, tenant_id), unique(batch_id, room_id),
  foreign key(batch_id, tenant_id) references rentlio_demo.tenants(batch_id, id) on delete restrict,
  foreign key(batch_id, room_id) references rentlio_demo.rooms(batch_id, id) on delete restrict
);
create table rentlio_demo.bills (
  batch_id uuid not null, id uuid not null default gen_random_uuid(),
  lease_id uuid not null, period date not null, due_date date not null,
  primary key(batch_id, id), unique(batch_id, lease_id, period),
  foreign key(batch_id, lease_id) references rentlio_demo.leases(batch_id, id) on delete restrict
);
create table rentlio_demo.bill_items (
  batch_id uuid not null, id uuid not null default gen_random_uuid(), bill_id uuid not null,
  kind public.bill_item_kind not null,
  description text not null,
  amount numeric(12,2) not null check(amount > 0),
  sort_order integer not null,
  primary key(batch_id, id), unique(batch_id, id, bill_id, kind),
  foreign key(batch_id, bill_id) references rentlio_demo.bills(batch_id, id) on delete restrict
);
create table rentlio_demo.payments (
  batch_id uuid not null, id uuid not null default gen_random_uuid(), bill_id uuid not null,
  amount numeric(12,2) not null check(amount > 0),
  method text not null check(method in ('cash','gcash','maya','bank_transfer','other')),
  paid_on date not null,
  status text not null check(status in ('pending','verified','rejected')),
  initial_status text not null check(initial_status in ('pending','verified')),
  request_id uuid not null,
  receipt_number integer,
  balance_before numeric(12,2), balance_after numeric(12,2),
  rejection_reason text,
  created_at timestamptz not null default now(),
  primary key(batch_id, id), unique(batch_id, request_id),
  unique(batch_id, id, bill_id), unique(batch_id, receipt_number),
  check(status <> 'verified' or (receipt_number is not null and balance_before is not null
        and balance_after is not null and balance_after >= 0)),
  foreign key(batch_id, bill_id) references rentlio_demo.bills(batch_id, id) on delete restrict
);
create table rentlio_demo.payment_allocations (
  batch_id uuid not null, payment_id uuid not null, bill_item_id uuid not null,
  bill_id uuid not null, kind public.bill_item_kind not null,
  amount numeric(12,2) not null check(amount > 0),
  primary key(batch_id, payment_id, bill_item_id),
  foreign key(batch_id, payment_id, bill_id) references rentlio_demo.payments(batch_id, id, bill_id) on delete restrict,
  foreign key(batch_id, bill_item_id, bill_id, kind) references rentlio_demo.bill_items(batch_id, id, bill_id, kind) on delete restrict
);
create table rentlio_demo.expenses (
  batch_id uuid not null references rentlio_demo.batches(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  amount numeric(12,2) not null check(amount > 0),
  paid_on date not null, description text not null,
  request_id uuid not null,
  primary key(batch_id, id), unique(batch_id, request_id)
);
create table rentlio_demo.cash_openings (
  batch_id uuid not null references rentlio_demo.batches(id) on delete restrict,
  opening_date date not null,
  opening_cash numeric(12,2) not null check(opening_cash >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  primary key(batch_id, opening_date)
);

-- No client has direct schema/table access, even when RLS is bypassed by the
-- service role. Owner-executed, landlord-checked RPCs are the only app entry.
do $$ declare t text; begin
  foreach t in array array['batches','tenants','rooms','leases','bills','bill_items',
    'payments','payment_allocations','expenses','cash_openings'] loop
    execute format('alter table rentlio_demo.%I enable row level security', t);
  end loop;
end $$;
revoke all on all tables in schema rentlio_demo from public, anon, authenticated, service_role;
alter default privileges in schema rentlio_demo revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema rentlio_demo revoke execute on functions from public, anon, authenticated, service_role;

create function rentlio_demo.assert_isolated() returns void
language plpgsql set search_path = '' as $$
begin
  -- Refuse mutation if later DDL attaches side effects, cross-boundary FKs,
  -- public reports, direct client grants, or broad Realtime publications.
  if exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='rentlio_demo' and not t.tgisinternal)
     or exists(select 1 from pg_catalog.pg_constraint k
      join pg_catalog.pg_class src on src.oid=k.conrelid
      join pg_catalog.pg_namespace sn on sn.oid=src.relnamespace
      join pg_catalog.pg_class dst on dst.oid=k.confrelid
      join pg_catalog.pg_namespace dn on dn.oid=dst.relnamespace
      where k.contype='f' and ((sn.nspname='rentlio_demo') <> (dn.nspname='rentlio_demo')))
     or exists(select 1 from pg_catalog.pg_rewrite w
      join pg_catalog.pg_class c on c.oid=w.ev_class
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='rentlio_demo')
     or exists(select 1 from pg_catalog.pg_depend d
      join pg_catalog.pg_rewrite w on w.oid=d.objid and d.classid='pg_catalog.pg_rewrite'::regclass
      join pg_catalog.pg_class v on v.oid=w.ev_class
      join pg_catalog.pg_namespace vn on vn.oid=v.relnamespace
      join pg_catalog.pg_class c on c.oid=d.refobjid and d.refclassid='pg_catalog.pg_class'::regclass
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='rentlio_demo' and vn.nspname<>'rentlio_demo')
     or exists(select 1 from pg_catalog.pg_publication where puballtables)
     or exists(select 1 from pg_catalog.pg_publication_tables where schemaname='rentlio_demo')
     or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='rentlio_demo' and c.relkind in ('r','p','v','m','f','S') and
        (c.relkind<>'r' or c.relname not in ('batches','tenants','rooms','leases','bills','bill_items',
          'payments','payment_allocations','expenses','cash_openings')))
     or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname<>'rentlio_demo' and position('rentlio_demo' in p.prosrc)>0 and
        (n.nspname<>'public' or p.proname not in ('demo_list_batches','demo_get_batch','demo_generate_batch',
          'demo_record_payment','demo_review_payment','demo_save_cash_opening','demo_record_expense','demo_delete_batch')))
     or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='rentlio_demo' and c.relkind='r'
      and (not c.relrowsecurity
        or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
     or has_schema_privilege('anon','rentlio_demo','USAGE')
     or has_schema_privilege('authenticated','rentlio_demo','USAGE')
     or has_schema_privilege('service_role','rentlio_demo','USAGE') then
    raise exception 'Demo isolation checks failed. No demo changes were made.' using errcode='42501';
  end if;
  if to_regclass('cron.job') is not null then
    if row_security_active('cron.job'::regclass) then
      raise exception 'Cannot verify the complete scheduler inventory' using errcode='42501';
    end if;
    -- Only inspect command text. Never execute scheduler commands.
    if exists(select 1 from cron.job where active and
      (database <> current_database() or regexp_replace(lower(command),'\s','','g') not in
        ('selectpublic.run_scheduled_billing();','selectpublic.run_notification_jobs();'))) then
      raise exception 'An unreviewed scheduled job is active. Review demo isolation before continuing.' using errcode='42501';
    end if;
  end if;
end $$;

create function rentlio_demo.lock_batch(p_batch_id uuid) returns rentlio_demo.batches
language plpgsql set search_path = '' as $$
declare b rentlio_demo.batches;
begin
  perform public._assert_landlord();
  perform rentlio_demo.assert_isolated();
  select * into b from rentlio_demo.batches where id=p_batch_id for update;
  if not found then raise exception 'Demo batch not found or already deleted' using errcode='P0002'; end if;
  return b;
end $$;

create function rentlio_demo.counts(p_batch_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'batches',(select count(*) from rentlio_demo.batches where id=p_batch_id),
    'tenants',(select count(*) from rentlio_demo.tenants where batch_id=p_batch_id),
    'rooms',(select count(*) from rentlio_demo.rooms where batch_id=p_batch_id),
    'leases',(select count(*) from rentlio_demo.leases where batch_id=p_batch_id),
    'bills',(select count(*) from rentlio_demo.bills where batch_id=p_batch_id),
    'bill_items',(select count(*) from rentlio_demo.bill_items where batch_id=p_batch_id),
    'payments',(select count(*) from rentlio_demo.payments where batch_id=p_batch_id),
    'payment_allocations',(select count(*) from rentlio_demo.payment_allocations where batch_id=p_batch_id),
    'expenses',(select count(*) from rentlio_demo.expenses where batch_id=p_batch_id),
    'cash_openings',(select count(*) from rentlio_demo.cash_openings where batch_id=p_batch_id))
$$;

create function rentlio_demo.verify_payment(p_batch_id uuid,p_payment_id uuid) returns void
language plpgsql set search_path = '' as $$
declare p rentlio_demo.payments; v_balance numeric(12,2); v_left numeric(12,2);
  v_take numeric(12,2); v_receipt integer; item record;
begin
  select * into strict p from rentlio_demo.payments where batch_id=p_batch_id and id=p_payment_id;
  select coalesce((select sum(amount) from rentlio_demo.bill_items where batch_id=p_batch_id and bill_id=p.bill_id),0)
    - coalesce((select sum(amount) from rentlio_demo.payments where batch_id=p_batch_id and bill_id=p.bill_id and status='verified'),0)
    into v_balance;
  if p.amount > v_balance then raise exception 'Amount exceeds the outstanding balance of %',v_balance using errcode='22023'; end if;
  select next_receipt into v_receipt from rentlio_demo.batches where id=p_batch_id;
  update rentlio_demo.batches set next_receipt=next_receipt+1 where id=p_batch_id;
  update rentlio_demo.payments set status='verified',receipt_number=v_receipt,
    balance_before=v_balance,balance_after=v_balance-amount where batch_id=p_batch_id and id=p_payment_id;
  v_left:=p.amount;
  -- Same allocation algorithm and existing pure priority helper as production.
  -- Batch serialization replaces production's per-bill lock; money stays private.
  for item in
    select bi.id,bi.kind,bi.amount-coalesce((select sum(a.amount) from rentlio_demo.payment_allocations a
      where a.batch_id=p_batch_id and a.bill_item_id=bi.id),0) as remaining
    from rentlio_demo.bill_items bi where bi.batch_id=p_batch_id and bi.bill_id=p.bill_id
    order by public._allocation_priority(bi.kind),bi.sort_order,bi.id
  loop
    exit when v_left<=0; continue when item.remaining<=0;
    v_take:=least(v_left,item.remaining);
    insert into rentlio_demo.payment_allocations(batch_id,payment_id,bill_item_id,bill_id,kind,amount)
      values(p_batch_id,p_payment_id,item.id,p.bill_id,item.kind,v_take);
    v_left:=v_left-v_take;
  end loop;
  if v_left<>0 then raise exception 'Demo allocation did not reconcile' using errcode='23514'; end if;
end $$;

create function public.demo_list_batches() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_landlord();
  return (select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc),'[]'::jsonb)
    from rentlio_demo.batches b);
end $$;

create function public.demo_get_batch(p_batch_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public._assert_landlord();
  select jsonb_build_object('batch',to_jsonb(b),'today',public.property_today(),
    'counts',rentlio_demo.counts(p_batch_id),
    'tenants',(select coalesce(jsonb_agg(to_jsonb(t) order by full_name),'[]') from rentlio_demo.tenants t where batch_id=p_batch_id),
    'rooms',(select coalesce(jsonb_agg(to_jsonb(r) order by room_number),'[]') from rentlio_demo.rooms r where batch_id=p_batch_id),
    'leases',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from rentlio_demo.leases l where batch_id=p_batch_id),
    'bills',(select coalesce(jsonb_agg(to_jsonb(row) order by row.room_number),'[]') from (
      select bi.id,bi.lease_id,bi.period,bi.due_date,t.full_name as tenant_name,r.room_number,
        coalesce((select sum(amount) from rentlio_demo.bill_items where batch_id=p_batch_id and bill_id=bi.id),0) as total_amount,
        coalesce((select sum(amount) from rentlio_demo.payments where batch_id=p_batch_id and bill_id=bi.id and status='verified'),0) as amount_paid
      from rentlio_demo.bills bi join rentlio_demo.leases l on l.batch_id=bi.batch_id and l.id=bi.lease_id
      join rentlio_demo.tenants t on t.batch_id=l.batch_id and t.id=l.tenant_id
      join rentlio_demo.rooms r on r.batch_id=l.batch_id and r.id=l.room_id
      where bi.batch_id=p_batch_id) row),
    'bill_items',(select coalesce(jsonb_agg(to_jsonb(i) order by sort_order),'[]') from rentlio_demo.bill_items i where batch_id=p_batch_id),
    'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by created_at,id),'[]') from rentlio_demo.payments p where batch_id=p_batch_id),
    'allocations',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from rentlio_demo.payment_allocations a where batch_id=p_batch_id),
    'expenses',(select coalesce(jsonb_agg(to_jsonb(e) order by paid_on,id),'[]') from rentlio_demo.expenses e where batch_id=p_batch_id),
    'openings',(select coalesce(jsonb_agg(to_jsonb(o) order by opening_date),'[]') from rentlio_demo.cash_openings o where batch_id=p_batch_id))
    into result from rentlio_demo.batches b where b.id=p_batch_id;
  if result is null then raise exception 'Demo batch not found or already deleted' using errcode='P0002'; end if;
  return result;
end $$;

create function public.demo_record_payment(p_batch_id uuid,p_bill_id uuid,p_amount numeric,
  p_method text,p_paid_on date,p_request_id uuid,p_status text default 'verified') returns uuid
language plpgsql security definer set search_path = '' as $$
declare b rentlio_demo.batches; p rentlio_demo.payments; v_id uuid; v_available numeric(12,2);
begin
  b:=rentlio_demo.lock_batch(p_batch_id);
  if p_amount is null or p_amount='NaN'::numeric or p_amount<=0 or p_amount>9999999999.99
     or p_amount<>round(p_amount,2) then raise exception 'Enter a positive amount with at most two decimal places' using errcode='22023'; end if;
  if p_request_id is null or p_method is null or p_method not in ('cash','gcash','maya','bank_transfer','other')
    or p_status is null or p_status not in ('pending','verified') then raise exception 'Invalid demo payment' using errcode='22023'; end if;
  if p_paid_on is null or p_paid_on<b.starts_on or p_paid_on>public.property_today() then raise exception 'Choose a date within this demo batch' using errcode='22023'; end if;
  select * into p from rentlio_demo.payments where batch_id=p_batch_id and request_id=p_request_id;
  if found then
    if (p.bill_id,p.amount,p.method,p.paid_on,p.initial_status) is distinct from
       (p_bill_id,p_amount,p_method,p_paid_on,p_status) then raise exception 'This request ID was used for a different payment' using errcode='23505'; end if;
    return p.id;
  end if;
  if not exists(select 1 from rentlio_demo.bills where batch_id=p_batch_id and id=p_bill_id) then
    raise exception 'Bill is not in the selected demo batch' using errcode='P0002'; end if;
  select coalesce((select sum(amount) from rentlio_demo.bill_items where batch_id=p_batch_id and bill_id=p_bill_id),0)
    -coalesce((select sum(amount) from rentlio_demo.payments where batch_id=p_batch_id and bill_id=p_bill_id
      and (status='verified' or (p_status='pending' and status='pending'))),0) into v_available;
  if p_amount>v_available then raise exception 'Amount exceeds the outstanding balance of %',v_available using errcode='22023'; end if;
  insert into rentlio_demo.payments(batch_id,bill_id,amount,method,paid_on,status,initial_status,request_id)
    values(p_batch_id,p_bill_id,p_amount,p_method,p_paid_on,'pending',p_status,p_request_id) returning id into v_id;
  if p_status='verified' then perform rentlio_demo.verify_payment(p_batch_id,v_id); end if;
  update rentlio_demo.batches set revision=revision+1 where id=p_batch_id;
  return v_id;
end $$;

create function public.demo_review_payment(p_batch_id uuid,p_payment_id uuid,p_approve boolean,p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare p rentlio_demo.payments;
begin
  perform rentlio_demo.lock_batch(p_batch_id);
  select * into p from rentlio_demo.payments where batch_id=p_batch_id and id=p_payment_id;
  if not found then raise exception 'Payment is not in this demo batch' using errcode='P0002'; end if;
  if p_approve is null then raise exception 'Choose approve or reject' using errcode='22023'; end if;
  if p.status<>'pending' then raise exception 'This demo payment was already reviewed' using errcode='22023'; end if;
  if p_approve then perform rentlio_demo.verify_payment(p_batch_id,p_payment_id);
  else
    if char_length(btrim(coalesce(p_reason,''))) not between 1 and 300 then raise exception 'Enter a rejection reason (1–300 characters)' using errcode='22023'; end if;
    update rentlio_demo.payments set status='rejected',rejection_reason=btrim(p_reason) where batch_id=p_batch_id and id=p_payment_id;
  end if;
  update rentlio_demo.batches set revision=revision+1 where id=p_batch_id;
end $$;

create function public.demo_save_cash_opening(p_batch_id uuid,p_date date,p_amount numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare b rentlio_demo.batches;
begin
  b:=rentlio_demo.lock_batch(p_batch_id);
  if p_date is null or p_date<b.starts_on or p_date>public.property_today() or p_amount is null
    or p_amount='NaN'::numeric or p_amount<0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Enter a valid demo opening date and non-negative amount' using errcode='22023'; end if;
  insert into rentlio_demo.cash_openings(batch_id,opening_date,opening_cash,updated_by)
    values(p_batch_id,p_date,p_amount,auth.uid())
    on conflict(batch_id,opening_date) do update set opening_cash=excluded.opening_cash,updated_by=excluded.updated_by,updated_at=now();
  update rentlio_demo.batches set revision=revision+1 where id=p_batch_id;
end $$;

create function public.demo_record_expense(p_batch_id uuid,p_date date,p_amount numeric,p_description text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare b rentlio_demo.batches; e rentlio_demo.expenses; v_id uuid;
begin
  b:=rentlio_demo.lock_batch(p_batch_id);
  if p_date is null or p_date<b.starts_on or p_date>public.property_today() or p_amount is null
    or p_amount='NaN'::numeric or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2)
    or p_request_id is null or char_length(btrim(coalesce(p_description,''))) not between 1 and 300 then
    raise exception 'Enter a valid demo expense, date and description' using errcode='22023'; end if;
  select * into e from rentlio_demo.expenses where batch_id=p_batch_id and request_id=p_request_id;
  if found then
    if (e.amount,e.paid_on,e.description) is distinct from (p_amount,p_date,btrim(p_description)) then
      raise exception 'This request ID was used for a different expense' using errcode='23505'; end if;
    return e.id;
  end if;
  insert into rentlio_demo.expenses(batch_id,paid_on,amount,description,request_id)
    values(p_batch_id,p_date,p_amount,btrim(p_description),p_request_id) returning id into v_id;
  update rentlio_demo.batches set revision=revision+1 where id=p_batch_id;
  return v_id;
end $$;

create function public.demo_generate_batch(p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_today date:=public.property_today(); v_tenant uuid; v_room uuid; v_lease uuid; v_bill uuid; i integer;
begin
  perform public._assert_landlord(); perform rentlio_demo.assert_isolated();
  if p_request_id is null then raise exception 'A demo request ID is required' using errcode='22023'; end if;
  -- Only serializes sandbox generation; never locks a production business row.
  perform pg_advisory_xact_lock(726384001);
  if exists(select 1 from rentlio_demo.batches where id=p_request_id) then return p_request_id; end if;
  if (select count(*) from rentlio_demo.batches)>=5 then raise exception 'Delete a demo batch before generating another (maximum five)' using errcode='22023'; end if;
  insert into rentlio_demo.batches(id,label,created_by,starts_on)
    values(p_request_id,'Demo '||v_today||' · '||left(p_request_id::text,8),auth.uid(),v_today-1);
  for i in 1..4 loop
    insert into rentlio_demo.tenants(batch_id,full_name) values(p_request_id,
      (array['Ava Demo — combined unpaid','Ben Demo — partial payment','Cora Demo — rent unpaid','Dina Demo — combined paid'])[i]) returning id into v_tenant;
    insert into rentlio_demo.rooms(batch_id,room_number) values(p_request_id,'DEMO-'||i) returning id into v_room;
    insert into rentlio_demo.leases(batch_id,tenant_id,room_id,monthly_rent,start_date)
      values(p_request_id,v_tenant,v_room,5000,date_trunc('month',v_today-2)::date) returning id into v_lease;
    insert into rentlio_demo.bills(batch_id,lease_id,period,due_date)
      values(p_request_id,v_lease,date_trunc('month',v_today-2)::date,v_today-2) returning id into v_bill;
    insert into rentlio_demo.bill_items(batch_id,bill_id,kind,description,amount,sort_order)
      values(p_request_id,v_bill,'rent','Monthly rent',5000,0);
    if i<>3 then
      insert into rentlio_demo.bill_items(batch_id,bill_id,kind,description,amount,sort_order)
        values(p_request_id,v_bill,'electricity','Electricity',245,1),(p_request_id,v_bill,'water','Water',100,2);
    end if;
    if i=2 or i=4 then perform public.demo_record_payment(p_request_id,v_bill,
      case when i=2 then 1000 else 5345 end,'cash',
      case when i=2 then v_today-1 else v_today end,gen_random_uuid()); end if;
  end loop;
  perform public.demo_save_cash_opening(p_request_id,v_today-1,1000);
  perform public.demo_record_expense(p_request_id,v_today,250,'Demo cleaning supplies',gen_random_uuid());
  return p_request_id;
end $$;

create function public.demo_delete_batch(p_batch_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b rentlio_demo.batches; expected jsonb; removed jsonb:='{}'; t text; n bigint;
begin
  b:=rentlio_demo.lock_batch(p_batch_id);
  if p_expected_revision is null or b.revision<>p_expected_revision then
    raise exception 'Demo records changed. Refresh the deletion preview and confirm again.' using errcode='40001'; end if;
  expected:=rentlio_demo.counts(p_batch_id);
  -- Static allowlist, bound batch predicate for EVERY delete, children first.
  -- Root lock is also taken by every mutation, so no writer can race cleanup.
  foreach t in array array['payment_allocations','payments','bill_items','bills','leases','tenants','rooms','expenses','cash_openings'] loop
    execute format('delete from rentlio_demo.%I where batch_id=$1',t) using p_batch_id;
    get diagnostics n=row_count;
    removed:=removed||jsonb_build_object(t,n);
  end loop;
  delete from rentlio_demo.batches where id=p_batch_id;
  get diagnostics n=row_count; removed:=removed||jsonb_build_object('batches',n);
  if removed<>expected then raise exception 'Cleanup count mismatch; deletion rolled back' using errcode='23514'; end if;
  return jsonb_build_object('batch_id',p_batch_id,'removed',removed);
end $$;

revoke execute on all functions in schema rentlio_demo from public, anon, authenticated, service_role;
revoke all on function public.demo_list_batches(), public.demo_get_batch(uuid),
  public.demo_record_payment(uuid,uuid,numeric,text,date,uuid,text),
  public.demo_review_payment(uuid,uuid,boolean,text), public.demo_save_cash_opening(uuid,date,numeric),
  public.demo_record_expense(uuid,date,numeric,text,uuid), public.demo_generate_batch(uuid),
  public.demo_delete_batch(uuid,bigint) from public, anon, authenticated, service_role;
grant execute on function public.demo_list_batches(), public.demo_get_batch(uuid),
  public.demo_record_payment(uuid,uuid,numeric,text,date,uuid,text),
  public.demo_review_payment(uuid,uuid,boolean,text), public.demo_save_cash_opening(uuid,date,numeric),
  public.demo_record_expense(uuid,date,numeric,text,uuid), public.demo_generate_batch(uuid),
  public.demo_delete_batch(uuid,bigint) to authenticated;

commit;
