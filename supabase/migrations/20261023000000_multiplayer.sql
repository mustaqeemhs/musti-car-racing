create table if not exists public.multiplayer_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  username_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint multiplayer_username_length check (char_length(username) between 3 and 18),
  constraint multiplayer_username_characters check (username ~ '^[A-Za-z0-9 _-]+$'),
  constraint multiplayer_username_key_normalized check (username_key = lower(username))
);

create table if not exists public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_id uuid not null references auth.users (id) on delete cascade,
  max_players smallint not null default 4 check (max_players between 2 and 4),
  is_public boolean not null default true,
  status text not null default 'waiting' check (status in ('waiting', 'racing')),
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create index if not exists multiplayer_rooms_open_idx
  on public.multiplayer_rooms (created_at desc)
  where status = 'waiting' and is_public;

create table if not exists public.multiplayer_room_members (
  room_id uuid not null references public.multiplayer_rooms (id) on delete cascade,
  user_id uuid not null references public.multiplayer_profiles (id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat),
  unique (user_id)
);

create table if not exists public.multiplayer_race_positions (
  room_id uuid not null,
  user_id uuid not null,
  lane_ratio real not null check (lane_ratio between 0 and 1),
  distance real not null check (distance between 0 and 1000000000),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  foreign key (room_id, user_id)
    references public.multiplayer_room_members (room_id, user_id)
    on delete cascade
);

create or replace function public.normalize_multiplayer_username(p_username text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(btrim(p_username), '\s+', ' ', 'g'))
$$;

create or replace function public.is_multiplayer_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.multiplayer_room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  )
$$;

create or replace function public.are_multiplayer_roommates(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.multiplayer_room_members mine
    join public.multiplayer_room_members theirs using (room_id)
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  )
$$;

create or replace function public.cleanup_expired_multiplayer_rooms()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room record;
  v_next_host uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before cleaning up expired rooms.' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(71231829);
  delete from public.multiplayer_rooms where expires_at <= now();

  delete from public.multiplayer_room_members m
  using public.multiplayer_rooms r
  where m.room_id = r.id
    and m.last_seen_at < now() - interval '30 seconds';

  for v_room in
    select r.id, r.host_id
    from public.multiplayer_rooms r
    where not exists (
      select 1 from public.multiplayer_room_members m
      where m.room_id = r.id and m.user_id = r.host_id
    )
  loop
    select m.user_id into v_next_host
    from public.multiplayer_room_members m
    where m.room_id = v_room.id
    order by m.joined_at, m.seat
    limit 1;

    if v_next_host is null then
      delete from public.multiplayer_rooms where id = v_room.id;
    else
      update public.multiplayer_rooms
      set host_id = v_next_host, status = 'waiting', starts_at = null
      where id = v_room.id;
      update public.multiplayer_room_members
      set ready = (user_id = v_next_host)
      where room_id = v_room.id;
    end if;
  end loop;
end
$$;

alter table public.multiplayer_profiles enable row level security;
alter table public.multiplayer_rooms enable row level security;
alter table public.multiplayer_room_members enable row level security;
alter table public.multiplayer_race_positions enable row level security;

drop policy if exists multiplayer_profiles_read on public.multiplayer_profiles;
create policy multiplayer_profiles_read on public.multiplayer_profiles
  for select to authenticated
  using (id = auth.uid() or public.are_multiplayer_roommates(id));

drop policy if exists multiplayer_rooms_read on public.multiplayer_rooms;
create policy multiplayer_rooms_read on public.multiplayer_rooms
  for select to authenticated
  using (
    (is_public and status = 'waiting' and expires_at > now())
    or public.is_multiplayer_room_member(id)
  );

drop policy if exists multiplayer_room_members_read on public.multiplayer_room_members;
create policy multiplayer_room_members_read on public.multiplayer_room_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_multiplayer_room_member(room_id)
  );

drop policy if exists multiplayer_race_positions_read on public.multiplayer_race_positions;
create policy multiplayer_race_positions_read on public.multiplayer_race_positions
  for select to authenticated
  using (public.is_multiplayer_room_member(room_id));

revoke all on public.multiplayer_profiles from anon, authenticated;
revoke all on public.multiplayer_rooms from anon, authenticated;
revoke all on public.multiplayer_room_members from anon, authenticated;
revoke all on public.multiplayer_race_positions from anon, authenticated;
grant select on public.multiplayer_profiles to authenticated;
grant select on public.multiplayer_rooms to authenticated;
grant select on public.multiplayer_room_members to authenticated;
grant select on public.multiplayer_race_positions to authenticated;

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

create or replace function public.create_multiplayer_room(
  p_max_players smallint default 4,
  p_is_public boolean default true
)
returns public.multiplayer_rooms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.multiplayer_rooms;
  v_code text;
begin
  if v_user_id is null then
    raise exception 'Sign in before creating a room.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.multiplayer_profiles p where p.id = v_user_id) then
    raise exception 'Set an online username before creating a room.' using errcode = '23503';
  end if;
  if p_max_players not between 2 and 4 then
    raise exception 'Rooms support two to four players.' using errcode = '22023';
  end if;
  if exists (select 1 from public.multiplayer_room_members m where m.user_id = v_user_id) then
    raise exception 'Leave your current room before creating another.' using errcode = '23505';
  end if;

  delete from public.multiplayer_rooms where expires_at <= now();
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1 from public.multiplayer_rooms r where r.room_code = v_code
    );
  end loop;

  insert into public.multiplayer_rooms (room_code, host_id, max_players, is_public)
  values (v_code, v_user_id, p_max_players, p_is_public)
  returning * into v_room;

  insert into public.multiplayer_room_members (room_id, user_id, seat, ready)
  values (v_room.id, v_user_id, 0, true);

  return v_room;
end
$$;

create or replace function public.join_multiplayer_room(p_room_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.multiplayer_rooms;
  v_seat integer;
begin
  if v_user_id is null then
    raise exception 'Sign in before joining a room.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.multiplayer_profiles p where p.id = v_user_id) then
    raise exception 'Set an online username before joining a room.' using errcode = '23503';
  end if;
  if exists (select 1 from public.multiplayer_room_members m where m.user_id = v_user_id) then
    raise exception 'Leave your current room before joining another.' using errcode = '23505';
  end if;

  select * into v_room
  from public.multiplayer_rooms r
  where r.room_code = upper(btrim(coalesce(p_room_code, '')))
    and r.expires_at > now()
  for update;

  if not found or v_room.status <> 'waiting' then
    raise exception 'Room code was not found or the race has already started.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.multiplayer_room_members m where m.room_id = v_room.id)
     >= v_room.max_players then
    raise exception 'This room is full.' using errcode = '23514';
  end if;

  select candidate.seat into v_seat
  from generate_series(0, v_room.max_players - 1) as candidate(seat)
  where not exists (
    select 1
    from public.multiplayer_room_members m
    where m.room_id = v_room.id and m.seat = candidate.seat
  )
  order by candidate.seat
  limit 1;

  insert into public.multiplayer_room_members (room_id, user_id, seat, ready)
  values (v_room.id, v_user_id, v_seat, false);

  return v_room.id;
end
$$;

create or replace function public.set_multiplayer_ready(p_room_id uuid, p_ready boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_multiplayer_room_member(p_room_id) then
    raise exception 'You are not a member of this room.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.multiplayer_rooms r
    where r.id = p_room_id and r.status = 'waiting' and r.expires_at > now()
  ) then
    raise exception 'Readiness can only be changed while the room is waiting.' using errcode = '55000';
  end if;

  update public.multiplayer_room_members
  set ready = p_ready, last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid();
end
$$;

create or replace function public.touch_multiplayer_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before updating room presence.' using errcode = '28000';
  end if;

  update public.multiplayer_room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'You are not a member of this room.' using errcode = '42501';
  end if;
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
  set status = 'racing', starts_at = v_starts_at, expires_at = now() + interval '2 hours'
  where id = p_room_id;

  return v_starts_at;
end
$$;

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
  delete from public.multiplayer_race_positions where room_id = p_room_id;

  select m.user_id into v_next_host
  from public.multiplayer_room_members m
  where m.room_id = p_room_id
  order by m.joined_at, m.seat
  limit 1;

  if v_next_host is null then
    delete from public.multiplayer_rooms where id = p_room_id;
  else
    update public.multiplayer_rooms
    set host_id = v_next_host,
        status = 'waiting',
        starts_at = null,
        expires_at = now() + interval '2 hours'
    where id = p_room_id;
    update public.multiplayer_room_members
    set ready = (user_id = v_next_host)
    where room_id = p_room_id;
  end if;

  delete from public.multiplayer_rooms where expires_at <= now();
end
$$;

create or replace function public.update_multiplayer_race_position(
  p_room_id uuid,
  p_lane_ratio real,
  p_distance real
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
  if p_lane_ratio is null or p_lane_ratio < 0 or p_lane_ratio > 1
     or p_distance is null or p_distance < 0 or p_distance > 1000000000 then
    raise exception 'Invalid race position.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.multiplayer_rooms r
    where r.id = p_room_id and r.status = 'racing'
      and r.starts_at <= now() and r.expires_at > now()
  ) then
    raise exception 'This race is not active.' using errcode = '55000';
  end if;

  insert into public.multiplayer_race_positions (room_id, user_id, lane_ratio, distance)
  values (p_room_id, auth.uid(), p_lane_ratio, p_distance)
  on conflict (room_id, user_id) do update
    set lane_ratio = excluded.lane_ratio,
        distance = excluded.distance,
        updated_at = now();

  update public.multiplayer_room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid();
end
$$;

create or replace function public.get_multiplayer_race_state(p_room_id uuid)
returns table (
  user_id uuid,
  username text,
  lane_ratio real,
  distance real,
  updated_at timestamptz
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
  select m.user_id, p.username, pos.lane_ratio, pos.distance, pos.updated_at
  from public.multiplayer_room_members m
  join public.multiplayer_profiles p on p.id = m.user_id
  left join public.multiplayer_race_positions pos
    on pos.room_id = m.room_id
    and pos.user_id = m.user_id
    and pos.updated_at > now() - interval '3 seconds'
  where m.room_id = p_room_id
  order by m.seat;
end
$$;

revoke all on function public.normalize_multiplayer_username(text) from public, anon, authenticated;
revoke all on function public.is_multiplayer_room_member(uuid) from public, anon, authenticated;
revoke all on function public.are_multiplayer_roommates(uuid) from public, anon, authenticated;
revoke all on function public.cleanup_expired_multiplayer_rooms() from public, anon, authenticated;
revoke all on function public.set_multiplayer_username(text) from public, anon, authenticated;
revoke all on function public.create_multiplayer_room(smallint, boolean) from public, anon, authenticated;
revoke all on function public.join_multiplayer_room(text) from public, anon, authenticated;
revoke all on function public.set_multiplayer_ready(uuid, boolean) from public, anon, authenticated;
revoke all on function public.touch_multiplayer_room(uuid) from public, anon, authenticated;
revoke all on function public.start_multiplayer_room(uuid) from public, anon, authenticated;
revoke all on function public.leave_multiplayer_room(uuid) from public, anon, authenticated;
revoke all on function public.update_multiplayer_race_position(uuid, real, real) from public, anon, authenticated;
revoke all on function public.get_multiplayer_race_state(uuid) from public, anon, authenticated;
grant execute on function public.is_multiplayer_room_member(uuid) to authenticated;
grant execute on function public.are_multiplayer_roommates(uuid) to authenticated;
grant execute on function public.cleanup_expired_multiplayer_rooms() to authenticated;
grant execute on function public.set_multiplayer_username(text) to authenticated;
grant execute on function public.create_multiplayer_room(smallint, boolean) to authenticated;
grant execute on function public.join_multiplayer_room(text) to authenticated;
grant execute on function public.set_multiplayer_ready(uuid, boolean) to authenticated;
grant execute on function public.touch_multiplayer_room(uuid) to authenticated;
grant execute on function public.start_multiplayer_room(uuid) to authenticated;
grant execute on function public.leave_multiplayer_room(uuid) to authenticated;
grant execute on function public.update_multiplayer_race_position(uuid, real, real) to authenticated;
grant execute on function public.get_multiplayer_race_state(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'multiplayer_rooms'
    ) then
      execute 'alter publication supabase_realtime add table public.multiplayer_rooms';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'multiplayer_room_members'
    ) then
      execute 'alter publication supabase_realtime add table public.multiplayer_room_members';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'multiplayer_race_positions'
    ) then
      execute 'alter publication supabase_realtime add table public.multiplayer_race_positions';
    end if;
  end if;
end
$$;
