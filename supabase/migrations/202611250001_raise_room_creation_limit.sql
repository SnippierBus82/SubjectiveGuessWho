-- Update the existing RPC in place, preserving its permissions and room logic.
do $$
declare
  definition text := pg_get_functiondef('public.create_room_board_v2(text,uuid,jsonb,text)'::regprocedure);
  previous_limit constant text := 'private.allow_request(''create'',5,3600)';
  new_limit constant text := 'private.allow_request(''create'',20,3600)';
begin
  if strpos(definition, previous_limit) > 0 then
    execute replace(definition, previous_limit, new_limit);
  elsif strpos(definition, new_limit) = 0 then
    raise exception 'Could not locate the room creation limit in public.create_room_board_v2';
  end if;
end;
$$;
