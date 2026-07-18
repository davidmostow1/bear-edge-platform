-- M-030: immutable, owner-isolated decision journal.
-- Browser history is a presentation cache; these normalized rows are canonical.

create table public.decision_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_event_id uuid not null,
  engine_version text not null default '10.1' check (char_length(engine_version) between 1 and 32),
  market text not null check (char_length(market) between 1 and 500),
  market_type text not null check (market_type in ('Main Side', 'Main Total', 'Primary Prop', 'Derivative Prop', 'Live Bet')),
  odds integer check (odds is null or (odds <> 0 and abs(odds) >= 100 and abs(odds) <= 100000)),
  p_user double precision check (p_user is null or (p_user > 0 and p_user < 1)),
  tier smallint check (tier is null or tier between 1 and 5),
  verdict text not null check (verdict in ('BET', 'PASS', 'NO BET')),
  reason_code text not null check (char_length(reason_code) between 1 and 80),
  reason text not null check (char_length(reason) between 1 and 1000),
  recommended_stake numeric(14,2) check (recommended_stake is null or recommended_stake >= 0),
  input_snapshot jsonb not null,
  output_snapshot jsonb not null,
  state_snapshot jsonb not null,
  source text not null default 'live_ui' check (source in ('live_ui', 'backup_restore')),
  data_quality text not null default 'complete' check (data_quality in ('complete', 'legacy_incomplete')),
  created_at timestamptz not null default now(),
  constraint decision_records_client_event_unique unique (user_id, client_event_id),
  constraint decision_records_owner_identity unique (id, user_id),
  constraint decision_records_snapshots_are_objects check (
    jsonb_typeof(input_snapshot) = 'object'
    and jsonb_typeof(output_snapshot) = 'object'
    and jsonb_typeof(state_snapshot) = 'object'
  ),
  constraint decision_records_snapshot_size check (
    octet_length(input_snapshot::text) <= 100000
    and octet_length(output_snapshot::text) <= 100000
    and octet_length(state_snapshot::text) <= 100000
  )
);

create table public.settlement_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_id uuid not null,
  result text not null check (result in ('won', 'lost', 'push')),
  stake numeric(14,2) not null check (stake > 0),
  taken_odds integer not null check (taken_odds <> 0 and abs(taken_odds) between 100 and 100000),
  closing_odds integer check (closing_odds is null or (closing_odds <> 0 and abs(closing_odds) between 100 and 100000)),
  profit numeric(14,2) not null,
  clv_delta double precision check (clv_delta is null or (clv_delta between -1 and 1)),
  settled_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint settlement_records_one_per_decision unique (decision_id),
  constraint settlement_records_owner_identity unique (id, user_id),
  constraint settlement_records_owned_decision foreign key (decision_id, user_id)
    references public.decision_records (id, user_id) on delete restrict,
  constraint settlement_records_clv_pair check (
    (closing_odds is null and clv_delta is null)
    or (closing_odds is not null and clv_delta is not null)
  )
);

create table public.record_amendments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_id uuid not null,
  settlement_id uuid,
  reason text not null check (char_length(reason) between 3 and 1000),
  patch jsonb not null check (jsonb_typeof(patch) = 'object' and octet_length(patch::text) <= 100000),
  created_at timestamptz not null default now(),
  constraint record_amendments_owned_decision foreign key (decision_id, user_id)
    references public.decision_records (id, user_id) on delete restrict,
  constraint record_amendments_owned_settlement foreign key (settlement_id, user_id)
    references public.settlement_records (id, user_id) on delete restrict
);

comment on table public.decision_records is 'Append-only pre-result candidate and recommendation snapshots.';
comment on table public.settlement_records is 'Append-only outcomes linked to BET decisions; closing line and CLV may be unknown.';
comment on table public.record_amendments is 'Append-only correction notes; source journal rows are never rewritten.';

create index decision_records_user_created_idx on public.decision_records (user_id, created_at desc);
create index settlement_records_user_created_idx on public.settlement_records (user_id, created_at desc);
create index record_amendments_user_created_idx on public.record_amendments (user_id, created_at desc);
create index record_amendments_decision_idx on public.record_amendments (decision_id);

alter table public.decision_records enable row level security;
alter table public.decision_records force row level security;
alter table public.settlement_records enable row level security;
alter table public.settlement_records force row level security;
alter table public.record_amendments enable row level security;
alter table public.record_amendments force row level security;

revoke all on public.decision_records from public, anon, authenticated;
revoke all on public.settlement_records from public, anon, authenticated;
revoke all on public.record_amendments from public, anon, authenticated;
grant select, insert on public.decision_records to authenticated;
grant select, insert on public.settlement_records to authenticated;
grant select, insert on public.record_amendments to authenticated;

create policy "decision_records_select_own"
  on public.decision_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "decision_records_insert_own"
  on public.decision_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "settlement_records_select_own"
  on public.settlement_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "settlement_records_insert_own"
  on public.settlement_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "record_amendments_select_own"
  on public.record_amendments for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "record_amendments_insert_own"
  on public.record_amendments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function private.reject_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Bear Edge audit records are append-only; write an amendment instead.'
    using errcode = '55000';
end;
$$;

revoke all on function private.reject_audit_mutation() from public, anon, authenticated;

create trigger decision_records_reject_mutation
  before update or delete on public.decision_records
  for each row execute function private.reject_audit_mutation();
create trigger settlement_records_reject_mutation
  before update or delete on public.settlement_records
  for each row execute function private.reject_audit_mutation();
create trigger record_amendments_reject_mutation
  before update or delete on public.record_amendments
  for each row execute function private.reject_audit_mutation();

create or replace function private.enforce_settlement_is_bet()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.decision_records
    where id = new.decision_id
      and user_id = new.user_id
      and verdict = 'BET'
  ) then
    raise exception 'Only an owned BET decision can be settled.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_settlement_is_bet() from public, anon, authenticated;

create trigger settlement_records_require_bet
  before insert on public.settlement_records
  for each row execute function private.enforce_settlement_is_bet();
