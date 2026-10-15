-- Badminton tracker: shared database. Applied automatically by the Supabase GitHub integration, or paste it once into SQL Editor.

-- ---------- tables ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  is_admin boolean not null default false
);

create table players (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 20),
  avatar text,                                  -- small data: URL, set from the app
  active boolean not null default true          -- false = removed (history is kept)
);

create table days (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  player_order bigint[] not null,               -- player ids, slot 1..n
  mode int not null default 5 check (mode in (4, 5)),
  started boolean not null default false,
  closed boolean not null default false,
  photo_path text,                              -- object in the private 'photos' bucket
  created_by uuid default auth.uid()
);

create table matches (
  id bigint generated always as identity primary key,
  day_id bigint not null references days on delete cascade,
  n int not null check (n > 0),
  t1 bigint[] not null,
  t2 bigint[] not null,
  rest bigint,
  win int not null check (win in (1, 2)),
  created_by uuid default auth.uid(),
  unique (day_id, n)                            -- two people tapping the same match: the second one fails
);

insert into players (name) values ('Vali'), ('Dani'), ('Costi'), ('Zjepko'), ('Ciprian');

-- ---------- admin helpers ----------
create function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- every new login gets a profile; the very first one is the admin
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, is_admin)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
          not exists (select 1 from profiles));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- admin-only changes ----------
create function guard_player() returns trigger language plpgsql as $$
begin
  if new.active is distinct from old.active and not is_admin() then raise exception 'Admins only'; end if;
  return new;
end $$;
create trigger guard_player before update on players for each row execute function guard_player();

create function guard_day() returns trigger language plpgsql as $$
begin
  if (new.closed is distinct from old.closed                       -- close / reopen
      or (old.started and not new.started)                         -- reset day
      or (old.photo_path is not null and new.photo_path is null))  -- delete photo
     and not is_admin() then
    raise exception 'Admins only';
  end if;
  return new;
end $$;
create trigger guard_day before update on days for each row execute function guard_day();

-- ---------- row level security ----------
alter table profiles enable row level security;
alter table players  enable row level security;
alter table days     enable row level security;
alter table matches  enable row level security;

create policy "members read"   on profiles for select to authenticated using (true);
create policy "admin promote"  on profiles for update to authenticated using (is_admin()) with check (is_admin());

create policy "members read"   on players for select to authenticated using (true);
create policy "members add"    on players for insert to authenticated with check (true);
create policy "members edit"   on players for update to authenticated using (true) with check (true);

create policy "members read"   on days for select to authenticated using (true);
create policy "members add"    on days for insert to authenticated with check (true);
create policy "members edit"   on days for update to authenticated using (true) with check (true);
create policy "admin erase"    on days for delete to authenticated using (is_admin());

create policy "members read"   on matches for select to authenticated using (true);
create policy "members record" on matches for insert to authenticated
  with check (exists (select 1 from days d where d.id = day_id and d.started and not d.closed));
-- undo = delete the latest match of an open day; admins can delete any (reset day)
create policy "undo or admin"  on matches for delete to authenticated using (
  is_admin() or (
    n = (select max(m.n) from matches m where m.day_id = matches.day_id)
    and exists (select 1 from days d where d.id = day_id and not d.closed)));

-- ---------- photos (private bucket, any member can add/replace, only admins delete) ----------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict do nothing;
create policy "photos read"   on storage.objects for select to authenticated using (bucket_id = 'photos');
create policy "photos add"    on storage.objects for insert to authenticated with check (bucket_id = 'photos');
create policy "photos retake" on storage.objects for update to authenticated using (bucket_id = 'photos');
create policy "photos delete" on storage.objects for delete to authenticated using (bucket_id = 'photos' and is_admin());

-- ---------- live updates ----------
alter publication supabase_realtime add table players, days, matches, profiles;
