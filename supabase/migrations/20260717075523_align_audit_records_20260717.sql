begin;

do $$
begin
  if exists (select 1 from public.decision_records limit 1)
    or exists (select 1 from public.settlement_records limit 1)
    or exists (select 1 from public.record_amendments limit 1)
  then
    raise exception 'Audit projection migration requires empty tables; retain every row until independently validated before migration.';
  end if;
end
$$;

alter table public.decision_records
  add column if not exists schema_version text not null default '2.0.0',
  add column if not exists content_digest text,
  add column if not exists authority text not null default 'local',
  add column if not exists synchronized_at timestamptz not null default now();

alter table public.decision_records
  drop constraint if exists decision_records_verdict_check;
alter table public.decision_records
  add constraint decision_records_verdict_check
  check (verdict = any (array['BET'::text, 'PASS'::text, 'WAIT'::text]));

alter table public.decision_records
  drop constraint if exists decision_records_source_check;
alter table public.decision_records
  add constraint decision_records_source_check
  check (source = any (array[
    'local_engine'::text,
    'live_ui'::text,
    'backup_restore'::text,
    'screenshot_intake'::text,
    'assistant_review'::text
  ]));

alter table public.decision_records
  drop constraint if exists decision_records_schema_version_check;
alter table public.decision_records
  add constraint decision_records_schema_version_check
  check (schema_version = '2.0.0');

alter table public.decision_records
  drop constraint if exists decision_records_content_digest_check;
alter table public.decision_records
  add constraint decision_records_content_digest_check
  check (content_digest ~ '^[a-f0-9]{64}$');
alter table public.decision_records
  alter column content_digest set not null;

alter table public.decision_records
  drop constraint if exists decision_records_authority_check;
alter table public.decision_records
  add constraint decision_records_authority_check
  check (authority = 'local');

create unique index if not exists decision_records_client_event_unique
  on public.decision_records (user_id, client_event_id);

alter table public.settlement_records
  add column if not exists client_event_id uuid not null,
  add column if not exists schema_version text not null default '2.0.0',
  add column if not exists content_digest text,
  add column if not exists authority text not null default 'local',
  add column if not exists source text not null default 'local_engine',
  add column if not exists synchronized_at timestamptz not null default now(),
  alter column stake drop not null,
  alter column taken_odds drop not null,
  alter column profit drop not null;

alter table public.settlement_records
  drop constraint if exists settlement_records_result_check;
alter table public.settlement_records
  add constraint settlement_records_result_check
  check (result = any (array[
    'pending'::text,
    'win'::text,
    'loss'::text,
    'push'::text,
    'void'::text
  ]));

alter table public.settlement_records
  drop constraint if exists settlement_records_one_per_decision;

alter table public.settlement_records
  drop constraint if exists settlement_records_schema_version_check;
alter table public.settlement_records
  add constraint settlement_records_schema_version_check
  check (schema_version = '2.0.0');

alter table public.settlement_records
  drop constraint if exists settlement_records_content_digest_check;
alter table public.settlement_records
  add constraint settlement_records_content_digest_check
  check (content_digest ~ '^[a-f0-9]{64}$');
alter table public.settlement_records
  alter column content_digest set not null;

alter table public.settlement_records
  drop constraint if exists settlement_records_authority_check;
alter table public.settlement_records
  add constraint settlement_records_authority_check
  check (authority = 'local');

alter table public.settlement_records
  drop constraint if exists settlement_records_source_check;
alter table public.settlement_records
  add constraint settlement_records_source_check
  check (source = any (array[
    'local_engine'::text,
    'backup_restore'::text,
    'assistant_review'::text
  ]));

alter table public.settlement_records
  drop constraint if exists settlement_records_final_fields_check;
alter table public.settlement_records
  add constraint settlement_records_final_fields_check
  check (
    result = 'pending'
    or (
      stake is not null
      and stake > 0
      and taken_odds is not null
      and profit is not null
    )
  );

alter table public.settlement_records
  drop constraint if exists settlement_records_clv_pair;
alter table public.settlement_records
  drop constraint if exists settlement_records_clv_requires_closing_odds;
alter table public.settlement_records
  add constraint settlement_records_clv_requires_closing_odds
  check (clv_delta is null or closing_odds is not null);

create unique index if not exists settlement_records_client_event_unique
  on public.settlement_records (user_id, client_event_id);

create index if not exists settlement_records_decision_history
  on public.settlement_records (decision_id, settled_at desc, created_at desc);

alter table public.record_amendments
  add column if not exists client_event_id uuid not null,
  add column if not exists schema_version text not null default '2.0.0',
  add column if not exists content_digest text,
  add column if not exists authority text not null default 'local',
  add column if not exists source text not null default 'local_engine',
  add column if not exists synchronized_at timestamptz not null default now(),
  alter column settlement_id set not null;

alter table public.record_amendments
  drop constraint if exists record_amendments_schema_version_check;
alter table public.record_amendments
  add constraint record_amendments_schema_version_check
  check (schema_version = '2.0.0');

alter table public.record_amendments
  drop constraint if exists record_amendments_content_digest_check;
alter table public.record_amendments
  add constraint record_amendments_content_digest_check
  check (content_digest ~ '^[a-f0-9]{64}$');
alter table public.record_amendments
  alter column content_digest set not null;

alter table public.record_amendments
  drop constraint if exists record_amendments_authority_check;
alter table public.record_amendments
  add constraint record_amendments_authority_check
  check (authority = 'local');

alter table public.record_amendments
  drop constraint if exists record_amendments_source_check;
alter table public.record_amendments
  add constraint record_amendments_source_check
  check (source = any (array[
    'local_engine'::text,
    'backup_restore'::text,
    'assistant_review'::text
  ]));

create unique index if not exists record_amendments_client_event_unique
  on public.record_amendments (user_id, client_event_id);

alter table public.decision_records enable row level security;
alter table public.settlement_records enable row level security;
alter table public.record_amendments enable row level security;

revoke all privileges on table public.decision_records from anon;
revoke all privileges on table public.settlement_records from anon;
revoke all privileges on table public.record_amendments from anon;

revoke update, delete, truncate on table public.decision_records from authenticated, service_role;
revoke update, delete, truncate on table public.settlement_records from authenticated, service_role;
revoke update, delete, truncate on table public.record_amendments from authenticated, service_role;

grant select, insert on table public.decision_records to authenticated;
grant select, insert on table public.settlement_records to authenticated;
grant select, insert on table public.record_amendments to authenticated;

grant select, insert on table public.decision_records to service_role;
grant select, insert on table public.settlement_records to service_role;
grant select, insert on table public.record_amendments to service_role;

comment on table public.decision_records is
  'Immutable remote projection of evaluation records from the local authoritative ledger.';
comment on table public.settlement_records is
  'Immutable remote projection of settlement history from the local authoritative ledger.';
comment on table public.record_amendments is
  'Immutable remote projection of amendments from the local authoritative ledger.';

comment on column public.decision_records.content_digest is
  'Canonical SHA-256 digest copied from the local authoritative record.';
comment on column public.settlement_records.content_digest is
  'Canonical SHA-256 digest copied from the local authoritative record.';
comment on column public.record_amendments.content_digest is
  'Canonical SHA-256 digest copied from the local authoritative record.';

commit;
