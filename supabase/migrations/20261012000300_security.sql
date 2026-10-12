-- =============================================================================
-- Rentlio authorization
--
-- Model
--   * anon: no table access at all.
--   * authenticated: SELECT filtered by RLS. Tenants see only their own rows.
--   * Direct writes are allowed only where the operation is harmless
--     (landlord editing rooms/settings, anyone editing their own contact info).
--     Everything else is reachable only via the SECURITY DEFINER functions in
--     the previous migration, which validate the caller themselves.
-- =============================================================================

-- Table privileges ------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

grant update (full_name, phone, emergency_contact_name, emergency_contact_phone) on public.profiles to authenticated;
grant insert, update, delete on public.rooms to authenticated;
grant update (property_name, property_address, currency_code, timezone, billing_day, due_days,
              electricity_rate, water_billing_mode, water_rate, water_flat_fee,
              auto_billing_enabled, payment_instructions)
  on public.app_settings to authenticated;
grant insert, delete on public.tenant_documents to authenticated;

-- Function privileges -------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- Internal helpers and the scheduler entry point are never callable from clients.
revoke execute on function
  public._assert_landlord(),
  public._assert_active_user(),
  public._refresh_bill(uuid),
  public._bill_items_changed(),
  public._payments_changed(),
  public._sync_bill_utilities(uuid),
  public._generate_bills(date),
  public.run_scheduled_billing(),
  public.handle_new_user(),
  public.handle_user_email_change(),
  public.set_updated_at(),
  public.validate_settings_timezone()
from authenticated;

-- Row level security ---------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.app_settings         enable row level security;
alter table public.rooms                enable row level security;
alter table public.leases               enable row level security;
alter table public.meter_readings       enable row level security;
alter table public.bills                enable row level security;
alter table public.bill_items           enable row level security;
alter table public.payments             enable row level security;
alter table public.deposit_transactions enable row level security;
alter table public.tenant_documents     enable row level security;
alter table public.billing_runs         enable row level security;

-- profiles
create policy "profiles: read own or landlord reads all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_landlord()));

create policy "profiles: update own or landlord updates tenants"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_landlord()))
  with check (id = (select auth.uid()) or (select public.is_landlord()));

-- app_settings: everyone signed in can read (currency, payment instructions, rates)
create policy "settings: read"
  on public.app_settings for select to authenticated
  using (true);

create policy "settings: landlord updates"
  on public.app_settings for update to authenticated
  using ((select public.is_landlord()))
  with check ((select public.is_landlord()));

-- rooms
create policy "rooms: landlord reads all, tenant reads own rooms"
  on public.rooms for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.leases l
      where l.room_id = rooms.id and l.tenant_id = (select auth.uid())
    )
  );

create policy "rooms: landlord inserts"
  on public.rooms for insert to authenticated
  with check ((select public.is_landlord()));

create policy "rooms: landlord updates"
  on public.rooms for update to authenticated
  using ((select public.is_landlord()))
  with check ((select public.is_landlord()));

-- Rooms with any lease history are protected by the FK; empty rooms may be removed.
create policy "rooms: landlord deletes"
  on public.rooms for delete to authenticated
  using ((select public.is_landlord()));

-- leases
create policy "leases: own or landlord"
  on public.leases for select to authenticated
  using (tenant_id = (select auth.uid()) or (select public.is_landlord()));

-- meter_readings: tenants see readings that were billed to them
create policy "meter_readings: billed tenant or landlord"
  on public.meter_readings for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.bills b
      where b.room_id = meter_readings.room_id
        and b.period = meter_readings.period
        and b.tenant_id = (select auth.uid())
    )
  );

-- bills
create policy "bills: own or landlord"
  on public.bills for select to authenticated
  using (tenant_id = (select auth.uid()) or (select public.is_landlord()));

-- bill_items
create policy "bill_items: via own bill or landlord"
  on public.bill_items for select to authenticated
  using (
    (select public.is_landlord())
    or exists (
      select 1 from public.bills b
      where b.id = bill_items.bill_id and b.tenant_id = (select auth.uid())
    )
  );

-- payments
create policy "payments: own or landlord"
  on public.payments for select to authenticated
  using (tenant_id = (select auth.uid()) or (select public.is_landlord()));

-- deposit_transactions
create policy "deposits: own or landlord"
  on public.deposit_transactions for select to authenticated
  using (tenant_id = (select auth.uid()) or (select public.is_landlord()));

-- tenant_documents
create policy "documents: own or landlord"
  on public.tenant_documents for select to authenticated
  using (tenant_id = (select auth.uid()) or (select public.is_landlord()));

create policy "documents: landlord inserts"
  on public.tenant_documents for insert to authenticated
  with check ((select public.is_landlord()) and uploaded_by = (select auth.uid()));

create policy "documents: landlord deletes"
  on public.tenant_documents for delete to authenticated
  using ((select public.is_landlord()));

-- billing_runs
create policy "billing_runs: landlord"
  on public.billing_runs for select to authenticated
  using ((select public.is_landlord()));

-- Storage -------------------------------------------------------------------------
-- Object paths are "<tenant_id>/<file>" in both buckets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-proofs',   'payment-proofs',   false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('tenant-documents', 'tenant-documents', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Tenants upload proofs into their own folder only, and can never overwrite or
-- delete them (no update/delete policies), so proof history is preserved.
create policy "payment-proofs: tenant uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "payment-proofs: landlord uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (select public.is_landlord()));

create policy "payment-proofs: owner or landlord reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_landlord()))
  );

create policy "tenant-documents: landlord writes"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-documents' and (select public.is_landlord()));

create policy "tenant-documents: landlord deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tenant-documents' and (select public.is_landlord()));

create policy "tenant-documents: owner or landlord reads"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tenant-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_landlord()))
  );
