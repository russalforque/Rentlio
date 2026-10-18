-- A landlord-entered daily opening balance takes precedence over the computed
-- carry-forward for that date. Every save is also retained in the audit table.
create table public.daily_cash_openings (
  opening_date date primary key,
  opening_cash numeric(12,2) not null check (opening_cash >= 0),
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_cash_opening_audit (
  id bigint generated always as identity primary key,
  opening_date date not null references public.daily_cash_openings (opening_date) on delete restrict,
  opening_cash numeric(12,2) not null check (opening_cash >= 0),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  event text not null check (event in ('created', 'updated')),
  created_at timestamptz not null default now()
);

create index daily_cash_opening_audit_date_idx
  on public.daily_cash_opening_audit (opening_date, created_at desc);

alter table public.daily_cash_openings enable row level security;
alter table public.daily_cash_opening_audit enable row level security;
revoke all on public.daily_cash_openings, public.daily_cash_opening_audit from public, anon, authenticated;
grant select on public.daily_cash_openings, public.daily_cash_opening_audit to authenticated;

create policy "daily cash openings: landlord reads"
  on public.daily_cash_openings for select to authenticated
  using ((select public.is_landlord()));

create policy "daily cash opening audit: landlord reads"
  on public.daily_cash_opening_audit for select to authenticated
  using ((select public.is_landlord()));

create function public._audit_daily_cash_opening()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.daily_cash_opening_audit (opening_date, opening_cash, actor_id, event)
  values (
    new.opening_date,
    new.opening_cash,
    new.updated_by,
    case when tg_op = 'INSERT' then 'created' else 'updated' end
  );
  return new;
end;
$$;

create trigger daily_cash_openings_audit
  after insert or update on public.daily_cash_openings
  for each row execute function public._audit_daily_cash_opening();

create function public._daily_cash_opening_audit_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Daily cash opening audit entries are permanent' using errcode = '42501';
end;
$$;

create trigger daily_cash_opening_audit_immutable
  before update or delete on public.daily_cash_opening_audit
  for each row execute function public._daily_cash_opening_audit_immutable();

create function public.save_daily_cash_opening(p_opening_date date, p_opening_cash numeric)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select public.current_profile_id());
begin
  perform public._assert_landlord();

  if p_opening_date is null or p_opening_date > public.property_today() then
    raise exception 'The opening cash date cannot be in the future' using errcode = '22023';
  end if;
  if p_opening_cash is null or p_opening_cash < 0
     or p_opening_cash <> round(p_opening_cash, 2)
     or p_opening_cash > 9999999999.99 then
    raise exception 'Beginning cash must be zero or greater and have no more than two decimal places' using errcode = '22023';
  end if;

  insert into public.daily_cash_openings (opening_date, opening_cash, created_by, updated_by)
  values (p_opening_date, p_opening_cash, v_actor, v_actor)
  on conflict (opening_date) do update
    set opening_cash = excluded.opening_cash,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_opening_date;
end;
$$;

revoke execute on function public._audit_daily_cash_opening(),
  public._daily_cash_opening_audit_immutable() from public, anon, authenticated;
revoke execute on function public.save_daily_cash_opening(date, numeric) from public, anon;
grant execute on function public.save_daily_cash_opening(date, numeric) to authenticated;
