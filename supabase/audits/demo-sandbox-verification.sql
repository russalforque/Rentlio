-- Post-install verification only. No demo records are generated or modified.
-- Run after applying ONLY 20261026000100_demo_sandbox.sql on the audited project.
begin transaction isolation level repeatable read read only;
with checked as materialized (
  select rentlio_demo.assert_isolated()
), wrappers as (
  select p.oid,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'demo_list_batches','demo_generate_batch','demo_get_batch','demo_record_payment',
    'demo_review_payment','demo_save_cash_opening','demo_record_expense','demo_delete_batch')
)
select jsonb_build_object(
  'isolation_check','passed',
  'read_only',current_setting('transaction_read_only'),
  'private_table_count',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='rentlio_demo' and c.relkind='r'),
  'wrapper_count',(select count(*) from wrappers),
  'anonymous_execute_revoked',(select bool_and(not has_function_privilege('anon',oid,'EXECUTE')) from wrappers),
  'service_role_execute_revoked',(select bool_and(not has_function_privilege('service_role',oid,'EXECUTE')) from wrappers),
  'authenticated_execute_granted',(select bool_and(has_function_privilege('authenticated',oid,'EXECUTE')) from wrappers),
  'wrappers_use_definer_and_empty_search_path',(select bool_and(prosecdef and 'search_path=""'=any(proconfig)) from wrappers)
) as demo_sandbox_verification from checked;
commit;
