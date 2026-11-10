-- (Safe to run more than once.)
-- Admins may also write the sharp card photos (avatars/p<id>.jpg), so merging two players can move the photo along.
drop policy if exists "photos add" on storage.objects;
create policy "photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (
    ((name like 'bg/%' or name like 'tips/%' or name like 'avatars/%') and is_admin())
    or (name like 'avatars/%' and exists (select 1 from players p where p.user_id = auth.uid() and objects.name = 'avatars/p' || p.id || '.jpg'))
    or (name not like 'bg/%' and name not like 'tips/%' and name not like 'avatars/%')));
drop policy if exists "photos retake" on storage.objects;
create policy "photos retake" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (
    ((name like 'bg/%' or name like 'tips/%' or name like 'avatars/%') and is_admin())
    or (name like 'avatars/%' and exists (select 1 from players p where p.user_id = auth.uid() and objects.name = 'avatars/p' || p.id || '.jpg'))
    or (name not like 'bg/%' and name not like 'tips/%' and name not like 'avatars/%')));

create or replace function db_version() returns int language sql immutable as $$ select 20261113 $$;
