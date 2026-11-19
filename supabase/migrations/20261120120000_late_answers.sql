-- (Safe to run more than once.)
-- After the answer deadline a member can ask the admins to open the sign-up for them (for that day only).
-- Only the player (or an admin) ever changes their own answer; an admin opening it lets the player answer again themselves.
create table if not exists rsvp_unlocks (
  day_date date not null,
  player_id bigint not null references players on delete cascade,
  opened boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (day_date, player_id)
);
alter table rsvp_unlocks enable row level security;
drop policy if exists "own or admin read" on rsvp_unlocks;
create policy "own or admin read" on rsvp_unlocks for select to authenticated
  using (is_admin() or exists (select 1 from players p where p.id = player_id and p.user_id = auth.uid()));
drop policy if exists "ask for yourself" on rsvp_unlocks;
create policy "ask for yourself" on rsvp_unlocks for insert to authenticated
  with check (not opened and exists (select 1 from players p where p.id = player_id and p.user_id = auth.uid()));
drop policy if exists "admins open" on rsvp_unlocks;
create policy "admins open" on rsvp_unlocks for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "own or admin remove" on rsvp_unlocks;
create policy "own or admin remove" on rsvp_unlocks for delete to authenticated
  using (is_admin() or exists (select 1 from players p where p.id = player_id and p.user_id = auth.uid()));
do $$ begin alter publication supabase_realtime add table rsvp_unlocks; exception when duplicate_object or undefined_object then null; end $$;

-- the deadline still holds for everyone else; a player an admin opened it for may answer for that day
create or replace function guard_rsvp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and not rsvp_open(coalesce(new.day_date, old.day_date))
     and not exists (select 1 from rsvp_unlocks u where u.day_date = coalesce(new.day_date, old.day_date)
                     and u.player_id = coalesce(new.player_id, old.player_id) and u.opened) then
    raise exception 'Answers are closed';
  end if;
  return coalesce(new, old);
end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261120 $$;
