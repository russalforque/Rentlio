-- Metadata only. Run the ENTIRE file through an authorized connection / SQL editor.
-- Returns ONE row / JSON cell containing all 20 named audit sections.
-- Export or copy that full JSON value; a screenshot cannot show the definitions.
-- Does not invoke application routines or read tenant, payment, or secret rows.
-- Definitions can contain embedded secrets: keep results internal.
begin transaction isolation level repeatable read read only;

with
metadata as (
select current_database() as database_name, current_user as inspected_as,
       current_setting('server_version') as server_version,
       current_setting('transaction_read_only') as read_only
),

schemas as (
select nspname as schema_name, nspacl::text as schema_acl
from pg_namespace
where nspname !~ '^pg_' and nspname <> 'information_schema'
order by nspname
),

extensions as (
select extname, extversion, extnamespace::regnamespace::text as schema_name
from pg_extension order by extname
),

-- All non-system relations, including auth/storage/custom schemas, RLS and ACLs.
relations as (
select n.nspname as schema_name, c.relname, c.relkind,
       c.relrowsecurity, c.relforcerowsecurity, c.reloptions, c.relacl::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
order by n.nspname, c.relname
),

columns as (
select n.nspname as schema_name, c.relname, a.attname,
       format_type(a.atttypid, a.atttypmod) as data_type,
       a.attnotnull, a.attidentity, a.attgenerated, a.attacl::text,
       pg_get_expr(d.adbin, d.adrelid) as default_expression
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
  and a.attnum > 0 and not a.attisdropped
order by n.nspname, c.relname, a.attnum
),

-- Includes incoming foreign keys and constraints in any non-system schema.
constraints as (
select n.nspname as schema_name, c.relname, con.conname, con.contype,
       con.convalidated, con.condeferrable, con.condeferred,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
order by n.nspname, c.relname, con.conname
),

indexes as (
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname !~ '^pg_' and schemaname <> 'information_schema'
order by schemaname, tablename, indexname
),

policies as (
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies order by schemaname, tablename, policyname
),

-- Internal constraint triggers are represented by the constraints above.
triggers as (
select n.nspname as schema_name, c.relname, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid, true) as definition,
       t.tgfoid::regprocedure::text as function_name,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
order by n.nspname, c.relname, t.tgname
),

-- Include custom routines in every non-system schema; exclude extension-owned
-- routines here. Trigger routines above are included regardless of extension.
routines as (
select n.nspname as schema_name, p.oid::regprocedure::text as routine,
       p.prosecdef as security_definer, p.provolatile, p.proconfig,
       p.proowner::regrole::text as owner, p.proacl::text,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  and p.prokind in ('f', 'p')
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
  )
order by n.nspname, routine
),

views as (
select n.nspname as schema_name, c.relname, c.relkind, c.reloptions,
       pg_get_viewdef(c.oid, true) as definition
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v', 'm')
  and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
order by n.nspname, c.relname
),

rules as (
select n.nspname as schema_name, c.relname, r.rulename,
       pg_get_ruledef(r.oid, true) as definition
from pg_rewrite r
join pg_class c on c.oid = r.ev_class
join pg_namespace n on n.oid = c.relnamespace
where r.rulename <> '_RETURN'
  and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
order by n.nspname, c.relname, r.rulename
),

event_triggers as (
select evtname, evtevent, evtenabled, evttags,
       evtfoid::regprocedure::text as function_name,
       pg_get_functiondef(evtfoid) as function_definition
from pg_event_trigger order by evtname
),

-- Sequence configuration only: do not call nextval, setval, or inspect last_value.
sequences as (
select n.nspname as schema_name, c.relname, s.seqstart, s.seqincrement,
       s.seqmin, s.seqmax, s.seqcache, s.seqcycle
from pg_sequence s
join pg_class c on c.oid = s.seqrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
order by n.nspname, c.relname
),

default_privileges as (
select defaclrole::regrole::text as role_name,
       case when defaclnamespace = 0 then null
            else defaclnamespace::regnamespace::text end as schema_name,
       defaclobjtype, defaclacl::text
from pg_default_acl order by role_name, schema_name, defaclobjtype
),

roles as (
select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolcanlogin, rolreplication, rolbypassrls, rolconfig
from pg_roles order by rolname
),

role_memberships as (
select parent.rolname as granted_role, child.rolname as member_role, m.admin_option
from pg_auth_members m
join pg_roles parent on parent.oid = m.roleid
join pg_roles child on child.oid = m.member
order by granted_role, member_role
),

publications as (
select pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate
from pg_publication order by pubname
),

publication_tables as (
select pubname, schemaname, tablename
from pg_publication_tables order by pubname, schemaname, tablename
),

-- Optional integration metadata to inspect separately if present. Do not select
-- Vault data, execute job commands, or invoke webhook/network routines.
optional_relations as (
select relation_name, to_regclass(relation_name)::text as present_relation
from (values ('cron.job'), ('supabase_functions.hooks'),
             ('supabase_migrations.schema_migrations')) as optional(relation_name)
)

select jsonb_build_object(
  'audit_format_version', 1,
  'metadata', (select to_jsonb(entry) from metadata entry),
  'schemas', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from schemas entry),
  'extensions', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from extensions entry),
  'relations', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from relations entry),
  'columns', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from columns entry),
  'constraints', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from constraints entry),
  'indexes', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from indexes entry),
  'policies', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from policies entry),
  'triggers', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from triggers entry),
  'routines', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from routines entry),
  'views', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from views entry),
  'rules', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from rules entry),
  'event_triggers', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from event_triggers entry),
  'sequences', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from sequences entry),
  'default_privileges', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from default_privileges entry),
  'roles', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from roles entry),
  'role_memberships', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from role_memberships entry),
  'publications', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from publications entry),
  'publication_tables', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from publication_tables entry),
  'optional_relations', (select coalesce(jsonb_agg(to_jsonb(entry)), '[]'::jsonb) from optional_relations entry)
) as demo_isolation_audit;

commit;
