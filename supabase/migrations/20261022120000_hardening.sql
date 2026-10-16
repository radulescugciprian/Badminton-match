-- (Safe to run more than once.)
-- Timestamps, an admin activity log, standings calculated in the database, and username login that no longer reveals emails.

-- 1) when things happened
alter table days add column if not exists created_at timestamptz not null default now();
alter table matches add column if not exists created_at timestamptz not null default now();

-- 2) admin activity log: who deleted / closed / changed what. Written only by the triggers below, readable only by admins.
create table if not exists admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_name text,
  action text not null,
  detail jsonb not null default '{}'
);
alter table admin_log enable row level security;
drop policy if exists "admins read" on admin_log;
create policy "admins read" on admin_log for select to authenticated using (is_admin());

create or replace function log_action(a text, d jsonb) returns void
language sql security definer set search_path = public as $$
  insert into admin_log (actor, actor_name, action, detail) values (auth.uid(), (select username from profiles where id = auth.uid()), a, d)
$$;
revoke all on function log_action(text, jsonb) from public;

create or replace function audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'days' and tg_op = 'DELETE' then
    perform log_action('delete_day', jsonb_build_object('date', old.date, 'matches', (select count(*) from matches where day_id = old.id)));
    return old;
  elsif tg_table_name = 'days' then
    if new.closed is distinct from old.closed then perform log_action(case when new.closed then 'close_day' else 'reopen_day' end, jsonb_build_object('date', new.date)); end if;
    if old.started and not new.started then perform log_action('reset_day', jsonb_build_object('date', new.date)); end if;
    if old.photo_path is not null and new.photo_path is null then perform log_action('delete_photo', jsonb_build_object('date', new.date)); end if;
  elsif tg_table_name = 'matches' then       -- an undo or a reset; matches removed together with their day are logged by the day
    if exists (select 1 from days where id = old.day_id) then
      perform log_action('delete_match', jsonb_build_object('date', (select date from days where id = old.day_id), 'n', old.n));
    end if;
    return old;
  elsif tg_table_name = 'profiles' then
    if new.is_admin is distinct from old.is_admin then perform log_action(case when new.is_admin then 'make_admin' else 'remove_admin' end, jsonb_build_object('username', new.username)); end if;
  elsif tg_table_name = 'players' then
    if old.active and not new.active then perform log_action('remove_player', jsonb_build_object('name', new.name)); end if;
  elsif tg_table_name = 'schedule' then
    perform log_action('edit_schedule', jsonb_build_object('tz', new.tz, 'dow', new.dow, 'play_time', new.play_time, 'opens_minutes', new.opens_minutes));
  end if;
  return new;
end $$;

drop trigger if exists audit_days_delete on days;
create trigger audit_days_delete before delete on days for each row execute function audit();
drop trigger if exists audit_days_update on days;
create trigger audit_days_update after update on days for each row execute function audit();
drop trigger if exists audit_matches_delete on matches;
create trigger audit_matches_delete after delete on matches for each row execute function audit();
drop trigger if exists audit_profiles_update on profiles;
create trigger audit_profiles_update after update on profiles for each row execute function audit();
drop trigger if exists audit_players_update on players;
create trigger audit_players_update after update on players for each row execute function audit();
drop trigger if exists audit_schedule_update on schedule;
create trigger audit_schedule_update after update on schedule for each row execute function audit();

create or replace function delete_account(uid uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if uid = auth.uid() then raise exception 'You cannot remove your own account'; end if;
  perform log_action('remove_account', jsonb_build_object('username', (select username from profiles where id = uid)));
  perform set_config('app.internal', '1', true);
  delete from auth.users where id = uid;
  if not found then raise exception 'No such account'; end if;
end $$;

-- 3) standings counted in the database (one day, or all days when p_day is null). Runs with the caller's rights.
create or replace function standings(p_day bigint default null) returns table (player_id bigint, played bigint, wins bigint)
language sql stable as $$
  with sides as (
    select unnest(t1) as pid, (win = 1) as won from matches where p_day is null or day_id = p_day
    union all
    select unnest(t2), (win = 2) from matches where p_day is null or day_id = p_day)
  select pid, count(*), count(*) filter (where won) from sides group by pid
$$;
grant execute on function standings(bigint) to authenticated;

-- 4) username login without revealing emails.
-- The old email_for_username() handed any visitor the email of any username. Now the email is only returned when the
-- password is right (so whoever gets it could log in anyway), and wrong guesses are throttled: 5 per username per 15 minutes.
-- Typing the email instead of the username never goes through this function.
create extension if not exists pgcrypto with schema extensions;
create table if not exists login_attempts (username text primary key, fails int not null default 0, since timestamptz not null default now());
alter table login_attempts enable row level security;   -- no policies: only reachable through login_email()

create or replace function username_taken(u text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where lower(username) = lower(trim(u)))
$$;

create or replace function login_email(u text, pw text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare k text := lower(trim(u)); n int; rec record;
begin
  delete from login_attempts where since < now() - interval '15 minutes';
  select fails into n from login_attempts where username = k;
  if coalesce(n, 0) >= 5 then raise exception 'Too many attempts for this username'; end if;
  select au.email::text as email, au.encrypted_password as hash into rec
    from profiles p join auth.users au on au.id = p.id where lower(p.username) = k;
  if rec.email is not null and rec.hash = crypt(pw, rec.hash) then
    delete from login_attempts where username = k;
    return rec.email;
  end if;
  insert into login_attempts as la (username, fails) values (k, 1) on conflict (username) do update set fails = la.fails + 1;
  return null;   -- same answer for "no such user" and "wrong password"
end $$;

revoke all on function username_taken(text) from public;
revoke all on function login_email(text, text) from public;
grant execute on function username_taken(text) to anon, authenticated;
grant execute on function login_email(text, text) to anon, authenticated;
drop function if exists email_for_username(text);
