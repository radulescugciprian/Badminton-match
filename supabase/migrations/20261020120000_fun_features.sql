-- (Safe to run more than once.)
-- Thursday sign-up (rsvps), custom team names, emoji reactions on day photos.

-- 1) "I'm in / I'm out" for a play date. Players answer for themselves; admins can answer for guests (players without an account).
create table if not exists rsvps (
  day_date date not null,
  player_id bigint not null references players on delete cascade,
  status text not null check (status in ('in', 'out')),
  updated_at timestamptz not null default now(),
  primary key (day_date, player_id)
);
alter table rsvps enable row level security;
drop policy if exists "members read" on rsvps;
create policy "members read" on rsvps for select to authenticated using (true);
drop policy if exists "own or admin writes" on rsvps;
create policy "own or admin writes" on rsvps for all to authenticated
  using (exists (select 1 from players p where p.id = player_id and (p.user_id = auth.uid() or is_admin())))
  with check (exists (select 1 from players p where p.id = player_id and (p.user_id = auth.uid() or is_admin())));

-- 2) optional team names, saved with the match
alter table matches add column if not exists team1_name text;
alter table matches add column if not exists team2_name text;
alter table matches drop constraint if exists matches_team_names;
alter table matches add constraint matches_team_names check (length(team1_name) <= 24 and length(team2_name) <= 24);

-- 3) emoji reactions on a day's group photo (one of each kind per person)
create table if not exists reactions (
  day_id bigint not null references days on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('clap', 'fire', 'laugh', 'love', 'trophy')),
  primary key (day_id, user_id, kind)
);
alter table reactions enable row level security;
drop policy if exists "members read" on reactions;
create policy "members read" on reactions for select to authenticated using (true);
drop policy if exists "react as yourself" on reactions;
create policy "react as yourself" on reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "remove your own" on reactions;
create policy "remove your own" on reactions for delete to authenticated using (user_id = auth.uid());

-- live updates
do $$ begin alter publication supabase_realtime add table rsvps; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table reactions; exception when duplicate_object then null; end $$;
