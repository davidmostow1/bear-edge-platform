begin;

alter table public.decision_records
  drop constraint if exists decision_records_schema_version_check;
alter table public.decision_records
  add constraint decision_records_schema_version_check
  check (schema_version = any (array['2.0.0'::text, '2.1.0'::text]));

alter table public.settlement_records
  drop constraint if exists settlement_records_schema_version_check;
alter table public.settlement_records
  add constraint settlement_records_schema_version_check
  check (schema_version = any (array['2.0.0'::text, '2.1.0'::text]));

alter table public.record_amendments
  drop constraint if exists record_amendments_schema_version_check;
alter table public.record_amendments
  add constraint record_amendments_schema_version_check
  check (schema_version = any (array['2.0.0'::text, '2.1.0'::text]));

create table public.prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_id uuid not null,
  client_event_id uuid not null,
  supersedes_client_event_id uuid,
  schema_version text not null check (schema_version = '2.1.0'),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  authority text not null check (authority = 'local'),
  outcome text not null check (outcome in ('win', 'loss', 'push', 'void')),
  resolved_at timestamptz not null,
  event_status text not null check (event_status = 'final'),
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  observed_value double precision,
  observed_unit text not null check (char_length(observed_unit) between 1 and 80),
  source_provider text not null check (char_length(source_provider) between 1 and 120),
  source_type text not null check (char_length(source_type) between 1 and 120),
  source_locator text not null check (char_length(source_locator) between 1 and 2000),
  source_captured_at timestamptz not null,
  source_time timestamptz not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  verification_status text not null check (verification_status = 'verified_official_result'),
  record_snapshot jsonb not null,
  created_at timestamptz not null,
  synchronized_at timestamptz not null default now(),
  constraint prediction_outcomes_owner_identity unique (id, user_id),
  constraint prediction_outcomes_client_event_unique unique (user_id, client_event_id),
  constraint prediction_outcomes_owned_decision foreign key (decision_id, user_id)
    references public.decision_records (id, user_id) on delete restrict,
  constraint prediction_outcomes_supersedes_owned foreign key (user_id, supersedes_client_event_id)
    references public.prediction_outcomes (user_id, client_event_id) on delete restrict,
  constraint prediction_outcomes_score_pair check (
    (home_score is null and away_score is null)
    or (home_score is not null and away_score is not null)
  ),
  constraint prediction_outcomes_observed_value_check check (
    outcome = 'void' or observed_value is not null
  ),
  constraint prediction_outcomes_source_chronology check (
    resolved_at <= source_time
    and source_time <= source_captured_at
    and resolved_at <= source_captured_at
    and source_captured_at <= created_at
  ),
  constraint prediction_outcomes_snapshot_check check (
    jsonb_typeof(record_snapshot) = 'object'
    and octet_length(record_snapshot::text) <= 100000
    and record_snapshot->>'recordType' = 'prediction_outcome'
    and record_snapshot->>'contentDigest' = content_digest
    and record_snapshot->>'clientEventId' = client_event_id::text
  )
);

create table public.closing_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  decision_id uuid not null,
  client_event_id uuid not null,
  supersedes_client_event_id uuid,
  schema_version text not null check (schema_version = '2.1.0'),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  authority text not null check (authority = 'local'),
  sportsbook text not null check (char_length(sportsbook) between 1 and 120),
  market_odds integer not null check (market_odds <> 0 and abs(market_odds) between 100 and 100000),
  opposite_odds integer not null check (opposite_odds <> 0 and abs(opposite_odds) between 100 and 100000),
  market_closed_at timestamptz not null,
  is_final boolean not null check (is_final),
  source_provider text not null check (char_length(source_provider) between 1 and 120),
  source_type text not null check (char_length(source_type) between 1 and 120),
  source_locator text not null check (char_length(source_locator) between 1 and 2000),
  source_captured_at timestamptz not null,
  source_time timestamptz not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  verification_status text not null check (verification_status = 'verified_provider_capture'),
  record_snapshot jsonb not null,
  created_at timestamptz not null,
  synchronized_at timestamptz not null default now(),
  constraint closing_prices_owner_identity unique (id, user_id),
  constraint closing_prices_client_event_unique unique (user_id, client_event_id),
  constraint closing_prices_owned_decision foreign key (decision_id, user_id)
    references public.decision_records (id, user_id) on delete restrict,
  constraint closing_prices_supersedes_owned foreign key (user_id, supersedes_client_event_id)
    references public.closing_prices (user_id, client_event_id) on delete restrict,
  constraint closing_prices_source_chronology check (
    source_time <= market_closed_at
    and source_time <= source_captured_at
    and market_closed_at <= source_captured_at
    and source_captured_at <= created_at
  ),
  constraint closing_prices_snapshot_check check (
    jsonb_typeof(record_snapshot) = 'object'
    and octet_length(record_snapshot::text) <= 100000
    and record_snapshot->>'recordType' = 'closing_price'
    and record_snapshot->>'contentDigest' = content_digest
    and record_snapshot->>'clientEventId' = client_event_id::text
  )
);

create index prediction_outcomes_decision_history
  on public.prediction_outcomes (decision_id, resolved_at desc, created_at desc);
create index closing_prices_decision_history
  on public.closing_prices (decision_id, market_closed_at desc, created_at desc);

alter table public.prediction_outcomes enable row level security;
alter table public.prediction_outcomes force row level security;
alter table public.closing_prices enable row level security;
alter table public.closing_prices force row level security;

revoke all privileges on table public.prediction_outcomes from public, anon, authenticated, service_role;
revoke all privileges on table public.closing_prices from public, anon, authenticated, service_role;
grant select, insert on table public.prediction_outcomes to authenticated, service_role;
grant select, insert on table public.closing_prices to authenticated, service_role;
revoke update, delete, truncate on table public.prediction_outcomes from authenticated, service_role;
revoke update, delete, truncate on table public.closing_prices from authenticated, service_role;

create policy "prediction_outcomes_select_own"
  on public.prediction_outcomes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "prediction_outcomes_insert_own"
  on public.prediction_outcomes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "closing_prices_select_own"
  on public.closing_prices for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "closing_prices_insert_own"
  on public.closing_prices for insert to authenticated
  with check ((select auth.uid()) = user_id);

create trigger prediction_outcomes_reject_mutation
  before update or delete on public.prediction_outcomes
  for each row execute function private.reject_audit_mutation();
create trigger closing_prices_reject_mutation
  before update or delete on public.closing_prices
  for each row execute function private.reject_audit_mutation();

create or replace function private.enforce_shadow_evidence_lineage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  parent_snapshot jsonb;
  event_start_at timestamptz;
  parent_sportsbook text;
  previous_created_at timestamptz;
begin
  if (
    (select auth.uid()) is null
    or new.user_id <> (select auth.uid())
  ) and (
    select auth.jwt()->>'role'
  ) is distinct from 'service_role'
  then
    raise exception 'Shadow evidence owner mismatch.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || '|' || new.decision_id::text || '|' || tg_table_name, 0)
  );

  select input_snapshot->'audit_record'
    into parent_snapshot
  from public.decision_records
  where id = new.decision_id
    and user_id = new.user_id;

  if parent_snapshot is null then
    raise exception 'Shadow evidence requires an owned canonical decision.' using errcode = '23514';
  end if;

  event_start_at := nullif(parent_snapshot->'event'->>'startTime', '')::timestamptz;
  parent_sportsbook := parent_snapshot->'price'->>'sportsbook';

  if tg_table_name = 'prediction_outcomes' then
    if event_start_at is null or new.resolved_at < event_start_at then
      raise exception 'Prediction outcome cannot resolve before event start.' using errcode = '23514';
    end if;

    if new.supersedes_client_event_id is null then
      if exists (
        select 1 from public.prediction_outcomes existing
        where existing.user_id = new.user_id
          and existing.decision_id = new.decision_id
      ) then
        raise exception 'Initial prediction outcome cannot branch an existing history.' using errcode = '23514';
      end if;
    else
      select created_at into previous_created_at
      from public.prediction_outcomes previous
      where previous.user_id = new.user_id
        and previous.decision_id = new.decision_id
        and previous.client_event_id = new.supersedes_client_event_id;

      if previous_created_at is null or new.created_at <= previous_created_at then
        raise exception 'Prediction outcome correction must supersede an earlier record.' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.prediction_outcomes existing
        where existing.user_id = new.user_id
          and existing.decision_id = new.decision_id
          and existing.supersedes_client_event_id = new.supersedes_client_event_id
      ) then
        raise exception 'Prediction outcome correction history cannot branch.' using errcode = '23505';
      end if;
      if exists (
        select 1 from public.prediction_outcomes candidate
        where candidate.user_id = new.user_id
          and candidate.decision_id = new.decision_id
          and candidate.client_event_id <> new.supersedes_client_event_id
          and not exists (
            select 1 from public.prediction_outcomes child
            where child.user_id = candidate.user_id
              and child.decision_id = candidate.decision_id
              and child.supersedes_client_event_id = candidate.client_event_id
          )
      ) then
        raise exception 'Prediction outcome correction must supersede the latest record.' using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'closing_prices' then
    if event_start_at is null or new.market_closed_at > event_start_at then
      raise exception 'Closing price market close cannot be after event start.' using errcode = '23514';
    end if;
    if lower(new.sportsbook) is distinct from lower(parent_sportsbook) then
      raise exception 'Closing price sportsbook must match the evaluated sportsbook.' using errcode = '23514';
    end if;

    if new.supersedes_client_event_id is null then
      if exists (
        select 1 from public.closing_prices existing
        where existing.user_id = new.user_id
          and existing.decision_id = new.decision_id
      ) then
        raise exception 'Initial closing price cannot branch an existing history.' using errcode = '23514';
      end if;
    else
      select created_at into previous_created_at
      from public.closing_prices previous
      where previous.user_id = new.user_id
        and previous.decision_id = new.decision_id
        and previous.client_event_id = new.supersedes_client_event_id;

      if previous_created_at is null or new.created_at <= previous_created_at then
        raise exception 'Closing price correction must supersede an earlier record.' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.closing_prices existing
        where existing.user_id = new.user_id
          and existing.decision_id = new.decision_id
          and existing.supersedes_client_event_id = new.supersedes_client_event_id
      ) then
        raise exception 'Closing price correction history cannot branch.' using errcode = '23505';
      end if;
      if exists (
        select 1 from public.closing_prices candidate
        where candidate.user_id = new.user_id
          and candidate.decision_id = new.decision_id
          and candidate.client_event_id <> new.supersedes_client_event_id
          and not exists (
            select 1 from public.closing_prices child
            where child.user_id = candidate.user_id
              and child.decision_id = candidate.decision_id
              and child.supersedes_client_event_id = candidate.client_event_id
          )
      ) then
        raise exception 'Closing price correction must supersede the latest record.' using errcode = '23514';
      end if;
    end if;
  else
    raise exception 'Unsupported shadow evidence table.' using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_shadow_evidence_lineage() from public, anon, authenticated;

create trigger prediction_outcomes_enforce_lineage
  before insert on public.prediction_outcomes
  for each row execute function private.enforce_shadow_evidence_lineage();
create trigger closing_prices_enforce_lineage
  before insert on public.closing_prices
  for each row execute function private.enforce_shadow_evidence_lineage();

comment on table public.prediction_outcomes is
  'Immutable non-financial official outcomes for shadow and historical evaluation records from the local authoritative ledger.';
comment on table public.closing_prices is
  'Immutable exact-book final closing prices for shadow and historical evaluation records from the local authoritative ledger.';
comment on function private.enforce_shadow_evidence_lineage() is
  'Enforces parent identity, source chronology, exact-book matching, owner claims, and one linear correction history for shadow evidence, including service_role projections.';

commit;
