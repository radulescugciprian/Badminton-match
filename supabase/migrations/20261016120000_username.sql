-- Usernames: every account gets a unique username (shown in the app, usable to log in instead of the email).

alter table profiles add column username text;

-- backfill existing accounts from their display name; duplicates get a number appended
with b as (
  select id, left(case when length(c) < 3 then rpad(c, 3, '0') else c end, 18) as base
  from (select id, coalesce(nullif(lower(regexp_replace(name, '[^A-Za-z0-9_.]', '', 'g')), ''), 'user') as c from profiles) x),
r as (select id, base, row_number() over (partition by base order by id) as rn from b)
update profiles p set username = case when r.rn = 1 then r.base else r.base || r.rn end from r where r.id = p.id;

alter table profiles alter column username set not null;
alter table profiles add constraint username_format check (username ~ '^[A-Za-z0-9_.]{3,20}$');
create unique index profiles_username_key on profiles (lower(username));

-- new accounts: username comes from the sign-up form (the app checks the format; the constraints above enforce it)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1));
begin
  insert into profiles (id, name, username, is_admin) values (new.id, u, u, not exists (select 1 from profiles));
  return new;
end $$;

-- lets the login screen turn a username into the email Supabase needs.
-- Trade-off: anyone who knows a username can look up that account's email address.
create function email_for_username(u text) returns text
language sql security definer stable set search_path = public, auth as $$
  select au.email::text from profiles p join auth.users au on au.id = p.id where lower(p.username) = lower(u)
$$;
revoke all on function email_for_username(text) from public;
grant execute on function email_for_username(text) to anon, authenticated;
