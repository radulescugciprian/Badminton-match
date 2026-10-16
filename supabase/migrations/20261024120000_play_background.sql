-- (Safe to run more than once.)
-- The shared Play-tab background lives in the photos bucket under bg/; only admins may write there.
drop policy if exists "photos add" on storage.objects;
create policy "photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (name not like 'bg/%' or is_admin()));
drop policy if exists "photos retake" on storage.objects;
create policy "photos retake" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (name not like 'bg/%' or is_admin()));
