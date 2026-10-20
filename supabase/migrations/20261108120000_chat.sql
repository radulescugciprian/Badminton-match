-- (Safe to run more than once.)
-- Group chat: messages from members, automatic notes from the app (extra game added, who is in, day closed),
-- reactions, and an optional phone notification for new messages (sent by supabase/functions/remind).

create table if not exists chat (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users on delete set null,
  body text check (length(btrim(body)) between 1 and 1000),
  event jsonb,                                         -- automatic notes; the app words them in each person's language
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  check ((body is null) <> (event is null))
);
alter table chat enable row level security;
drop policy if exists "members read" on chat;
create policy "members read" on chat for select to authenticated using (true);
drop policy if exists "write as yourself" on chat;
create policy "write as yourself" on chat for insert to authenticated with check (user_id = auth.uid() and event is null and not notified);
drop policy if exists "remove own or admin" on chat;
create policy "remove own or admin" on chat for delete to authenticated using (user_id = auth.uid() or is_admin());

create table if not exists chat_reactions (
  msg_id bigint not null references chat on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  emoji text not null check (emoji in ('👍', '😂', '🔥', '❤️', '🏸')),
  primary key (msg_id, user_id, emoji)
);
alter table chat_reactions enable row level security;
drop policy if exists "members read" on chat_reactions;
create policy "members read" on chat_reactions for select to authenticated using (true);
drop policy if exists "react as yourself" on chat_reactions;
create policy "react as yourself" on chat_reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "remove your own" on chat_reactions;
create policy "remove your own" on chat_reactions for delete to authenticated using (user_id = auth.uid());

do $$ begin alter publication supabase_realtime add table chat; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table chat_reactions; exception when duplicate_object then null; end $$;

alter table profiles add column if not exists chat_push boolean not null default false;   -- "notify me of new messages"

-- ---------- automatic notes ----------
create or replace function who_is(u uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from players where user_id = u limit 1), (select username from profiles where id = u), '?')
$$;
create or replace function chat_event(u uuid, ev jsonb) returns void language sql security definer set search_path = public as $$
  insert into chat (user_id, event) values (u, ev)
$$;
revoke execute on function chat_event(uuid, jsonb) from public, anon, authenticated;

create or replace function chat_on_extra() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'extra' then
    perform chat_event(new.created_by, jsonb_build_object('type', 'extra', 'who', who_is(new.created_by), 'date', new.day, 'time', to_char(play_time_on(new.day), 'HH24:MI')));
  end if;
  return new;
end $$;
drop trigger if exists chat_on_extra on play_dates;
create trigger chat_on_extra after insert on play_dates for each row execute function chat_on_extra();

create or replace function chat_on_rsvp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform chat_event(auth.uid(), jsonb_build_object('type', 'rsvp', 'who', (select name from players where id = new.player_id), 'date', new.day_date, 'status', new.status));
  end if;
  return new;
end $$;
drop trigger if exists chat_on_rsvp on rsvps;
create trigger chat_on_rsvp after insert or update on rsvps for each row execute function chat_on_rsvp();

create or replace function chat_on_close() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.closed and not old.closed then
    perform chat_event(auth.uid(), jsonb_build_object('type', 'closed', 'date', new.date,
      'n', (select count(*) from matches where day_id = new.id),
      'top', (select p.name from matches m cross join lateral unnest(case m.win when 1 then m.t1 else m.t2 end) w(id) join players p on p.id = w.id
              where m.day_id = new.id group by p.name order by count(*) desc, p.name limit 1)));
  end if;
  return new;
end $$;
drop trigger if exists chat_on_close on days;
create trigger chat_on_close after update on days for each row execute function chat_on_close();

-- ---------- phone notifications for new messages ----------
create or replace function chat_ping() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.body is not null and to_regnamespace('net') is not null then   -- pg_net exists only on Supabase
    execute 'select net.http_post(url := $1, body := $2)'
      using 'https://lhpfiyvsgibxkayepxml.supabase.co/functions/v1/remind', jsonb_build_object('chat', new.id);
  end if;
  return new;
end $$;
drop trigger if exists chat_ping on chat;
create trigger chat_ping after insert on chat for each row execute function chat_ping();

-- the phones to tell about message `msg`, once: everyone who turned chat notifications on, except the writer
create or replace function claim_chat(msg bigint)
returns table (endpoint text, p256dh text, auth text, title text, body text)
language sql security definer set search_path = public as $$
  with m as (update chat set notified = true where id = msg and not notified and chat.body is not null returning user_id, chat.body)
  select ps.endpoint, ps.p256dh, ps.auth, who_is(m.user_id), left(m.body, 200)
  from m join push_subs ps on ps.user_id is distinct from m.user_id
  join profiles pr on pr.id = ps.user_id and pr.chat_push
$$;
revoke execute on function claim_chat(bigint) from public, anon, authenticated;
grant execute on function claim_chat(bigint) to service_role;

create or replace function db_version() returns int language sql immutable as $$ select 20261108 $$;
