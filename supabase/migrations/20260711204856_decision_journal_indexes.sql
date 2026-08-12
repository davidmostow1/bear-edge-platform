create index if not exists decision_records_user_created_idx
on public.decision_records (user_id, created_at desc);

create unique index if not exists decision_records_user_client_event_uidx
on public.decision_records (user_id, client_event_id);

create index if not exists settlement_records_user_settled_idx
on public.settlement_records (user_id, settled_at desc);
