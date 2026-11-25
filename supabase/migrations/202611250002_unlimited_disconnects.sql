create or replace function private.advance_game(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.games%rowtype;
  absent public.room_players%rowtype;
  missing uuid;
  ignore_disconnect boolean;
  checked_at timestamptz;
  paused_for interval;
begin
  select gg.* into g
  from public.games gg join public.rooms r on r.current_game_id = gg.id
  where r.id = p_room;
  if not found then return; end if;

  checked_at := clock_timestamp();
  ignore_disconnect := g.settings @> '{"question": null}'::jsonb
    or g.settings @> '{"answer": null}'::jsonb
    or g.settings @> '{"review": null}'::jsonb;

  -- Restore games that were paused for a disconnect before this policy changed.
  if g.phase = 'paused' and g.pause_data->>'reason' = 'disconnect' and ignore_disconnect then
    paused_for := checked_at - (g.pause_data->>'since')::timestamptz;
    update public.games set
      phase = g.pause_data->>'phase',
      deadline = checked_at + make_interval(secs => (g.pause_data->>'remaining')::double precision),
      started_at = g.started_at + paused_for,
      writing_deadline = g.writing_deadline + paused_for,
      review_deadline = g.review_deadline + paused_for,
      pause_data = null
    where id = g.id;
    update public.room_players set resume_ready = false where room_id = p_room;
    perform private.notify_room(p_room);
    return;
  end if;

  if g.phase not in ('question', 'answer') then return; end if;
  if not ignore_disconnect then
    select * into absent from public.room_players
    where room_id = p_room and last_seen < checked_at - interval '45 seconds'
    order by last_seen limit 1;
    if found and (g.deadline is null or absent.last_seen + interval '45 seconds' < g.deadline) then
      perform private.pause_game(p_room, 'disconnect', absent.user_id, absent.last_seen + interval '45 seconds');
      return;
    end if;
  end if;

  if g.deadline is null or checked_at < g.deadline then return; end if;
  if g.phase = 'question' and g.submitted_at is not null then
    update public.games set review_ready = true where id = g.id;
    perform private.release_question(g.id);
    perform private.notify_room(p_room);
    return;
  end if;
  missing := g.active_player;
  if g.phase = 'answer' then
    select user_id into missing from public.room_players where room_id = p_room and user_id <> g.active_player;
  end if;
  perform private.pause_game(p_room, 'timeout', missing, g.deadline);
end;
$$;
