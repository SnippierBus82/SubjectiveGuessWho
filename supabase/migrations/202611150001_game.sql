-- The browser may read RLS-filtered public data, but every write goes through an RPC.
-- Secrets and idempotency receipts live outside the exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.character_packs (
  id text primary key,
  name text not null,
  active boolean not null default true
);
create table public.characters (
  id text primary key,
  pack_id text not null references public.character_packs(id),
  name text not null,
  position smallint not null check (position between 0 and 23),
  unique (pack_id, position)
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{7}$'),
  current_game_id uuid,
  version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  last_activity timestamptz not null default clock_timestamp()
);
create index rooms_expiry_idx on public.rooms(last_activity);
create table public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  nickname text not null check (char_length(nickname) between 1 and 18),
  ready boolean not null default false,
  rematch_ready boolean not null default false,
  primary key (room_id, user_id),
  unique (room_id, slot)
);
create index room_players_user_idx on public.room_players(user_id);
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  pack_id text not null default 'original' references public.character_packs(id),
  phase text not null default 'lobby' check (phase in ('lobby', 'question', 'answer', 'finished')),
  active_player uuid references auth.users(id) on delete cascade,
  turn integer not null default 0 check (turn >= 0),
  deadline timestamptz,
  winner uuid references auth.users(id) on delete cascade,
  guesser uuid references auth.users(id) on delete cascade,
  guess_character text references public.characters(id),
  result text check (result in ('correct', 'incorrect')),
  created_at timestamptz not null default clock_timestamp(),
  check ((phase in ('question', 'answer')) = (deadline is not null)),
  check ((phase = 'finished') = (winner is not null))
);
create index games_room_idx on public.games(room_id);
alter table public.rooms add constraint rooms_current_game_fk
  foreign key (current_game_id) references public.games(id) on delete set null;
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  turn integer not null,
  asker uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 50 and body = btrim(body)),
  answer boolean,
  status text not null default 'pending' check (status in ('pending', 'answered', 'unanswered')),
  asked_at timestamptz not null default clock_timestamp(),
  answered_at timestamptz,
  unique (game_id, turn),
  check ((status = 'answered') = (answer is not null))
);
create table private.selections (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id),
  primary key (game_id, user_id)
);
create table private.action_receipts (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null,
  request jsonb not null,
  primary key (room_id, user_id, action_id)
);
create table private.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  bucket bigint not null,
  hits integer not null,
  primary key (user_id, kind, bucket)
);

alter table public.character_packs enable row level security;
alter table public.characters enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.questions enable row level security;
alter table private.selections enable row level security;
alter table private.action_receipts enable row level security;
alter table private.rate_limits enable row level security;

-- These helpers deliberately expose only a membership boolean.
create function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_players p join public.rooms r on r.id = p.room_id
    where p.room_id = p_room_id and p.user_id = (select auth.uid())
      and r.last_activity > now() - interval '24 hours');
$$;
create function public.room_topic_allowed(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_players p join public.rooms r on r.id = p.room_id
    where p.user_id = (select auth.uid()) and r.last_activity > now() - interval '24 hours'
      and p_topic in ('game:' || p.room_id::text, 'social:' || p.room_id::text));
$$;
create policy catalog_packs on public.character_packs for select to authenticated using (active);
create policy catalog_characters on public.characters for select to authenticated using (true);
create policy members_rooms on public.rooms for select to authenticated using (public.is_room_member(id));
create policy members_players on public.room_players for select to authenticated using (public.is_room_member(room_id));
create policy members_games on public.games for select to authenticated using (public.is_room_member(room_id));
create policy members_questions on public.questions for select to authenticated using (
  exists (select 1 from public.games g where g.id = game_id and public.is_room_member(g.room_id))
);
-- No policy or grant allows a browser to read private.selections, even its own.
-- The snapshot below explicitly projects only the caller's selection until finish.
create policy game_receive on realtime.messages for select to authenticated using (
  extension in ('broadcast', 'presence') and topic = (select realtime.topic())
    and public.room_topic_allowed((select realtime.topic()))
);
create policy social_send on realtime.messages for insert to authenticated with check (
  extension in ('broadcast', 'presence') and topic = (select realtime.topic()) and (select realtime.topic()) like 'social:%'
    and public.room_topic_allowed((select realtime.topic()))
);

create function private.allow_request(p_kind text, p_limit integer, p_window integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  if auth.uid() is null then return false; end if;
  insert into private.rate_limits(user_id, kind, bucket, hits)
    values (auth.uid(), p_kind, floor(extract(epoch from clock_timestamp()) / p_window)::bigint, 1)
    on conflict (user_id, kind, bucket) do update set hits = private.rate_limits.hits + 1
    returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

create function private.notify_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_version bigint;
begin
  update public.rooms set version = version + 1, last_activity = clock_timestamp()
    where id = p_room_id returning version into v_version;
  -- Never broadcast row records: they might contain a secret in future migrations.
  perform realtime.send(jsonb_build_object('version', v_version), 'state', 'game:' || p_room_id::text, true);
end;
$$;

create function private.snapshot(p_room_id uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object(
    'roomId', r.id, 'code', r.code, 'version', r.version,
    'serverNow', clock_timestamp(), 'you', auth.uid(),
    'players', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.user_id, 'name', p.nickname, 'slot', p.slot, 'ready', p.ready,
      'rematchReady', p.rematch_ready) order by p.slot), '[]'::jsonb)
      from public.room_players p where p.room_id = r.id),
    'game', jsonb_build_object('id', g.id, 'packId', g.pack_id, 'phase', g.phase,
      'turn', g.turn, 'activePlayer', g.active_player, 'deadline', g.deadline,
      'winner', g.winner, 'guesser', g.guesser, 'guessCharacter', g.guess_character, 'result', g.result),
    'myCharacter', (select s.character_id from private.selections s where s.game_id = g.id and s.user_id = auth.uid()),
    'reveals', case when g.phase = 'finished' then
      (select coalesce(jsonb_object_agg(s.user_id::text, s.character_id), '{}'::jsonb)
        from private.selections s where s.game_id = g.id) else null end,
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'turn', q.turn,
      'asker', q.asker, 'text', q.body, 'answer', q.answer, 'status', q.status,
      'askedAt', q.asked_at) order by q.turn), '[]'::jsonb)
      from public.questions q where q.game_id = g.id)
  ) from public.rooms r join public.games g on g.id = r.current_game_id where r.id = p_room_id;
$$;

create function private.advance_expired(p_room_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype; v_steps integer; v_other uuid;
begin
  -- The caller already holds the room row lock. Never use client timestamps.
  select g.* into v_game from public.games g join public.rooms r on r.current_game_id = g.id where r.id = p_room_id;
  if v_game.deadline is null or clock_timestamp() < v_game.deadline then return false; end if;
  select p.user_id into v_other from public.room_players p
    where p.room_id = p_room_id and p.user_id <> v_game.active_player;
  if v_game.phase = 'answer' then
    update public.questions set status = 'unanswered', answered_at = clock_timestamp()
      where game_id = v_game.id and turn = v_game.turn and status = 'pending';
  end if;
  -- Reconnection may be hours later. Compute missed empty question turns in O(1).
  v_steps := 1 + floor(extract(epoch from (clock_timestamp() - v_game.deadline)) / 30)::integer;
  update public.games set phase = 'question', turn = turn + v_steps,
    active_player = case when v_steps % 2 = 1 then v_other else v_game.active_player end,
    deadline = v_game.deadline + v_steps * interval '30 seconds'
    where id = v_game.id;
  perform private.notify_room(p_room_id);
  return true;
end;
$$;

create function public.create_room(p_nickname text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room uuid; v_game uuid; v_code text; v_attempt integer;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Please reconnect to play.'); end if;
  if p_request_id is null then return jsonb_build_object('error', 'A request ID is required.'); end if;
  -- Serialize retries per user before looking up their creation receipt.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select a.room_id into v_room from private.action_receipts a where a.user_id = auth.uid()
    and a.action_id = p_request_id and a.request->>'kind' = 'create';
  if found then
    if not public.is_room_member(v_room) then return jsonb_build_object('error', 'This room has expired. Create a fresh room.'); end if;
    if not private.allow_request('snapshot', 120, 60) then return jsonb_build_object('error', 'Please wait a moment before retrying.'); end if;
    return jsonb_build_object('state', private.snapshot(v_room));
  end if;
  if not private.allow_request('create', 5, 3600) then return jsonb_build_object('error', 'Too many new rooms. Try again in an hour.'); end if;
  if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname ~ '[[:cntrl:]]' then
    return jsonb_build_object('error', 'Use a nickname of 1–18 characters.');
  end if;
  if (select count(*) from public.room_players p join public.rooms r on r.id = p.room_id
      where p.user_id = auth.uid() and r.last_activity > clock_timestamp() - interval '24 hours') >= 5 then
    return jsonb_build_object('error', 'You already have five active rooms.');
  end if;
  for v_attempt in 1..10 loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    insert into public.rooms(code) values (v_code) on conflict (code) do nothing returning id into v_room;
    exit when v_room is not null;
  end loop;
  if v_room is null then return jsonb_build_object('error', 'Could not create a code. Please retry.'); end if;
  insert into public.room_players(room_id, user_id, slot, nickname) values (v_room, auth.uid(), 1, btrim(p_nickname));
  insert into public.games(room_id) values (v_room) returning id into v_game;
  update public.rooms set current_game_id = v_game where id = v_room;
  insert into private.action_receipts values (v_room, auth.uid(), p_request_id, jsonb_build_object('kind', 'create'));
  return jsonb_build_object('state', private.snapshot(v_room));
end;
$$;

create function public.join_room(p_code text, p_nickname text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Please reconnect to play.'); end if;
  if not private.allow_request('join', 20, 60) then return jsonb_build_object('error', 'Too many join attempts. Wait a minute.'); end if;
  if p_code is null or upper(btrim(p_code)) !~ '^[A-F0-9]{7}$' then return jsonb_build_object('error', 'Enter the 7-character room code.'); end if;
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found or v_room.last_activity < clock_timestamp() - interval '24 hours' then
    return jsonb_build_object('error', 'That room has expired or does not exist.');
  end if;
  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = auth.uid()) then
    perform private.advance_expired(v_room.id);
    return jsonb_build_object('state', private.snapshot(v_room.id));
  end if;
  if (select count(*) from public.room_players where room_id = v_room.id) >= 2 then
    return jsonb_build_object('error', 'This room already has two players.');
  end if;
  if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname ~ '[[:cntrl:]]' then
    return jsonb_build_object('error', 'Use a nickname of 1–18 characters.');
  end if;
  if (select count(*) from public.room_players p join public.rooms r on r.id = p.room_id
      where p.user_id = auth.uid() and r.last_activity > clock_timestamp() - interval '24 hours') >= 5 then
    return jsonb_build_object('error', 'You already have five active rooms.');
  end if;
  -- The locked parent row plus UNIQUE(room_id, slot) makes simultaneous joins safe.
  insert into public.room_players(room_id, user_id, slot, nickname)
    values (v_room.id, auth.uid(), 2, btrim(p_nickname));
  perform private.notify_room(v_room.id);
  return jsonb_build_object('state', private.snapshot(v_room.id));
end;
$$;

create function public.get_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_room_member(p_room_id) then return jsonb_build_object('error', 'This room is unavailable to your session.', 'code', 'ROOM_UNAVAILABLE'); end if;
  if not private.allow_request('snapshot', 120, 60) then return jsonb_build_object('error', 'Please wait a moment before reconnecting.'); end if;
  perform 1 from public.rooms where id = p_room_id for update;
  perform private.advance_expired(p_room_id);
  update public.rooms set last_activity = clock_timestamp()
    where id = p_room_id and last_activity < clock_timestamp() - interval '5 minutes';
  return jsonb_build_object('state', private.snapshot(p_room_id));
end;
$$;

create function public.game_action(
  p_room_id uuid, p_game_id uuid, p_turn integer, p_action_id uuid, p_kind text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_request jsonb; v_previous jsonb; v_character text; v_other uuid; v_new_game uuid;
  v_text text; v_answer boolean; v_correct boolean; v_error text;
begin
  if not public.is_room_member(p_room_id) then return jsonb_build_object('error', 'This room is unavailable to your session.', 'code', 'ROOM_UNAVAILABLE'); end if;
  perform 1 from public.rooms where id = p_room_id for update;
  if p_payload is not null and octet_length(p_payload::text) > 2048 then
    return jsonb_build_object('error', 'This game action is too large.');
  end if;
  v_request := jsonb_build_object('game', p_game_id, 'turn', p_turn, 'kind', p_kind, 'payload', p_payload);
  select request into v_previous from private.action_receipts
    where room_id = p_room_id and user_id = auth.uid() and action_id = p_action_id;
  if found then
    if v_previous <> v_request then return jsonb_build_object('error', 'This action ID was already used.'); end if;
    if not private.allow_request('snapshot', 120, 60) then return jsonb_build_object('error', 'Please wait a moment before retrying.'); end if;
    perform private.advance_expired(p_room_id);
    return jsonb_build_object('state', private.snapshot(p_room_id));
  end if;
  if p_action_id is null or p_kind is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('error', 'Invalid game action.');
  end if;
  if not private.allow_request('action', 90, 60) then return jsonb_build_object('error', 'Slow down a little. Try again in a minute.'); end if;
  perform private.advance_expired(p_room_id);
  select g.* into v_game from public.games g join public.rooms r on r.current_game_id = g.id where r.id = p_room_id;
  if p_game_id is distinct from v_game.id then v_error := 'A new round has started. Please try again.';
  elsif p_kind in ('question', 'answer', 'guess') and p_turn is distinct from v_game.turn then
    v_error := 'The turn has changed. Your draft is still here.';
  end if;
  if v_error is not null then return jsonb_build_object('error', v_error, 'state', private.snapshot(p_room_id)); end if;
  select user_id into v_other from public.room_players where room_id = p_room_id and user_id <> auth.uid();

  case p_kind
  when 'select' then
    v_character := p_payload->>'characterId';
    if v_game.phase <> 'lobby' then v_error := 'Your secret is locked for this round.';
    elsif (select ready from public.room_players where room_id = p_room_id and user_id = auth.uid()) then v_error := 'Unready before changing your secret.';
    elsif not exists (select 1 from public.characters where id = v_character and pack_id = v_game.pack_id) then v_error := 'Choose a character from this board.';
    else
      insert into private.selections values (v_game.id, auth.uid(), v_character)
        on conflict (game_id, user_id) do update set character_id = excluded.character_id;
    end if;
  when 'ready' then
    if v_game.phase <> 'lobby' then v_error := 'This round has already started.';
    elsif not exists (select 1 from private.selections where game_id = v_game.id and user_id = auth.uid()) then v_error := 'Pick your secret character first.';
    else
      update public.room_players set ready = true where room_id = p_room_id and user_id = auth.uid();
      if (select count(*) from public.room_players where room_id = p_room_id and ready) = 2 then
        update public.games set phase = 'question', turn = 1,
          active_player = (select user_id from public.room_players where room_id = p_room_id order by random() limit 1),
          deadline = clock_timestamp() + interval '30 seconds' where id = v_game.id;
      end if;
    end if;
  when 'unready' then
    if v_game.phase <> 'lobby' then v_error := 'This round has already started.';
    else update public.room_players set ready = false where room_id = p_room_id and user_id = auth.uid(); end if;
  when 'question' then
    v_text := btrim(p_payload->>'text');
    if v_game.phase <> 'question' or v_game.active_player <> auth.uid() then v_error := 'You can ask a question on your turn.';
    elsif v_text is null or char_length(v_text) not between 1 and 50 or v_text ~ '[[:cntrl:]]' then v_error := 'Questions must be 1–50 characters on one line.';
    else
      insert into public.questions(game_id, turn, asker, body) values (v_game.id, v_game.turn, auth.uid(), v_text);
      update public.games set phase = 'answer', deadline = clock_timestamp() + interval '15 seconds' where id = v_game.id;
    end if;
  when 'answer' then
    if v_game.phase <> 'answer' or v_game.active_player = auth.uid() then v_error := 'Only your friend can answer that question.';
    elsif jsonb_typeof(p_payload->'answer') is distinct from 'boolean' then v_error := 'Choose YES or NO.';
    else
      v_answer := (p_payload->>'answer')::boolean;
      update public.questions set answer = v_answer, status = 'answered', answered_at = clock_timestamp()
        where game_id = v_game.id and turn = v_game.turn and status = 'pending';
      update public.games set phase = 'question', active_player = auth.uid(), turn = turn + 1,
        deadline = clock_timestamp() + interval '30 seconds' where id = v_game.id;
    end if;
  when 'guess' then
    v_character := p_payload->>'characterId';
    if v_game.phase <> 'question' or v_game.active_player <> auth.uid() then v_error := 'Make a final guess during your question turn.';
    elsif not exists (select 1 from public.characters where id = v_character and pack_id = v_game.pack_id) then v_error := 'Choose a character from this board.';
    else
      select character_id = v_character into v_correct from private.selections where game_id = v_game.id and user_id = v_other;
      if v_correct is null then v_error := 'Your friend has not selected a character.';
      else
        update public.games set phase = 'finished', deadline = null, guesser = auth.uid(), guess_character = v_character,
          winner = case when v_correct then auth.uid() else v_other end,
          result = case when v_correct then 'correct' else 'incorrect' end where id = v_game.id;
      end if;
    end if;
  when 'rematch' then
    if v_game.phase <> 'finished' then v_error := 'Finish this round before playing again.';
    else
      update public.room_players set rematch_ready = true where room_id = p_room_id and user_id = auth.uid();
      if (select count(*) from public.room_players where room_id = p_room_id and rematch_ready) = 2 then
        insert into public.games(room_id, pack_id) values (p_room_id, v_game.pack_id) returning id into v_new_game;
        update public.rooms set current_game_id = v_new_game where id = p_room_id;
        update public.room_players set ready = false, rematch_ready = false where room_id = p_room_id;
      end if;
    end if;
  else v_error := 'Unknown game action.';
  end case;
  if v_error is not null then return jsonb_build_object('error', v_error, 'state', private.snapshot(p_room_id)); end if;
  insert into private.action_receipts values (p_room_id, auth.uid(), p_action_id, v_request);
  perform private.notify_room(p_room_id);
  return jsonb_build_object('state', private.snapshot(p_room_id));
end;
$$;

create function public.cleanup_expired_rooms() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.rooms where last_activity < clock_timestamp() - interval '24 hours';
  get diagnostics v_count = row_count;
  delete from private.rate_limits where bucket < floor(extract(epoch from clock_timestamp()) / 3600)::bigint - 48
    and kind = 'create';
  delete from private.rate_limits where bucket < floor(extract(epoch from clock_timestamp()) / 60)::bigint - 2880
    and kind <> 'create';
  -- Cap previous rounds retained in long-running rooms to the most recent 20.
  delete from public.games where id in (
    select id from (select g.id, row_number() over (partition by g.room_id order by g.created_at desc) as n
      from public.games g join public.rooms r on r.id = g.room_id where g.id <> r.current_game_id) old where n > 20
  );
  delete from private.action_receipts a where a.request->>'kind' <> 'create'
    and not exists (select 1 from public.games g where g.room_id = a.room_id and g.id::text = a.request->>'game');
  return v_count;
end;
$$;

-- Remove Supabase's default table/function grants. SECURITY DEFINER is never
-- sufficient on its own: every entry point validates auth.uid() and membership.
revoke all on public.rooms, public.room_players, public.games, public.questions,
  public.characters, public.character_packs from public, anon, authenticated;
grant select on public.rooms, public.room_players, public.games, public.questions,
  public.characters, public.character_packs to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.is_room_member(uuid), public.room_topic_allowed(text),
  public.create_room(text, uuid), public.join_room(text, text), public.get_room(uuid),
  public.game_action(uuid, uuid, integer, uuid, text, jsonb), public.cleanup_expired_rooms()
  from public, anon, authenticated;
grant execute on function public.is_room_member(uuid), public.room_topic_allowed(text),
  public.create_room(text, uuid), public.join_room(text, text), public.get_room(uuid),
  public.game_action(uuid, uuid, integer, uuid, text, jsonb) to authenticated;
grant execute on function public.cleanup_expired_rooms() to service_role;

insert into public.character_packs(id, name) values ('original', 'The Original 24');
insert into public.characters(id, pack_id, name, position) values
  ('amara','original','Amara',0), ('milo','original','Milo',1), ('cleo','original','Cleo',2),
  ('jasper','original','Jasper',3), ('olive','original','Olive',4), ('theo','original','Theo',5),
  ('zara','original','Zara',6), ('felix','original','Felix',7), ('luna','original','Luna',8),
  ('nico','original','Nico',9), ('priya','original','Priya',10), ('hugo','original','Hugo',11),
  ('iris','original','Iris',12), ('oscar','original','Oscar',13), ('bea','original','Bea',14),
  ('max','original','Max',15), ('esme','original','Esme',16), ('leo','original','Leo',17),
  ('ruby','original','Ruby',18), ('otto','original','Otto',19), ('mae','original','Mae',20),
  ('ezra','original','Ezra',21), ('june','original','June',22), ('arlo','original','Arlo',23);
