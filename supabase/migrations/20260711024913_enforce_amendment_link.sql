-- Prevent an amendment from pairing one decision with another decision's settlement.
create or replace function private.enforce_amendment_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
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
$$;

revoke all on function private.enforce_amendment_link() from public, anon, authenticated;

create trigger record_amendments_require_consistent_link
  before insert on public.record_amendments
  for each row execute function private.enforce_amendment_link();
