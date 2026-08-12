-- M-040: canonical identity and transaction-safe duplicate open-exposure rejection.
alter table public.decision_records
  add column sport_code text check (sport_code is null or char_length(sport_code) between 1 and 32),
  add column league_code text check (league_code is null or char_length(league_code) between 1 and 32),
  add column canonical_event_id text check (canonical_event_id is null or char_length(canonical_event_id) between 1 and 200),
  add column market_kind text check (market_kind is null or market_kind in ('MONEYLINE', 'SPREAD', 'TOTAL', 'PLAYER_PROP', 'TEAM_PROP')),
  add column market_period text check (market_period is null or char_length(market_period) between 1 and 80),
  add column market_subject text check (market_subject is null or char_length(market_subject) between 1 and 200),
  add column market_selection text check (market_selection is null or char_length(market_selection) between 1 and 200),
  add column line_value double precision,
  add column market_identity_status text check (market_identity_status is null or market_identity_status in ('COMPLETE', 'BLOCK')),
  add column market_fingerprint text check (market_fingerprint is null or char_length(market_fingerprint) between 1 and 1000),
  add constraint decision_records_complete_market_identity check (
    market_identity_status is distinct from 'COMPLETE'
    or (
      sport_code is not null and btrim(sport_code) <> ''
      and league_code is not null and btrim(league_code) <> ''
      and canonical_event_id is not null and btrim(canonical_event_id) <> ''
      and market_kind is not null
      and market_period is not null and btrim(market_period) <> ''
      and market_selection is not null and btrim(market_selection) <> ''
      and (market_kind not in ('PLAYER_PROP', 'TEAM_PROP') or (market_subject is not null and btrim(market_subject) <> ''))
      and market_fingerprint is not null
    )
  );

create index decision_records_user_market_fingerprint_idx
  on public.decision_records (user_id, market_fingerprint)
  where market_fingerprint is not null;

create or replace function private.market_identity_token(value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select trim(both '_' from regexp_replace(lower(btrim(coalesce(value, ''))), '[^a-z0-9]+', '_', 'g'));
$$;

revoke all on function private.market_identity_token(text) from public, anon, authenticated;

create or replace function private.enforce_market_identity_and_duplicate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_subject text;
  normalized_line text;
begin
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

  if new.source = 'live_ui' and new.verdict = 'BET' then
    if new.market_identity_status is distinct from 'COMPLETE' or new.market_fingerprint is null then
      raise exception 'A live UI BET requires complete canonical market identity.' using errcode = '23514';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || '|' || new.market_fingerprint, 0));
    if exists (
      select 1
      from public.decision_records existing
      where existing.user_id = new.user_id
        and existing.verdict = 'BET'
        and existing.market_fingerprint = new.market_fingerprint
        and not exists (
          select 1 from public.settlement_records settled
          where settled.decision_id = existing.id
            and settled.user_id = existing.user_id
        )
    ) then
      raise exception 'An unresolved BET already exists for this canonical market.' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_market_identity_and_duplicate() from public, anon, authenticated;

create trigger decision_records_canonical_identity
  before insert on public.decision_records
  for each row execute function private.enforce_market_identity_and_duplicate();
