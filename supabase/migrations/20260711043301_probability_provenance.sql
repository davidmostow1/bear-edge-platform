-- M-040: make fair-probability evidence queryable and mandatory for future UI BETs.
alter table public.decision_records
  add column probability_method text check (probability_method is null or probability_method in ('CALIBRATED_MODEL', 'HISTORICAL_BASE_RATE', 'MANUAL_RESEARCH', 'ENSEMBLE')),
  add column probability_source text check (probability_source is null or char_length(probability_source) between 1 and 1000),
  add column probability_model_version text check (probability_model_version is null or char_length(probability_model_version) between 1 and 120),
  add column probability_sample_size integer check (probability_sample_size is null or probability_sample_size > 0),
  add column probability_evidence_at timestamptz,
  add column probability_notes text check (probability_notes is null or char_length(probability_notes) between 1 and 5000),
  add column probability_provenance_status text check (probability_provenance_status is null or probability_provenance_status in ('COMPLETE', 'BLOCK')),
  add constraint decision_records_complete_probability_provenance check (
    probability_provenance_status is distinct from 'COMPLETE'
    or (
      probability_method is not null
      and probability_source is not null
      and probability_evidence_at is not null
      and (probability_method not in ('CALIBRATED_MODEL', 'ENSEMBLE') or (probability_model_version is not null and probability_sample_size is not null))
      and (probability_method <> 'HISTORICAL_BASE_RATE' or probability_sample_size is not null)
      and (probability_method <> 'MANUAL_RESEARCH' or char_length(probability_notes) >= 20)
    )
  );

create index decision_records_user_probability_method_idx
  on public.decision_records (user_id, probability_method)
  where probability_method is not null;

create or replace function private.enforce_bet_probability_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source = 'live_ui'
    and new.verdict = 'BET'
    and new.probability_provenance_status is distinct from 'COMPLETE'
  then
    raise exception 'A live UI BET requires complete probability provenance.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_bet_probability_provenance() from public, anon, authenticated;

create trigger decision_records_require_bet_probability_provenance
  before insert on public.decision_records
  for each row execute function private.enforce_bet_probability_provenance();
