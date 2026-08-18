-- Sweet Bear LoL prospective model promotion pipeline.
-- This migration does not promote a model. It creates the append-only evidence
-- path required for the canonical registry promotion policy to be earned.

create table if not exists public.model_registry (
  model_id text primary key,
  model_name text not null,
  version text not null,
  sport_code text not null,
  game_code text not null,
  market_family text not null,
  model_status text not null,
  probability_method text not null,
  artifact_sha256 text not null,
  code_sha256 text not null,
  feature_schema_sha256 text not null,
  manifest jsonb not null default '{}'::jsonb,
  retrospective_validation jsonb,
  prospective_calibration_status text not null default 'PENDING',
  uncertainty_status text not null default 'PENDING',
  bet_authority boolean not null default false,
  immutable boolean not null default true,
  registered_at timestamptz not null default now(),
  promoted_at timestamptz,
  demoted_at timestamptz,
  content_digest text not null,
  unique (model_id, version, market_family)
);

create table if not exists public.model_predictions (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references public.model_registry(model_id) on delete restrict,
  canonical_event_id text,
  market_family text not null,
  team_a text not null,
  team_b text not null,
  best_of smallint not null,
  raw_probability_a double precision not null,
  calibrated_probability_a double precision,
  uncertainty_low_a double precision,
  uncertainty_high_a double precision,
  generated_at timestamptz not null,
  evidence_cutoff_at timestamptz not null,
  is_prospective boolean not null default true,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  content_digest text not null,
  outcome_status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create table if not exists public.model_calibration_runs (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references public.model_registry(model_id) on delete restrict,
  run_type text not null,
  sample_start timestamptz,
  sample_end timestamptz,
  sample_size integer not null default 0,
  brier_score double precision,
  log_loss double precision,
  expected_calibration_error double precision,
  calibration_slope double precision,
  calibration_intercept double precision,
  method text not null,
  status text not null,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.model_prediction_context (
  prediction_id uuid primary key references public.model_predictions(id) on delete restrict,
  scheduled_start_at timestamptz not null,
  event_identity_status text not null check (event_identity_status in ('VERIFIED','UNVERIFIED','CONFLICT')),
  roster_status text not null check (roster_status in ('VERIFIED','UNVERIFIED','CONFLICT')),
  patch_status text not null check (patch_status in ('VERIFIED','UNVERIFIED','CONFLICT')),
  source_snapshot jsonb not null default '{}'::jsonb,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.model_prediction_status_events (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.model_predictions(id) on delete restrict,
  status text not null check (status in ('VALID','SUPERSEDED','INVALIDATED')),
  replacement_prediction_id uuid references public.model_predictions(id) on delete restrict,
  reason text not null,
  effective_at timestamptz not null,
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  check (
    (status = 'SUPERSEDED' and replacement_prediction_id is not null)
    or (status <> 'SUPERSEDED' and replacement_prediction_id is null)
  )
);

create table if not exists public.model_event_outcomes (
  id uuid primary key default gen_random_uuid(),
  canonical_event_id text not null,
  winner_team text,
  event_status text not null check (event_status in ('FINAL','CANCELLED','VOID')),
  resolved_at timestamptz not null,
  source_provider text not null,
  source_type text not null,
  source_locator text not null,
  source_captured_at timestamptz not null,
  source_time timestamptz,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  verification_status text not null,
  supersedes_outcome_id uuid references public.model_event_outcomes(id) on delete restrict,
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  check ((event_status = 'FINAL' and winner_team is not null) or event_status <> 'FINAL')
);

create table if not exists public.model_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid references public.model_predictions(id) on delete restrict,
  canonical_event_id text not null,
  snapshot_kind text not null check (snapshot_kind in ('DECISION','CLOSING')),
  provider text not null,
  team_a text not null,
  team_b text not null,
  team_a_yes_bid double precision,
  team_a_yes_ask double precision,
  team_b_yes_bid double precision,
  team_b_yes_ask double precision,
  captured_at timestamptz not null,
  source_time timestamptz,
  is_final boolean not null default false,
  source_locator text not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  verification_status text not null,
  snapshot jsonb not null default '{}'::jsonb,
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  check (team_a_yes_bid is null or (team_a_yes_bid >= 0 and team_a_yes_bid <= 1)),
  check (team_a_yes_ask is null or (team_a_yes_ask >= 0 and team_a_yes_ask <= 1)),
  check (team_b_yes_bid is null or (team_b_yes_bid >= 0 and team_b_yes_bid <= 1)),
  check (team_b_yes_ask is null or (team_b_yes_ask >= 0 and team_b_yes_ask <= 1)),
  check (team_a_yes_bid is null or team_a_yes_ask is null or team_a_yes_bid <= team_a_yes_ask),
  check (team_b_yes_bid is null or team_b_yes_ask is null or team_b_yes_bid <= team_b_yes_ask)
);

create table if not exists public.model_promotion_policies (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null unique,
  policy_digest text not null unique check (policy_digest ~ '^[a-f0-9]{64}$'),
  registered_at timestamptz not null,
  policy jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.model_calibrator_artifacts (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references public.model_registry(model_id) on delete restrict,
  calibration_run_id uuid not null references public.model_calibration_runs(id) on delete restrict,
  calibration_method text not null,
  sample_size integer not null check (sample_size >= 1),
  coefficients jsonb not null,
  dataset_digest text not null check (dataset_digest ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  uncertainty_method text not null,
  bootstrap_resamples integer not null check (bootstrap_resamples >= 1),
  confidence_level double precision not null check (confidence_level > 0 and confidence_level < 1),
  status text not null check (status in ('SHADOW','VERIFIED','REJECTED')),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.model_probability_intervals (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.model_predictions(id) on delete restrict,
  calibrator_artifact_id uuid not null references public.model_calibrator_artifacts(id) on delete restrict,
  calibrated_probability_a double precision not null check (calibrated_probability_a >= 0 and calibrated_probability_a <= 1),
  uncertainty_low_a double precision not null check (uncertainty_low_a >= 0 and uncertainty_low_a <= 1),
  uncertainty_high_a double precision not null check (uncertainty_high_a >= 0 and uncertainty_high_a <= 1),
  method text not null,
  confidence_level double precision not null check (confidence_level > 0 and confidence_level < 1),
  generated_at timestamptz not null,
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  check (uncertainty_low_a <= calibrated_probability_a and calibrated_probability_a <= uncertainty_high_a)
);

create table if not exists public.model_promotion_evaluations (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references public.model_registry(model_id) on delete restrict,
  policy_id uuid not null references public.model_promotion_policies(id) on delete restrict,
  calibration_run_id uuid not null references public.model_calibration_runs(id) on delete restrict,
  calibrator_artifact_id uuid references public.model_calibrator_artifacts(id) on delete restrict,
  report_id text not null,
  report_digest text not null check (report_digest ~ '^[a-f0-9]{64}$'),
  passed boolean not null,
  checks jsonb not null,
  evaluated_at timestamptz not null,
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

insert into public.model_promotion_policies (
  policy_version, policy_digest, registered_at, policy
) values (
  '1.2.0',
  'ee24c6dc23dfa5cf9384d0bb595193b41903024e4e5959e54694800a2cb4226a',
  '2026-07-23T03:13:15.000Z',
  '{
    "minimumSettledPredictions":500,
    "minimumDistinctEvents":100,
    "minimumBucketObservations":100,
    "minimumSettlementCoverage":0.95,
    "maximumExpectedCalibrationError":0.03,
    "minimumCalibrationSlope":0.8,
    "maximumCalibrationSlope":1.2,
    "maximumAbsoluteCalibrationIntercept":0.05,
    "requireNoMaterialBaselineDegradation":true,
    "requireNonNegativeClosingLineValueInterval":true,
    "reliabilityBucketBoundaries":[0,0.2,0.4,0.6,0.8,1],
    "requiredBaseline":{"baselineId":"no_vig_market","method":"two_way_proportional_normalization","methodVersion":"1.0.0"},
    "requiredSplitMethod":"event_atomic_prediction_interval_blocks",
    "requiredUncertaintyMethod":"event_cluster_percentile_bootstrap",
    "minimumBootstrapResamples":2000,
    "minimumConfidenceLevel":0.95
  }'::jsonb
) on conflict (policy_version) do nothing;

create or replace function public.sbkp_reject_append_only_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only; UPDATE and DELETE are forbidden', tg_table_name;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'model_prediction_context',
    'model_prediction_status_events',
    'model_event_outcomes',
    'model_market_snapshots',
    'model_promotion_policies',
    'model_calibrator_artifacts',
    'model_probability_intervals',
    'model_promotion_evaluations'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'sbkp_append_only_' || table_name, table_name);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.sbkp_reject_append_only_mutation()',
      'sbkp_append_only_' || table_name,
      table_name
    );
  end loop;
end;
$$;

create index if not exists model_predictions_event_model_generated_idx
  on public.model_predictions(model_id, canonical_event_id, generated_at desc);
create index if not exists model_prediction_status_prediction_effective_idx
  on public.model_prediction_status_events(prediction_id, effective_at desc, created_at desc);
create index if not exists model_event_outcomes_event_created_idx
  on public.model_event_outcomes(canonical_event_id, created_at desc);
create index if not exists model_market_snapshots_prediction_kind_idx
  on public.model_market_snapshots(prediction_id, snapshot_kind, captured_at desc);
create index if not exists model_market_snapshots_event_kind_idx
  on public.model_market_snapshots(canonical_event_id, snapshot_kind, captured_at desc);
create index if not exists model_probability_intervals_prediction_idx
  on public.model_probability_intervals(prediction_id, generated_at desc);
create index if not exists model_promotion_evaluations_model_idx
  on public.model_promotion_evaluations(model_id, evaluated_at desc);

create or replace view public.v_active_model_predictions as
with ranked_predictions as (
  select
    p.*,
    row_number() over (
      partition by p.model_id, p.canonical_event_id
      order by p.generated_at desc, p.created_at desc, p.id desc
    ) as event_prediction_rank
  from public.model_predictions p
  where p.canonical_event_id is not null
),
latest_status as (
  select prediction_id, status, replacement_prediction_id, reason, effective_at
  from (
    select
      s.*,
      row_number() over (
        partition by s.prediction_id
        order by s.effective_at desc, s.created_at desc, s.id desc
      ) as status_rank
    from public.model_prediction_status_events s
  ) ranked
  where status_rank = 1
)
select
  p.id,
  p.model_id,
  p.canonical_event_id,
  p.market_family,
  p.team_a,
  p.team_b,
  p.best_of,
  p.raw_probability_a,
  p.calibrated_probability_a,
  p.uncertainty_low_a,
  p.uncertainty_high_a,
  p.generated_at,
  p.evidence_cutoff_at,
  p.input_snapshot,
  p.output_snapshot,
  p.content_digest,
  c.scheduled_start_at,
  c.event_identity_status,
  c.roster_status,
  c.patch_status,
  c.source_snapshot,
  c.source_digest,
  s.effective_at as valid_effective_at
from ranked_predictions p
join public.model_prediction_context c on c.prediction_id = p.id
join latest_status s on s.prediction_id = p.id and s.status = 'VALID'
where p.event_prediction_rank = 1
  and p.is_prospective = true
  and p.generated_at < c.scheduled_start_at
  and p.evidence_cutoff_at <= p.generated_at
  and p.evidence_cutoff_at < c.scheduled_start_at;

create or replace view public.v_scored_model_predictions as
with latest_outcomes as (
  select * from (
    select
      o.*,
      row_number() over (
        partition by o.canonical_event_id
        order by o.created_at desc, o.resolved_at desc, o.id desc
      ) as outcome_rank
    from public.model_event_outcomes o
  ) ranked
  where outcome_rank = 1
),
latest_decision as (
  select * from (
    select
      s.*,
      row_number() over (
        partition by s.prediction_id
        order by s.captured_at desc, s.created_at desc, s.id desc
      ) as snapshot_rank
    from public.model_market_snapshots s
    where s.snapshot_kind = 'DECISION' and s.prediction_id is not null
  ) ranked
  where snapshot_rank = 1
),
latest_closing as (
  select * from (
    select
      s.*,
      row_number() over (
        partition by s.canonical_event_id
        order by s.captured_at desc, s.created_at desc, s.id desc
      ) as snapshot_rank
    from public.model_market_snapshots s
    where s.snapshot_kind = 'CLOSING' and s.is_final = true
  ) ranked
  where snapshot_rank = 1
),
latest_interval as (
  select * from (
    select
      i.*,
      row_number() over (
        partition by i.prediction_id
        order by i.generated_at desc, i.created_at desc, i.id desc
      ) as interval_rank
    from public.model_probability_intervals i
  ) ranked
  where interval_rank = 1
)
select
  p.*,
  o.event_status,
  o.winner_team,
  o.resolved_at,
  case when o.event_status = 'FINAL' and o.winner_team = p.team_a then 1
       when o.event_status = 'FINAL' and o.winner_team = p.team_b then 0
       else null end as outcome_a,
  d.team_a_yes_ask as decision_team_a_yes_ask,
  d.team_b_yes_ask as decision_team_b_yes_ask,
  case when d.team_a_yes_ask is not null and d.team_b_yes_ask is not null
            and d.team_a_yes_ask + d.team_b_yes_ask > 0
       then d.team_a_yes_ask / (d.team_a_yes_ask + d.team_b_yes_ask)
       else null end as decision_no_vig_probability_a,
  c.team_a_yes_ask as closing_team_a_yes_ask,
  c.team_b_yes_ask as closing_team_b_yes_ask,
  case when c.team_a_yes_ask is not null and c.team_b_yes_ask is not null
            and c.team_a_yes_ask + c.team_b_yes_ask > 0
       then c.team_a_yes_ask / (c.team_a_yes_ask + c.team_b_yes_ask)
       else null end as closing_no_vig_probability_a,
  i.calibrated_probability_a as certified_calibrated_probability_a,
  i.uncertainty_low_a as certified_uncertainty_low_a,
  i.uncertainty_high_a as certified_uncertainty_high_a,
  i.method as certified_uncertainty_method,
  i.confidence_level as certified_confidence_level
from public.v_active_model_predictions p
left join latest_outcomes o on o.canonical_event_id = p.canonical_event_id
left join latest_decision d on d.prediction_id = p.id
left join latest_closing c on c.canonical_event_id = p.canonical_event_id
left join latest_interval i on i.prediction_id = p.id;

create or replace function public.sbkp_lol_gpr_bt_probability(
  gpr_a double precision,
  gpr_b double precision,
  best_of integer
)
returns double precision
language plpgsql
immutable
strict
as $$
declare
  p double precision;
begin
  if not isfinite(gpr_a) or not isfinite(gpr_b) then
    raise exception 'GPR ratings must be finite';
  end if;
  if best_of not in (1, 3, 5, 7) then
    raise exception 'best_of must be one of 1, 3, 5, 7';
  end if;

  p := 1.0 / (1.0 + power(10.0, (gpr_b - gpr_a) / 400.0));

  if best_of = 1 then
    return p;
  elsif best_of = 3 then
    return p * p * (3.0 - 2.0 * p);
  elsif best_of = 5 then
    return p * p * p * (10.0 - 15.0 * p + 6.0 * p * p);
  end if;

  return power(p, 4) * (35.0 - 84.0 * p + 70.0 * p * p - 20.0 * p * p * p);
end;
$$;

create or replace function public.sbkp_promote_model_if_eligible(p_model_id text)
returns boolean
language plpgsql
as $$
declare
  model_row public.model_registry%rowtype;
  policy_row public.model_promotion_policies%rowtype;
  evaluation_row public.model_promotion_evaluations%rowtype;
  calibration_row public.model_calibration_runs%rowtype;
  artifact_row public.model_calibrator_artifacts%rowtype;
  failed_check_count integer;
begin
  select * into model_row
  from public.model_registry
  where model_id = p_model_id
  for update;

  if not found or model_row.model_status <> 'SHADOW' or model_row.bet_authority = true then
    return false;
  end if;

  select * into policy_row
  from public.model_promotion_policies
  order by registered_at desc, created_at desc
  limit 1;

  if not found then return false; end if;

  select * into evaluation_row
  from public.model_promotion_evaluations
  where model_id = p_model_id
    and policy_id = policy_row.id
    and passed = true
  order by evaluated_at desc, created_at desc
  limit 1;

  if not found or jsonb_typeof(evaluation_row.checks) <> 'array'
     or jsonb_array_length(evaluation_row.checks) = 0 then
    return false;
  end if;

  select count(*) into failed_check_count
  from jsonb_array_elements(evaluation_row.checks) check_row
  where coalesce((check_row ->> 'passed')::boolean, false) is distinct from true;

  if failed_check_count > 0 then return false; end if;

  select * into calibration_row
  from public.model_calibration_runs
  where id = evaluation_row.calibration_run_id
    and model_id = p_model_id
    and run_type = 'PROSPECTIVE'
    and status = 'PASSES_PROMOTION';

  if not found then return false; end if;

  if calibration_row.sample_size < (policy_row.policy ->> 'minimumSettledPredictions')::integer
     or calibration_row.expected_calibration_error is null
     or calibration_row.expected_calibration_error > (policy_row.policy ->> 'maximumExpectedCalibrationError')::double precision
     or calibration_row.calibration_slope is null
     or calibration_row.calibration_slope < (policy_row.policy ->> 'minimumCalibrationSlope')::double precision
     or calibration_row.calibration_slope > (policy_row.policy ->> 'maximumCalibrationSlope')::double precision
     or calibration_row.calibration_intercept is null
     or abs(calibration_row.calibration_intercept) > (policy_row.policy ->> 'maximumAbsoluteCalibrationIntercept')::double precision then
    return false;
  end if;

  select * into artifact_row
  from public.model_calibrator_artifacts
  where id = evaluation_row.calibrator_artifact_id
    and model_id = p_model_id
    and calibration_run_id = calibration_row.id
    and status = 'VERIFIED';

  if not found
     or artifact_row.uncertainty_method <> policy_row.policy ->> 'requiredUncertaintyMethod'
     or artifact_row.bootstrap_resamples < (policy_row.policy ->> 'minimumBootstrapResamples')::integer
     or artifact_row.confidence_level < (policy_row.policy ->> 'minimumConfidenceLevel')::double precision then
    return false;
  end if;

  update public.model_registry
  set model_status = 'VALIDATED',
      prospective_calibration_status = 'VERIFIED',
      uncertainty_status = 'VERIFIED',
      bet_authority = true,
      promoted_at = coalesce(promoted_at, now())
  where model_id = p_model_id;

  return true;
end;
$$;

alter table public.model_prediction_context enable row level security;
alter table public.model_prediction_status_events enable row level security;
alter table public.model_event_outcomes enable row level security;
alter table public.model_market_snapshots enable row level security;
alter table public.model_promotion_policies enable row level security;
alter table public.model_calibrator_artifacts enable row level security;
alter table public.model_probability_intervals enable row level security;
alter table public.model_promotion_evaluations enable row level security;

revoke all on function public.sbkp_promote_model_if_eligible(text) from public;
