-- Bear Edge private-pilot identity and per-user state foundation.
-- Route guards are UX; these policies are the data authorization boundary.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Private profile data owned by one authenticated user.';

create table public.user_app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schema_version integer not null default 1 check (schema_version > 0),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_app_state_size check (octet_length(state::text) <= 1000000)
);

comment on table public.user_app_state is 'Private Bear Edge application state; one row per authenticated user.';

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.user_app_state enable row level security;
alter table public.user_app_state force row level security;

revoke all on public.profiles from public, anon, authenticated;
revoke all on public.user_app_state from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant insert (id, display_name) on public.profiles to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;
grant select, delete on public.user_app_state to authenticated;
grant insert (user_id, schema_version, state) on public.user_app_state to authenticated;
grant update (schema_version, state, updated_at) on public.user_app_state to authenticated;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "user_app_state_select_own"
  on public.user_app_state
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_app_state_insert_own"
  on public.user_app_state
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_app_state_update_own"
  on public.user_app_state
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_app_state_delete_own"
  on public.user_app_state
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_app_state (user_id) values (new.id);
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created_bear_edge
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger user_app_state_set_updated_at
  before update on public.user_app_state
  for each row execute function private.set_updated_at();
