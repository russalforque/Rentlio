-- =============================================================================
-- Automatic monthly billing via Supabase Cron (pg_cron).
--
-- Runs hourly. run_scheduled_billing() does nothing until the configured
-- billing day (in the property's timezone) and bill generation is idempotent,
-- so hourly ticks are cheap and a missed tick self-heals on the next one.
-- New move-ins after the billing day are picked up automatically too.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'rentlio-monthly-billing',
  '5 * * * *',
  $$ select public.run_scheduled_billing(); $$
);
