-- Applied: isolated diagnostics and one-time OAuth state storage only.
create table public.keloke_runtime_checks (key text primary key,payload jsonb not null,checked_at timestamptz not null default now());
alter table public.keloke_runtime_checks enable row level security;
revoke all on public.keloke_runtime_checks from public,anon,authenticated;
grant select on public.keloke_runtime_checks to authenticated;
grant all on public.keloke_runtime_checks to service_role;
create policy "Active admins read runtime checks" on public.keloke_runtime_checks for select to authenticated using (exists(select 1 from public.users where id=auth.uid() and is_active=true and role='admin'));
create table public.keloke_oauth_states (state_hash text primary key,user_id uuid not null,platform text not null,redirect_uri text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes');
alter table public.keloke_oauth_states enable row level security;
revoke all on public.keloke_oauth_states from public,anon,authenticated;
grant all on public.keloke_oauth_states to service_role;
