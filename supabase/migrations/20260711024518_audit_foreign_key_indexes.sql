-- Cover composite ownership foreign keys for joins and parent deletion checks.
create index settlement_records_owned_decision_idx
  on public.settlement_records (decision_id, user_id);
create index record_amendments_owned_decision_idx
  on public.record_amendments (decision_id, user_id);
create index record_amendments_owned_settlement_idx
  on public.record_amendments (settlement_id, user_id);
