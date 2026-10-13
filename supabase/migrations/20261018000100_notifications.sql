-- =============================================================================
-- Notifications: in-app notices for the landlord and tenants, plus automatic
-- rent reminders.
--
-- Design
--   * A notification belongs to a LOGIN (auth.users), not a tenant record, so
--     an applicant whose registration is reviewed can be told the outcome, and
--     tenants without a login are simply skipped.
--   * Notifications are written only by triggers and scheduled jobs in this
--     file, all funnelled through _notify(). Clients cannot insert them, so a
--     notice always reflects a business event that actually committed: if the
--     payment, approval or bill rolls back, so does its notice.
--   * Recipients are resolved from the records themselves (the bill's tenant,
--     the single landlord), never from caller input, and _notify() refuses a
--     landlord-only notice for anyone but the landlord and vice versa.
--   * Whoever caused an event is not notified about it (the landlord recording
--     a cash payment does not get a "payment recorded" notice; the tenant does).
--   * Every notice has a deduplication key, unique per recipient, so retries,
--     hourly scheduler ticks and concurrent runs can never send one twice.
--   * Messages carry amounts and dates for the recipient's own bills only, and
--     never payment reference numbers, proofs or another tenant's details.
--   * _notify() is the single place a future email or push channel would hook
--     in (e.g. by writing to an outbox), using the same preferences.
-- =============================================================================

create type public.notification_category as enum ('payment', 'billing', 'account', 'rental', 'system');
create type public.notification_type as enum (
  -- To the landlord
  'registration_submitted',
  'payment_submitted',
  'tenant_activated',
  'move_in_today',
  'move_out_today',
  'bills_due_soon',
  'bills_overdue',
  'bills_generated',
  'billing_failed',
  'system_error',
  -- To tenants and applicants
  'registration_approved',
  'registration_rejected',
  'bill_issued',
  'bill_voided',
  'rent_due_soon',
  'rent_due_today',
  'rent_overdue',
  'payment_rejected',
  'lease_started',
  'lease_updated',
  'lease_ended',
  'announcement',
  -- Either: tenants get these for their own payments; the landlord only when
  -- someone else (e.g. a future payment provider) verified the payment.
  'payment_verified',
  'payment_recorded'
);

-- Notifications ---------------------------------------------------------------------
create table public.notifications (
  id                   uuid primary key default gen_random_uuid(),
  recipient_user_id    uuid not null references auth.users (id) on delete cascade,
  type                 public.notification_type not null,
  category             public.notification_category not null,
  title                text not null check (char_length(title) between 1 and 120),
  message              text not null check (char_length(message) between 1 and 1000),
  -- What opening the notice leads to. Not a foreign key: the targets live in
  -- several tables, and the app re-checks access (RLS) when it opens one.
  related_entity_type  text check (related_entity_type in ('bill', 'payment', 'tenant', 'registration', 'lease', 'billing')),
  related_entity_id    uuid,
  is_read              boolean not null default false,
  read_at              timestamptz,
  deduplication_key    text not null check (char_length(deduplication_key) between 1 and 200),
  created_at           timestamptz not null default now(),
  constraint notifications_dedupe_key unique (recipient_user_id, deduplication_key),
  check (is_read = (read_at is not null)),
  check (related_entity_id is null or related_entity_type is not null)
);
-- Newest-first paging per user, and a cheap unread count.
create index notifications_recipient_idx on public.notifications (recipient_user_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications (recipient_user_id) where not is_read;
-- Retention clean-up.
create index notifications_created_idx on public.notifications (created_at);

-- Preferences: one optional row per login; no row means everything on --------------
create table public.notification_preferences (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  payment_updates  boolean not null default true,
  rent_reminders   boolean not null default true,
  announcements    boolean not null default true,
  general_updates  boolean not null default true,
  updated_at       timestamptz not null default now()
);

create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Reminder schedule, set by the landlord ----------------------------------------------
alter table public.app_settings
  add column rent_reminders_enabled boolean not null default true,
  -- 0 turns a stage off.
  add column reminder_days_before smallint not null default 3 check (reminder_days_before between 0 and 14),
  add column reminder_on_due_date boolean not null default true,
  add column reminder_days_after smallint not null default 3 check (reminder_days_after between 0 and 30);

-- Type metadata ------------------------------------------------------------------------
-- category: how the notice is grouped and coloured.
-- topic:    the preference that can silence it; null = essential, always sent.
-- audience: who may receive it.
create function public._notification_meta(
  p_type       public.notification_type,
  out category public.notification_category,
  out topic    text,
  out audience text
)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when p_type in ('payment_submitted', 'payment_verified', 'payment_recorded', 'payment_rejected')
        then 'payment'
      when p_type in ('bill_issued', 'bill_voided', 'rent_due_soon', 'rent_due_today', 'rent_overdue',
                      'bills_due_soon', 'bills_overdue', 'bills_generated')
        then 'billing'
      when p_type in ('registration_submitted', 'registration_approved', 'registration_rejected', 'tenant_activated')
        then 'account'
      when p_type in ('billing_failed', 'system_error')
        then 'system'
      else 'rental'
    end::public.notification_category,
    case
      when p_type in ('payment_submitted', 'payment_verified', 'payment_recorded') then 'payment_updates'
      when p_type in ('rent_due_soon', 'rent_due_today', 'rent_overdue', 'bills_due_soon', 'bills_overdue') then 'rent_reminders'
      when p_type = 'announcement' then 'announcements'
      when p_type in ('lease_started', 'lease_updated', 'lease_ended', 'tenant_activated', 'bills_generated',
                      'move_in_today', 'move_out_today') then 'general_updates'
    end,
    case
      when p_type in ('registration_submitted', 'payment_submitted', 'tenant_activated', 'move_in_today', 'move_out_today',
                      'bills_due_soon', 'bills_overdue', 'bills_generated', 'billing_failed', 'system_error')
        then 'landlord'
      when p_type in ('payment_verified', 'payment_recorded') then 'any'
      else 'tenant'
    end;
$$;

-- Formatting helpers for messages ---------------------------------------------------
create function public._fmt_money(p_amount numeric)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case s.currency_code
           when 'PHP' then '₱' when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£' when 'JPY' then '¥'
           else s.currency_code || ' '
         end || to_char(coalesce(p_amount, 0), 'FM999,999,999,990.00')
  from public.app_settings s where s.id;
$$;

create function public._fmt_date(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_date, 'Mon FMDD, YYYY');
$$;

create function public._fmt_period(p_period date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_period, 'FMMonth YYYY');
$$;

create function public._method_label(p_method public.payment_method)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_method
    when 'cash' then 'cash' when 'bank_transfer' then 'bank transfer' when 'gcash' then 'GCash'
    when 'maya' then 'Maya' when 'check' then 'check' else 'other means'
  end;
$$;

-- Recipients --------------------------------------------------------------------------
create function public._landlord_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.profiles where role = 'landlord' and is_active limit 1;
$$;

/** The tenant record's login, or null for tenants without portal access. */
create function public._tenant_user_id(p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.profiles where id = p_tenant_id and role = 'tenant' and is_active;
$$;

-- The one way notifications are created ------------------------------------------------
-- Returns the new id, or null when nothing was sent (no login, the recipient
-- caused the event, they opted out, it was already sent, or it was refused).
-- Never raises: a notice must not be able to roll back the business event.
create function public._notify(
  p_recipient   uuid,
  p_type        public.notification_type,
  p_title       text,
  p_message     text,
  p_entity_type text,
  p_entity_id   uuid,
  p_dedupe_key  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     record;
  v_landlord uuid;
  v_id       uuid;
begin
  if p_recipient is null or p_recipient = auth.uid() then
    return null;
  end if;

  select * into v_meta from public._notification_meta(p_type);
  v_landlord := public._landlord_user_id();
  if (v_meta.audience = 'landlord' and p_recipient is distinct from v_landlord)
     or (v_meta.audience = 'tenant' and p_recipient = v_landlord) then
    raise warning 'Refused % notification for %: wrong audience', p_type, p_recipient;
    return null;
  end if;

  if v_meta.topic is not null and exists (
    select 1 from public.notification_preferences np
    where np.user_id = p_recipient
      and not case v_meta.topic
        when 'payment_updates' then np.payment_updates
        when 'rent_reminders'  then np.rent_reminders
        when 'announcements'   then np.announcements
        else np.general_updates
      end
  ) then
    return null;
  end if;

  begin
    insert into public.notifications
      (recipient_user_id, type, category, title, message, related_entity_type, related_entity_id, deduplication_key)
    values
      (p_recipient, p_type, v_meta.category, left(btrim(p_title), 120), left(btrim(p_message), 1000),
       p_entity_type, p_entity_id, p_dedupe_key)
    on conflict on constraint notifications_dedupe_key do nothing
    returning id into v_id;
  exception when others then
    raise warning 'Notification % for % not created: %', p_type, p_recipient, sqlerrm;
    return null;
  end;
  return v_id;
end;
$$;

-- Event: payments ------------------------------------------------------------------------
create function public._payments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill     public.bills;
  v_tenant   public.profiles;
  v_room     text;
  v_period   text;
  v_balance  numeric(12,2);
  v_after    text;
begin
  select * into v_bill from public.bills where id = new.bill_id;
  select * into v_tenant from public.profiles where id = new.tenant_id;
  select room_number into v_room from public.rooms where id = v_bill.room_id;
  v_period := public._fmt_period(v_bill.period);

  -- Tenant submitted proof: the landlord has something to review.
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public._notify(
      public._landlord_user_id(), 'payment_submitted', 'Payment to verify',
      format('%s (Room %s) sent %s by %s for the %s bill.',
             coalesce(nullif(v_tenant.full_name, ''), 'A tenant'), v_room, public._fmt_money(new.amount),
             public._method_label(new.method), v_period),
      'payment', new.id, 'payment_submitted:' || new.id);

  -- Verified, either recorded directly by the landlord or approved after review.
  elsif new.status = 'verified' and (tg_op = 'INSERT' or old.status = 'pending') then
    -- Computed here so it is right whichever bill trigger runs first.
    select v_bill.total_amount - coalesce(sum(amount), 0) into v_balance
    from public.payments where bill_id = new.bill_id and status = 'verified';
    v_after := case when v_balance <= 0 then 'Your bill is now fully paid.'
                    else format('Remaining balance: %s.', public._fmt_money(v_balance)) end;

    if tg_op = 'INSERT' then
      perform public._notify(
        v_tenant.user_id, 'payment_recorded', 'Payment recorded',
        format('Your %s payment of %s for the %s bill was recorded. %s It now shows in your bill''s payment history.',
               public._method_label(new.method), public._fmt_money(new.amount), v_period, v_after),
        'bill', new.bill_id, 'payment_recorded:' || new.id);
    else
      perform public._notify(
        v_tenant.user_id, 'payment_verified', 'Payment confirmed',
        format('Your payment of %s for the %s bill was confirmed. %s It now shows in your bill''s payment history.',
               public._fmt_money(new.amount), v_period, v_after),
        'bill', new.bill_id, 'payment_verified:' || new.id);
    end if;
    -- Only reaches the landlord when someone else did the verifying.
    perform public._notify(
      public._landlord_user_id(),
      case when tg_op = 'INSERT' then 'payment_recorded' else 'payment_verified' end::public.notification_type,
      'Payment verified',
      format('%s from %s (Room %s) was verified for the %s bill.',
             public._fmt_money(new.amount), coalesce(nullif(v_tenant.full_name, ''), 'a tenant'), v_room, v_period),
      'payment', new.id, 'payment_verified:' || new.id);

  -- Rejected after review. Voiding a bill rejects its pending payments too;
  -- the bill-cancelled notice already covers that.
  elsif tg_op = 'UPDATE' and new.status = 'rejected' and old.status = 'pending'
        and new.rejection_reason is distinct from 'Bill was voided' then
    perform public._notify(
      v_tenant.user_id, 'payment_rejected', 'Payment not accepted',
      format('Your payment of %s for the %s bill was not accepted: %s. Please check the details and submit it again.',
             public._fmt_money(new.amount), v_period, rtrim(new.rejection_reason, '.')),
      'bill', new.bill_id, 'payment_rejected:' || new.id);
  end if;
  return null;
end;
$$;

create trigger payments_notify
  after insert or update of status on public.payments
  for each row execute function public._payments_notify();

-- Event: bills -----------------------------------------------------------------------------
-- Deferred to commit: generation inserts the bill first and its lines after,
-- so only then is the total known.
create function public._bill_issued_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  select * into v_bill from public.bills where id = new.id;
  if not found or v_bill.status = 'void' then
    return null;
  end if;
  perform public._notify(
    public._tenant_user_id(v_bill.tenant_id), 'bill_issued', format('%s bill is ready', public._fmt_period(v_bill.period)),
    case when v_bill.total_amount > 0
      then format('Your bill #%s for %s is due on %s.', v_bill.bill_number, public._fmt_money(v_bill.total_amount),
                  public._fmt_date(v_bill.due_date))
      else format('Your bill #%s is due on %s.', v_bill.bill_number, public._fmt_date(v_bill.due_date))
    end,
    'bill', v_bill.id, 'bill_issued:' || v_bill.id);
  return null;
end;
$$;

create constraint trigger bills_issued_notify
  after insert on public.bills
  deferrable initially deferred
  for each row execute function public._bill_issued_notify();

create function public._bill_voided_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'void' and old.status <> 'void' then
    perform public._notify(
      public._tenant_user_id(new.tenant_id), 'bill_voided', 'Bill cancelled',
      format('Your %s bill #%s was cancelled: %s. You do not need to pay it.',
             public._fmt_period(new.period), new.bill_number, rtrim(new.void_reason, '.')),
      'bill', new.id, 'bill_voided:' || new.id);
  end if;
  return null;
end;
$$;

create trigger bills_voided_notify
  after update of status on public.bills
  for each row execute function public._bill_voided_notify();

-- Event: leases --------------------------------------------------------------------------
-- Deferred so a room move (end one lease, start the next, in one transaction)
-- reads as a single "you moved" notice rather than "ended" plus "started".
create function public._lease_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases;
  v_room  text;
  v_moved boolean;
begin
  select * into v_lease from public.leases where id = new.id;
  select room_number into v_room from public.rooms where id = v_lease.room_id;

  if tg_op = 'INSERT' and v_lease.status = 'active' then
    v_moved := exists (
      select 1 from public.leases
      where tenant_id = v_lease.tenant_id and id <> v_lease.id and status = 'ended'
        and end_date = v_lease.start_date - 1
    );
    perform public._notify(
      public._tenant_user_id(v_lease.tenant_id), 'lease_started',
      case when v_moved then format('Moving to Room %s', v_room) else format('Welcome to Room %s', v_room) end,
      format('Your tenancy in Room %s starts on %s. Monthly rent: %s.',
             v_room, public._fmt_date(v_lease.start_date), public._fmt_money(v_lease.monthly_rent)),
      'lease', v_lease.id, 'lease_started:' || v_lease.id);

  elsif tg_op = 'UPDATE' and v_lease.status = 'ended' and old.status = 'active' then
    if exists (select 1 from public.leases
               where tenant_id = v_lease.tenant_id and status = 'active' and start_date = v_lease.end_date + 1) then
      return null; -- A room move: the new lease's notice says it all.
    end if;
    perform public._notify(
      public._tenant_user_id(v_lease.tenant_id), 'lease_ended', 'Tenancy ending',
      format('Your tenancy in Room %s ends on %s. Any remaining bills stay available in the app.',
             v_room, public._fmt_date(v_lease.end_date)),
      'lease', v_lease.id, 'lease_ended:' || v_lease.id);
  end if;
  return null;
end;
$$;

create constraint trigger leases_notify
  after insert or update of status on public.leases
  deferrable initially deferred
  for each row execute function public._lease_notify();

create function public._lease_rent_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and new.monthly_rent is distinct from old.monthly_rent then
    perform public._notify(
      public._tenant_user_id(new.tenant_id), 'lease_updated', 'Rental agreement updated',
      format('Your monthly rent for Room %s is now %s, starting with your next bill.',
             (select room_number from public.rooms where id = new.room_id), public._fmt_money(new.monthly_rent)),
      'lease', new.id, format('lease_updated:%s:%s', new.id, extract(epoch from now())));
  end if;
  return null;
end;
$$;

create trigger leases_rent_notify
  after update of monthly_rent on public.leases
  for each row execute function public._lease_rent_notify();

-- Event: registrations -----------------------------------------------------------------
create function public._registration_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property text := (select property_name from public.app_settings where id);
begin
  -- A verified self-registration is waiting for the landlord. Unverified ones
  -- cannot be approved yet, so they are not worth a notice.
  if new.status = 'pending' and new.source = 'self_signup' and new.email_verified_at is not null
     and (tg_op = 'INSERT' or old.email_verified_at is null) then
    perform public._notify(
      public._landlord_user_id(), 'registration_submitted', 'New tenant registration',
      format('%s%s is waiting for approval. Confirm who they are before approving.',
             coalesce(nullif(new.full_name, ''), new.email),
             case when new.requested_room is not null then format(' (requested Room %s)', new.requested_room) else '' end),
      'registration', new.id, 'registration_submitted:' || new.id);

  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.source = 'self_signup' then
    if new.status = 'approved' then
      perform public._notify(
        new.user_id, 'registration_approved', 'Account approved',
        format('Welcome to %s! You can now see your bills, payments and room details here.', v_property),
        null, null, 'registration_approved:' || new.id);
    elsif new.status = 'rejected' then
      perform public._notify(
        new.user_id, 'registration_rejected', 'Registration not approved',
        format('Your registration was not approved: %s. Contact the landlord if you think this is a mistake.',
               rtrim(new.review_note, '.')),
        null, null, 'registration_rejected:' || new.id);
    end if;
  end if;
  return null;
end;
$$;

create trigger registration_requests_notify
  after insert or update of status, email_verified_at on public.registration_requests
  for each row execute function public._registration_notify();

-- Event: a tenant activates their invited portal account ------------------------------------
create function public._profile_activated_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'tenant' and old.activated_at is null and new.activated_at is not null then
    perform public._notify(
      public._landlord_user_id(), 'tenant_activated', 'Tenant joined the portal',
      format('%s activated their account and can now view bills and pay online.',
             coalesce(nullif(new.full_name, ''), new.email, 'A tenant')),
      'tenant', new.id, 'tenant_activated:' || new.id);
  end if;
  return null;
end;
$$;

create trigger profiles_activated_notify
  after update of activated_at on public.profiles
  for each row execute function public._profile_activated_notify();

-- Announcements ----------------------------------------------------------------------------
-- Sent to every tenant who can use the portal. Returns how many were notified.
create function public.send_announcement(p_title text, p_message text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text := 'announcement:' || gen_random_uuid();
  v_user  uuid;
  v_count integer := 0;
begin
  perform public._assert_landlord();
  if char_length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'Give the announcement a title' using errcode = '22023';
  end if;
  if char_length(btrim(p_title)) > 120 then
    raise exception 'The title is too long (120 characters at most)' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) < 3 then
    raise exception 'Write the announcement' using errcode = '22023';
  end if;
  if char_length(btrim(p_message)) > 1000 then
    raise exception 'The announcement is too long (1000 characters at most)' using errcode = '22023';
  end if;

  for v_user in
    select user_id from public.profiles
    where role = 'tenant' and is_active and suspended_at is null and user_id is not null
  loop
    if public._notify(v_user, 'announcement', p_title, p_message, null, null, v_key) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Reading -------------------------------------------------------------------------------------
create function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set is_read = true, read_at = now()
  where id = any(p_ids) and recipient_user_id = auth.uid() and not is_read;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set is_read = true, read_at = now()
  where recipient_user_id = auth.uid() and not is_read;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Scheduled jobs ---------------------------------------------------------------------------
-- Rent reminders for each open bill, at most once per bill and stage. Stages
-- have a catch-up window, so a missed scheduler tick is sent on the next one,
-- but a reminder is never sent long after it stopped being relevant.
create function public._send_rent_reminders(p_settings public.app_settings, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill   record;
  v_stage  text;
  v_days   integer;
  v_count  integer := 0;
  v_before smallint := p_settings.reminder_days_before;
  v_after  smallint := p_settings.reminder_days_after;
begin
  if not p_settings.rent_reminders_enabled then
    return 0;
  end if;

  for v_bill in
    select b.id, b.period, b.due_date, b.balance, b.created_at, p.user_id
    from public.bills b
    join public.profiles p on p.id = b.tenant_id
    where b.status in ('unpaid', 'partial') and b.balance > 0
      and p.user_id is not null and p.is_active
      and b.due_date between p_today - (v_after + 7) and p_today + v_before
  loop
    v_days := v_bill.due_date - p_today;
    v_stage := case
      -- Skipped for a bill issued in the last day: its "bill ready" notice gave the date.
      when v_before > 0 and v_days between 1 and v_before and v_bill.created_at < now() - interval '1 day' then 'due_soon'
      when p_settings.reminder_on_due_date and v_days = 0 then 'due_today'
      when v_after > 0 and -v_days between v_after and v_after + 6 then 'overdue'
    end;
    continue when v_stage is null;

    if public._notify(
      v_bill.user_id,
      ('rent_' || v_stage)::public.notification_type,
      case v_stage
        when 'due_soon' then case when v_days = 1 then 'Rent due tomorrow' else format('Rent due in %s days', v_days) end
        when 'due_today' then 'Rent due today'
        else 'Rent overdue'
      end,
      case v_stage
        when 'due_soon' then format('%s is due on %s for your %s bill.',
                                    public._fmt_money(v_bill.balance), public._fmt_date(v_bill.due_date), public._fmt_period(v_bill.period))
        when 'due_today' then format('%s is due today for your %s bill.',
                                     public._fmt_money(v_bill.balance), public._fmt_period(v_bill.period))
        else format('Your %s bill was due on %s and %s is still unpaid. Please pay as soon as you can, or contact your landlord.',
                    public._fmt_period(v_bill.period), public._fmt_date(v_bill.due_date), public._fmt_money(v_bill.balance))
      end,
      'bill', v_bill.id, format('rent_%s:%s', v_stage, v_bill.id)
    ) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- "Rooms 101, 102, 103 and 2 more" for the landlord's daily summaries.
create function public._room_list(p_rooms text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case when cardinality(p_rooms) = 1 then 'Room ' else 'Rooms ' end
         || array_to_string(p_rooms[1:3], ', ')
         || case when cardinality(p_rooms) > 3 then format(' and %s more', cardinality(p_rooms) - 3) else '' end;
$$;

-- The landlord's daily summaries: due soon, newly overdue, move-ins and move-outs.
create function public._send_landlord_digests(p_settings public.app_settings, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_landlord uuid := public._landlord_user_id();
  v_ahead    integer := greatest(p_settings.reminder_days_before, 1);
  v_n        integer;
  v_sum      numeric(12,2);
  v_rooms    text[];
  v_total    integer;
  v_lease    record;
  v_count    integer := 0;
begin
  if v_landlord is null then
    return 0;
  end if;

  -- Bills falling due soon that are still open.
  select count(*), sum(b.balance), array_agg(r.room_number order by r.room_number)
    into v_n, v_sum, v_rooms
  from public.bills b join public.rooms r on r.id = b.room_id
  where b.status in ('unpaid', 'partial') and b.balance > 0 and b.due_date = p_today + v_ahead;
  if v_n > 0 and public._notify(
    v_landlord, 'bills_due_soon',
    format('%s %s due on %s', v_n, case when v_n = 1 then 'bill' else 'bills' end, public._fmt_date(p_today + v_ahead)),
    format('%s still open across %s.', public._fmt_money(v_sum), public._room_list(v_rooms)),
    'billing', null, 'bills_due_soon:' || p_today) is not null then
    v_count := v_count + 1;
  end if;

  -- Bills that became overdue today (due yesterday, still open).
  select count(*), sum(b.balance), array_agg(r.room_number order by r.room_number)
    into v_n, v_sum, v_rooms
  from public.bills b join public.rooms r on r.id = b.room_id
  where b.status in ('unpaid', 'partial') and b.balance > 0 and b.due_date = p_today - 1;
  if v_n > 0 then
    select count(*) into v_total from public.bills
    where status in ('unpaid', 'partial') and balance > 0 and due_date < p_today;
    if public._notify(
      v_landlord, 'bills_overdue',
      format('%s %s now overdue', v_n, case when v_n = 1 then 'bill is' else 'bills are' end),
      format('%s unpaid from %s.%s', public._fmt_money(v_sum), public._room_list(v_rooms),
             case when v_total > v_n then format(' %s overdue bills in total.', v_total) else '' end),
      'billing', null, 'bills_overdue:' || p_today) is not null then
      v_count := v_count + 1;
    end if;
  end if;

  -- Move-ins and move-outs happening today.
  for v_lease in
    select l.id, l.tenant_id, l.start_date = p_today and l.status = 'active' as moving_in,
           r.room_number, p.full_name
    from public.leases l
    join public.rooms r on r.id = l.room_id
    join public.profiles p on p.id = l.tenant_id
    where (l.start_date = p_today and l.status = 'active') or l.end_date = p_today
  loop
    if public._notify(
      v_landlord,
      case when v_lease.moving_in then 'move_in_today' else 'move_out_today' end::public.notification_type,
      case when v_lease.moving_in then 'Move-in today' else 'Move-out today' end,
      case when v_lease.moving_in
        then format('%s moves into Room %s today.', coalesce(nullif(v_lease.full_name, ''), 'A tenant'), v_lease.room_number)
        else format('%s moves out of Room %s today. Remember the final meter reading.',
                    coalesce(nullif(v_lease.full_name, ''), 'A tenant'), v_lease.room_number)
      end,
      'tenant', v_lease.tenant_id,
      format('%s:%s', case when v_lease.moving_in then 'move_in' else 'move_out' end, v_lease.id)) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create function public._notify_job_failed(p_job text, p_error text, p_today date)
returns void
language sql
security definer
set search_path = ''
as $$
  select public._notify(
    public._landlord_user_id(), 'system_error', 'Scheduled task failed',
    format('Rentlio could not finish the %s: %s. It will try again within the hour.', p_job, left(p_error, 200)),
    null, null, format('system_error:%s:%s', p_job, p_today));
$$;

-- Invoked hourly by pg_cron. Safe to run as often as you like: every notice is
-- de-duplicated, and nothing goes out before 8 AM at the property.
create function public.run_notification_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_now      timestamp;
  v_today    date;
  v_count    integer := 0;
begin
  -- Retention: read notices go after 90 days, everything after a year.
  begin
    delete from public.notifications
    where (is_read and created_at < now() - interval '90 days') or created_at < now() - interval '1 year';
  exception when others then
    raise warning 'Notification clean-up failed: %', sqlerrm;
  end;

  select * into v_settings from public.app_settings where id;
  v_now := now() at time zone v_settings.timezone;
  v_today := v_now::date;
  if extract(hour from v_now) < 8 then
    return 0;
  end if;

  begin
    v_count := v_count + public._send_rent_reminders(v_settings, v_today);
  exception when others then
    perform public._notify_job_failed('rent reminders', sqlerrm, v_today);
  end;
  begin
    v_count := v_count + public._send_landlord_digests(v_settings, v_today);
  exception when others then
    perform public._notify_job_failed('daily summary', sqlerrm, v_today);
  end;
  return v_count;
end;
$$;

-- Scheduled billing now reports its outcome to the landlord ------------------------------
create or replace function public.run_scheduled_billing()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_today    date;
  v_period   date;
  v_count    integer;
  v_run_id   uuid;
begin
  select * into v_settings from public.app_settings where id;
  if not v_settings.auto_billing_enabled then
    return 0;
  end if;

  v_today := (now() at time zone v_settings.timezone)::date;
  if extract(day from v_today) < v_settings.billing_day then
    return 0;
  end if;
  v_period := date_trunc('month', v_today)::date;

  begin
    v_count := public._generate_bills(v_today);
  exception when others then
    -- Nothing was generated (the block rolled back). Tell the landlord once a day.
    raise warning 'Scheduled billing failed: %', sqlerrm;
    perform public._notify(
      public._landlord_user_id(), 'billing_failed', 'Automatic billing failed',
      format('%s bills could not be generated: %s. Generate them from Billing, or they will be retried within the hour.',
             public._fmt_period(v_period), left(sqlerrm, 200)),
      'billing', null, format('billing_failed:%s:%s', v_period, v_today));
    return 0;
  end;

  if v_count > 0 then
    insert into public.billing_runs (period, triggered_by, bills_created)
    values (v_period, 'schedule', v_count)
    returning id into v_run_id;
    perform public._notify(
      public._landlord_user_id(), 'bills_generated', format('%s bills issued', public._fmt_period(v_period)),
      format('%s %s generated automatically. Add this month''s meter readings so electricity and water are billed.',
             v_count, case when v_count = 1 then 'bill was' else 'bills were' end),
      'billing', null, 'bills_generated:' || v_run_id);
  end if;
  return v_count;
end;
$$;

-- Row level security -------------------------------------------------------------------------
alter table public.notifications            enable row level security;
alter table public.notification_preferences enable row level security;

-- Read-only to clients: no insert, update or delete policies or grants. Read
-- state changes go through mark_*_read(), which only touch the caller's rows.
create policy "notifications: recipient reads own"
  on public.notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));

create policy "notification_preferences: read own"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_preferences: create own"
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_preferences: update own"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Privileges (Supabase grants new objects to authenticated by default) ----------------------
revoke all on public.notifications, public.notification_preferences from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant select on public.notification_preferences to authenticated;
grant insert (user_id, payment_updates, rent_reminders, announcements, general_updates)
  on public.notification_preferences to authenticated;
grant update (user_id, payment_updates, rent_reminders, announcements, general_updates)
  on public.notification_preferences to authenticated;
grant update (rent_reminders_enabled, reminder_days_before, reminder_on_due_date, reminder_days_after)
  on public.app_settings to authenticated;

revoke execute on function
  public._notification_meta(public.notification_type),
  public._fmt_money(numeric),
  public._fmt_date(date),
  public._fmt_period(date),
  public._method_label(public.payment_method),
  public._landlord_user_id(),
  public._tenant_user_id(uuid),
  public._notify(uuid, public.notification_type, text, text, text, uuid, text),
  public._payments_notify(),
  public._bill_issued_notify(),
  public._bill_voided_notify(),
  public._lease_notify(),
  public._lease_rent_notify(),
  public._registration_notify(),
  public._profile_activated_notify(),
  public._send_rent_reminders(public.app_settings, date),
  public._room_list(text[]),
  public._send_landlord_digests(public.app_settings, date),
  public._notify_job_failed(text, text, date),
  public.run_notification_jobs(),
  public.run_scheduled_billing()
from public, anon, authenticated;

revoke execute on function
  public.send_announcement(text, text),
  public.mark_notifications_read(uuid[]),
  public.mark_all_notifications_read()
from public, anon;
grant execute on function
  public.send_announcement(text, text),
  public.mark_notifications_read(uuid[]),
  public.mark_all_notifications_read()
to authenticated;

-- Realtime: deliver new notices instantly. Realtime applies the SELECT policy
-- above, so each subscriber only ever receives their own rows.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- Hourly scheduler (pg_cron is enabled by the scheduled-billing migration).
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rentlio-notifications', '20 * * * *', 'select public.run_notification_jobs();');
  end if;
end;
$$;
