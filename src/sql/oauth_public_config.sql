-- Only public OAuth configuration reaches the browser; secrets remain server-side.
create or replace function public.keloke_oauth_public_config(p_platform text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare config jsonb;
begin
 if not exists(select 1 from public.users where id=auth.uid() and is_active=true) then raise exception 'Unauthorized'; end if;
 select jsonb_build_object('client_id',coalesce(credentials->>'client_id',credentials->>'app_id',credentials->>'appId',credentials->>'META_APP_ID',client_id),
 'redirect_uri',credentials->>'redirect_uri') into config from public.oauth_credentials where platform=p_platform limit 1;
 return config;
end $$;
revoke all on function public.keloke_oauth_public_config(text) from public,anon;
grant execute on function public.keloke_oauth_public_config(text) to authenticated;
alter table public.oauth_credentials enable row level security;
revoke all on public.oauth_credentials from public,anon,authenticated;
grant all on public.oauth_credentials to service_role;
-- Secret lookups are used by server functions only.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_app_secret' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
