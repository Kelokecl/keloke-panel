-- NOT APPLIED: requires explicit approval after automatic review rejection.
select vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'keloke_internal_scheduler_key','Internal operational checks and publishing scheduler');
create or replace function public.keloke_verify_internal_key(p_key text) returns boolean language sql security definer set search_path='' as $$ select p_key is not null and exists(select 1 from vault.decrypted_secrets where name='keloke_internal_scheduler_key' and decrypted_secret=p_key); $$;
revoke all on function public.keloke_verify_internal_key(text) from public,anon,authenticated;
grant execute on function public.keloke_verify_internal_key(text) to service_role;
create or replace function private.keloke_enqueue(p_function text,p_body jsonb default '{}'::jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare k text; rid bigint;
begin
 if p_function <> 'cron-publish' then raise exception 'Unsupported internal job'; end if;
 select decrypted_secret into k from vault.decrypted_secrets where name='keloke_internal_scheduler_key';
 select net.http_post(url:='https://ggqsgkaeopvbsultjgvt.supabase.co/functions/v1/'||p_function,headers:=jsonb_build_object('Content-Type','application/json','x-keloke-internal',k),body:=p_body,timeout_milliseconds:=120000) into rid;
 return rid;
end $$;
revoke all on function private.keloke_enqueue(text,jsonb) from public,anon,authenticated,service_role;
-- A single, authenticated publisher. Existing scheduled rows are preserved.
select cron.alter_job(jobid,command:='select private.keloke_enqueue(''cron-publish'');') from cron.job where jobname='cron-publish-every-minute';
