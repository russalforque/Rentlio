-- Read-only supplement to demo-isolation-catalog.sql.
-- The supplied production catalog confirms both referenced tables and columns exist.
-- Run the ENTIRE file. Returns one JSON cell; export its full value for review.
-- Reads scheduler configuration and migration versions, not business records.
-- Job commands may embed integration secrets: review before sharing.
-- Does not execute job commands, application functions, or provider requests.
begin transaction isolation level repeatable read read only;

with
metadata as (
  select current_database() as database_name,
         current_user as inspected_as,
         current_setting('server_version') as server_version,
         current_setting('transaction_read_only') as read_only,
         row_security_active('cron.job'::regclass) as cron_rls_active
),
cron_jobs as (
  select j.jobid, j.jobname, j.schedule, j.command, j.active,
         j.database, j.username
  from cron.job j
  order by j.jobid
),
migration_versions as (
  select m.version, m.name
  from supabase_migrations.schema_migrations m
  order by m.version
)
select jsonb_build_object(
  'audit_format_version', 1,
  'metadata', (select to_jsonb(entry) from metadata entry),
  'cron_jobs', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from cron_jobs entry),
  'migration_versions', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from migration_versions entry)
) as demo_isolation_automation;

commit;
