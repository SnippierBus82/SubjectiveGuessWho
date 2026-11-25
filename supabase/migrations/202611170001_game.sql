-- The browser may read RLS-filtered public data, but every write goes through an RPC.
-- Secrets and idempotency receipts live outside the exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.board_catalog (
  id text primary key,
  kind text not null check (kind in ('synthetic-photo', 'folder')),
  enabled boolean not null default true,
  display_name text not null,
  version text not null
);
insert into private.board_catalog(id, kind, display_name, version)
values ('ai-random', 'synthetic-photo', 'Random AI faces', '1');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{7}$'),
  current_game_id uuid,
  matchmade boolean not null default false,
  board_id text not null references private.board_catalog(id),
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
  last_seen timestamptz not null default clock_timestamp(),
  resume_ready boolean not null default false,
  primary key (room_id, user_id),
  unique (room_id, slot)
);
create index room_players_user_idx on public.room_players(user_id);
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  phase text not null default 'lobby' check (phase in ('lobby', 'question', 'answer', 'paused', 'finished')),
  active_player uuid references auth.users(id) on delete cascade,
  turn integer not null default 0 check (turn >= 0),
  deadline timestamptz,
  winner uuid references auth.users(id) on delete cascade,
  guesser uuid references auth.users(id) on delete cascade,
  guess_character text,
  result text check (result in ('correct', 'incorrect')),
  created_at timestamptz not null default clock_timestamp(),
  settings jsonb not null default '{"question":120,"answer":30,"review":60}',
  started_at timestamptz,
  writing_deadline timestamptz,
  review_deadline timestamptz,
  review_ready boolean not null default true,
  submitted_at timestamptz,
  pause_data jsonb,
  end_reason text,
  board_key text not null,
  board_label text not null,
  board_status text not null default 'pending' check (board_status in ('pending', 'ready', 'error')),
  board_source text check (board_source in ('folder', 'online', 'cache')),
  board_error text,
  board_lease uuid,
  board_lease_until timestamptz,
  check ((phase = 'finished') = (winner is not null or end_reason is not null))
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
  status text not null default 'pending' check (status in ('pending', 'answered')),
  asked_at timestamptz not null default clock_timestamp(),
  answered_at timestamptz,
  unique (game_id, turn),
  check ((status = 'answered') = (answer is not null))
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

create table public.game_characters (
  game_id uuid not null references public.games(id) on delete cascade,
  id text not null, position integer not null check(position between 0 and 23), definition jsonb not null,
  primary key(game_id,id), unique(game_id,position)
);
alter table public.game_characters enable row level security;
create table private.selections (
 game_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade, character_id text not null,
 primary key(game_id,user_id), foreign key(game_id,character_id) references public.game_characters(game_id,id) on delete cascade
);
alter table private.selections enable row level security;
create table private.submissions (
 game_id uuid not null references public.games(id) on delete cascade, turn integer not null, body text not null,
 primary key(game_id,turn)
);
create table private.match_queue (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null, queued_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 seconds',
 board_id text not null references private.board_catalog(id),
 room_id uuid references public.rooms(id) on delete set null
);
create index queue_board_waiting on private.match_queue(board_id,queued_at,user_id) where room_id is null;
create table private.reaction_clock(user_id uuid primary key references auth.users(id) on delete cascade, sent_at timestamptz not null);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.questions enable row level security;
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
create policy cast_members on public.game_characters for select to authenticated using (
  exists(select 1 from public.games g where g.id=game_id and public.is_room_member(g.room_id))
);
revoke all on public.game_characters from public, anon, authenticated;
grant select on public.game_characters to authenticated;
create policy members_rooms on public.rooms for select to authenticated using (public.is_room_member(id));
create policy members_players on public.room_players for select to authenticated using (public.is_room_member(room_id));
create policy members_games on public.games for select to authenticated using (public.is_room_member(room_id));
create policy members_questions on public.questions for select to authenticated using (
  exists (select 1 from public.games g where g.id = game_id and public.is_room_member(g.room_id))
);
create policy game_receive on realtime.messages for select to authenticated using (
  extension in ('broadcast', 'presence') and topic = (select realtime.topic())
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

create function private.room_snapshot(p_room uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
  select jsonb_build_object(
    'roomId', r.id, 'code', r.code, 'version', r.version,
    'serverNow', clock_timestamp(), 'you', auth.uid(),
    'mode', case when r.matchmade then 'match' else 'private' end,
    'settings', g.settings,
    'boardId', g.board_key, 'boardLabel', g.board_label, 'boardStatus', g.board_status,
    'boardSource', g.board_source, 'boardError', g.board_error,
    'board', coalesce((select jsonb_agg(definition order by position)
      from public.game_characters where game_id = g.id), '[]'::jsonb),
    'players', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.user_id, 'name', p.nickname, 'slot', p.slot, 'ready', p.ready,
      'rematchReady', p.rematch_ready) order by p.slot), '[]'::jsonb)
      from public.room_players p where p.room_id = r.id),
    'game', jsonb_build_object(
      'id', g.id, 'phase', g.phase, 'turn', g.turn, 'activePlayer', g.active_player,
      'deadline', case
        when g.phase = 'lobby' and g.board_status <> 'ready' then null
        when g.phase = 'lobby' and r.matchmade then g.created_at + interval '120 seconds'
        else g.deadline end,
      'winner', g.winner, 'guesser', g.guesser, 'guessCharacter', g.guess_character,
      'result', g.result, 'endReason', g.end_reason,
      'pause', case when g.pause_data is not null then jsonb_build_object(
        'reason', g.pause_data->'reason', 'since', g.pause_data->'since', 'missing', g.pause_data->'missing',
        'resumeReady', (select coalesce(jsonb_agg(user_id), '[]'::jsonb)
          from public.room_players where room_id = r.id and resume_ready)) end,
      'flow', jsonb_build_object(
        'startedAt', g.started_at, 'writingDeadline', g.writing_deadline, 'reviewDeadline', g.review_deadline,
        'submitted', g.submitted_at is not null, 'reviewReady', g.review_ready,
        'ownSubmission', case when g.active_player = auth.uid() then
          (select body from private.submissions where game_id = g.id and turn = g.turn) end)),
    'myCharacter', (select character_id from private.selections where game_id = g.id and user_id = auth.uid()),
    'reveals', case when g.phase = 'finished' then
      (select jsonb_object_agg(user_id::text, character_id) from private.selections where game_id = g.id) end,
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'turn', q.turn,
      'asker', q.asker, 'text', q.body, 'answer', q.answer, 'status', q.status,
      'askedAt', q.asked_at) order by q.turn), '[]'::jsonb)
      from public.questions q where q.game_id = g.id)
  ) from public.rooms r join public.games g on g.id = r.current_game_id where r.id = p_room;
$$;

create function private.valid_settings(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if s is null or jsonb_typeof(s)<>'object' then return false; end if;
 if not s ?& array['question','answer','review'] or (select count(*) from jsonb_object_keys(s))<>3 then return false; end if;
 if s->'question' not in ('null','60','90','120','180','300')
 or s->'answer' not in ('null','15','30','45','60','90','120')
 or s->'review' not in ('null','15','30','45','60','90','120') then return false; end if;
 return s->'question'='null' or s->'review'='null' or (s->>'review')::integer <= (s->>'question')::integer;
end; $$;

-- A per-identity reservation is guarded by the short admission lock in all admission RPCs.
create function private.active_room(p_user uuid) returns uuid language sql stable security definer set search_path='' as $$
 select r.id from public.rooms r join public.games g on g.id=r.current_game_id join public.room_players p on p.room_id=r.id
 where p.user_id=p_user and g.phase<>'finished' and r.last_activity>clock_timestamp()-interval '24 hours' limit 1;
$$;

create function private.new_game(p_room uuid, p_settings jsonb) returns uuid
language sql security definer set search_path='' as $$
  insert into public.games(room_id, settings, board_key, board_label)
  select r.id, p_settings, c.id, c.display_name
  from public.rooms r join private.board_catalog c on c.id = r.board_id
  where r.id = p_room
  returning id;
$$;

create function private.new_board_room(p_user uuid,p_name text,p_settings jsonb,p_match boolean,p_board_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid; g uuid; n integer;
begin
 if p_name is null or char_length(btrim(p_name)) not between 1 and 18 or p_name~'[[:cntrl:]]' then raise exception 'Use a nickname of 1–18 characters.'; end if;
 for n in 1..10 loop
  insert into public.rooms(code,matchmade,board_id) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,7)),p_match,p_board_id)
   on conflict(code) do nothing returning id into r;
  exit when r is not null;
 end loop;
 if r is null then raise exception 'Could not create a room. Try again.'; end if;
 insert into public.room_players(room_id,user_id,slot,nickname) values(r,p_user,1,btrim(p_name));
 g:=private.new_game(r,p_settings);
 update public.rooms set current_game_id=g where id=r;
 return r;
end; $$;

create function private.begin_writing(p_game uuid,p_user uuid,p_first boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.games set phase='question',active_player=p_user,turn=case when p_first then 1 else turn+1 end,
 started_at=clock_timestamp(),writing_deadline=clock_timestamp()+make_interval(secs=>(settings->>'question')::integer),
 deadline=clock_timestamp()+make_interval(secs=>(settings->>'question')::integer), review_deadline=null,
 review_ready=p_first,submitted_at=null,pause_data=null where id=p_game;
end; $$;
create function private.release_question(p_game uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.questions(game_id,turn,asker,body)
 select g.id,g.turn,g.active_player,s.body from public.games g join private.submissions s on s.game_id=g.id and s.turn=g.turn
 where g.id=p_game on conflict(game_id,turn) do nothing;
 update public.games set phase='answer',deadline=clock_timestamp()+make_interval(secs=>(settings->>'answer')::integer)
 where id=p_game;
end; $$;
create function private.pause_game(p_room uuid,p_reason text,p_missing uuid,p_since timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.games set pause_data=jsonb_build_object('reason',p_reason,'since',p_since,'missing',p_missing,
 'phase',phase,'remaining',case when deadline is null then null else greatest(0,extract(epoch from deadline-p_since)) end),
 phase='paused',deadline=null where id=(select current_game_id from public.rooms where id=p_room) and phase in ('question','answer');
 update public.room_players set resume_ready=false where room_id=p_room;
 perform private.notify_room(p_room);
end; $$;
create function private.advance_game(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype; absent public.room_players%rowtype; missing uuid;
begin
 select gg.* into g from public.games gg join public.rooms r on r.current_game_id=gg.id where r.id=p_room;
 if g.phase not in ('question','answer') then return; end if;
 select * into absent from public.room_players where room_id=p_room and last_seen<clock_timestamp()-interval '45 seconds' order by last_seen limit 1;
 if found and (g.deadline is null or absent.last_seen+interval '45 seconds'<g.deadline) then
  perform private.pause_game(p_room,'disconnect',absent.user_id,absent.last_seen+interval '45 seconds'); return;
 end if;
 if g.deadline is null or clock_timestamp()<g.deadline then return; end if;
 if g.phase='question' and g.submitted_at is not null then
  update public.games set review_ready=true where id=g.id;
  perform private.release_question(g.id); perform private.notify_room(p_room); return;
 end if;
 missing:=g.active_player;
 if g.phase='answer' then select user_id into missing from public.room_players where room_id=p_room and user_id<>g.active_player; end if;
 perform private.pause_game(p_room,'timeout',missing,g.deadline);
end; $$;

create function public.create_room_board_v2(p_nickname text,p_request_id uuid,p_settings jsonb,p_board_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r uuid; old jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('error','Please reconnect to play.'); end if;
 if p_request_id is null or not coalesce(private.valid_settings(p_settings),false) then return jsonb_build_object('error','Choose valid activity timers. Review cannot exceed writing time.'); end if;
 if not coalesce((select enabled from private.board_catalog where id=p_board_id),false) then return jsonb_build_object('error','Choose an available board.'); end if;
 if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname~'[[:cntrl:]]' then return jsonb_build_object('error','Use a nickname of 1–18 characters.'); end if;
 perform pg_advisory_xact_lock(9827341);
 select room_id,request into r,old from private.action_receipts where user_id=auth.uid() and action_id=p_request_id;
 if found then
  if not public.is_room_member(r) then return jsonb_build_object('error','This room has expired. Create a fresh room.'); end if;
  if old<>jsonb_build_object('kind','create','settings',p_settings,'nickname',p_nickname,'boardId',p_board_id) then return jsonb_build_object('error','This request ID was already used.'); end if;
  return jsonb_build_object('state',private.room_snapshot(r));
 end if;
 if private.active_room(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
 if not private.allow_request('create',5,3600) then return jsonb_build_object('error','Too many new rooms. Try again later.'); end if;
 if exists(select 1 from private.match_queue where user_id=auth.uid() and expires_at>clock_timestamp() and room_id is null) then return jsonb_build_object('error','Cancel your player search before creating a room.'); end if;
 r:=private.new_board_room(auth.uid(),p_nickname,p_settings,false,p_board_id);
 delete from private.match_queue where user_id=auth.uid();
 insert into private.action_receipts values(r,auth.uid(),p_request_id,jsonb_build_object('kind','create','settings',p_settings,'nickname',p_nickname,'boardId',p_board_id));
 return jsonb_build_object('state',private.room_snapshot(r));
end; $$;

create function public.join_room_v2(p_code text,p_nickname text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.rooms%rowtype;
begin
 if auth.uid() is null then return jsonb_build_object('error','Please reconnect to play.'); end if;
 if not private.allow_request('join',20,60) then return jsonb_build_object('error','Too many join attempts. Wait a minute.'); end if;
 if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname~'[[:cntrl:]]' then return jsonb_build_object('error','Use a nickname of 1–18 characters.'); end if;
 perform pg_advisory_xact_lock(9827341);
 select * into r from public.rooms where code=upper(btrim(p_code)) for update;
 if not found then
  if not private.allow_request('join',20,60) then return jsonb_build_object('error','Too many join attempts. Wait a minute.'); end if;
  if p_code is null or upper(btrim(p_code)) !~ '^[A-F0-9]{7}$' then
   return jsonb_build_object('error','Enter the 7-character room code.');
  end if;
  return jsonb_build_object('error','That room has expired or does not exist.');
 end if;
 if r.last_activity<clock_timestamp()-interval '24 hours' then return jsonb_build_object('error','This room has expired.'); end if;
 if exists(select 1 from public.room_players where room_id=r.id and user_id=auth.uid()) then return jsonb_build_object('state',private.room_snapshot(r.id)); end if;
 if r.matchmade or (select count(*) from public.room_players where room_id=r.id)>=2 then return jsonb_build_object('error','This room already has two players.'); end if;
 if private.active_room(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
 if exists(select 1 from private.match_queue where user_id=auth.uid() and expires_at>clock_timestamp() and room_id is null) then return jsonb_build_object('error','Cancel your player search first.'); end if;
 delete from private.match_queue where user_id=auth.uid();
 insert into public.room_players(room_id,user_id,slot,nickname) values(r.id,auth.uid(),2,btrim(p_nickname));
 update public.room_players set last_seen=clock_timestamp() where room_id=r.id;
 perform private.notify_room(r.id);
 return jsonb_build_object('state',private.room_snapshot(r.id));
end; $$;
create function public.get_room_v2(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_room_member(p_room_id) then return jsonb_build_object('error','This room is unavailable to your session.','code','ROOM_UNAVAILABLE'); end if;
 if not private.allow_request('snapshot',120,60) then return jsonb_build_object('error','Please wait before retrying.'); end if;
 perform 1 from public.rooms where id=p_room_id for update;
 -- Reconcile before renewing the caller's lease, so a long absence is not hidden.
 perform private.advance_game(p_room_id);
 update public.room_players set last_seen=clock_timestamp() where room_id=p_room_id and user_id=auth.uid();
 update public.rooms set last_activity=clock_timestamp() where id=p_room_id and last_activity<clock_timestamp()-interval '5 minutes';
 return jsonb_build_object('state',private.room_snapshot(p_room_id));
end; $$;
create function public.game_action_v2(p_room_id uuid,p_game_id uuid,p_turn integer,p_action_id uuid,p_kind text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype; other uuid; txt text; cid text; err text; req jsonb; old jsonb; correct boolean; newg uuid; until_at timestamptz; delta interval; all_back boolean;
begin
 if not public.is_room_member(p_room_id) then return jsonb_build_object('error','This game is unavailable.'); end if;
 if p_kind='rematch' then perform pg_advisory_xact_lock(9827341); end if;
 perform 1 from public.rooms where id=p_room_id for update;
 select * into g from public.games where id=(select current_game_id from public.rooms where id=p_room_id);
 if p_kind in ('select','ready') and g.board_status<>'ready' then
  return jsonb_build_object('error','Wait for the faces to finish preparing.','state',private.room_snapshot(p_room_id));
 end if;
 if p_kind='rematch' and g.id=p_game_id and g.phase='finished'
   and exists(select 1 from public.rooms r join private.board_catalog c on c.id=r.board_id where r.id=p_room_id and not c.enabled) then
  update public.rooms set board_id='ai-random' where id=p_room_id;
 end if;
 if p_action_id is null or p_kind is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2048 then return jsonb_build_object('error','Invalid game action.'); end if;
 req:=jsonb_build_object('game',p_game_id,'turn',p_turn,'kind',p_kind,'payload',p_payload);
 select request into old from private.action_receipts where room_id=p_room_id and user_id=auth.uid() and action_id=p_action_id;
 if found then
  if old<>req then return jsonb_build_object('error','This action ID was already used.'); end if;
  return jsonb_build_object('state',private.room_snapshot(p_room_id));
 end if;
 if not private.allow_request('action',90,60) then return jsonb_build_object('error','Slow down a little. Try again in a minute.'); end if;
 perform private.advance_game(p_room_id);
 update public.room_players set last_seen=clock_timestamp() where room_id=p_room_id and user_id=auth.uid();
 select * into g from public.games where id=(select current_game_id from public.rooms where id=p_room_id);
 select user_id into other from public.room_players where room_id=p_room_id and user_id<>auth.uid();
 if g.id is distinct from p_game_id or (p_kind not in ('leave','rematch') and p_turn is distinct from g.turn) then
  return jsonb_build_object('error','The turn has changed. Your draft is still here.','state',private.room_snapshot(p_room_id));
 end if;
 cid:=p_payload->>'characterId'; txt:=btrim(p_payload->>'text');
 case p_kind
 when 'select' then
  if g.phase<>'lobby' or (select ready from public.room_players where room_id=p_room_id and user_id=auth.uid()) then err:='Unready before changing your secret.';
  elsif not exists(select 1 from public.game_characters where game_id=g.id and id=cid) then err:='Choose a character from this board.';
  else insert into private.selections values(g.id,auth.uid(),cid) on conflict(game_id,user_id) do update set character_id=excluded.character_id; end if;
 when 'ready','unready' then
  if g.phase<>'lobby' then err:='This game has already started.';
  elsif p_kind='ready' and g.created_at<clock_timestamp()-interval '120 seconds' and (select matchmade from public.rooms where id=p_room_id) then err:='Character selection time expired. Returning available players to search.';
  elsif not exists(select 1 from private.selections where game_id=g.id and user_id=auth.uid()) then err:='Pick your secret character first.';
  else
   update public.room_players set ready=p_kind='ready' where room_id=p_room_id and user_id=auth.uid();
   if (select count(*) from public.room_players where room_id=p_room_id and ready)=2 then
    perform private.begin_writing(g.id,(select user_id from public.room_players where room_id=p_room_id order by random() limit 1),true);
   end if;
  end if;
 when 'question' then
  if g.phase<>'question' or g.active_player<>auth.uid() or g.submitted_at is not null then err:='You can submit one question on your writing turn.';
  elsif txt is null or char_length(txt) not between 1 and 50 or txt~'[[:cntrl:]]' then err:='Questions must be 1–50 characters on one line.';
  else
   insert into private.submissions values(g.id,g.turn,txt);
   if g.review_ready then until_at:=null;
   elsif g.settings->'review'='null' then until_at:=null;
   else
    until_at:=greatest(g.started_at+make_interval(secs=>(g.settings->>'review')::integer),clock_timestamp()+interval '20 seconds');
    if g.writing_deadline is not null then until_at:=least(until_at,g.writing_deadline); end if;
   end if;
   update public.games set submitted_at=clock_timestamp(),review_deadline=until_at,deadline=until_at where id=g.id;
   if g.review_ready then perform private.release_question(g.id); end if;
  end if;
 when 'review' then
  if g.phase<>'question' or g.active_player=auth.uid() then err:='Only the reviewing player can finish review.';
  else
   update public.games set review_ready=true,review_deadline=null where id=g.id;
   if g.submitted_at is not null then perform private.release_question(g.id); end if;
  end if;
 when 'answer' then
  if g.phase<>'answer' or g.active_player=auth.uid() then err:='Only the other player can answer this question.';
  elsif jsonb_typeof(p_payload->'answer') is distinct from 'boolean' then err:='Choose YES or NO.';
  else
   update public.questions set answer=(p_payload->>'answer')::boolean,status='answered',answered_at=clock_timestamp() where game_id=g.id and turn=g.turn;
   perform private.begin_writing(g.id,auth.uid());
  end if;
 when 'guess' then
  if g.phase<>'question' or g.active_player<>auth.uid() or g.submitted_at is not null then err:='Make a final guess before submitting your question.';
  elsif not exists(select 1 from public.game_characters where game_id=g.id and id=cid) then err:='Choose a character from this board.';
  else
   select character_id=cid into correct from private.selections where game_id=g.id and user_id=other;
   if correct is null then err:='The other player has not selected a character.';
   else update public.games set phase='finished',deadline=null,winner=case when correct then auth.uid() else other end,
    guesser=auth.uid(),guess_character=cid,result=case when correct then 'correct' else 'incorrect' end,end_reason='guess' where id=g.id; end if;
  end if;
 when 'resume' then
  if g.phase<>'paused' then err:='This game is not paused.';
  else
   update public.room_players set resume_ready=true where room_id=p_room_id and user_id=auth.uid();
   select count(*)=2 into all_back from public.room_players where room_id=p_room_id and resume_ready and last_seen>clock_timestamp()-interval '45 seconds';
   if all_back then
    delta:=clock_timestamp()-(g.pause_data->>'since')::timestamptz;
    update public.games set phase=g.pause_data->>'phase',pause_data=null,
     started_at=case when g.pause_data->>'reason'='timeout' and g.pause_data->>'phase'='question' then clock_timestamp() else started_at+delta end,
     writing_deadline=case when g.pause_data->>'reason'='timeout' and g.pause_data->>'phase'='question' then clock_timestamp()+make_interval(secs=>(settings->>'question')::integer) else writing_deadline+delta end,
     review_deadline=review_deadline+delta,
     deadline=case when g.pause_data->>'reason'='timeout' then clock_timestamp()+make_interval(secs=>(settings->>(case when g.pause_data->>'phase'='answer' then 'answer' else 'question' end))::integer)
      else clock_timestamp()+make_interval(secs=>(g.pause_data->>'remaining')::double precision) end where id=g.id;
    update public.room_players set resume_ready=false where room_id=p_room_id;
   end if;
  end if;
 when 'leave','end' then
  if g.phase='finished' then err:='This game has ended.';
  elsif p_kind='end' and (g.phase<>'paused' or clock_timestamp()<(g.pause_data->>'since')::timestamptz+interval '2 minutes') then err:='Give the other player two minutes to return, or leave the game.';
  else update public.games set phase='finished',deadline=null,winner=null,result=null,end_reason=case when p_kind='end' then 'timeout' else 'left' end,pause_data=null where id=g.id; end if;
 when 'rematch' then
  if g.phase<>'finished' then err:='Finish this game first.';
  elsif private.active_room(auth.uid()) is not null then err:='Finish or leave your other game first.';
  elsif exists(select 1 from private.match_queue where user_id=auth.uid() and expires_at>clock_timestamp() and room_id is null) then err:='Cancel your search before a rematch.';
  else
   update public.room_players set rematch_ready=true where room_id=p_room_id and user_id=auth.uid();
   if (select count(*) from public.room_players where room_id=p_room_id and rematch_ready)=2 then
    if private.active_room(other) is not null or exists(select 1 from private.match_queue where user_id=other and expires_at>clock_timestamp() and room_id is null) then err:='The other player has joined another game or search.';
    else
     newg:=private.new_game(p_room_id,g.settings);
     update private.match_queue set queued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 seconds' where room_id=p_room_id;
     update public.rooms set current_game_id=newg where id=p_room_id;
     update public.room_players set ready=false,rematch_ready=false,last_seen=clock_timestamp() where room_id=p_room_id;
    end if;
   end if;
  end if;
 else err:='Unknown game action.';
 end case;
 if err is not null then return jsonb_build_object('error',err,'state',private.room_snapshot(p_room_id)); end if;
 insert into private.action_receipts values(p_room_id,auth.uid(),p_action_id,req);
 perform private.notify_room(p_room_id);
 return jsonb_build_object('state',private.room_snapshot(p_room_id));
end; $$;

create function public.send_reaction_v2(p_room_id uuid,p_id uuid,p_emoji text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_room_member(p_room_id) or p_id is null then return jsonb_build_object('error','Reconnect before sending a reaction.'); end if;
 if p_emoji is null or not p_emoji=any(array['😂','💀','❤️','😭','🤨','👍','🤔','👀','😮','😎','🤯','🙃','😅','🥳','🙈','🙄','👏','🔥','💅','😬','🫣','🧐','😏','🤝']) then return jsonb_build_object('error','Choose an available reaction.'); end if;
 insert into private.reaction_clock values(auth.uid(),clock_timestamp()) on conflict(user_id) do update set sent_at=excluded.sent_at
  where private.reaction_clock.sent_at<clock_timestamp()-interval '1 second';
 if not found then return jsonb_build_object('error','Wait a moment before reacting again.'); end if;
 perform realtime.send(jsonb_build_object('id',p_id,'emoji',p_emoji,'from',auth.uid()),'reaction','social:'||p_room_id::text,true);
 return '{}'::jsonb;
end; $$;
-- Clients can publish presence, but cannot impersonate a player in reaction broadcasts.
create policy social_send on realtime.messages for insert to authenticated with check (
 extension='presence' and topic=(select realtime.topic()) and topic like 'social:%' and public.room_topic_allowed(topic)
);
create policy match_receive on realtime.messages for select to authenticated using (
 extension='broadcast' and topic=(select realtime.topic()) and topic='match:'||(select auth.uid())::text
);
create function private.match_notice(p_user uuid) returns void language sql security definer set search_path='' as $$
 select realtime.send('{}'::jsonb,'match','match:'||p_user::text,true);
$$;

create function public.matchmake_board_v2(p_nickname text,p_command text,p_board_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me private.match_queue%rowtype; candidate private.match_queue%rowtype; r uuid; g public.games%rowtype; survivor uuid;
begin
 if auth.uid() is null then return jsonb_build_object('error','Please reconnect to find a player.'); end if;
 if p_command is null or p_command not in ('join','pulse','cancel') then return jsonb_build_object('error','Invalid search action.'); end if;
 if not private.allow_request('match',30,60) then return jsonb_build_object('error','Please wait a moment before searching again.'); end if;
 -- Only admission/pairing transactions share this lock; game actions and heartbeats
 -- do not. The indexed queue makes admission short and strictly FIFO.
 perform pg_advisory_xact_lock(9827341);
 select * into me from private.match_queue where user_id=auth.uid();
 if p_command='cancel' then
  if me.room_id is null then delete from private.match_queue where user_id=auth.uid(); return jsonb_build_object('status','idle'); end if;
 end if;
 if me.room_id is not null then
  perform 1 from public.rooms where id=me.room_id for update;
  update public.room_players set last_seen=clock_timestamp() where room_id=me.room_id and user_id=auth.uid();
  select * into g from public.games where id=(select current_game_id from public.rooms where id=me.room_id);
  if g.phase='lobby' and g.board_status='ready' and g.created_at<clock_timestamp()-interval '120 seconds' and (select count(*) from public.room_players where room_id=me.room_id and ready)<2 then
   select user_id into survivor from public.room_players where room_id=me.room_id and ready and last_seen>clock_timestamp()-interval '45 seconds';
   update public.games set phase='finished',end_reason='no_show',deadline=null where id=g.id;
   update private.match_queue set room_id=null,expires_at=clock_timestamp()+interval '30 seconds' where room_id=me.room_id and user_id=survivor;
   delete from private.match_queue where room_id=me.room_id;
   perform private.notify_room(me.room_id);
   if survivor is not null then perform private.match_notice(survivor); end if;
   select * into me from private.match_queue where user_id=auth.uid();
  elsif g.phase<>'finished' then
   return jsonb_build_object('status','matched','roomId',me.room_id,'boardId',(select board_id from public.rooms where id=me.room_id));
  else delete from private.match_queue where user_id=auth.uid(); me.user_id:=null; end if;
 end if;
 if p_command='cancel' then delete from private.match_queue where user_id=auth.uid(); return jsonb_build_object('status','idle'); end if;
 if p_command='join' and not coalesce((select enabled from private.board_catalog where id=p_board_id),false) then return jsonb_build_object('error','Choose an available board.'); end if;
 if private.active_room(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
 if p_command='pulse' and (me.user_id is null or me.expires_at<clock_timestamp()) then
  delete from private.match_queue where user_id=auth.uid(); return jsonb_build_object('status','idle');
 end if;
 if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname~'[[:cntrl:]]' then return jsonb_build_object('error','Use a nickname of 1–18 characters.'); end if;
 if me.user_id is not null and me.expires_at<clock_timestamp() then delete from private.match_queue where user_id=auth.uid(); end if;
 -- Changing boards starts a new FIFO position; pulses keep the saved preference.
 if p_command='join' and me.board_id<>p_board_id then delete from private.match_queue where user_id=auth.uid(); end if;
 insert into private.match_queue(user_id,nickname,board_id) values(auth.uid(),btrim(p_nickname),case when p_command='pulse' then me.board_id else p_board_id end) on conflict(user_id) do update set expires_at=clock_timestamp()+interval '30 seconds';
 select * into me from private.match_queue where user_id=auth.uid();
 if not coalesce((select enabled from private.board_catalog where id=me.board_id),false) then
  delete from private.match_queue where user_id=auth.uid();
  return jsonb_build_object('error','This board is currently unavailable. Choose another board.');
 end if;
 select * into candidate from private.match_queue q where q.user_id<>auth.uid() and q.board_id=me.board_id and q.room_id is null and q.expires_at>clock_timestamp()
  and private.active_room(q.user_id) is null order by q.queued_at,q.user_id limit 1 for update;
 if found then
  r:=private.new_board_room(candidate.user_id,candidate.nickname,'{"question":120,"answer":30,"review":60}',true,me.board_id);
  insert into public.room_players(room_id,user_id,slot,nickname) values(r,auth.uid(),2,btrim(p_nickname));
  update private.match_queue set room_id=r where user_id in (auth.uid(),candidate.user_id);
  perform private.match_notice(candidate.user_id); perform private.match_notice(auth.uid());
  return jsonb_build_object('status','matched','roomId',r,'boardId',me.board_id);
 end if;
 return jsonb_build_object('status','waiting','queuedAt',me.queued_at,'boardId',me.board_id);
end; $$;

create function public.heartbeat_room_v2(p_room_id uuid,p_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v bigint;
begin
 if not public.is_room_member(p_room_id) then return jsonb_build_object('error','This room is unavailable to your session.','code','ROOM_UNAVAILABLE'); end if;
 if not private.allow_request('heartbeat',12,60) then return jsonb_build_object('error','Please wait before reconnecting.'); end if;
 perform 1 from public.rooms where id=p_room_id for update;
 perform private.advance_game(p_room_id);
 update public.room_players set last_seen=clock_timestamp() where room_id=p_room_id and user_id=auth.uid();
 update public.rooms set last_activity=clock_timestamp() where id=p_room_id and last_activity<clock_timestamp()-interval '5 minutes';
 select version into v from public.rooms where id=p_room_id;
 if v is distinct from p_version then return jsonb_build_object('state',private.room_snapshot(p_room_id)); end if;
 return jsonb_build_object('version',v,'serverNow',clock_timestamp());
end; $$;

create function public.allow_board_request_v3() returns boolean language sql security definer set search_path='' as $$ select private.allow_request('boards',30,60); $$;

create function public.register_board_v3(p_id text,p_name text,p_version text,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_id is null or p_name is null or char_length(p_name) not between 1 and 120 or p_version is null or char_length(p_version)>100
 or not ((p_id='ai-random' and p_kind='synthetic-photo') or (p_id like 'folder/%' and p_kind='folder' and char_length(p_id)<=400)) then raise exception 'Invalid board definition'; end if;
 insert into private.board_catalog(id,kind,display_name,version) values(p_id,p_kind,p_name,p_version)
 on conflict(id) do update set display_name=excluded.display_name,version=excluded.version,enabled=true;
end; $$;

create function public.claim_board_v3(p_actor uuid,p_room uuid,p_game uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype;
begin
 perform 1 from public.rooms where id=p_room and current_game_id=p_game and last_activity>clock_timestamp()-interval '24 hours' for update;
 if not found or not exists(select 1 from public.room_players where room_id=p_room and user_id=p_actor) then return jsonb_build_object('error','This game is unavailable.'); end if;
 select * into g from public.games where id=p_game;
 if g.board_status='ready' then return jsonb_build_object('status','ready'); end if;
 if g.phase<>'lobby' then return jsonb_build_object('error','This game has ended.'); end if;
 if g.board_lease_until>clock_timestamp() then return jsonb_build_object('status','pending'); end if;
 update public.games set board_status='pending',board_error=null,board_lease=p_lease,board_lease_until=clock_timestamp()+interval '90 seconds' where id=p_game;
 return jsonb_build_object('status','claimed','boardId',g.board_key);
end; $$;

create function public.finish_board_v3(p_room uuid,p_game uuid,p_lease uuid,p_source text,p_characters jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype; opened_at timestamptz;
begin
 perform 1 from public.rooms where id=p_room and current_game_id=p_game and last_activity>clock_timestamp()-interval '24 hours' for update;
 if not found then return false; end if;
 select * into g from public.games where id=p_game;
 if g.phase<>'lobby' or g.board_status='ready' or g.board_lease is distinct from p_lease or g.board_lease_until<clock_timestamp() then return false; end if;
 if p_source is null or p_source not in ('folder','online','cache') or jsonb_typeof(p_characters) is distinct from 'array' then raise exception 'Invalid board'; end if;
 if jsonb_array_length(p_characters)<>24 then raise exception 'A board needs 24 images'; end if;
 if (select count(distinct e->>'id') from jsonb_array_elements(p_characters) e)<>24
 or (select count(distinct lower(e->>'name')) from jsonb_array_elements(p_characters) e)<>24 then raise exception 'Duplicate characters or names'; end if;
 if exists(select 1 from jsonb_array_elements(p_characters) e where jsonb_typeof(e)<>'object'
  or jsonb_typeof(e->'id') is distinct from 'string' or char_length(e->>'id') not between 1 and 128
  or jsonb_typeof(e->'name') is distinct from 'string' or char_length(btrim(e->>'name')) not between 1 and 80
  or jsonb_typeof(e->'image') is distinct from 'string' or char_length(e->>'image') not between 1 and 4096
  or not (case p_source when 'folder' then e->>'image' like '/boards/%' when 'cache' then e->>'image' like '/fallback-faces/%' else e->>'image' ~ '^https://[^/]+/storage/v1/object/public/game-faces/' end)) then raise exception 'Invalid character'; end if;
 if (g.board_key like 'folder/%')<>(p_source='folder') then raise exception 'Wrong board source'; end if;
 insert into public.game_characters(game_id,id,position,definition) select p_game,e->>'id',(n-1)::integer,jsonb_build_object('id',e->>'id','name',e->>'name','image',e->>'image') from jsonb_array_elements(p_characters) with ordinality as x(e,n);
 -- Start the selection clock when the board becomes playable.
 opened_at:=clock_timestamp();
 update public.games set board_status='ready',board_source=p_source,created_at=opened_at,board_lease=null,board_lease_until=null where id=p_game;
 perform private.notify_room(p_room);
 return true;
end; $$;

create function public.fail_board_v3(p_room uuid,p_game uuid,p_lease uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.rooms where id=p_room and current_game_id=p_game and last_activity>clock_timestamp()-interval '24 hours' for update;
 if not found then return; end if;
 update public.games set board_status='error',board_error='Could not prepare these faces. Retry, or leave and choose another board.',board_lease=null,board_lease_until=null
 where id=p_game and board_lease=p_lease and board_status<>'ready';
 if found then perform private.notify_room(p_room); end if;
end; $$;

create table private.face_maintenance(id boolean primary key default true check(id),ran_at timestamptz not null,scan_offset integer not null default 0);
create function public.claim_face_cleanup_v3(p_offset integer default null) returns integer
language plpgsql security definer set search_path='' as $$
declare next_offset integer;
begin
 if p_offset is not null then update private.face_maintenance set scan_offset=greatest(0,p_offset) where id=true; return null; end if;
 insert into private.face_maintenance(id,ran_at) values(true,'epoch') on conflict do nothing;
 update private.face_maintenance set ran_at=clock_timestamp() where id=true and ran_at<clock_timestamp()-interval '1 hour' returning scan_offset into next_offset;
 return next_offset;
end; $$;
create function public.existing_face_games_v3(p_ids uuid[]) returns setof uuid
language sql security definer set search_path='' as $$ select id from public.games where id=any(p_ids); $$;

do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('game-faces','game-faces',true,1048576,array['image/webp']) on conflict(id) do nothing;
 end if;
end $$;

-- Retain creation receipts during active games and prune abandoned queue tickets.
create function public.cleanup_expired_rooms() returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from public.rooms where last_activity<clock_timestamp()-interval '24 hours'; get diagnostics n=row_count;
 delete from private.match_queue where expires_at<clock_timestamp()-interval '5 minutes' and (room_id is null or not exists(select 1 from public.rooms r join public.games g on g.id=r.current_game_id where r.id=room_id and g.phase<>'finished'));
 delete from private.reaction_clock where sent_at<clock_timestamp()-interval '48 hours';
 delete from private.rate_limits where (kind='create' and bucket<floor(extract(epoch from clock_timestamp())/3600)::bigint-48)
   or (kind<>'create' and bucket<floor(extract(epoch from clock_timestamp())/60)::bigint-2880);
 delete from public.games where id in (select id from (select g.id,row_number() over(partition by g.room_id order by g.created_at desc) n from public.games g join public.rooms r on r.id=g.room_id where g.id<>r.current_game_id) old where old.n>20);
 delete from private.action_receipts a where a.request->>'kind' <>'create' and not exists(select 1 from public.games g where g.room_id=a.room_id and g.id::text=a.request->>'game');
 return n;
end; $$;

revoke all on public.rooms, public.room_players, public.games, public.questions, public.game_characters from public, anon, authenticated;
grant select on public.rooms, public.room_players, public.games, public.questions, public.game_characters to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.is_room_member(uuid), public.room_topic_allowed(text),
  public.create_room_board_v2(text,uuid,jsonb,text), public.join_room_v2(text,text), public.get_room_v2(uuid),
  public.game_action_v2(uuid,uuid,integer,uuid,text,jsonb), public.matchmake_board_v2(text,text,text),
  public.send_reaction_v2(uuid,uuid,text), public.heartbeat_room_v2(uuid,bigint), public.allow_board_request_v3()
from public, anon, authenticated;
grant execute on function
  public.is_room_member(uuid), public.room_topic_allowed(text),
  public.create_room_board_v2(text,uuid,jsonb,text), public.join_room_v2(text,text), public.get_room_v2(uuid),
  public.game_action_v2(uuid,uuid,integer,uuid,text,jsonb), public.matchmake_board_v2(text,text,text),
  public.send_reaction_v2(uuid,uuid,text), public.heartbeat_room_v2(uuid,bigint), public.allow_board_request_v3()
to authenticated;

revoke execute on function
  public.register_board_v3(text,text,text,text), public.claim_board_v3(uuid,uuid,uuid,uuid),
  public.finish_board_v3(uuid,uuid,uuid,text,jsonb), public.fail_board_v3(uuid,uuid,uuid),
  public.claim_face_cleanup_v3(integer), public.existing_face_games_v3(uuid[]), public.cleanup_expired_rooms()
from public, anon, authenticated;
grant execute on function
  public.register_board_v3(text,text,text,text), public.claim_board_v3(uuid,uuid,uuid,uuid),
  public.finish_board_v3(uuid,uuid,uuid,text,jsonb), public.fail_board_v3(uuid,uuid,uuid),
  public.claim_face_cleanup_v3(integer), public.existing_face_games_v3(uuid[]), public.cleanup_expired_rooms()
to service_role;
