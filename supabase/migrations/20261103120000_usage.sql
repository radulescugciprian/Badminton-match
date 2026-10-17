-- (Safe to run more than once.)
-- Usage counts for the admins: how often each person opens each tab (and a few actions), per day and hour.
-- Only counters are kept (no content), each person can only add to their own, and only admins can read them.
create table if not exists usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  hour int not null check (hour between 0 and 23),
  what text not null check (length(what) <= 30),   -- a tab ('play', 'board', ...) or an action ('act:whatsapp', 'act:photo')
  n int not null default 1,
  primary key (user_id, day, hour, what)
);
alter table usage enable row level security;
drop policy if exists "admins read" on usage;
create policy "admins read" on usage for select to authenticated using (is_admin());

create or replace function track(v text) returns void
language plpgsql security definer set search_path = public as $$
declare tz text := coalesce((select s.tz from schedule s), 'Europe/Berlin'); local timestamp := now() at time zone tz;
begin
  if auth.uid() is null then return; end if;
  insert into usage (user_id, day, hour, what) values (auth.uid(), local::date, extract(hour from local)::int, left(v, 30))
  on conflict (user_id, day, hour, what) do update set n = usage.n + 1;
end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261103 $$;
