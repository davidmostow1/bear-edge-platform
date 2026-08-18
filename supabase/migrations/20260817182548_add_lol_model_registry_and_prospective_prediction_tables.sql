-- Backfill of the production migration that introduced the LoL shadow model.
-- Kept in Git so a fresh database can reproduce the deployed schema.

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
  manifest jsonb not null,
  retrospective_validation jsonb,
  prospective_calibration_status text not null,
  uncertainty_status text not null,
  bet_authority boolean not null default false,
  immutable boolean not null default true,
  content_digest text not null,
  registered_at timestamptz not null default now(),
  promoted_at timestamptz,
  demoted_at timestamptz,
  unique(model_id,version,market_family)
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
  evidence_cutoff_at timestamptz,
  is_prospective boolean not null,
  input_snapshot jsonb not null,
  output_snapshot jsonb not null,
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
  sample_size integer not null,
  brier_score double precision,
  log_loss double precision,
  expected_calibration_error double precision,
  calibration_slope double precision,
  calibration_intercept double precision,
  method text,
  status text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

insert into public.model_registry(
  model_id,model_name,version,sport_code,game_code,market_family,model_status,
  probability_method,artifact_sha256,code_sha256,feature_schema_sha256,manifest,
  retrospective_validation,prospective_calibration_status,uncertainty_status,
  bet_authority,immutable,content_digest,registered_at
) values (
  'SBKP-LOL-FMW-GPR-BT-0.1.0',
  'Sweet Bear LoL Full-Match Winner GPR-Bradley-Terry',
  '0.1.0','LOL','LEAGUE_OF_LEGENDS','FULL_MATCH_WINNER','SHADOW',
  'GPR_BRADLEY_TERRY_SERIES',
  '7ca4d2295ca0543fc3163968311aaed2b50531dbda86b74c58eb726526c4d1f0',
  '159981d5968541d7e27358ac2fab4df929a5e4c8aa66c7974cb86674bb9357a1',
  'b0eb9b705ae5f30cab98366019d405020b200a114aba4bb2376f4551fa9aa41e',
  '{"name":"Sweet Bear LoL Full-Match Winner GPR-Bradley-Terry","status":"SHADOW","version":"0.1.0","model_id":"SBKP-LOL-FMW-GPR-BT-0.1.0","sport_code":"LOL","rating_scale":400,"bet_authority":false,"market_family":"FULL_MATCH_WINNER","market_odds_used":false,"promotion_status":"NOT_PROMOTED","calibration_status":"PROSPECTIVE_CALIBRATION_PENDING","uncertainty_status":"PROSPECTIVE_UNCERTAINTY_PENDING","probability_method":"GPR_BRADLEY_TERRY_SERIES","feature_schema":{"required":["team_a","team_b","gpr_a","gpr_b","best_of"],"prohibited":["prediction_market_price","live_game_state","current_match_post_start_stats"],"best_of_allowed":[1,3,5,7]}}'::jsonb,
  '{"n":13,"type":"TRACKED_LANE_STRESS_SAMPLE","status":"FAILS_PROMOTION","accuracy":0.5384615384615384,"log_loss":0.8035040930578957,"brier_score":0.28483541923076927,"parameter_tuning_on_sample":false}'::jsonb,
  'PENDING','PENDING',false,true,
  '421b753906e72653f0019930d31faee12faded77c8657b6a05013c4a36750beb',
  '2026-08-17T18:26:08.348554Z'
) on conflict(model_id) do nothing;
