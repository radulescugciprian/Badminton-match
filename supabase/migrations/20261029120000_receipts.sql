-- (Safe to run more than once.)
-- Receipts for the odd extra purchase (an extra court, shuttles): a photo plus a note and an optional amount, shown in the Photos tab.
create table if not exists receipts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  note text not null default '' check (length(note) <= 80),
  amount numeric(8, 2) check (amount >= 0),
  photo_path text                                   -- object in the private 'photos' bucket, under receipts/
);
alter table receipts enable row level security;
drop policy if exists "members read" on receipts;
create policy "members read" on receipts for select to authenticated using (true);
drop policy if exists "members add own" on receipts;
create policy "members add own" on receipts for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "own or admin deletes" on receipts;
create policy "own or admin deletes" on receipts for delete to authenticated using (created_by = auth.uid() or is_admin());
do $$ begin alter publication supabase_realtime add table receipts; exception when duplicate_object or undefined_object then null; end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261029 $$;
