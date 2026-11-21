-- Folder catalogs are registered by the app backend; chosen faces are stored once per game.
create function public.allow_board_request_v3() returns boolean language sql security definer set search_path='' as $$ select private.allow_request('boards',30,60); $$;
revoke execute on function public.allow_board_request_v3() from public,anon,authenticated;
grant execute on function public.allow_board_request_v3() to authenticated;
alter table private.board_catalog add column managed boolean not null default false;
alter table private.board_catalog add column display_name text not null default '';
alter table private.board_catalog add column version text not null default '';
alter table private.board_catalog drop constraint board_catalog_kind_check;
alter table private.board_catalog add constraint board_catalog_kind_check check(kind in ('illustrated','synthetic-photo','folder'));
update private.board_catalog set enabled=false,display_name=case id when 'generated-v1' then 'Standard illustrations' when 'million-faces-v1' then 'Realistic faces' else 'Realistic faces · shuffle' end;
insert into private.board_catalog(id,kind,shuffled,enabled,managed,display_name,version) values('ai-random','synthetic-photo',true,true,true,'Random AI faces','1');
alter table public.games add column board_key text not null default 'generated-v1';
alter table public.games add column board_label text not null default '';
alter table public.games add column board_status text not null default 'ready' check(board_status in ('pending','ready','error'));
alter table public.games add column board_source text check(board_source in ('folder','online','cache'));
alter table public.games add column board_error text;
alter table public.games add column board_ready_at timestamptz;
alter table public.games add column board_lease uuid;
alter table public.games add column board_lease_until timestamptz;
update public.games g set board_key=r.board_id,board_label=c.display_name from public.rooms r join private.board_catalog c on c.id=r.board_id where g.room_id=r.id;

create function public.register_board_v3(p_id text,p_name text,p_version text,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_id is null or p_name is null or char_length(p_name) not between 1 and 120 or p_version is null or char_length(p_version)>100
 or not ((p_id='ai-random' and p_kind='synthetic-photo') or (p_id like 'folder/%' and p_kind='folder' and char_length(p_id)<=400)) then raise exception 'Invalid board definition'; end if;
 insert into private.board_catalog(id,kind,shuffled,enabled,managed,display_name,version) values(p_id,p_kind,true,true,true,p_name,p_version)
 on conflict(id) do update set display_name=excluded.display_name,version=excluded.version,enabled=true;
end; $$;

alter function private.generate_cast(uuid,bigint) rename to generate_legacy_cast;
create function private.generate_cast(p_game uuid,p_seed bigint) returns void
language plpgsql security definer set search_path='' as $$
declare c private.board_catalog%rowtype;
begin
 select cc.* into c from private.board_catalog cc join public.rooms r on r.board_id=cc.id join public.games g on g.room_id=r.id where g.id=p_game;
 update public.games set board_key=c.id,board_label=c.display_name,board_status=case when c.managed then 'pending' else 'ready' end where id=p_game;
 if not c.managed then perform private.generate_legacy_cast(p_game,p_seed); end if;
end; $$;

alter function private.snapshot_v2(uuid) rename to snapshot_before_folders_v2;
create function private.snapshot_v2(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb; g public.games%rowtype;
begin
 s:=private.snapshot_before_folders_v2(p_room);
 if s->>'rulesVersion'='2' then
  select gg.* into g from public.games gg join public.rooms r on r.current_game_id=gg.id where r.id=p_room;
  s:=s||jsonb_build_object('boardId',g.board_key,'boardLabel',g.board_label,'boardStatus',g.board_status,'boardSource',g.board_source,'boardError',g.board_error,
   'board',coalesce(nullif(s->'board','null'::jsonb),'[]'::jsonb),'game',(s->'game')||jsonb_build_object('packId',g.board_key,
    'deadline',case when g.phase='lobby' and g.board_status<>'ready' then null
     when g.phase='lobby' and g.board_ready_at is not null and (select matchmade from public.rooms where id=p_room) then to_jsonb(g.board_ready_at+interval '120 seconds')
     else s->'game'->'deadline' end));
 end if;
 return s;
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
  or not (case p_source when 'folder' then e->>'image' like '/boards/%' when 'cache' then e->>'image' like '/ai-face-cache/%' else e->>'image' ~ '^https://[^/]+/storage/v1/object/public/game-faces/' end)) then raise exception 'Invalid character'; end if;
 if (g.board_key like 'folder/%')<>(p_source='folder') then raise exception 'Wrong board source'; end if;
 insert into public.game_characters(game_id,id,position,definition) select p_game,e->>'id',(n-1)::integer,jsonb_build_object('id',e->>'id','name',e->>'name','image',e->>'image') from jsonb_array_elements(p_characters) with ordinality as x(e,n);
 -- Legacy v2 ready checks use created_at as the lobby-open clock. Preparation must
 -- not consume any of that selection window; both clocks start at finalization.
 opened_at:=clock_timestamp();
 update public.games set board_status='ready',board_source=p_source,board_ready_at=opened_at,created_at=opened_at,board_lease=null,board_lease_until=null where id=p_game;
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

alter function public.game_action_v2(uuid,uuid,integer,uuid,text,jsonb) rename to game_action_before_folders_v2;
create function public.game_action_v2(p_room_id uuid,p_game_id uuid,p_turn integer,p_action_id uuid,p_kind text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_room_member(p_room_id) then return jsonb_build_object('error','This game is unavailable.'); end if;
 if p_kind in ('select','ready') and exists(select 1 from public.games g join public.rooms r on r.current_game_id=g.id where r.id=p_room_id and g.board_status<>'ready') then
  return jsonb_build_object('error','Wait for the faces to finish preparing.','state',private.snapshot_v2(p_room_id));
 end if;
 if p_kind='rematch' then
  perform pg_advisory_xact_lock(9827341);
  perform 1 from public.rooms where id=p_room_id for update;
  if exists(select 1 from public.games g join public.rooms r on r.current_game_id=g.id join private.board_catalog c on c.id=r.board_id where r.id=p_room_id and g.id=p_game_id and g.phase='finished' and not c.enabled) then
   update public.rooms set board_id='ai-random' where id=p_room_id;
  end if;
 end if;
 return public.game_action_before_folders_v2(p_room_id,p_game_id,p_turn,p_action_id,p_kind,p_payload);
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

revoke execute on function public.game_action_before_folders_v2(uuid,uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
revoke execute on function public.game_action_v2(uuid,uuid,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.game_action_v2(uuid,uuid,integer,uuid,text,jsonb) to authenticated;
revoke execute on function public.register_board_v3(text,text,text,text),public.claim_board_v3(uuid,uuid,uuid,uuid),public.finish_board_v3(uuid,uuid,uuid,text,jsonb),public.fail_board_v3(uuid,uuid,uuid),public.claim_face_cleanup_v3(integer),public.existing_face_games_v3(uuid[]) from public,anon,authenticated;
grant execute on function public.register_board_v3(text,text,text,text),public.claim_board_v3(uuid,uuid,uuid,uuid),public.finish_board_v3(uuid,uuid,uuid,text,jsonb),public.fail_board_v3(uuid,uuid,uuid),public.claim_face_cleanup_v3(integer),public.existing_face_games_v3(uuid[]) to service_role;
revoke execute on all functions in schema private from public,anon,authenticated;

-- Character-selection time starts after preparation, including no-show handling.
create or replace function public.matchmake_board_v2(p_nickname text,p_command text,p_board_id text) returns jsonb
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
  if g.phase='lobby' and g.board_status='ready' and coalesce(g.board_ready_at,g.created_at)<clock_timestamp()-interval '120 seconds' and (select count(*) from public.room_players where room_id=me.room_id and ready)<2 then
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
 if private.active_v2(auth.uid()) is not null then return jsonb_build_object('error','Finish or leave your current game first.'); end if;
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
  and private.active_v2(q.user_id) is null order by q.queued_at,q.user_id limit 1 for update;
 if found then
  r:=private.new_board_room(candidate.user_id,candidate.nickname,'{"question":120,"answer":30,"review":60}',true,me.board_id);
  insert into public.room_players(room_id,user_id,slot,nickname) values(r,auth.uid(),2,btrim(p_nickname));
  update private.match_queue set room_id=r where user_id in (auth.uid(),candidate.user_id);
  perform private.match_notice(candidate.user_id); perform private.match_notice(auth.uid());
  return jsonb_build_object('status','matched','roomId',r,'boardId',me.board_id);
 end if;
 return jsonb_build_object('status','waiting','queuedAt',me.queued_at,'boardId',me.board_id);
end; $$;
