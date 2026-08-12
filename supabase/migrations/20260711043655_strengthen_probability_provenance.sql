-- Reject whitespace-only identifiers and future-dated evidence marked complete.
alter table public.decision_records
  drop constraint decision_records_complete_probability_provenance,
  add constraint decision_records_complete_probability_provenance check (
    probability_provenance_status is distinct from 'COMPLETE'
    or (
      probability_method is not null
      and probability_source is not null
      and btrim(probability_source) <> ''
      and probability_evidence_at is not null
      and probability_evidence_at <= created_at + interval '5 minutes'
      and (probability_method not in ('CALIBRATED_MODEL', 'ENSEMBLE') or (probability_model_version is not null and btrim(probability_model_version) <> '' and probability_sample_size is not null))
      and (probability_method <> 'HISTORICAL_BASE_RATE' or probability_sample_size is not null)
      and (probability_method <> 'MANUAL_RESEARCH' or char_length(btrim(probability_notes)) >= 20)
    )
  );
