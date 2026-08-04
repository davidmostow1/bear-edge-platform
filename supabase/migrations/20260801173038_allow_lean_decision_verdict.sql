alter table public.decision_records
  drop constraint if exists decision_records_verdict_check;

alter table public.decision_records
  add constraint decision_records_verdict_check
  check (verdict = any (array['BET'::text, 'LEAN'::text, 'WAIT'::text, 'PASS'::text]));
