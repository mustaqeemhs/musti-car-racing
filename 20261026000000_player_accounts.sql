-- Player accounts: a server-side wallet, garage, career and achievements.
-- Every change goes through the functions below. The tables cannot be touched directly.
-- Run AFTER 20261025000000_multiplayer_part1.sql.

----------------------------------------------------------------------
-- 1. Price lists (the server decides what things cost)
----------------------------------------------------------------------
create table if not exists public.vehicle_catalog (
  id text primary key,
  price integer not null check (price >= 0),
  starter boolean not null default false
);

insert into public.vehicle_catalog (id, price, starter) values
  ('musti-gt', 0, true),
  ('huracan-sto', 1800, false),
  ('huracan-evo', 2800, false),
  ('mclaren-765lt', 4200, false),
  ('ferrari-f8', 5500, false),
  ('mclaren-720s', 6200, false),
  ('amg-one', 10000, false),
  ('bugatti-chiron', 25000, false),
  ('yamaha-r1', 0, true),
  ('ducati-v4r', 3000, false),
  ('bmw-m1000rr', 4800, false)
on conflict (id) do update set price = excluded.price, starter = excluded.starter;

create table if not exists public.upgrade_costs (
  category text not null check (category in ('engine', 'topSpeed', 'nitro', 'handling')),
  level smallint not null check (level between 0 and 4), -- the level you have now
  cost integer not null check (cost > 0),
  primary key (category, level)
);

insert into public.upgrade_costs (category, level, cost) values
  ('engine', 0, 300), ('engine', 1, 600), ('engine', 2, 1000), ('engine', 3, 1500), ('engine', 4, 2200),
  ('topSpeed', 0, 400), ('topSpeed', 1, 750), ('topSpeed', 2, 1200), ('topSpeed', 3, 1800), ('topSpeed', 4, 2600),
  ('nitro', 0, 250), ('nitro', 1, 500), ('nitro', 2, 850), ('nitro', 3, 1300), ('nitro', 4, 1900),
  ('handling', 0, 300), ('handling', 1, 600), ('handling', 2, 1000), ('handling', 3, 1500), ('handling', 4, 2200)
on conflict (category, level) do update set cost = excluded.cost;

create table if not exists public.career_tiers (
  id text primary key,
  idx smallint not null unique,
  rewards integer[] not null check (array_length(rewards, 1) = 4),
  min_seconds integer not null
);

insert into public.career_tiers (id, idx, rewards, min_seconds) values
  ('rookie', 0, '{150,80,40,10}', 24),
  ('street', 1, '{220,110,60,15}', 27),
  ('pro', 2, '{320,160,80,20}', 31),
  ('night', 3, '{450,225,110,30}', 26),
  ('elite', 4, '{650,325,160,40}', 34),
  ('endurance', 5, '{900,450,225,50}', 48),
  ('legend', 6, '{1300,650,325,75}', 38),
  ('champion', 7, '{2500,1250,600,150}', 43)
on conflict (id) do update set idx = excluded.idx, rewards = excluded.rewards, min_seconds = excluded.min_seconds;

create table if not exists public.achievement_rewards (
  id text primary key,
  reward integer not null
);

insert into public.achievement_rewards (id, reward) values
  ('first-race', 25), ('rookie-racer', 50), ('high-scorer', 100),
  ('coin-collector', 50), ('near-miss-expert', 75), ('survivor', 75)
on conflict (id) do update set reward = excluded.reward;

----------------------------------------------------------------------
-- 2. Player data
----------------------------------------------------------------------
create table if not exists public.player_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 1000 check (balance >= 0),
  selected_vehicle text not null default 'musti-gt',
  last_daily date,
  migrated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_vehicles (
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id text not null references public.vehicle_catalog (id),
  engine smallint not null default 0 check (engine between 0 and 5),
  top_speed smallint not null default 0 check (top_speed between 0 and 5),
  nitro smallint not null default 0 check (nitro between 0 and 5),
  handling smallint not null default 0 check (handling between 0 and 5),
  primary key (user_id, vehicle_id)
);

create table if not exists public.player_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  best_score integer not null default 0,
  completed_races integer not null default 0,
  total_distance double precision not null default 0,
  lifetime_coins integer not null default 0,
  lifetime_near_misses integer not null default 0,
  achievements text[] not null default '{}',
  career_unlocked smallint not null default 1 check (career_unlocked between 1 and 8),
  career_best jsonb not null default '{}'::jsonb
);

create table if not exists public.wallet_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta bigint not null,
  balance_after bigint not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create unique index if not exists wallet_ledger_once on public.wallet_ledger (user_id, reason, ref) where ref is not null;
create index if not exists wallet_ledger_user on public.wallet_ledger (user_id, created_at desc);

create table if not exists public.race_runs (
  race_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('solo', 'career', 'online')),
  tier text,
  started_at timestamptz not null default now(),
  stats_settled_at timestamptz,
  career_settled_at timestamptz
);
create index if not exists race_runs_user on public.race_runs (user_id, started_at desc);

alter table public.vehicle_catalog enable row level security;
alter table public.upgrade_costs enable row level security;
alter table public.career_tiers enable row level security;
alter table public.achievement_rewards enable row level security;
alter table public.player_wallets enable row level security;
alter table public.player_vehicles enable row level security;
alter table public.player_progress enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.race_runs enable row level security;

revoke all on public.vehicle_catalog, public.upgrade_costs, public.career_tiers, public.achievement_rewards,
  public.player_wallets, public.player_vehicles, public.player_progress, public.wallet_ledger, public.race_runs
  from anon, authenticated;
revoke all on sequence public.wallet_ledger_id_seq from anon, authenticated;

----------------------------------------------------------------------
-- 3. Internal helpers (not callable by players)
----------------------------------------------------------------------
create or replace function public.player_ensure(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new integer;
begin
  insert into public.player_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new > 0 then
    insert into public.wallet_ledger (user_id, delta, balance_after, reason, ref)
    values (p_user, 1000, 1000, 'welcome', 'welcome') on conflict do nothing;
  end if;
  insert into public.player_progress (user_id) values (p_user) on conflict (user_id) do nothing;
  insert into public.player_vehicles (user_id, vehicle_id)
  select p_user, c.id from public.vehicle_catalog c where c.starter
  on conflict (user_id, vehicle_id) do nothing;
end
$$;

-- Adds or removes Jaa'izah. The same (reason, ref) is only ever applied once.
create or replace function public.player_wallet_apply(p_user uuid, p_delta bigint, p_reason text, p_ref text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint;
begin
  perform public.player_ensure(p_user);
  if p_ref is not null and exists (
    select 1 from public.wallet_ledger l where l.user_id = p_user and l.reason = p_reason and l.ref = p_ref
  ) then
    select w.balance into v_balance from public.player_wallets w where w.user_id = p_user;
    return v_balance;
  end if;
  update public.player_wallets w
  set balance = w.balance + p_delta, updated_at = now()
  where w.user_id = p_user and w.balance + p_delta >= 0
  returning w.balance into v_balance;
  if not found then
    raise exception 'Not enough Jaa''izah.' using errcode = '23514';
  end if;
  insert into public.wallet_ledger (user_id, delta, balance_after, reason, ref)
  values (p_user, p_delta, v_balance, p_reason, p_ref);
  return v_balance;
end
$$;

-- The same price rule as the game: faster, pricier vehicles cost up to 4x more to upgrade.
create or replace function public.player_upgrade_cost(p_category text, p_level integer, p_price integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(10, (round((c.cost * (1 + least(3, greatest(0, p_price) / 6000.0))) / 10.0) * 10)::integer)
  from public.upgrade_costs c
  where c.category = p_category and c.level = p_level;
$$;

create or replace function public.player_state_json(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.player_wallets;
  v_progress public.player_progress;
  v_ledger_count integer;
begin
  perform public.player_ensure(p_user);
  select * into v_wallet from public.player_wallets w where w.user_id = p_user;
  select * into v_progress from public.player_progress p where p.user_id = p_user;
  select count(*) into v_ledger_count from public.wallet_ledger l where l.user_id = p_user;
  return jsonb_build_object(
    'balance', v_wallet.balance,
    'selected', v_wallet.selected_vehicle,
    'owned', coalesce((select jsonb_agg(v.vehicle_id order by v.vehicle_id) from public.player_vehicles v where v.user_id = p_user), '[]'::jsonb),
    'upgrades', coalesce((
      select jsonb_object_agg(v.vehicle_id, jsonb_build_object(
        'engine', v.engine, 'topSpeed', v.top_speed, 'nitro', v.nitro, 'handling', v.handling))
      from public.player_vehicles v where v.user_id = p_user), '{}'::jsonb),
    'progression', jsonb_build_object(
      'bestScore', v_progress.best_score,
      'completedRaces', v_progress.completed_races,
      'totalDistance', v_progress.total_distance,
      'lifetimeCoins', v_progress.lifetime_coins,
      'lifetimeNearMisses', v_progress.lifetime_near_misses,
      'unlockedAchievements', to_jsonb(v_progress.achievements),
      'claimedAchievementRewards', to_jsonb(v_progress.achievements)),
    'career', jsonb_build_object('unlocked', v_progress.career_unlocked, 'best', v_progress.career_best),
    'dailyAvailable', coalesce(v_wallet.last_daily, date '1970-01-01') < (now() at time zone 'utc')::date,
    'fresh', (v_ledger_count <= 1 and not v_wallet.migrated),
    'isAnonymous', coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false),
    'email', auth.jwt() ->> 'email'
  );
end
$$;

----------------------------------------------------------------------
-- 4. Functions the game calls
----------------------------------------------------------------------
create or replace function public.get_player_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  return public.player_state_json(auth.uid());
end
$$;

-- One-time carry-over of what a player earned before the wallet moved to the server.
create or replace function public.import_local_player(
  p_balance bigint, p_owned text[], p_upgrades jsonb, p_progression jsonb, p_selected text, p_career jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_wallet public.player_wallets;
  v_ledger_count integer;
  v_id text;
  v_total bigint := 0;
  v_price integer;
  v_cat text;
  v_level integer;
  v_extra bigint;
  v_levels jsonb;
  v_ok_vehicles text[] := '{}';
  v_ach text[] := '{}';
  v_best jsonb := '{}'::jsonb;
  v_key text;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  perform public.player_ensure(v_user);
  select * into v_wallet from public.player_wallets w where w.user_id = v_user for update;
  select count(*) into v_ledger_count from public.wallet_ledger l where l.user_id = v_user;
  if v_wallet.migrated or v_ledger_count > 1 then
    return public.player_state_json(v_user);
  end if;

  -- the vehicles and upgrades they own, only if the total value is believable
  foreach v_id in array coalesce(p_owned, '{}') loop
    select c.price into v_price from public.vehicle_catalog c where c.id = v_id;
    if found then
      v_ok_vehicles := array_append(v_ok_vehicles, v_id);
      v_total := v_total + v_price;
      v_levels := coalesce(p_upgrades -> v_id, '{}'::jsonb);
      foreach v_cat in array array['engine', 'topSpeed', 'nitro', 'handling'] loop
        v_level := least(5, greatest(0, coalesce((v_levels ->> v_cat)::integer, 0)));
        for i in 0 .. v_level - 1 loop
          v_total := v_total + coalesce(public.player_upgrade_cost(v_cat, i, v_price), 0);
        end loop;
      end loop;
    end if;
  end loop;

  if v_total <= 15000 then
    foreach v_id in array v_ok_vehicles loop
      insert into public.player_vehicles (user_id, vehicle_id) values (v_user, v_id) on conflict do nothing;
      v_levels := coalesce(p_upgrades -> v_id, '{}'::jsonb);
      update public.player_vehicles v
      set engine = least(5, greatest(0, coalesce((v_levels ->> 'engine')::integer, 0))),
          top_speed = least(5, greatest(0, coalesce((v_levels ->> 'topSpeed')::integer, 0))),
          nitro = least(5, greatest(0, coalesce((v_levels ->> 'nitro')::integer, 0))),
          handling = least(5, greatest(0, coalesce((v_levels ->> 'handling')::integer, 0)))
      where v.user_id = v_user and v.vehicle_id = v_id;
    end loop;
    if p_selected = any (v_ok_vehicles) then
      update public.player_wallets w set selected_vehicle = p_selected where w.user_id = v_user;
    end if;
  end if;

  -- the balance, up to a limit
  v_extra := least(greatest(coalesce(p_balance, 0), 0), 10000) - v_wallet.balance;
  if v_extra <> 0 then
    perform public.player_wallet_apply(v_user, v_extra, 'import', 'import');
  end if;

  -- achievements and totals
  select coalesce(array_agg(a.id), '{}') into v_ach
  from public.achievement_rewards a
  where p_progression -> 'unlockedAchievements' ? a.id;

  foreach v_key in array (select array_agg(t.id) from public.career_tiers t) loop
    if (p_career -> 'best' ->> v_key) ~ '^[1-4]$' then
      v_best := v_best || jsonb_build_object(v_key, (p_career -> 'best' ->> v_key)::integer);
    end if;
  end loop;

  update public.player_progress p
  set best_score = least(greatest(coalesce((p_progression ->> 'bestScore')::integer, 0), 0), 50000),
      completed_races = least(greatest(coalesce((p_progression ->> 'completedRaces')::integer, 0), 0), 5000),
      total_distance = least(greatest(coalesce((p_progression ->> 'totalDistance')::double precision, 0), 0), 100000000),
      lifetime_coins = least(greatest(coalesce((p_progression ->> 'lifetimeCoins')::integer, 0), 0), 10000),
      lifetime_near_misses = least(greatest(coalesce((p_progression ->> 'lifetimeNearMisses')::integer, 0), 0), 10000),
      achievements = v_ach,
      career_unlocked = least(8, greatest(1, coalesce((p_career ->> 'unlocked')::integer, 1))),
      career_best = v_best
  where p.user_id = v_user;

  update public.player_wallets w set migrated = true where w.user_id = v_user;
  return public.player_state_json(v_user);
end
$$;

create or replace function public.select_vehicle(p_vehicle_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  perform public.player_ensure(auth.uid());
  if not exists (select 1 from public.player_vehicles v where v.user_id = auth.uid() and v.vehicle_id = p_vehicle_id) then
    raise exception 'You do not own that vehicle.' using errcode = '42501';
  end if;
  update public.player_wallets w set selected_vehicle = p_vehicle_id, updated_at = now() where w.user_id = auth.uid();
  return public.player_state_json(auth.uid());
end
$$;

create or replace function public.buy_vehicle(p_vehicle_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_price integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  perform public.player_ensure(auth.uid());
  select c.price into v_price from public.vehicle_catalog c where c.id = p_vehicle_id;
  if not found then
    raise exception 'Unknown vehicle.' using errcode = '22023';
  end if;
  if exists (select 1 from public.player_vehicles v where v.user_id = auth.uid() and v.vehicle_id = p_vehicle_id) then
    raise exception 'You already own that vehicle.' using errcode = '55000';
  end if;
  perform public.player_wallet_apply(auth.uid(), -v_price::bigint, 'vehicle', p_vehicle_id);
  insert into public.player_vehicles (user_id, vehicle_id) values (auth.uid(), p_vehicle_id);
  update public.player_wallets w set selected_vehicle = p_vehicle_id, updated_at = now() where w.user_id = auth.uid();
  return public.player_state_json(auth.uid());
end
$$;

create or replace function public.buy_upgrade(p_vehicle_id text, p_category text, p_expected_level integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_price integer;
  v_level integer;
  v_cost integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  perform public.player_ensure(auth.uid());
  if p_category not in ('engine', 'topSpeed', 'nitro', 'handling') then
    raise exception 'Unknown upgrade.' using errcode = '22023';
  end if;
  select c.price into v_price from public.vehicle_catalog c where c.id = p_vehicle_id;
  if not found or not exists (select 1 from public.player_vehicles v where v.user_id = auth.uid() and v.vehicle_id = p_vehicle_id) then
    raise exception 'You do not own that vehicle.' using errcode = '42501';
  end if;
  select case p_category when 'engine' then v.engine when 'topSpeed' then v.top_speed
                         when 'nitro' then v.nitro else v.handling end
  into v_level
  from public.player_vehicles v where v.user_id = auth.uid() and v.vehicle_id = p_vehicle_id
  for update;
  if v_level >= 5 then
    raise exception 'That upgrade is already at its maximum.' using errcode = '55000';
  end if;
  if v_level <> p_expected_level then
    raise exception 'The upgrade level changed. Please try again.' using errcode = '40001';
  end if;
  v_cost := public.player_upgrade_cost(p_category, v_level, v_price);
  perform public.player_wallet_apply(auth.uid(), -v_cost::bigint, 'upgrade', p_vehicle_id || ':' || p_category || ':' || (v_level + 1));
  update public.player_vehicles v
  set engine = v.engine + (p_category = 'engine')::integer,
      top_speed = v.top_speed + (p_category = 'topSpeed')::integer,
      nitro = v.nitro + (p_category = 'nitro')::integer,
      handling = v.handling + (p_category = 'handling')::integer
  where v.user_id = auth.uid() and v.vehicle_id = p_vehicle_id;
  return public.player_state_json(auth.uid());
end
$$;

create or replace function public.claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  perform public.player_ensure(auth.uid());
  update public.player_wallets w set last_daily = v_today
  where w.user_id = auth.uid() and coalesce(w.last_daily, date '1970-01-01') < v_today;
  if not found then
    raise exception 'You already claimed today''s 100 Jaa''izah.' using errcode = '55000';
  end if;
  perform public.player_wallet_apply(auth.uid(), 100, 'daily', v_today::text);
  return public.player_state_json(auth.uid());
end
$$;

-- A race is announced when it starts, so the server knows how much real time has passed.
create or replace function public.begin_race(p_race_id uuid, p_kind text, p_tier text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unlocked integer;
  v_idx integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  perform public.player_ensure(auth.uid());
  if p_kind not in ('solo', 'career', 'online') then
    raise exception 'Unknown race type.' using errcode = '22023';
  end if;
  if p_kind = 'career' then
    select t.idx into v_idx from public.career_tiers t where t.id = p_tier;
    select p.career_unlocked into v_unlocked from public.player_progress p where p.user_id = auth.uid();
    if v_idx is null or v_idx >= v_unlocked then
      raise exception 'That cup is still locked.' using errcode = '42501';
    end if;
  end if;
  delete from public.race_runs r where r.user_id = auth.uid() and r.started_at < now() - interval '3 hours';
  insert into public.race_runs (race_id, user_id, kind, tier)
  values (p_race_id, auth.uid(), p_kind, case when p_kind = 'career' then p_tier else null end)
  on conflict (race_id) do nothing;
end
$$;

-- When a race ends the game reports what happened. The server checks it can be true and pays out.
create or replace function public.settle_race(
  p_race_id uuid, p_score integer, p_distance double precision, p_time double precision,
  p_coins integer, p_near_misses integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.race_runs;
  v_progress public.player_progress;
  v_elapsed double precision;
  v_time double precision;
  v_coins integer;
  v_near integer;
  v_score integer;
  v_distance double precision;
  v_earned integer;
  v_today bigint;
  v_new_best boolean;
  v_ach text[];
  v_now_unlocked text[] := '{}';
  v_candidate text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  perform public.player_ensure(auth.uid());
  select * into v_run from public.race_runs r where r.race_id = p_race_id and r.user_id = auth.uid() for update;
  if not found then
    raise exception 'unknown_race' using errcode = '55000';
  end if;
  if v_run.stats_settled_at is not null then
    return jsonb_build_object('state', public.player_state_json(auth.uid()), 'unlockedNow', '[]'::jsonb, 'earned', 0, 'newBest', false, 'duplicate', true);
  end if;

  v_elapsed := extract(epoch from (now() - v_run.started_at));
  v_time := least(greatest(coalesce(p_time, 0), 0), v_elapsed + 8);   -- cannot race for longer than real time
  v_coins := least(greatest(coalesce(p_coins, 0), 0), floor(v_time * 1.1)::integer + 3);
  v_near := least(greatest(coalesce(p_near_misses, 0), 0), floor(v_time * 0.8)::integer + 3);
  v_distance := least(greatest(coalesce(p_distance, 0), 0), v_time * 1600 + 200);
  v_score := least(greatest(coalesce(p_score, 0), 0), 300 + floor(v_time * 70)::integer + v_near * 50);
  v_earned := v_coins * 5 + v_near * 2;

  -- a daily limit on what races can pay
  select coalesce(sum(l.delta), 0) into v_today
  from public.wallet_ledger l
  where l.user_id = auth.uid() and l.reason = 'race'
    and l.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  v_earned := least(v_earned, greatest(0, 15000 - v_today)::integer);

  if v_earned > 0 then
    perform public.player_wallet_apply(auth.uid(), v_earned, 'race', p_race_id::text);
  end if;

  select * into v_progress from public.player_progress p where p.user_id = auth.uid() for update;
  v_new_best := v_score > v_progress.best_score;
  update public.player_progress p
  set best_score = greatest(p.best_score, v_score),
      completed_races = p.completed_races + 1,
      total_distance = p.total_distance + v_distance,
      lifetime_coins = p.lifetime_coins + v_coins,
      lifetime_near_misses = p.lifetime_near_misses + v_near
  where p.user_id = auth.uid()
  returning * into v_progress;

  v_ach := v_progress.achievements;
  for v_candidate in
    select a.id from public.achievement_rewards a
    where (a.id = 'first-race' and v_progress.completed_races >= 1)
       or (a.id = 'rookie-racer' and v_score >= 1000)
       or (a.id = 'high-scorer' and v_score >= 5000)
       or (a.id = 'coin-collector' and v_progress.lifetime_coins >= 25)
       or (a.id = 'near-miss-expert' and v_progress.lifetime_near_misses >= 10)
       or (a.id = 'survivor' and v_time >= 60)
  loop
    if not (v_candidate = any (v_ach)) then
      v_ach := array_append(v_ach, v_candidate);
      v_now_unlocked := array_append(v_now_unlocked, v_candidate);
      perform public.player_wallet_apply(auth.uid(), (select a.reward from public.achievement_rewards a where a.id = v_candidate)::bigint, 'achievement', v_candidate);
    end if;
  end loop;
  update public.player_progress p set achievements = v_ach where p.user_id = auth.uid();
  update public.race_runs r set stats_settled_at = now() where r.race_id = p_race_id;

  return jsonb_build_object(
    'state', public.player_state_json(auth.uid()),
    'unlockedNow', to_jsonb(v_now_unlocked),
    'earned', v_earned,
    'newBest', v_new_best,
    'duplicate', false
  );
end
$$;

-- Career: pays the cup prize and opens the next cup for a podium finish.
create or replace function public.settle_career(p_race_id uuid, p_tier text, p_place integer, p_time double precision)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.race_runs;
  v_tier public.career_tiers;
  v_progress public.player_progress;
  v_elapsed double precision;
  v_prize integer;
  v_best integer;
  v_unlocked_before integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  perform public.player_ensure(auth.uid());
  select * into v_run from public.race_runs r where r.race_id = p_race_id and r.user_id = auth.uid() for update;
  if not found or v_run.kind <> 'career' or v_run.tier is distinct from p_tier then
    raise exception 'unknown_race' using errcode = '55000';
  end if;
  if v_run.career_settled_at is not null then
    return jsonb_build_object('state', public.player_state_json(auth.uid()), 'prize', 0, 'unlockedNext', false, 'duplicate', true);
  end if;
  select * into v_tier from public.career_tiers t where t.id = p_tier;
  v_elapsed := extract(epoch from (now() - v_run.started_at));
  if p_place not between 1 and 4 or coalesce(p_time, 0) < v_tier.min_seconds or v_elapsed < v_tier.min_seconds * 0.9 or p_time > v_elapsed + 8 then
    raise exception 'That race result is not believable.' using errcode = '22023';
  end if;

  v_prize := v_tier.rewards[p_place];
  perform public.player_wallet_apply(auth.uid(), v_prize::bigint, 'career', p_race_id::text);

  select * into v_progress from public.player_progress p where p.user_id = auth.uid() for update;
  v_unlocked_before := v_progress.career_unlocked;
  v_best := coalesce((v_progress.career_best ->> p_tier)::integer, 99);
  update public.player_progress p
  set career_best = p.career_best || jsonb_build_object(p_tier, least(v_best, p_place)),
      career_unlocked = case when p_place <= 3 then greatest(p.career_unlocked, least(8, v_tier.idx + 2)) else p.career_unlocked end
  where p.user_id = auth.uid()
  returning * into v_progress;
  update public.race_runs r set career_settled_at = now() where r.race_id = p_race_id;

  return jsonb_build_object(
    'state', public.player_state_json(auth.uid()),
    'prize', v_prize,
    'unlockedNext', v_progress.career_unlocked > v_unlocked_before,
    'duplicate', false
  );
end
$$;

----------------------------------------------------------------------
-- 5. Online races: the server holds the stakes and pays the pot
----------------------------------------------------------------------
-- Only players with a saved (email) account may play online.
create or replace function public.set_multiplayer_username(p_username text)
returns public.multiplayer_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_profile public.multiplayer_profiles;
begin
  if v_user_id is null then
    raise exception 'Sign in before setting an online username.' using errcode = '28000';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Save your progress with an email before playing online.' using errcode = '42501';
  end if;

  v_username := regexp_replace(btrim(coalesce(p_username, '')), '\s+', ' ', 'g');
  if char_length(v_username) not between 3 and 18
     or v_username !~ '^[A-Za-z0-9 _-]+$' then
    raise exception 'Username must be 3 to 18 characters using letters, numbers, spaces, _ or -.'
      using errcode = '22023';
  end if;

  insert into public.multiplayer_profiles (id, username, username_key)
  values (v_user_id, v_username, public.normalize_multiplayer_username(v_username))
  on conflict (id) do update
    set username = excluded.username,
        username_key = excluded.username_key,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end
$$;

create or replace function public.start_multiplayer_room(p_room_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.multiplayer_rooms;
  v_count integer;
  v_ready integer;
  v_member record;
  v_starts_at timestamptz := now() + interval '5 seconds';
begin
  if auth.uid() is null then
    raise exception 'Sign in before starting a race.' using errcode = '28000';
  end if;
  select * into v_room
  from public.multiplayer_rooms r
  where r.id = p_room_id
  for update;
  if not found or v_room.host_id <> auth.uid() then
    raise exception 'Only this room''s host can start the race.' using errcode = '42501';
  end if;
  if v_room.status <> 'waiting' or v_room.expires_at <= now() then
    raise exception 'This room is not waiting for a race.' using errcode = '55000';
  end if;

  select count(*), count(*) filter (where m.ready)
  into v_count, v_ready
  from public.multiplayer_room_members m
  where m.room_id = p_room_id;

  if v_count < 2 then
    raise exception 'At least two players are required.' using errcode = '23514';
  end if;
  if v_ready <> v_count then
    raise exception 'Every player must be ready before the host can start.' using errcode = '23514';
  end if;

  -- every player puts the stake in the pot (all or nothing)
  if v_room.stake > 0 then
    for v_member in
      select m.user_id, p.username
      from public.multiplayer_room_members m
      join public.multiplayer_profiles p on p.id = m.user_id
      where m.room_id = p_room_id
      order by m.seat
    loop
      begin
        perform public.player_wallet_apply(v_member.user_id, -v_room.stake::bigint, 'stake', p_room_id::text || ':' || v_starts_at::text);
      exception when sqlstate '23514' then
        raise exception '% does not have enough Jaa''izah for the % stake.', v_member.username, v_room.stake using errcode = '23514';
      end;
    end loop;
  end if;

  update public.multiplayer_rooms
  set status = 'racing', starts_at = v_starts_at, expires_at = now() + interval '2 hours',
      race_stake = v_room.stake, race_players = v_count
  where id = p_room_id;

  return v_starts_at;
end
$$;

drop function if exists public.finish_multiplayer_race(uuid, real);

create function public.finish_multiplayer_race(p_room_id uuid, p_distance real)
returns table (place integer, pot integer, stake_each integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.multiplayer_rooms;
  v_secs real;
  v_my_finish timestamptz;
  v_place integer;
  v_pot integer;
begin
  if auth.uid() is null or not public.is_multiplayer_room_member(p_room_id) then
    raise exception 'You are not a member of this room.' using errcode = '42501';
  end if;

  select * into v_room
  from public.multiplayer_rooms r
  where r.id = p_room_id
  for update;

  if not found or v_room.status <> 'racing' or v_room.starts_at is null or v_room.starts_at > now() then
    raise exception 'This race is not active.' using errcode = '55000';
  end if;

  v_secs := extract(epoch from (now() - v_room.starts_at))::real;
  if v_secs < 15 then
    raise exception 'Finish rejected: that race was too short.' using errcode = '22023';
  end if;

  insert into public.multiplayer_race_positions
    (room_id, user_id, lane_ratio, distance, finished_at, finish_seconds)
  values
    (p_room_id, auth.uid(), 0.5, greatest(0, least(coalesce(p_distance, 0), 1000000000)), now(), v_secs)
  on conflict (room_id, user_id) do update
    set distance = excluded.distance,
        finished_at = coalesce(public.multiplayer_race_positions.finished_at, excluded.finished_at),
        finish_seconds = coalesce(public.multiplayer_race_positions.finish_seconds, excluded.finish_seconds),
        updated_at = now();

  select pos.finished_at into v_my_finish
  from public.multiplayer_race_positions pos
  where pos.room_id = p_room_id and pos.user_id = auth.uid();

  select count(*) into v_place
  from public.multiplayer_race_positions pos
  where pos.room_id = p_room_id
    and pos.finished_at is not null
    and pos.finished_at <= v_my_finish;

  update public.multiplayer_room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid();

  v_pot := v_room.race_stake * v_room.race_players;
  -- the winner takes the whole pot (paid once)
  if v_place = 1 and v_pot > 0 then
    perform public.player_wallet_apply(auth.uid(), v_pot::bigint, 'pot', p_room_id::text || ':' || v_room.starts_at::text);
  end if;

  return query select v_place, v_pot, v_room.race_stake;
end
$$;

create or replace function public.reset_multiplayer_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.multiplayer_rooms;
  v_host uuid;
  v_cutoff timestamptz;
  v_member record;
begin
  if auth.uid() is null then
    raise exception 'Sign in before starting a replay.' using errcode = '28000';
  end if;

  select * into v_room
  from public.multiplayer_rooms r
  where r.id = p_room_id
  for update;
  if not found then
    raise exception 'This room no longer exists.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.multiplayer_room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this room.' using errcode = '42501';
  end if;

  if v_room.status = 'waiting' then
    return;
  end if;

  v_cutoff := public.multiplayer_dnf_cutoff(p_room_id);

  delete from public.multiplayer_room_members m
  where m.room_id = p_room_id
    and m.last_seen_at < now() - interval '30 seconds'
    and not exists (
      select 1 from public.multiplayer_race_positions pos
      where pos.room_id = m.room_id and pos.user_id = m.user_id and pos.finished_at is not null
    );

  if exists (
    select 1 from public.multiplayer_room_members m
    where m.room_id = p_room_id
      and not exists (
        select 1 from public.multiplayer_race_positions pos
        where pos.room_id = m.room_id and pos.user_id = m.user_id and pos.finished_at is not null
      )
      and not (v_cutoff is not null and now() > v_cutoff)
  ) then
    raise exception 'Other racers are still finishing.' using errcode = '55000';
  end if;

  -- nobody finished: give every stake back
  if v_room.race_stake > 0 and not exists (
    select 1 from public.multiplayer_race_positions pos where pos.room_id = p_room_id and pos.finished_at is not null
  ) then
    for v_member in select m.user_id from public.multiplayer_room_members m where m.room_id = p_room_id loop
      perform public.player_wallet_apply(v_member.user_id, v_room.race_stake::bigint, 'refund', p_room_id::text || ':' || v_room.starts_at::text);
    end loop;
  end if;

  delete from public.multiplayer_race_positions where room_id = p_room_id;

  select m.user_id into v_host
  from public.multiplayer_room_members m
  where m.room_id = p_room_id
  order by (m.user_id = v_room.host_id) desc, m.joined_at, m.seat
  limit 1;

  update public.multiplayer_rooms
  set status = 'waiting', starts_at = null, host_id = v_host,
      expires_at = now() + interval '2 hours'
  where id = p_room_id;

  update public.multiplayer_room_members
  set ready = (user_id = v_host), last_seen_at = now()
  where room_id = p_room_id;
end
$$;

----------------------------------------------------------------------
-- 6. Permissions
----------------------------------------------------------------------
revoke all on function public.player_ensure(uuid) from public, anon, authenticated;
revoke all on function public.player_wallet_apply(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.player_upgrade_cost(text, integer, integer) from public, anon, authenticated;
revoke all on function public.player_state_json(uuid) from public, anon, authenticated;
revoke all on function public.get_player_state() from public, anon, authenticated;
revoke all on function public.import_local_player(bigint, text[], jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.select_vehicle(text) from public, anon, authenticated;
revoke all on function public.buy_vehicle(text) from public, anon, authenticated;
revoke all on function public.buy_upgrade(text, text, integer) from public, anon, authenticated;
revoke all on function public.claim_daily_reward() from public, anon, authenticated;
revoke all on function public.begin_race(uuid, text, text) from public, anon, authenticated;
revoke all on function public.settle_race(uuid, integer, double precision, double precision, integer, integer) from public, anon, authenticated;
revoke all on function public.settle_career(uuid, text, integer, double precision) from public, anon, authenticated;
revoke all on function public.set_multiplayer_username(text) from public, anon, authenticated;
revoke all on function public.start_multiplayer_room(uuid) from public, anon, authenticated;
revoke all on function public.finish_multiplayer_race(uuid, real) from public, anon, authenticated;
revoke all on function public.reset_multiplayer_room(uuid) from public, anon, authenticated;

grant execute on function public.get_player_state() to authenticated;
grant execute on function public.import_local_player(bigint, text[], jsonb, jsonb, text, jsonb) to authenticated;
grant execute on function public.select_vehicle(text) to authenticated;
grant execute on function public.buy_vehicle(text) to authenticated;
grant execute on function public.buy_upgrade(text, text, integer) to authenticated;
grant execute on function public.claim_daily_reward() to authenticated;
grant execute on function public.begin_race(uuid, text, text) to authenticated;
grant execute on function public.settle_race(uuid, integer, double precision, double precision, integer, integer) to authenticated;
grant execute on function public.settle_career(uuid, text, integer, double precision) to authenticated;
grant execute on function public.set_multiplayer_username(text) to authenticated;
grant execute on function public.start_multiplayer_room(uuid) to authenticated;
grant execute on function public.finish_multiplayer_race(uuid, real) to authenticated;
grant execute on function public.reset_multiplayer_room(uuid) to authenticated;
