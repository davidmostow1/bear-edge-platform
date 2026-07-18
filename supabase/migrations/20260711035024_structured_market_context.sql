-- M-040 foundation: make sportsbook offer provenance queryable without rewriting decisions.
alter table public.decision_records
  add column event_label text check (event_label is null or char_length(event_label) between 1 and 500),
  add column sportsbook text check (sportsbook is null or char_length(sportsbook) between 1 and 120),
  add column selection_label text check (selection_label is null or char_length(selection_label) between 1 and 500),
  add column counterpart_odds integer check (counterpart_odds is null or (counterpart_odds <> 0 and abs(counterpart_odds) between 100 and 100000)),
  add column offer_captured_at timestamptz,
  add column is_live boolean not null default false,
  add column live_state text check (live_state is null or char_length(live_state) between 1 and 500),
  add column evidence_ref text check (evidence_ref is null or char_length(evidence_ref) between 1 and 500),
  add column price_overround double precision check (price_overround is null or price_overround between -1 and 2),
  add column price_integrity_status text check (price_integrity_status is null or price_integrity_status in ('CLEAR', 'REVIEW', 'BLOCK'));

create index decision_records_user_offer_capture_idx
  on public.decision_records (user_id, offer_captured_at desc)
  where offer_captured_at is not null;
create index decision_records_user_sportsbook_idx
  on public.decision_records (user_id, sportsbook)
  where sportsbook is not null;
