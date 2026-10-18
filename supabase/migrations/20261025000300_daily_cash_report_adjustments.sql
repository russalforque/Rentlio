-- Opening-cash corrections are append-only and never mingle with income or
-- expense transactions. They take effect at the start of the recorded date.
create table public.daily_cash_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_date date not null,
  amount_delta numeric(12,2) not null check (amount_delta <> 0),
  reason text not null check (length(trim(reason)) between 3 and 250),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index daily_cash_adjustments_date_idx
  on public.daily_cash_adjustments (adjustment_date, created_at);

alter table public.daily_cash_adjustments enable row level security;
revoke all on public.daily_cash_adjustments from public, anon, authenticated;
grant select on public.daily_cash_adjustments to authenticated;

create policy "daily cash adjustments: landlord reads"
  on public.daily_cash_adjustments for select to authenticated
  using ((select public.is_landlord()));

create function public.record_daily_cash_adjustment(
  p_adjustment_date date,
  p_amount_delta numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_reason text := trim(p_reason);
begin
  perform public._assert_landlord();

  if p_adjustment_date is null or p_adjustment_date > public.property_today() then
    raise exception 'The adjustment date cannot be in the future' using errcode = '22023';
  end if;
  if p_amount_delta is null or p_amount_delta = 0
     or p_amount_delta <> round(p_amount_delta, 2)
     or abs(p_amount_delta) > 9999999999.99 then
    raise exception 'Enter a non-zero adjustment with no more than two decimal places' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) not between 3 and 250 then
    raise exception 'Enter an adjustment reason between 3 and 250 characters' using errcode = '22023';
  end if;

  insert into public.daily_cash_adjustments (adjustment_date, amount_delta, reason, created_by)
  values (p_adjustment_date, p_amount_delta, v_reason, (select public.current_profile_id()))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.record_daily_cash_adjustment(date, numeric, text) from public, anon;
grant execute on function public.record_daily_cash_adjustment(date, numeric, text) to authenticated;
