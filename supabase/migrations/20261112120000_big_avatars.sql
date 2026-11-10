-- (Safe to run more than once.)
-- A sharp copy of each profile photo for the player cards: photos bucket, avatars/p<player id>.jpg.
-- Only the player's own account may write it (like the small avatar in the players table); bg/ and tips/ stay admin-only.
drop policy if exists "photos add" on storage.objects;
create policy "photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (
    ((name like 'bg/%' or name like 'tips/%') and is_admin())
    or (name like 'avatars/%' and exists (select 1 from players p where p.user_id = auth.uid() and objects.name = 'avatars/p' || p.id || '.jpg'))
    or (name not like 'bg/%' and name not like 'tips/%' and name not like 'avatars/%')));
drop policy if exists "photos retake" on storage.objects;
create policy "photos retake" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (
    ((name like 'bg/%' or name like 'tips/%') and is_admin())
    or (name like 'avatars/%' and exists (select 1 from players p where p.user_id = auth.uid() and objects.name = 'avatars/p' || p.id || '.jpg'))
    or (name not like 'bg/%' and name not like 'tips/%' and name not like 'avatars/%')));

create or replace function db_version() returns int language sql immutable as $$ select 20261112 $$;
