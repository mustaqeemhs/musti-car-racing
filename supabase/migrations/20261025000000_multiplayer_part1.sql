-- Multiplayer Part 1: chosen cars, Jaa'izah stake and pot, DNF (did not finish) timer.
-- Run AFTER 20261024000000_multiplayer_finish_replay.sql.

alter table public.multiplayer_rooms
  add column if not exists stake integer not null default 0 check (stake between 0 and 5000),
  add column if not exists race_stake integer not null default 0,
  add column if not exists race_players smallint not null default 0;

alter table public.multiplayer_room_members
  add column if not exists vehicle_id text,
  add column if not exists vehicle_paint text;

-- When does an unfinished racer count as DNF? 60 seconds after the first finisher,
-- or 8 minutes after the race started, whichever comes first.
create or replace function public.multiplayer_dnf_cutoff(p_room_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select least(
    coalesce(
      (select min(pos.finished_at) from public.multiplayer_race_positions pos
       where pos.room_id = p_room_id and pos.finished_at is not null) + interval '60 seconds',
      'infinity'::timestamptz
    ),
    (select r.starts_at + interval '8 minutes' from public.multiplayer_rooms r where r.id = p_room_id)
  );
$$;

-- Every player publishes the car they picked so everyone sees the same cars.
create or replace function public.set_multiplayer_vehicle(
  p_room_id uuid, p_vehicle_id text, p_paint text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_multiplayer_room_member(p_room_id) then
    raise exception 'You are not a member of this room.' using errcode = '42501';
  end if;
  if p_vehicle_id is null or p_vehicle_id !~ '^[a-z0-9-]{1,40}$'
     or p_paint is null or p_paint !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid vehicle.' using errcode = '22023';
  end if;
  update public.multiplayer_room_members
  set vehicle_id = p_vehicle_id, vehicle_paint = p_paint, last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid();
end
$$;

-- The host sets how many Jaa'izah everyone puts in. Changing it un-readies the other players.
create or replace function public.set_multiplayer_stake(p_room_id uuid, p_stake integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.multiplayer_rooms;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  select * into v_room from public.multiplayer_rooms r where r.id = p_room_id for update;
  if not found or v_room.host_id <> auth.uid() then
    raise exception 'Only the host can change the stake.' using errcode = '42501';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'The stake can only change while the room is waiting.' using errcode = '55000';
  end if;
  if p_stake is null or p_stake < 0 or p_stake > 5000 then
    raise exception 'Invalid stake.' using errcode = '22023';
  end if;
  update public.multiplayer_rooms set stake = p_stake where id = p_room_id;
  update public.multiplayer_room_members
  set ready = (user_id = v_room.host_id)
  where room_id = p_room_id;
end
$$;

-- Starting a race freezes the stake and the number of players (this decides the pot).
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

  update public.multiplayer_rooms
  set status = 'racing', starts_at = v_starts_at, expires_at = now() + interval '2 hours',
      race_stake = v_room.stake, race_players = v_count
  where id = p_room_id;

  return v_starts_at;
end
$$;

-- Finishing now also returns the pot, so the winner can be paid.
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

  return query select v_place, v_room.race_stake * v_room.race_players::integer, v_room.race_stake;
end
$$;

-- Race state: now includes the chosen car, seat and DNF flag.
drop function if exists public.get_multiplayer_race_state(uuid);

create function public.get_multiplayer_race_state(p_room_id uuid)
returns table (
  user_id uuid,
  username text,
  seat smallint,
  vehicle_id text,
  vehicle_paint text,
  lane_ratio real,
  distance real,
  updated_at timestamptz,
  finished_at timestamptz,
  finish_seconds real,
  dnf boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz;
begin
  if auth.uid() is null or not public.is_multiplayer_room_member(p_room_id) then
    raise exception 'You are not a member of this room.' using errcode = '42501';
  end if;

  v_cutoff := public.multiplayer_dnf_cutoff(p_room_id);

  return query
  select m.user_id, p.username, m.seat, m.vehicle_id, m.vehicle_paint,
         pos.lane_ratio, pos.distance, pos.updated_at, pos.finished_at, pos.finish_seconds,
         (pos.finished_at is null and v_cutoff is not null and now() > v_cutoff) as dnf
  from public.multiplayer_room_members m
  join public.multiplayer_profiles p on p.id = m.user_id
  left join public.multiplayer_race_positions pos
    on pos.room_id = m.room_id
    and pos.user_id = m.user_id
    and (pos.finished_at is not null or pos.updated_at > now() - interval '4 seconds')
  where m.room_id = p_room_id
  order by m.seat;
end
$$;

-- Replay becomes available once everyone has finished or is DNF.
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

  -- Drop players who vanished (no heartbeat for 30 s) and never finished.
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

revoke all on function public.multiplayer_dnf_cutoff(uuid) from public, anon, authenticated;
revoke all on function public.set_multiplayer_vehicle(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_multiplayer_stake(uuid, integer) from public, anon, authenticated;
revoke all on function public.start_multiplayer_room(uuid) from public, anon, authenticated;
revoke all on function public.finish_multiplayer_race(uuid, real) from public, anon, authenticated;
revoke all on function public.get_multiplayer_race_state(uuid) from public, anon, authenticated;
revoke all on function public.reset_multiplayer_room(uuid) from public, anon, authenticated;
grant execute on function public.set_multiplayer_vehicle(uuid, text, text) to authenticated;
grant execute on function public.set_multiplayer_stake(uuid, integer) to authenticated;
grant execute on function public.start_multiplayer_room(uuid) to authenticated;
grant execute on function public.finish_multiplayer_race(uuid, real) to authenticated;
grant execute on function public.get_multiplayer_race_state(uuid) to authenticated;
grant execute on function public.reset_multiplayer_room(uuid) to authenticated;
