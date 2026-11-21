-- Version 2: overlapping writing/review, durable casts, pause recovery and matchmaking.
-- Apply after 202611150001_game.sql. The original migration and legacy games stay intact.
alter table public.games add column rules_version integer not null default 1;
alter table public.games add column settings jsonb not null default '{"question":120,"answer":30,"review":60}';
alter table public.games add column started_at timestamptz;
alter table public.games add column writing_deadline timestamptz;
alter table public.games add column review_deadline timestamptz;
alter table public.games add column review_ready boolean not null default true;
alter table public.games add column submitted_at timestamptz;
alter table public.games add column pause_data jsonb;
alter table public.games add column end_reason text;
alter table public.games add column guess_character_v2 text;
alter table public.games drop constraint games_phase_check;
alter table public.games drop constraint games_check;
alter table public.games drop constraint games_check1;
alter table public.games add constraint games_phase_check check (phase in ('lobby','question','answer','paused','finished'));
alter table public.games add constraint games_clock_check check (rules_version=2 or ((phase in ('question','answer'))=(deadline is not null)));
alter table public.games add constraint games_finish_check check ((phase='finished')=(winner is not null or end_reason is not null));
alter table public.rooms add column matchmade boolean not null default false;
alter table public.room_players add column last_seen timestamptz not null default clock_timestamp();
alter table public.room_players add column resume_ready boolean not null default false;
create table public.game_characters (
  game_id uuid not null references public.games(id) on delete cascade,
  id text not null, position integer not null check(position between 0 and 23), definition jsonb not null,
  primary key(game_id,id), unique(game_id,position)
);
alter table public.game_characters enable row level security;
create policy cast_members on public.game_characters for select to authenticated using (
  exists(select 1 from public.games g where g.id=game_id and public.is_room_member(g.room_id))
);
revoke all on public.game_characters from public, anon, authenticated;
grant select on public.game_characters to authenticated;
create table private.v2_selections (
 game_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade, character_id text not null,
 primary key(game_id,user_id), foreign key(game_id,character_id) references public.game_characters(game_id,id) on delete cascade
);
create table private.submissions (
 game_id uuid not null references public.games(id) on delete cascade, turn integer not null, body text not null,
 primary key(game_id,turn)
);
create table private.match_queue (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null, queued_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 seconds',
 room_id uuid references public.rooms(id) on delete set null
);
create index queue_waiting on private.match_queue(queued_at,user_id) where room_id is null;
create table private.reaction_clock(user_id uuid primary key references auth.users(id) on delete cascade, sent_at timestamptz not null);

create function private.cast_pick(p_seed bigint,p_i integer,p_salt integer,p_n integer) returns integer
language sql immutable set search_path='' as $$
 select (x*x%2147483647%p_n)::integer from (select ((p_seed+(p_i+1)::bigint*104729+p_salt::bigint*15485863)%2147483647)*48271%2147483647 as x) mix;
$$;
create function private.generate_cast(p_game uuid,p_seed bigint) returns void
language plpgsql security definer set search_path='' as $$
declare j integer; i integer; t jsonb; n text; c text; f boolean;
 names text[]:=array['Amara','Milo','Cleo','Jasper','Olive','Theo','Zara','Felix','Luna','Nico','Priya','Hugo','Iris','Oscar','Bea','Max','Esme','Leo','Ruby','Otto','Mae','Ezra','June','Arlo'];
 colors text[]:=array['#f8d6b8','#d4e6cb','#e3d7f2','#f5e3a9','#d0e6ed','#f3d4df'];
begin
 for j in 0..23 loop
  i:=(j*5+p_seed%24)%24; f:=j%2=0;
  t:=jsonb_build_object('face',(i+p_seed)%8,'nose',(i*3+i/8+p_seed)%8,'eyes',(i*5+i/6+p_seed)%8,
   'brows',private.cast_pick(p_seed,i,4,6),'mouth',private.cast_pick(p_seed,i,5,8),'hair',(i+p_seed)%20,
   'hat',case when i%4=0 then private.cast_pick(p_seed,i,7,8) else -1 end,'outfit',(i+p_seed)%12,
   'glasses',case when i%3=0 then private.cast_pick(p_seed,i,9,8) else -1 end,
   'beard',case when not f and i%3<>0 then private.cast_pick(p_seed,i,10,8) else -1 end,
   'earrings',case when f and i%5<>0 then private.cast_pick(p_seed,i,11,8) else -1 end,
   'detail',private.cast_pick(p_seed,i,12,8),'skin',(i*3+i/10+p_seed)%10,
   'hairColor',private.cast_pick(p_seed,i,14,16),'eyeColor',(i+p_seed)%8,
   'fabric',private.cast_pick(p_seed,i,16,16),'accent',private.cast_pick(p_seed,i,17,16),'feminine',f);
  n:=names[((j+p_seed%24)%24)+1]; c:=colors[((j+p_seed)%6)+1];
  insert into public.game_characters values(p_game,'p'||lpad((j+1)::text,2,'0'),j,
   jsonb_build_object('id','p'||lpad((j+1)::text,2,'0'),'name',n,'color',c,'image','','rendererVersion',1,'traits',t));
 end loop;
end; $$;
create function private.valid_settings(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if s is null or jsonb_typeof(s)<>'object' then return false; end if;
 if not s ?& array['question','answer','review'] or (select count(*) from jsonb_object_keys(s))<>3 then return false; end if;
 if s->'question' not in ('null','60','90','120','180','300')
 or s->'answer' not in ('null','15','30','45','60','90','120')
 or s->'review' not in ('null','15','30','45','60','90','120') then return false; end if;
 return s->'question'='null' or s->'review'='null' or (s->>'review')::integer <= (s->>'question')::integer;
end; $$;
create function private.snapshot_v2(p_room uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; g public.games%rowtype;
begin
 select gg.* into g from public.games gg join public.rooms r on r.current_game_id=gg.id where r.id=p_room;
 s:=private.snapshot(p_room);
 if g.rules_version=1 then return s; end if;
 return s || jsonb_build_object('rulesVersion',2,'settings',g.settings,
 'mode',case when (select matchmade from public.rooms where id=p_room) then 'match' else 'private' end,
 'board',(select jsonb_agg(definition order by position) from public.game_characters where game_id=g.id),
 'myCharacter',(select character_id from private.v2_selections where game_id=g.id and user_id=auth.uid()),
 'reveals',case when g.phase='finished' then (select jsonb_object_agg(user_id::text,character_id) from private.v2_selections where game_id=g.id) else null end,
 'game',(s->'game')||jsonb_build_object('packId','generated-v1','deadline',case when g.phase='lobby' and (select matchmade from public.rooms where id=p_room) then g.created_at+interval '120 seconds' else g.deadline end,
 'guessCharacter',coalesce(g.guess_character_v2,g.guess_character),'endReason',g.end_reason,
 'pause',case when g.pause_data is null then null else jsonb_build_object('reason',g.pause_data->'reason','since',g.pause_data->'since','missing',g.pause_data->'missing',
 'resumeReady',(select coalesce(jsonb_agg(user_id),'[]') from public.room_players where room_id=p_room and resume_ready)) end,
 'flow',jsonb_build_object('startedAt',g.started_at,'writingDeadline',g.writing_deadline,'reviewDeadline',g.review_deadline,
 'submitted',g.submitted_at is not null,'reviewReady',g.review_ready,
 'ownSubmission',case when g.active_player=auth.uid() then (select body from private.submissions where game_id=g.id and turn=g.turn) else null end)));
end; $$;
-- A per-identity reservation is guarded by the short admission lock in all admission RPCs.
create function private.active_v2(p_user uuid) returns uuid language sql stable security definer set search_path='' as $$
 select r.id from public.rooms r join public.games g on g.id=r.current_game_id join public.room_players p on p.room_id=r.id
 where p.user_id=p_user and g.rules_version=2 and g.phase<>'finished' and r.last_activity>clock_timestamp()-interval '24 hours' limit 1;
$$;
create function private.new_v2(p_user uuid,p_name text,p_settings jsonb,p_match boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid; g uuid; n integer;
begin
 if p_name is null or char_length(btrim(p_name)) not between 1 and 18 or p_name~'[[:cntrl:]]' then raise exception 'Use a nickname of 1–18 characters.'; end if;
 for n in 1..10 loop
  insert into public.rooms(code,matchmade) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,7)),p_match)
   on conflict(code) do nothing returning id into r;
  exit when r is not null;
 end loop;
 if r is null then raise exception 'Could not create a room. Try again.'; end if;
 insert into public.room_players(room_id,user_id,slot,nickname) values(r,p_user,1,btrim(p_name));
 insert into public.games(room_id,rules_version,settings) values(r,2,p_settings) returning id into g;
 perform private.generate_cast(g,floor(random()*2147483646)::bigint);
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
create function private.pause_v2(p_room uuid,p_reason text,p_missing uuid,p_since timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.games set pause_data=jsonb_build_object('reason',p_reason,'since',p_since,'missing',p_missing,
 'phase',phase,'remaining',case when deadline is null then null else greatest(0,extract(epoch from deadline-p_since)) end),
 phase='paused',deadline=null where id=(select current_game_id from public.rooms where id=p_room) and phase in ('question','answer');
 update public.room_players set resume_ready=false where room_id=p_room;
 perform private.notify_room(p_room);
end; $$;
create function private.advance_v2(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype; absent public.room_players%rowtype; missing uuid;
begin
 select gg.* into g from public.games gg join public.rooms r on r.current_game_id=gg.id where r.id=p_room;
 if g.rules_version<>2 or g.phase not in ('question','answer') then return; end if;
 select * into absent from public.room_players where room_id=p_room and last_seen<clock_timestamp()-interval '45 seconds' order by last_seen limit 1;
 if found and (g.deadline is null or absent.last_seen+interval '45 seconds'<g.deadline) then
  perform private.pause_v2(p_room,'disconnect',absent.user_id,absent.last_seen+interval '45 seconds'); return;
 end if;
 if g.deadline is null or clock_timestamp()<g.deadline then return; end if;
 if g.phase='question' and g.submitted_at is not null then
  update public.games set review_ready=true where id=g.id;
  perform private.release_question(g.id); perform private.notify_room(p_room); return;
 end if;
 missing:=g.active_player;
 if g.phase='answer' then select user_id into missing from public.room_players where room_id=p_room and user_id<>g.active_player; end if;
 perform private.pause_v2(p_room,'timeout',missing,g.deadline);
end; $$;

create function public.create_room_v2(p_nickname text,p_request_id uuid,p_settings jsonb default '{"question":120,"answer":30,"review":60}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r uuid; old jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('error','Please reconnect to play.'); end if;
 if p_request_id is null or not coalesce(private.valid_settings(p_settings),false) then return jsonb_build_object('error','Choose valid activity timers. Review cannot exceed writing time.'); end if;
 if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname~'[[:cntrl:]]' then return jsonb_build_object('error','Use a nickname of 1–18 characters.'); end if;
 perform pg_advisory_xact_lock(9827341);
 select room_id,request into r,old from private.action_receipts where user_id=auth.uid() and action_id=p_request_id;
 if found then
  if not public.is_room_member(r) then return jsonb_build_object('error','This room has expired. Create a fresh room.'); end if;
  if old<>jsonb_build_object('kind','create2','settings',p_settings,'nickname',p_nickname) then return jsonb_build_object('error','This request ID was already used.'); end if;
  return jsonb_build_object('state',private.snapshot_v2(r));
 end if;
 if private.active_v2(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
 if not private.allow_request('create',5,3600) then return jsonb_build_object('error','Too many new rooms. Try again later.'); end if;
 if exists(select 1 from private.match_queue where user_id=auth.uid() and expires_at>clock_timestamp() and room_id is null) then return jsonb_build_object('error','Cancel your player search before creating a room.'); end if;
 r:=private.new_v2(auth.uid(),p_nickname,p_settings);
 delete from private.match_queue where user_id=auth.uid();
 insert into private.action_receipts values(r,auth.uid(),p_request_id,jsonb_build_object('kind','create2','settings',p_settings,'nickname',p_nickname));
 return jsonb_build_object('state',private.snapshot_v2(r));
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
 if not found or not exists(select 1 from public.games where id=r.current_game_id and rules_version=2) then
  return public.join_room(p_code,p_nickname);
 end if;
 if r.last_activity<clock_timestamp()-interval '24 hours' then return jsonb_build_object('error','This room has expired.'); end if;
 if exists(select 1 from public.room_players where room_id=r.id and user_id=auth.uid()) then return jsonb_build_object('state',private.snapshot_v2(r.id)); end if;
 if r.matchmade or (select count(*) from public.room_players where room_id=r.id)>=2 then return jsonb_build_object('error','This room already has two players.'); end if;
 if private.active_v2(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
 if exists(select 1 from private.match_queue where user_id=auth.uid() and expires_at>clock_timestamp() and room_id is null) then return jsonb_build_object('error','Cancel your player search first.'); end if;
 delete from private.match_queue where user_id=auth.uid();
 insert into public.room_players(room_id,user_id,slot,nickname) values(r.id,auth.uid(),2,btrim(p_nickname));
 update public.room_players set last_seen=clock_timestamp() where room_id=r.id;
 perform private.notify_room(r.id);
 return jsonb_build_object('state',private.snapshot_v2(r.id));
end; $$;
create function public.get_room_v2(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_room_member(p_room_id) then return jsonb_build_object('error','This room is unavailable to your session.','code','ROOM_UNAVAILABLE'); end if;
 if not private.allow_request('snapshot',120,60) then return jsonb_build_object('error','Please wait before retrying.'); end if;
 if (select rules_version from public.games where id=(select current_game_id from public.rooms where id=p_room_id))=1 then return public.get_room(p_room_id); end if;
 perform 1 from public.rooms where id=p_room_id for update;
 -- Reconcile before renewing the caller's lease, so a long absence is not hidden.
 perform private.advance_v2(p_room_id);
 update public.room_players set last_seen=clock_timestamp() where room_id=p_room_id and user_id=auth.uid();
 update public.rooms set last_activity=clock_timestamp() where id=p_room_id and last_activity<clock_timestamp()-interval '5 minutes';
 return jsonb_build_object('state',private.snapshot_v2(p_room_id));
end; $$;
create function public.game_action_v2(p_room_id uuid,p_game_id uuid,p_turn integer,p_action_id uuid,p_kind text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.games%rowtype; other uuid; txt text; cid text; err text; req jsonb; old jsonb; correct boolean; newg uuid; until_at timestamptz; delta interval; all_back boolean;
begin
 if not public.is_room_member(p_room_id) then return jsonb_build_object('error','This room is unavailable to your session.','code','ROOM_UNAVAILABLE'); end if;
 if p_kind='rematch' then perform pg_advisory_xact_lock(9827341); end if;
 perform 1 from public.rooms where id=p_room_id for update;
 select * into g from public.games where id=(select current_game_id from public.rooms where id=p_room_id);
 if g.rules_version=1 then
  if p_kind='rematch' and exists(select 1 from public.room_players p where p.room_id=p_room_id and
   (private.active_v2(p.user_id) is not null or exists(select 1 from private.match_queue q where q.user_id=p.user_id and q.room_id is null and q.expires_at>clock_timestamp()))) then
   return jsonb_build_object('error','Finish your other game or cancel your player search before rematching.');
  end if;
  old:=public.game_action(p_room_id,p_game_id,p_turn,p_action_id,p_kind,p_payload);
  if p_kind='rematch' and old->'state'->'game'->>'phase'='lobby' then
   newg:=(old->'state'->'game'->>'id')::uuid;
   update public.games set rules_version=2,settings='{"question":120,"answer":30,"review":60}' where id=newg;
   perform private.generate_cast(newg,floor(random()*2147483646)::bigint);
   update public.room_players set last_seen=clock_timestamp() where room_id=p_room_id;
   perform private.notify_room(p_room_id);
   return jsonb_build_object('state',private.snapshot_v2(p_room_id));
  end if;
  return old;
 end if;
 if p_action_id is null or p_kind is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2048 then return jsonb_build_object('error','Invalid game action.'); end if;
 req:=jsonb_build_object('game',p_game_id,'turn',p_turn,'kind',p_kind,'payload',p_payload);
 select request into old from private.action_receipts where room_id=p_room_id and user_id=auth.uid() and action_id=p_action_id;
 if found then
  if old<>req then return jsonb_build_object('error','This action ID was already used.'); end if;
  return jsonb_build_object('state',private.snapshot_v2(p_room_id));
 end if;
 if not private.allow_request('action',90,60) then return jsonb_build_object('error','Slow down a little. Try again in a minute.'); end if;
 perform private.advance_v2(p_room_id);
 update public.room_players set last_seen=clock_timestamp() where room_id=p_room_id and user_id=auth.uid();
 select * into g from public.games where id=(select current_game_id from public.rooms where id=p_room_id);
 select user_id into other from public.room_players where room_id=p_room_id and user_id<>auth.uid();
 if g.id is distinct from p_game_id or (p_kind not in ('leave','rematch') and p_turn is distinct from g.turn) then
  return jsonb_build_object('error','The turn has changed. Your draft is still here.','state',private.snapshot_v2(p_room_id));
 end if;
 cid:=p_payload->>'characterId'; txt:=btrim(p_payload->>'text');
 case p_kind
 when 'select' then
  if g.phase<>'lobby' or (select ready from public.room_players where room_id=p_room_id and user_id=auth.uid()) then err:='Unready before changing your secret.';
  elsif not exists(select 1 from public.game_characters where game_id=g.id and id=cid) then err:='Choose a character from this board.';
  else insert into private.v2_selections values(g.id,auth.uid(),cid) on conflict(game_id,user_id) do update set character_id=excluded.character_id; end if;
 when 'ready','unready' then
  if g.phase<>'lobby' then err:='This game has already started.';
  elsif p_kind='ready' and g.created_at<clock_timestamp()-interval '120 seconds' and (select matchmade from public.rooms where id=p_room_id) then err:='Character selection time expired. Returning available players to search.';
  elsif not exists(select 1 from private.v2_selections where game_id=g.id and user_id=auth.uid()) then err:='Pick your secret character first.';
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
   select character_id=cid into correct from private.v2_selections where game_id=g.id and user_id=other;
   if correct is null then err:='The other player has not selected a character.';
   else update public.games set phase='finished',deadline=null,winner=case when correct then auth.uid() else other end,
    guesser=auth.uid(),guess_character_v2=cid,result=case when correct then 'correct' else 'incorrect' end,end_reason='guess' where id=g.id; end if;
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
  elsif private.active_v2(auth.uid()) is not null then err:='Finish or leave your other game first.';
  elsif exists(select 1 from private.match_queue where user_id=auth.uid() and expires_at>clock_timestamp() and room_id is null) then err:='Cancel your search before a rematch.';
  else
   update public.room_players set rematch_ready=true where room_id=p_room_id and user_id=auth.uid();
   if (select count(*) from public.room_players where room_id=p_room_id and rematch_ready)=2 then
    if private.active_v2(other) is not null or exists(select 1 from private.match_queue where user_id=other and expires_at>clock_timestamp() and room_id is null) then err:='The other player has joined another game or search.';
    else
     insert into public.games(room_id,rules_version,settings) values(p_room_id,2,g.settings) returning id into newg;
     perform private.generate_cast(newg,floor(random()*2147483646)::bigint);
     update private.match_queue set queued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 seconds' where room_id=p_room_id;
     update public.rooms set current_game_id=newg where id=p_room_id;
     update public.room_players set ready=false,rematch_ready=false,last_seen=clock_timestamp() where room_id=p_room_id;
    end if;
   end if;
  end if;
 else err:='Unknown game action.';
 end case;
 if err is not null then return jsonb_build_object('error',err,'state',private.snapshot_v2(p_room_id)); end if;
 insert into private.action_receipts values(p_room_id,auth.uid(),p_action_id,req);
 perform private.notify_room(p_room_id);
 return jsonb_build_object('state',private.snapshot_v2(p_room_id));
end; $$;
-- A snapshot read also renews the authenticated player's heartbeat. This keeps the
-- heartbeat on one RPC and makes reconnect reconciliation atomic with lease renewal.
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
drop policy social_send on realtime.messages;
create policy social_send on realtime.messages for insert to authenticated with check (
 extension='presence' and topic=(select realtime.topic()) and topic like 'social:%' and public.room_topic_allowed(topic)
);
create policy match_receive on realtime.messages for select to authenticated using (
 extension='broadcast' and topic=(select realtime.topic()) and topic='match:'||(select auth.uid())::text
);
create function private.match_notice(p_user uuid) returns void language sql security definer set search_path='' as $$
 select realtime.send('{}'::jsonb,'match','match:'||p_user::text,true);
$$;
create function public.matchmake_v2(p_nickname text,p_command text) returns jsonb
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
  if g.phase='lobby' and g.created_at<clock_timestamp()-interval '120 seconds' and (select count(*) from public.room_players where room_id=me.room_id and ready)<2 then
   select user_id into survivor from public.room_players where room_id=me.room_id and ready and last_seen>clock_timestamp()-interval '45 seconds';
   update public.games set phase='finished',end_reason='no_show',deadline=null where id=g.id;
   update private.match_queue set room_id=null,expires_at=clock_timestamp()+interval '30 seconds' where room_id=me.room_id and user_id=survivor;
   delete from private.match_queue where room_id=me.room_id;
   perform private.notify_room(me.room_id);
   if survivor is not null then perform private.match_notice(survivor); end if;
   select * into me from private.match_queue where user_id=auth.uid();
  elsif g.phase<>'finished' then
   return jsonb_build_object('status','matched','roomId',me.room_id);
  else delete from private.match_queue where user_id=auth.uid(); me.user_id:=null; end if;
 end if;
 if p_command='cancel' then delete from private.match_queue where user_id=auth.uid(); return jsonb_build_object('status','idle'); end if;
 if private.active_v2(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
 if p_command='pulse' and (me.user_id is null or me.expires_at<clock_timestamp()) then
  delete from private.match_queue where user_id=auth.uid(); return jsonb_build_object('status','idle');
 end if;
 if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 18 or p_nickname~'[[:cntrl:]]' then return jsonb_build_object('error','Use a nickname of 1–18 characters.'); end if;
 if me.user_id is not null and me.expires_at<clock_timestamp() then delete from private.match_queue where user_id=auth.uid(); end if;
 insert into private.match_queue(user_id,nickname) values(auth.uid(),btrim(p_nickname)) on conflict(user_id) do update set expires_at=clock_timestamp()+interval '30 seconds';
 select * into me from private.match_queue where user_id=auth.uid();
 select * into candidate from private.match_queue q where q.user_id<>auth.uid() and q.room_id is null and q.expires_at>clock_timestamp()
  and private.active_v2(q.user_id) is null order by q.queued_at,q.user_id limit 1 for update;
 if found then
  r:=private.new_v2(candidate.user_id,candidate.nickname,'{"question":120,"answer":30,"review":60}',true);
  insert into public.room_players(room_id,user_id,slot,nickname) values(r,auth.uid(),2,btrim(p_nickname));
  update private.match_queue set room_id=r where user_id in (auth.uid(),candidate.user_id);
  perform private.match_notice(candidate.user_id); perform private.match_notice(auth.uid());
  return jsonb_build_object('status','matched','roomId',r);
 end if;
 return jsonb_build_object('status','waiting','queuedAt',me.queued_at);
end; $$;
-- Legacy RPCs cannot mutate a v2 room. Existing v1 rooms still use their old rules.
alter function public.join_room(text,text) rename to legacy_join_room;
alter function public.get_room(uuid) rename to legacy_get_room;
alter function public.game_action(uuid,uuid,integer,uuid,text,jsonb) rename to legacy_game_action;
create function public.join_room(p_code text,p_nickname text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.rooms r join public.games g on g.id=r.current_game_id where r.code=upper(btrim(p_code)) and g.rules_version=2) then return jsonb_build_object('error','Refresh the app to join this updated game.'); end if;
 return public.legacy_join_room(p_code,p_nickname);
end; $$;
create function public.get_room(p_room_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.rooms r join public.games g on g.id=r.current_game_id where r.id=p_room_id and g.rules_version=2) then return jsonb_build_object('error','Refresh the app to open this updated game.'); end if;
 return public.legacy_get_room(p_room_id);
end; $$;
create function public.game_action(p_room_id uuid,p_game_id uuid,p_turn integer,p_action_id uuid,p_kind text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.rooms r join public.games g on g.id=r.current_game_id where r.id=p_room_id and g.rules_version=2) then return jsonb_build_object('error','Refresh the app to play this updated game.'); end if;
 return public.legacy_game_action(p_room_id,p_game_id,p_turn,p_action_id,p_kind,p_payload);
end; $$;
revoke execute on function public.legacy_join_room(text,text),public.legacy_get_room(uuid),public.legacy_game_action(uuid,uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.join_room(text,text),public.get_room(uuid),public.game_action(uuid,uuid,integer,uuid,text,jsonb) to authenticated;
revoke execute on function public.join_room(text,text),public.get_room(uuid),public.game_action(uuid,uuid,integer,uuid,text,jsonb) from public,anon;
revoke all on all tables in schema private from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
revoke execute on function public.create_room_v2(text,uuid,jsonb),public.join_room_v2(text,text),public.get_room_v2(uuid),public.game_action_v2(uuid,uuid,integer,uuid,text,jsonb),public.matchmake_v2(text,text),public.send_reaction_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_room_v2(text,uuid,jsonb),public.join_room_v2(text,text),public.get_room_v2(uuid),public.game_action_v2(uuid,uuid,integer,uuid,text,jsonb),public.matchmake_v2(text,text),public.send_reaction_v2(uuid,uuid,text) to authenticated;
-- Heartbeats only transfer the full cast when the room version changes.
create function public.heartbeat_room_v2(p_room_id uuid,p_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v bigint;
begin
 if not public.is_room_member(p_room_id) then return jsonb_build_object('error','This room is unavailable to your session.','code','ROOM_UNAVAILABLE'); end if;
 if not private.allow_request('heartbeat',12,60) then return jsonb_build_object('error','Please wait before reconnecting.'); end if;
 perform 1 from public.rooms where id=p_room_id for update;
 perform private.advance_v2(p_room_id);
 update public.room_players set last_seen=clock_timestamp() where room_id=p_room_id and user_id=auth.uid();
 update public.rooms set last_activity=clock_timestamp() where id=p_room_id and last_activity<clock_timestamp()-interval '5 minutes';
 select version into v from public.rooms where id=p_room_id;
 if v is distinct from p_version then return jsonb_build_object('state',private.snapshot_v2(p_room_id)); end if;
 return jsonb_build_object('version',v,'serverNow',clock_timestamp());
end; $$;
revoke execute on function public.heartbeat_room_v2(uuid,bigint) from public,anon,authenticated;
grant execute on function public.heartbeat_room_v2(uuid,bigint) to authenticated;

-- Retain creation receipts during active games and prune abandoned queue tickets.
create or replace function public.cleanup_expired_rooms() returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from public.rooms where last_activity<clock_timestamp()-interval '24 hours'; get diagnostics n=row_count;
 delete from private.match_queue where expires_at<clock_timestamp()-interval '5 minutes' and (room_id is null or not exists(select 1 from public.rooms r join public.games g on g.id=r.current_game_id where r.id=room_id and g.phase<>'finished'));
 delete from private.reaction_clock where sent_at<clock_timestamp()-interval '48 hours';
 delete from private.rate_limits where (kind='create' and bucket<floor(extract(epoch from clock_timestamp())/3600)::bigint-48)
   or (kind<>'create' and bucket<floor(extract(epoch from clock_timestamp())/60)::bigint-2880);
 delete from public.games where id in (select id from (select g.id,row_number() over(partition by g.room_id order by g.created_at desc) n from public.games g join public.rooms r on r.id=g.room_id where g.id<>r.current_game_id) old where old.n>20);
 delete from private.action_receipts a where a.request->>'kind' not in ('create','create2') and not exists(select 1 from public.games g where g.room_id=a.room_id and g.id::text=a.request->>'game');
 return n;
end; $$;
