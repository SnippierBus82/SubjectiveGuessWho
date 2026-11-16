-- Run once in the Supabase SQL editor AFTER enabling the pg_cron extension.
-- This hourly retention job is unrelated to game timers; clients reconcile timers.
select cron.schedule('sgw-retention', '17 * * * *', 'select public.cleanup_expired_rooms()');

-- Optional monthly anonymous-account cleanup. Review your privacy policy and
-- account retention first. Preserve users participating in any retained room.
-- select cron.schedule('sgw-anonymous-retention', '27 3 * * *', $$
--   delete from auth.users u
--   where u.is_anonymous = true and u.created_at < now() - interval '30 days'
--     and not exists (select 1 from public.room_players p where p.user_id = u.id);
-- $$);
