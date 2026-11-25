-- Keep the stored question constraint and action validation in sync.
alter table public.questions
  drop constraint questions_body_check,
  add constraint questions_body_check
    check (char_length(body) between 1 and 75 and body = btrim(body));

do $$
declare
  definition text := pg_get_functiondef(
    'public.game_action_v2(uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  );
  previous_check constant text := 'char_length(txt) not between 1 and 50';
  new_check constant text := 'char_length(txt) not between 1 and 75';
  previous_message constant text := 'Questions must be 1–50 characters on one line.';
  new_message constant text := 'Questions must be 1–75 characters on one line.';
begin
  if strpos(definition, previous_check) = 0 or strpos(definition, previous_message) = 0 then
    raise exception 'Could not locate the question length validation in public.game_action_v2';
  end if;
  execute replace(replace(definition, previous_check, new_check), previous_message, new_message);
end;
$$;
