-- (Safe to run more than once.)
-- Video tips: admins share links to videos (YouTube, Instagram, TikTok, ...) or short clips from their phone, sorted by topic.
-- Clips live in the private photos bucket under tips/ (only admins may write there).
create table if not exists tips (
  id bigint generated always as identity primary key,
  url text check (url ~ '^https://' and length(url) <= 500),
  video_path text check (video_path like 'tips/%'),
  title text not null check (length(btrim(title)) between 1 and 120),
  topic text not null default 'other' check (topic in ('serve', 'smash', 'net', 'footwork', 'defence', 'doubles', 'singles', 'other')),
  note text check (length(note) <= 500),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (url is not null or video_path is not null)
);
alter table tips enable row level security;
drop policy if exists "members read" on tips;
create policy "members read" on tips for select to authenticated using (true);
drop policy if exists "admins add" on tips;
create policy "admins add" on tips for insert to authenticated with check (is_admin());
drop policy if exists "admins edit" on tips;
create policy "admins edit" on tips for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "admins remove" on tips;
create policy "admins remove" on tips for delete to authenticated using (is_admin());
drop policy if exists "photos add" on storage.objects;
create policy "photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and ((name not like 'bg/%' and name not like 'tips/%') or is_admin()));
drop policy if exists "photos retake" on storage.objects;
create policy "photos retake" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and ((name not like 'bg/%' and name not like 'tips/%') or is_admin()));
do $$ begin alter publication supabase_realtime add table tips; exception when duplicate_object then null; end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261111 $$;
