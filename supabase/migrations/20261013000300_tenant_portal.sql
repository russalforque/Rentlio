-- =============================================================================
-- Phase 5: rental information shown on the tenant portal.
-- Tenants cannot read the landlord's profile (RLS), so the contact details the
-- landlord chooses to share live in app_settings, which every tenant can read.
-- =============================================================================

alter table public.app_settings
  add column contact_name  text check (contact_name is null or char_length(contact_name) <= 120),
  add column contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  add column contact_email text check (contact_email is null or char_length(contact_email) <= 200),
  add column house_rules   text check (house_rules is null or char_length(house_rules) <= 5000);

grant update (contact_name, contact_phone, contact_email, house_rules) on public.app_settings to authenticated;
