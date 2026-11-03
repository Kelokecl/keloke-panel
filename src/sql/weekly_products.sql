-- Weekly commercial shortlist. Existing history is preserved.
create schema if not exists private;
create table public.keloke_weekly_products (
 week_start date primary key,
 status text not null check(status in ('running','completed','partial','failed')),
 attempts smallint not null default 1 check(attempts between 1 and 2),
 items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=5),
 notice text,
 started_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.keloke_weekly_products enable row level security;
revoke all on public.keloke_weekly_products from anon, authenticated;
grant select on public.keloke_weekly_products to authenticated;
grant all on public.keloke_weekly_products to service_role;
create policy "Keloke admins read weekly selections" on public.keloke_weekly_products for select to authenticated
 using (exists(select 1 from public.users u where u.id=(select auth.uid()) and u.is_active=true and u.role='admin'));
-- Vault generates the cron credential inside the database; no credential is exposed to clients.
select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'keloke_weekly_scan_key', 'Internal weekly products scheduler');
create or replace function public.keloke_claim_weekly_scan(p_key text) returns date
language plpgsql security definer set search_path='' as $$
declare wk date; claimed date;
begin
 if p_key is null or not exists(select 1 from vault.decrypted_secrets where name='keloke_weekly_scan_key' and decrypted_secret=p_key) then
   raise exception 'Unauthorized';
 end if;
 wk := date_trunc('week',now() at time zone 'America/Santiago')::date;
 insert into public.keloke_weekly_products(week_start,status) values(wk,'running')
 on conflict(week_start) do update set status='running',attempts=public.keloke_weekly_products.attempts+1,started_at=now(),notice=null where public.keloke_weekly_products.status='failed' and public.keloke_weekly_products.attempts<2 returning week_start into claimed;
 return claimed;
end $$;
revoke all on function public.keloke_claim_weekly_scan(text) from public,anon,authenticated;
grant execute on function public.keloke_claim_weekly_scan(text) to service_role;
create or replace function public.keloke_weekly_selection() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('week_start',week_start,'status',status,'items',items,
 'notice',case when status='running' and started_at<now()-interval '10 minutes' then 'La actualización no terminó. Revisa la conexión de la fuente.' else notice end,
 'completed_at',completed_at)
 from public.keloke_weekly_products where week_start=date_trunc('week',now() at time zone 'America/Santiago')::date),
 jsonb_build_object('week_start',date_trunc('week',now() at time zone 'America/Santiago')::date,'status','pending','items','[]'::jsonb,'notice','Esperando la actualización semanal de la fuente.'));
$$;
revoke all on function public.keloke_weekly_selection() from public,anon;
grant execute on function public.keloke_weekly_selection() to authenticated,service_role;
create or replace function private.keloke_enqueue_weekly_scan() returns bigint
language plpgsql security definer set search_path='' as $$
declare secret_value text; request_id bigint;
begin
 select decrypted_secret into secret_value from vault.decrypted_secrets where name='keloke_weekly_scan_key';
 select net.http_post(url:='https://ggqsgkaeopvbsultjgvt.supabase.co/functions/v1/keloke-weekly-products',
 headers:=jsonb_build_object('Content-Type','application/json','x-weekly-key',secret_value),
 body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function private.keloke_enqueue_weekly_scan() from public,anon,authenticated,service_role;
-- Pause only the obsolete product collectors, preserving definitions and history.
select cron.alter_job(jobid,active:=false) from cron.job where jobname in
 ('trends_scan_once','trends_scan_auto','cron_enqueue','cron_parse_category_html','meli_refresh_7d_full','winners_refresh');
select cron.alter_job(jobid,schedule:='0 12 * * 1',command:='select private.keloke_enqueue_weekly_scan();',active:=true)
 from cron.job where jobname='weekly-trends-scan';
