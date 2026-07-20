begin;

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_event_id text not null,
  market_fingerprint text not null,
  sportsbook text not null check (sportsbook = 'DraftKings'),
  market_kind text not null default 'PLAYER_PROP' check (market_kind = 'PLAYER_PROP'),
  market_subject text not null,
  market_selection text not null,
  line_value double precision not null,
  odds integer not null check (odds <> 0 and abs(odds) >= 100 and abs(odds) <= 100000),
  opposite_odds integer not null check (opposite_odds <> 0 and abs(opposite_odds) >= 100 and abs(opposite_odds) <= 100000),
  captured_at timestamptz not null,
  source_timestamp timestamptz not null,
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  authorization text not null default 'PRICE_CHECK_ONLY' check (authorization = 'PRICE_CHECK_ONLY'),
  created_at timestamptz not null default now(),
  unique (user_id, market_fingerprint, captured_at)
);

create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market_snapshot_id uuid not null references public.market_snapshots(id) on delete restrict,
  model_version text not null,
  seed text not null,
  simulation_count integer not null check (simulation_count > 0),
  model_probability double precision not null check (model_probability > 0 and model_probability < 1),
  no_vig_probability double precision check (no_vig_probability is null or (no_vig_probability > 0 and no_vig_probability < 1)),
  adjusted_probability double precision not null check (adjusted_probability > 0 and adjusted_probability < 1),
  fair_american_odds integer not null check (fair_american_odds <> 0),
  expected_value_roi double precision not null,
  quarter_kelly_fraction double precision not null check (quarter_kelly_fraction >= 0 and quarter_kelly_fraction <= 0.25),
  verdict text not null check (verdict in ('BET', 'LEAN', 'WAIT', 'PASS')),
  authorization text not null default 'PRICE_CHECK_ONLY' check (authorization = 'PRICE_CHECK_ONLY'),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  output_snapshot jsonb not null check (jsonb_typeof(output_snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists market_snapshots_user_captured_idx
  on public.market_snapshots (user_id, captured_at desc);

create index if not exists market_snapshots_event_idx
  on public.market_snapshots (canonical_event_id, captured_at desc);

create index if not exists simulation_runs_user_created_idx
  on public.simulation_runs (user_id, created_at desc);

create index if not exists simulation_runs_market_snapshot_idx
  on public.simulation_runs (market_snapshot_id);

alter table public.market_snapshots enable row level security;
alter table public.simulation_runs enable row level security;

revoke all on table public.market_snapshots from anon;
revoke all on table public.simulation_runs from anon;
revoke update, delete, truncate on table public.market_snapshots from authenticated, service_role;
revoke update, delete, truncate on table public.simulation_runs from authenticated, service_role;
grant select, insert on table public.market_snapshots to authenticated, service_role;
grant select, insert on table public.simulation_runs to authenticated, service_role;

create policy "market_snapshots_select_own"
  on public.market_snapshots
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "market_snapshots_insert_own"
  on public.market_snapshots
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "simulation_runs_select_own"
  on public.simulation_runs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "simulation_runs_insert_own"
  on public.simulation_runs
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.market_snapshots
      where market_snapshots.id = simulation_runs.market_snapshot_id
        and market_snapshots.user_id = auth.uid()
    )
  );

comment on table public.market_snapshots is
  'Immutable remote projection of exact pregame DraftKings market captures from the local authoritative Bear Edge ledger.';

comment on table public.simulation_runs is
  'Immutable remote projection of deterministic MLB simulation results from the local authoritative Bear Edge ledger.';

commit;
