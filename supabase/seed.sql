-- The production migration seeds the immutable original character catalog.
-- Local reset intentionally creates no fake users, rooms, or credentials.
select count(*) as original_characters from public.characters where pack_id = 'original';
