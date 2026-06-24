-- ============================================================
-- Deriv Pulse — Phase 2 Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================
do $$ begin
  create type trade_outcome as enum ('win', 'loss', 'pending');
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- PROFILES
-- Auto-created on signup via trigger
-- ============================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- WATCHLISTS
-- ============================================================
create table if not exists public.watchlists (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  symbols     text[] not null default '{}',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.watchlists enable row level security;

create policy "Users manage own watchlists"
  on public.watchlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists watchlists_user_id_idx on public.watchlists(user_id);

create trigger watchlists_updated_at
  before update on public.watchlists
  for each row execute procedure public.set_updated_at();

-- Ensure only one default watchlist per user
create unique index if not exists watchlists_one_default_per_user
  on public.watchlists(user_id)
  where is_default = true;

-- ============================================================
-- TRADE JOURNAL
-- ============================================================
create table if not exists public.trade_journal (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  symbol          text not null,
  contract_type   text not null,          -- e.g. 'DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITEVEN', 'DIGITODD', 'RISE', 'FALL'
  stake           numeric(12,2) not null,
  payout          numeric(12,2),
  outcome         trade_outcome not null default 'pending',
  entry_digit     smallint check (entry_digit between 0 and 9),
  barrier         smallint check (barrier between 0 and 9),
  duration_ticks  smallint,
  notes           text,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.trade_journal enable row level security;

create policy "Users manage own trades"
  on public.trade_journal for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists trade_journal_user_id_idx on public.trade_journal(user_id);
create index if not exists trade_journal_symbol_idx  on public.trade_journal(symbol);
create index if not exists trade_journal_opened_at_idx on public.trade_journal(opened_at desc);

-- ============================================================
-- SIGNAL HISTORY
-- ============================================================
create table if not exists public.signal_history (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  symbol        text not null,
  signal_type   text not null,     -- e.g. 'digit_bias', 'volatility_regime', 'streak'
  signal_value  text not null,     -- e.g. 'EVEN_HEAVY', 'EXPANDING', 'OVER_5_HOT'
  confidence    numeric(5,2) not null check (confidence between 0 and 100),
  window_size   integer not null,
  tick_epoch    bigint not null,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

alter table public.signal_history enable row level security;

create policy "Users manage own signals"
  on public.signal_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists signal_history_user_id_idx  on public.signal_history(user_id);
create index if not exists signal_history_symbol_idx   on public.signal_history(symbol);
create index if not exists signal_history_created_idx  on public.signal_history(created_at desc);
