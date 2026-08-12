begin;

-- The browser may read only its owner's immutable projections. All projection
-- writes come from the server-side service-role sync worker.
revoke insert on table public.decision_records from authenticated;
revoke insert on table public.settlement_records from authenticated;
revoke insert on table public.record_amendments from authenticated;
revoke insert on table public.prediction_outcomes from authenticated;
revoke insert on table public.closing_prices from authenticated;

grant select on table public.decision_records to authenticated;
grant select on table public.settlement_records to authenticated;
grant select on table public.record_amendments to authenticated;
grant select on table public.prediction_outcomes to authenticated;
grant select on table public.closing_prices to authenticated;

grant select, insert on table public.decision_records to service_role;
grant select, insert on table public.settlement_records to service_role;
grant select, insert on table public.record_amendments to service_role;
grant select, insert on table public.prediction_outcomes to service_role;
grant select, insert on table public.closing_prices to service_role;

drop policy if exists "decision_records_insert_own" on public.decision_records;
drop policy if exists "settlement_records_insert_own" on public.settlement_records;
drop policy if exists "record_amendments_insert_own" on public.record_amendments;
drop policy if exists "prediction_outcomes_insert_own" on public.prediction_outcomes;
drop policy if exists "closing_prices_insert_own" on public.closing_prices;

-- Account deletion is an intentional privacy cascade. Direct journal deletes
-- remain blocked by immutable-table triggers, while deletion of the owning auth
-- user must be able to remove the complete projection graph.
alter table public.prediction_outcomes
  drop constraint if exists prediction_outcomes_owned_decision,
  drop constraint if exists prediction_outcomes_supersedes_owned;
alter table public.prediction_outcomes
  add constraint prediction_outcomes_owned_decision foreign key (decision_id, user_id)
    references public.decision_records (id, user_id) on delete cascade,
  add constraint prediction_outcomes_supersedes_owned foreign key (user_id, supersedes_client_event_id)
    references public.prediction_outcomes (user_id, client_event_id) on delete cascade;

alter table public.closing_prices
  drop constraint if exists closing_prices_owned_decision,
  drop constraint if exists closing_prices_supersedes_owned;
alter table public.closing_prices
  add constraint closing_prices_owned_decision foreign key (decision_id, user_id)
    references public.decision_records (id, user_id) on delete cascade,
  add constraint closing_prices_supersedes_owned foreign key (user_id, supersedes_client_event_id)
    references public.closing_prices (user_id, client_event_id) on delete cascade;

-- CHECK expressions accept SQL UNKNOWN, so every required JSON key has an
-- explicit existence/type guard before its value is compared with a flat field.
alter table public.prediction_outcomes
  drop constraint if exists prediction_outcomes_snapshot_check;
alter table public.prediction_outcomes
  add constraint prediction_outcomes_snapshot_check check (
    jsonb_typeof(record_snapshot) = 'object'
    and octet_length(record_snapshot::text) <= 100000
    and record_snapshot ? 'schemaVersion'
    and record_snapshot ? 'id'
    and record_snapshot ? 'clientEventId'
    and record_snapshot ? 'createdAt'
    and record_snapshot ? 'authority'
    and record_snapshot ? 'recordType'
    and record_snapshot ? 'evaluationId'
    and record_snapshot ? 'supersedesId'
    and record_snapshot ? 'outcome'
    and record_snapshot ? 'resolvedAt'
    and record_snapshot ? 'eventResult'
    and record_snapshot ? 'marketResult'
    and record_snapshot ? 'source'
    and record_snapshot ? 'notes'
    and record_snapshot ? 'contentDigest'
    and jsonb_typeof(record_snapshot->'schemaVersion') = 'string'
    and jsonb_typeof(record_snapshot->'id') = 'string'
    and jsonb_typeof(record_snapshot->'clientEventId') = 'string'
    and jsonb_typeof(record_snapshot->'createdAt') = 'string'
    and jsonb_typeof(record_snapshot->'authority') = 'string'
    and jsonb_typeof(record_snapshot->'recordType') = 'string'
    and jsonb_typeof(record_snapshot->'evaluationId') = 'string'
    and jsonb_typeof(record_snapshot->'outcome') = 'string'
    and jsonb_typeof(record_snapshot->'resolvedAt') = 'string'
    and jsonb_typeof(record_snapshot->'eventResult') = 'object'
    and jsonb_typeof(record_snapshot->'marketResult') = 'object'
    and jsonb_typeof(record_snapshot->'source') = 'object'
    and jsonb_typeof(record_snapshot->'notes') = 'array'
    and jsonb_typeof(record_snapshot->'contentDigest') = 'string'
    and btrim(record_snapshot->>'evaluationId') <> ''
    and record_snapshot->'eventResult' ? 'status'
    and record_snapshot->'eventResult' ? 'homeScore'
    and record_snapshot->'eventResult' ? 'awayScore'
    and record_snapshot->'marketResult' ? 'observedValue'
    and record_snapshot->'marketResult' ? 'unit'
    and record_snapshot->'source' ? 'provider'
    and record_snapshot->'source' ? 'sourceType'
    and record_snapshot->'source' ? 'sourceLocator'
    and record_snapshot->'source' ? 'capturedAt'
    and record_snapshot->'source' ? 'sourceTime'
    and record_snapshot->'source' ? 'digest'
    and record_snapshot->'source' ? 'verificationStatus'
    and jsonb_typeof(record_snapshot->'eventResult'->'status') = 'string'
    and jsonb_typeof(record_snapshot->'marketResult'->'unit') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'provider') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'sourceType') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'sourceLocator') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'capturedAt') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'sourceTime') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'digest') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'verificationStatus') = 'string'
    and record_snapshot->>'schemaVersion' = schema_version
    and record_snapshot->>'id' = 'outcome_' || client_event_id::text
    and record_snapshot->>'clientEventId' = client_event_id::text
    and (record_snapshot->>'createdAt')::timestamptz = created_at
    and record_snapshot->>'authority' = authority
    and record_snapshot->>'recordType' = 'prediction_outcome'
    and record_snapshot->>'outcome' = outcome
    and (record_snapshot->>'resolvedAt')::timestamptz = resolved_at
    and record_snapshot->>'contentDigest' = content_digest
    and (
      (supersedes_client_event_id is null and record_snapshot->'supersedesId' = 'null'::jsonb)
      or (
        supersedes_client_event_id is not null
        and jsonb_typeof(record_snapshot->'supersedesId') = 'string'
        and record_snapshot->>'supersedesId' = 'outcome_' || supersedes_client_event_id::text
      )
    )
    and record_snapshot->'eventResult'->>'status' = event_status
    and (
      (home_score is null and record_snapshot->'eventResult'->'homeScore' = 'null'::jsonb)
      or (
        home_score is not null
        and jsonb_typeof(record_snapshot->'eventResult'->'homeScore') = 'number'
        and (record_snapshot->'eventResult'->>'homeScore')::integer = home_score
      )
    )
    and (
      (away_score is null and record_snapshot->'eventResult'->'awayScore' = 'null'::jsonb)
      or (
        away_score is not null
        and jsonb_typeof(record_snapshot->'eventResult'->'awayScore') = 'number'
        and (record_snapshot->'eventResult'->>'awayScore')::integer = away_score
      )
    )
    and (
      (observed_value is null and record_snapshot->'marketResult'->'observedValue' = 'null'::jsonb)
      or (
        observed_value is not null
        and jsonb_typeof(record_snapshot->'marketResult'->'observedValue') = 'number'
        and (record_snapshot->'marketResult'->>'observedValue')::double precision = observed_value
      )
    )
    and record_snapshot->'marketResult'->>'unit' = observed_unit
    and record_snapshot->'source'->>'provider' = source_provider
    and record_snapshot->'source'->>'sourceType' = source_type
    and record_snapshot->'source'->>'sourceLocator' = source_locator
    and (record_snapshot->'source'->>'capturedAt')::timestamptz = source_captured_at
    and (record_snapshot->'source'->>'sourceTime')::timestamptz = source_time
    and record_snapshot->'source'->>'digest' = source_digest
    and record_snapshot->'source'->>'verificationStatus' = verification_status
  );

alter table public.closing_prices
  drop constraint if exists closing_prices_snapshot_check;
alter table public.closing_prices
  add constraint closing_prices_snapshot_check check (
    jsonb_typeof(record_snapshot) = 'object'
    and octet_length(record_snapshot::text) <= 100000
    and record_snapshot ? 'schemaVersion'
    and record_snapshot ? 'id'
    and record_snapshot ? 'clientEventId'
    and record_snapshot ? 'createdAt'
    and record_snapshot ? 'authority'
    and record_snapshot ? 'recordType'
    and record_snapshot ? 'evaluationId'
    and record_snapshot ? 'supersedesId'
    and record_snapshot ? 'price'
    and record_snapshot ? 'source'
    and record_snapshot ? 'notes'
    and record_snapshot ? 'contentDigest'
    and jsonb_typeof(record_snapshot->'schemaVersion') = 'string'
    and jsonb_typeof(record_snapshot->'id') = 'string'
    and jsonb_typeof(record_snapshot->'clientEventId') = 'string'
    and jsonb_typeof(record_snapshot->'createdAt') = 'string'
    and jsonb_typeof(record_snapshot->'authority') = 'string'
    and jsonb_typeof(record_snapshot->'recordType') = 'string'
    and jsonb_typeof(record_snapshot->'evaluationId') = 'string'
    and jsonb_typeof(record_snapshot->'price') = 'object'
    and jsonb_typeof(record_snapshot->'source') = 'object'
    and jsonb_typeof(record_snapshot->'notes') = 'array'
    and jsonb_typeof(record_snapshot->'contentDigest') = 'string'
    and btrim(record_snapshot->>'evaluationId') <> ''
    and record_snapshot->'price' ? 'sportsbook'
    and record_snapshot->'price' ? 'marketOdds'
    and record_snapshot->'price' ? 'oppositeOdds'
    and record_snapshot->'price' ? 'marketClosedAt'
    and record_snapshot->'price' ? 'isFinal'
    and record_snapshot->'source' ? 'provider'
    and record_snapshot->'source' ? 'sourceType'
    and record_snapshot->'source' ? 'sourceLocator'
    and record_snapshot->'source' ? 'capturedAt'
    and record_snapshot->'source' ? 'sourceTime'
    and record_snapshot->'source' ? 'digest'
    and record_snapshot->'source' ? 'verificationStatus'
    and jsonb_typeof(record_snapshot->'price'->'sportsbook') = 'string'
    and jsonb_typeof(record_snapshot->'price'->'marketOdds') = 'number'
    and jsonb_typeof(record_snapshot->'price'->'oppositeOdds') = 'number'
    and jsonb_typeof(record_snapshot->'price'->'marketClosedAt') = 'string'
    and jsonb_typeof(record_snapshot->'price'->'isFinal') = 'boolean'
    and jsonb_typeof(record_snapshot->'source'->'provider') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'sourceType') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'sourceLocator') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'capturedAt') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'sourceTime') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'digest') = 'string'
    and jsonb_typeof(record_snapshot->'source'->'verificationStatus') = 'string'
    and record_snapshot->>'schemaVersion' = schema_version
    and record_snapshot->>'id' = 'close_' || client_event_id::text
    and record_snapshot->>'clientEventId' = client_event_id::text
    and (record_snapshot->>'createdAt')::timestamptz = created_at
    and record_snapshot->>'authority' = authority
    and record_snapshot->>'recordType' = 'closing_price'
    and record_snapshot->>'contentDigest' = content_digest
    and (
      (supersedes_client_event_id is null and record_snapshot->'supersedesId' = 'null'::jsonb)
      or (
        supersedes_client_event_id is not null
        and jsonb_typeof(record_snapshot->'supersedesId') = 'string'
        and record_snapshot->>'supersedesId' = 'close_' || supersedes_client_event_id::text
      )
    )
    and record_snapshot->'price'->>'sportsbook' = sportsbook
    and (record_snapshot->'price'->>'marketOdds')::integer = market_odds
    and (record_snapshot->'price'->>'oppositeOdds')::integer = opposite_odds
    and (record_snapshot->'price'->>'marketClosedAt')::timestamptz = market_closed_at
    and (record_snapshot->'price'->>'isFinal')::boolean = is_final
    and record_snapshot->'source'->>'provider' = source_provider
    and record_snapshot->'source'->>'sourceType' = source_type
    and record_snapshot->'source'->>'sourceLocator' = source_locator
    and (record_snapshot->'source'->>'capturedAt')::timestamptz = source_captured_at
    and (record_snapshot->'source'->>'sourceTime')::timestamptz = source_time
    and record_snapshot->'source'->>'digest' = source_digest
    and record_snapshot->'source'->>'verificationStatus' = verification_status
  );

alter table public.decision_records
  add constraint decision_records_finite_timestamps_check check (
    isfinite(created_at)
    and isfinite(synchronized_at)
    and (offer_captured_at is null or isfinite(offer_captured_at))
    and (probability_evidence_at is null or isfinite(probability_evidence_at))
  ),
  add constraint decision_records_finite_floats_check check (
    (recommended_stake is null or recommended_stake <> 'NaN'::numeric)
    and (p_user is null or p_user not in (
      'NaN'::double precision,
      'Infinity'::double precision,
      '-Infinity'::double precision
    ))
    and (price_overround is null or price_overround not in (
      'NaN'::double precision,
      'Infinity'::double precision,
      '-Infinity'::double precision
    ))
    and (line_value is null or line_value not in (
      'NaN'::double precision,
      'Infinity'::double precision,
      '-Infinity'::double precision
    ))
  );

alter table public.settlement_records
  add constraint settlement_records_finite_values_check check (
    isfinite(settled_at)
    and isfinite(created_at)
    and isfinite(synchronized_at)
    and (stake is null or stake <> 'NaN'::numeric)
    and (profit is null or profit <> 'NaN'::numeric)
    and (clv_delta is null or clv_delta not in (
      'NaN'::double precision,
      'Infinity'::double precision,
      '-Infinity'::double precision
    ))
  );

alter table public.record_amendments
  add constraint record_amendments_finite_timestamps_check check (
    isfinite(created_at)
    and isfinite(synchronized_at)
  );

alter table public.prediction_outcomes
  add constraint prediction_outcomes_finite_values_check check (
    isfinite(resolved_at)
    and isfinite(source_captured_at)
    and isfinite(source_time)
    and isfinite(created_at)
    and isfinite(synchronized_at)
    and (observed_value is null or observed_value not in (
      'NaN'::double precision,
      'Infinity'::double precision,
      '-Infinity'::double precision
    ))
  );

alter table public.closing_prices
  add constraint closing_prices_finite_timestamps_check check (
    isfinite(market_closed_at)
    and isfinite(source_captured_at)
    and isfinite(source_time)
    and isfinite(created_at)
    and isfinite(synchronized_at)
  );

create index if not exists prediction_outcomes_owned_decision_idx
  on public.prediction_outcomes (decision_id, user_id);
create index if not exists prediction_outcomes_supersedes_owned_idx
  on public.prediction_outcomes (user_id, supersedes_client_event_id)
  where supersedes_client_event_id is not null;
create index if not exists closing_prices_owned_decision_idx
  on public.closing_prices (decision_id, user_id);
create index if not exists closing_prices_supersedes_owned_idx
  on public.closing_prices (user_id, supersedes_client_event_id)
  where supersedes_client_event_id is not null;

create unique index if not exists prediction_outcomes_initial_per_decision_uidx
  on public.prediction_outcomes (user_id, decision_id)
  where supersedes_client_event_id is null;
create unique index if not exists prediction_outcomes_single_child_uidx
  on public.prediction_outcomes (user_id, decision_id, supersedes_client_event_id)
  where supersedes_client_event_id is not null;
create unique index if not exists closing_prices_initial_per_decision_uidx
  on public.closing_prices (user_id, decision_id)
  where supersedes_client_event_id is null;
create unique index if not exists closing_prices_single_child_uidx
  on public.closing_prices (user_id, decision_id, supersedes_client_event_id)
  where supersedes_client_event_id is not null;

-- BEFORE INSERT triggers execute before uniqueness conflict handling. Serialize
-- each client event and distinguish identical retries from digest/identity
-- conflicts so identical rows can continue to ON CONFLICT DO NOTHING.
create or replace function private.is_idempotent_projection_replay(
  projection_table text,
  owner_id uuid,
  event_id uuid,
  projected_digest text,
  projected_decision_id uuid default null,
  projected_settlement_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing_content_digest text;
  existing_decision_id uuid;
  existing_settlement_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(owner_id::text || '|' || event_id::text || '|' || projection_table, 0)
  );

  if projection_table = 'decision_records' then
    select existing.content_digest
      into existing_content_digest
    from public.decision_records existing
    where existing.user_id = owner_id
      and existing.client_event_id = event_id;
  elsif projection_table = 'settlement_records' then
    select existing.content_digest, existing.decision_id
      into existing_content_digest, existing_decision_id
    from public.settlement_records existing
    where existing.user_id = owner_id
      and existing.client_event_id = event_id;
  elsif projection_table = 'record_amendments' then
    select existing.content_digest, existing.decision_id, existing.settlement_id
      into existing_content_digest, existing_decision_id, existing_settlement_id
    from public.record_amendments existing
    where existing.user_id = owner_id
      and existing.client_event_id = event_id;
  elsif projection_table = 'prediction_outcomes' then
    select existing.content_digest, existing.decision_id
      into existing_content_digest, existing_decision_id
    from public.prediction_outcomes existing
    where existing.user_id = owner_id
      and existing.client_event_id = event_id;
  elsif projection_table = 'closing_prices' then
    select existing.content_digest, existing.decision_id
      into existing_content_digest, existing_decision_id
    from public.closing_prices existing
    where existing.user_id = owner_id
      and existing.client_event_id = event_id;
  else
    raise exception 'Unsupported authoritative projection table.' using errcode = '23514';
  end if;

  if existing_content_digest is null then
    return false;
  end if;

  if existing_content_digest is distinct from projected_digest then
    if projection_table in ('prediction_outcomes', 'closing_prices') then
      raise exception 'Shadow evidence client event digest conflict.' using errcode = '23505';
    end if;
    raise exception 'Authoritative projection client event digest conflict.' using errcode = '23505';
  end if;

  if projection_table <> 'decision_records'
    and existing_decision_id is distinct from projected_decision_id
  then
    raise exception 'Authoritative projection client event parent conflict.' using errcode = '23505';
  end if;

  if projection_table = 'record_amendments'
    and existing_settlement_id is distinct from projected_settlement_id
  then
    raise exception 'Authoritative projection client event settlement conflict.' using errcode = '23505';
  end if;

  return true;
end;
$function$;

revoke all on function private.is_idempotent_projection_replay(text, uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.enforce_market_identity_and_duplicate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_subject text;
  normalized_line text;
begin
  if (
    (select auth.uid()) is null
    or new.user_id <> (select auth.uid())
  ) and (
    select auth.jwt()->>'role'
  ) is distinct from 'service_role'
  then
    raise exception 'Canonical market identity owner mismatch.' using errcode = '42501';
  end if;

  if new.market_identity_status = 'COMPLETE' then
    normalized_subject := private.market_identity_token(new.market_subject);
    normalized_line := case when new.line_value is null then '-' else new.line_value::text end;
    new.market_fingerprint := concat_ws('|',
      private.market_identity_token(new.sport_code),
      private.market_identity_token(new.league_code),
      private.market_identity_token(new.canonical_event_id),
      private.market_identity_token(new.market_kind),
      private.market_identity_token(new.market_period),
      case when normalized_subject = '' then '-' else normalized_subject end,
      private.market_identity_token(new.market_selection),
      normalized_line
    );
  else
    new.market_fingerprint := null;
  end if;

  if private.is_idempotent_projection_replay(
    tg_table_name,
    new.user_id,
    new.client_event_id,
    new.content_digest
  ) then
    return new;
  end if;

  if new.source = 'live_ui' and new.verdict = 'BET' then
    if new.market_identity_status is distinct from 'COMPLETE' or new.market_fingerprint is null then
      raise exception 'A live UI BET requires complete canonical market identity.' using errcode = '23514';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(new.user_id::text || '|' || new.market_fingerprint, 0)
    );
    if exists (
      select 1
      from public.decision_records existing
      where existing.user_id = new.user_id
        and existing.verdict = 'BET'
        and existing.market_fingerprint = new.market_fingerprint
        and not exists (
          select 1
          from public.settlement_records settled
          where settled.decision_id = existing.id
            and settled.user_id = existing.user_id
        )
    ) then
      raise exception 'An unresolved BET already exists for this canonical market.' using errcode = '23505';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_market_identity_and_duplicate()
  from public, anon, authenticated;

create or replace function private.enforce_settlement_is_bet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (
    (select auth.uid()) is null
    or new.user_id <> (select auth.uid())
  ) and (
    select auth.jwt()->>'role'
  ) is distinct from 'service_role'
  then
    raise exception 'Settlement projection owner mismatch.' using errcode = '42501';
  end if;

  if private.is_idempotent_projection_replay(
    tg_table_name,
    new.user_id,
    new.client_event_id,
    new.content_digest,
    new.decision_id
  ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.decision_records
    where id = new.decision_id
      and user_id = new.user_id
      and verdict = 'BET'
  ) then
    raise exception 'Only an owned BET decision can be settled.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_settlement_is_bet()
  from public, anon, authenticated;

create or replace function private.enforce_amendment_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (
    (select auth.uid()) is null
    or new.user_id <> (select auth.uid())
  ) and (
    select auth.jwt()->>'role'
  ) is distinct from 'service_role'
  then
    raise exception 'Amendment projection owner mismatch.' using errcode = '42501';
  end if;

  if private.is_idempotent_projection_replay(
    tg_table_name,
    new.user_id,
    new.client_event_id,
    new.content_digest,
    new.decision_id,
    new.settlement_id
  ) then
    return new;
  end if;

  if new.settlement_id is not null and not exists (
    select 1 from public.settlement_records
    where id = new.settlement_id
      and decision_id = new.decision_id
      and user_id = new.user_id
  ) then
    raise exception 'An amendment settlement must belong to the same decision.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_amendment_link()
  from public, anon, authenticated;

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

  if private.is_idempotent_projection_replay(
    tg_table_name,
    new.user_id,
    new.client_event_id,
    new.content_digest,
    new.decision_id
  ) then
    -- Identical retries continue to PostgreSQL conflict handling.
    return new;
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
  if parent_snapshot->>'id' is distinct from new.record_snapshot->>'evaluationId' then
    raise exception 'Shadow evidence snapshot must reference its canonical decision.' using errcode = '23514';
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

revoke all on function private.enforce_shadow_evidence_lineage()
  from public, anon, authenticated;

comment on function private.is_idempotent_projection_replay(text, uuid, uuid, text, uuid, uuid) is
  'Serializes client-event projection retries, permits identical ON CONFLICT replays, and rejects digest or remote-parent conflicts.';
comment on function private.enforce_shadow_evidence_lineage() is
  'Enforces parent identity, source chronology, exact-book matching, owner claims, idempotent replay, and one linear correction history.';

commit;
