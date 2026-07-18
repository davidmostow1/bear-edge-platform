begin;

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

comment on function private.enforce_market_identity_and_duplicate() is
  'Enforces user ownership for authenticated inserts and permits the server-only service role to create immutable remote projections.';

commit;
