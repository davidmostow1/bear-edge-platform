-- Bear Edge / Sweet Bear
-- Proposed append-only quote ledger. Review and merge through GitHub before Supabase deployment.
-- Operational mode remains RESEARCH_ONLY. Authorized stake remains $0.

create extension if not exists pgcrypto;

create table if not exists public.market_quote_events (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null,
  source_surface text not null,
  source_tier smallint not null check (source_tier between 1 and 5),
  source_url text,
  screenshot_ref text,
  series_ticker text,
  event_ticker text not null,
  market_ticker text,
  event_label text not null,
  scheduled_start timestamptz,
  live_state text not null check (live_state in ('pregame','warmup','live','final','unknown')),
  market_kind text not null,
  subject text not null,
  selection text not null default 'YES',
  line numeric,
  unit text,
  yes_bid_cents numeric(7,2) check (yes_bid_cents between 0 and 100),
  yes_ask_cents numeric(7,2) check (yes_ask_cents between 0 and 100),
  app_american_odds integer,
  volume numeric,
  open_interest numeric,
  market_status text,
  verification_status text not null,
  metadata jsonb not null default '{}'::jsonb,
  market_fingerprint text not null,
  content_digest text not null unique,
  ingested_at timestamptz not null default now()
);

create index if not exists market_quote_events_captured_at_idx
  on public.market_quote_events (captured_at desc);

create index if not exists market_quote_events_event_ticker_idx
  on public.market_quote_events (event_ticker);

create index if not exists market_quote_events_market_ticker_idx
  on public.market_quote_events (market_ticker)
  where market_ticker is not null;

create index if not exists market_quote_events_fingerprint_idx
  on public.market_quote_events (market_fingerprint, captured_at desc);

create or replace function public.prevent_market_quote_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'market_quote_events is append-only';
end;
$$;

drop trigger if exists market_quote_events_no_update on public.market_quote_events;
create trigger market_quote_events_no_update
  before update or delete on public.market_quote_events
  for each row execute function public.prevent_market_quote_event_mutation();

comment on table public.market_quote_events is
  'Append-only market quote observations. GitHub owns schema; Supabase owns deployed operational records.';
