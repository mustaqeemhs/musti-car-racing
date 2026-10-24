-- Multiplayer: finish line, results and replay.
-- Safe to run once. Adds columns and functions; replaces get_multiplayer_race_state
-- and leave_multiplayer_room.

alter table public.multiplayer_race_positions
  add column if not exists finished_at timestamptz,
  add column if not exists finish_seconds real;

-- 1. Record that the calling player crossed the finish line. Returns their place (1 = first).
create or replace function public.finish_multiplayer_race(p_room_id uuid, p_distance real)
returns integer
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
  for update;  -- serialises finishers so places are assigned in order

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

  return v_place;
end
$$;

-- 2. Race state now also reports who has finished. Finished racers stay visible.
drop function if exists public.get_multiplayer_race_state(uuid);

create function public.get_multiplayer_race_state(p_room_id uuid)
returns table (
  user_id uuid,
  username text,
  lane_ratio real,
  distance real,
  updated_at timestamptz,
  finished_at timestamptz,
  finish_seconds real
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_multiplayer_room_member(p_room_id) then
    raise exception 'You are not a member of this room.' using errcode = '42501';
  end if;

  return query
  select m.user_id, p.username, pos.lane_ratio, pos.distance, pos.updated_at,
         pos.finished_at, pos.finish_seconds
  from public.multiplayer_room_members m
  join public.multiplayer_profiles p on p.id = m.user_id
  left join public.multiplayer_race_positions pos
    on pos.room_id = m.room_id
    and pos.user_id = m.user_id
    and (pos.finished_at is not null or pos.updated_at > now() - interval '3 seconds')
  where m.room_id = p_room_id
  order by m.seat;
end
$$;

-- 3. Replay: put the room back to "waiting" once everyone has finished.
create or replace function public.reset_multiplayer_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.multiplayer_rooms;
  v_host uuid;
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

  -- Another player already reset the room: nothing to do.
  if v_room.status = 'waiting' then
    return;
  end if;

  -- Drop players who disappeared mid-race (no heartbeat for 30 s and never finished).
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

-- 4. Leaving mid-race no longer cancels everyone else's race.
create or replace function public.leave_multiplayer_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.multiplayer_rooms;
  v_next_host uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before leaving a room.' using errcode = '28000';
  end if;

  select * into v_room
  from public.multiplayer_rooms r
  where r.id = p_room_id
  for update;
  if not found then
    return;
  end if;
  if not exists (
    select 1 from public.multiplayer_room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this room.' using errcode = '42501';
  end if;

  delete from public.multiplayer_room_members
  where room_id = p_room_id and user_id = auth.uid();

  select m.user_id into v_next_host
  from public.multiplayer_room_members m
  where m.room_id = p_room_id
  order by m.joined_at, m.seat
  limit 1;

  if v_next_host is null then
    delete from public.multiplayer_rooms where id = p_room_id;
  elsif v_room.status = 'waiting' then
    update public.multiplayer_rooms
    set host_id = case when v_room.host_id = auth.uid() then v_next_host else host_id end,
        starts_at = null,
        expires_at = now() + interval '2 hours'
    where id = p_room_id;
    update public.multiplayer_room_members
    set ready = (user_id = (select host_id from public.multiplayer_rooms where id = p_room_id))
    where room_id = p_room_id;
  else
    -- Race in progress: keep it running for the remaining players.
    update public.multiplayer_rooms
    set host_id = case when v_room.host_id = auth.uid() then v_next_host else host_id end
    where id = p_room_id;
  end if;

  delete from public.multiplayer_rooms where expires_at <= now();
end
$$;

revoke all on function public.finish_multiplayer_race(uuid, real) from public, anon, authenticated;
revoke all on function public.get_multiplayer_race_state(uuid) from public, anon, authenticated;
revoke all on function public.reset_multiplayer_room(uuid) from public, anon, authenticated;
grant execute on function public.finish_multiplayer_race(uuid, real) to authenticated;
grant execute on function public.get_multiplayer_race_state(uuid) to authenticated;
grant execute on function public.reset_multiplayer_room(uuid) to authenticated;
