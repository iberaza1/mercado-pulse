-- ============================================================
-- Mercado Pulse Paper Trader — database setup
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Safe to run once on a fresh project.
--
-- Security model:
--   * Row Level Security (RLS) is ON for every table.
--   * Signed-in users can only READ their own rows.
--   * Nobody can write from the browser. All writes (trades, snapshots)
--     go through our Vercel /api functions using the service-role key,
--     which fetch the price server-side. Fake money can't be faked. :)
--   * The leaderboard only exposes display name + return %.
-- ============================================================

create table if not exists public.portfolios (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  display_name  text not null default 'Trader' check (char_length(display_name) between 1 and 40),
  starting_cash numeric(14,2) not null default 100000,
  cash          numeric(14,2) not null default 100000 check (cash >= 0),
  created_at    timestamptz not null default now()
);

create table if not exists public.positions (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol       text not null check (symbol ~ '^[A-Z]{1,5}(\.[A-Z])?$'),
  qty          numeric(14,4) not null check (qty > 0),
  avg_cost     numeric(14,4) not null check (avg_cost >= 0),
  updated_at   timestamptz not null default now(),
  primary key (portfolio_id, symbol)
);

create table if not exists public.trades (
  id           bigint generated always as identity primary key,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol       text not null,
  side         text not null check (side in ('buy','sell')),
  qty          numeric(14,4) not null check (qty > 0),
  price        numeric(14,4) not null check (price > 0),
  total        numeric(14,2) not null,
  created_at   timestamptz not null default now()
);
create index if not exists trades_portfolio_idx on public.trades (portfolio_id, created_at desc);

create table if not exists public.snapshots (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  day          date not null,
  total_value  numeric(14,2) not null,
  cash         numeric(14,2) not null,
  spy_price    numeric(14,4),
  primary key (portfolio_id, day)
);

alter table public.portfolios enable row level security;
alter table public.positions  enable row level security;
alter table public.trades     enable row level security;
alter table public.snapshots  enable row level security;

-- Read-only policies: "you can see your own stuff". No insert/update/delete policies on purpose.
drop policy if exists "own portfolio" on public.portfolios;
create policy "own portfolio" on public.portfolios for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "own positions" on public.positions;
create policy "own positions" on public.positions for select to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = auth.uid()));
drop policy if exists "own trades" on public.trades;
create policy "own trades" on public.trades for select to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = auth.uid()));
drop policy if exists "own snapshots" on public.snapshots;
create policy "own snapshots" on public.snapshots for select to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = auth.uid()));

revoke insert, update, delete on public.portfolios, public.positions, public.trades, public.snapshots from anon, authenticated;
revoke all on public.portfolios, public.positions, public.trades, public.snapshots from anon;

-- ---------- Server-only functions (service role) ----------

-- Create the portfolio on first visit ($100,000 fake cash)
create or replace function public.pt_ensure_portfolio(p_user uuid, p_name text)
returns public.portfolios language plpgsql security definer set search_path = public as $$
declare r public.portfolios;
begin
  insert into portfolios (user_id, display_name)
  values (p_user, coalesce(nullif(left(trim(p_name), 40), ''), 'Trader'))
  on conflict (user_id) do nothing;
  select * into r from portfolios where user_id = p_user;
  return r;
end $$;

-- Buy or sell atomically. Price comes from the server (Finnhub), never the browser.
create or replace function public.pt_execute_trade(p_user uuid, p_symbol text, p_side text, p_qty numeric, p_price numeric)
returns public.trades language plpgsql security definer set search_path = public as $$
declare pf public.portfolios; pos public.positions; cost numeric; t public.trades;
begin
  if p_qty is null or p_qty <= 0 or p_qty <> trunc(p_qty) or p_qty > 100000 then raise exception 'Quantity must be a whole number from 1 to 100,000'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Bad price'; end if;
  if p_side not in ('buy','sell') then raise exception 'Side must be buy or sell'; end if;
  select * into pf from portfolios where user_id = p_user for update;
  if not found then raise exception 'No portfolio'; end if;
  cost := round(p_qty * p_price, 2);
  select * into pos from positions where portfolio_id = pf.id and symbol = p_symbol for update;
  if p_side = 'buy' then
    if pf.cash < cost then raise exception 'Not enough cash'; end if;
    update portfolios set cash = cash - cost where id = pf.id;
    if pos.symbol is null then
      insert into positions (portfolio_id, symbol, qty, avg_cost) values (pf.id, p_symbol, p_qty, p_price);
    else
      update positions set avg_cost = (qty * avg_cost + p_qty * p_price) / (qty + p_qty),
        qty = qty + p_qty, updated_at = now() where portfolio_id = pf.id and symbol = p_symbol;
    end if;
  else
    if pos.symbol is null or pos.qty < p_qty then raise exception 'You do not own that many shares'; end if;
    update portfolios set cash = cash + cost where id = pf.id;
    if pos.qty = p_qty then delete from positions where portfolio_id = pf.id and symbol = p_symbol;
    else update positions set qty = qty - p_qty, updated_at = now() where portfolio_id = pf.id and symbol = p_symbol; end if;
  end if;
  insert into trades (portfolio_id, symbol, side, qty, price, total)
  values (pf.id, p_symbol, p_side, p_qty, p_price, cost) returning * into t;
  return t;
end $$;

revoke execute on function public.pt_ensure_portfolio(uuid, text) from public, anon, authenticated;
revoke execute on function public.pt_execute_trade(uuid, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.pt_ensure_portfolio(uuid, text) to service_role;
grant execute on function public.pt_execute_trade(uuid, text, text, numeric, numeric) to service_role;

-- ---------- Public monthly leaderboard (name + return only) ----------
-- Return this month = latest snapshot vs. the last snapshot BEFORE this month
-- (or starting cash if the portfolio is newer than that). Months use Central Time.
create or replace function public.pt_leaderboard(p_limit int default 25)
returns table (rank bigint, display_name text, return_pct numeric)
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', (now() at time zone 'America/Chicago'))::date as start),
  latest as (
    select distinct on (s.portfolio_id) s.portfolio_id, s.total_value
    from snapshots s, m where s.day >= m.start order by s.portfolio_id, s.day desc),
  base as (
    select p.id as portfolio_id, coalesce(
      (select s.total_value from snapshots s, m where s.portfolio_id = p.id and s.day < m.start order by s.day desc limit 1),
      p.starting_cash) as base_value
    from portfolios p)
  select rank() over (order by l.total_value / b.base_value desc),
         p.display_name,
         round((l.total_value / b.base_value - 1) * 100, 2)
  from latest l join base b using (portfolio_id) join portfolios p on p.id = l.portfolio_id
  where b.base_value > 0
  order by 1 limit least(greatest(p_limit, 1), 100);
$$;
revoke execute on function public.pt_leaderboard(int) from public;
grant execute on function public.pt_leaderboard(int) to anon, authenticated, service_role;
