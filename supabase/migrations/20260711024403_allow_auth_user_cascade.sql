-- Permit privacy/account deletion cascades without permitting direct journal mutation.
create or replace function private.reject_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from auth.users where id = old.user_id
  ) then
    return old;
  end if;
  raise exception 'Bear Edge audit records are append-only; write an amendment instead.'
    using errcode = '55000';
end;
$$;

revoke all on function private.reject_audit_mutation() from public, anon, authenticated;
