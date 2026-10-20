-- (Safe to run more than once.)
-- Phone notifications on play days for everyone who has not answered "in" or "out" yet.
-- The edge function supabase/functions/remind runs every 5 minutes (pg_cron below) and sends what claim_reminders() hands out.

alter table schedule add column if not exists remind_minutes int not null default 240;   -- minutes before play time; 0 = off
alter table schedule drop constraint if exists schedule_remind_minutes_check;
alter table schedule add constraint schedule_remind_minutes_check check (remind_minutes between 0 and 1440);

-- one row per phone/browser that allowed notifications; written only through save_push()/drop_push()
create table if not exists push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subs enable row level security;   -- no policies: only the functions below and the edge function touch it

create table if not exists push_sent (day date not null, kind text not null, primary key (day, kind));
alter table push_sent enable row level security;

-- the notification keys (VAPID); the edge function creates them on its first run
create table if not exists push_keys (id boolean primary key default true check (id), public text not null, private text not null);
alter table push_keys enable row level security;

create or replace function push_public_key() returns text
language sql stable security definer set search_path = public as $$ select public from push_keys $$;

-- a shared phone moves to whoever turned notifications on last
create or replace function save_push(endpoint text, p256dh text, auth_key text) returns void
language sql security definer set search_path = public as $$
  insert into push_subs (endpoint, user_id, p256dh, auth) values (save_push.endpoint, auth.uid(), save_push.p256dh, save_push.auth_key)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth
$$;
create or replace function drop_push(endpoint text) returns void
language sql security definer set search_path = public as $$ delete from push_subs where push_subs.endpoint = drop_push.endpoint and user_id = auth.uid() $$;
revoke execute on function save_push(text, text, text), drop_push(text) from public, anon;
grant execute on function save_push(text, text, text), drop_push(text) to authenticated;

-- what to send right now, at most once per play day and kind:
--   'day'  remind_minutes before play time, 'last' 30 minutes before the answers close
-- only to players with an account who have not answered for that day
create or replace function claim_reminders(at timestamptz default now())
returns table (endpoint text, p256dh text, auth text, kind text, play text, lang text)
language plpgsql security definer set search_path = public as $$
declare s schedule; d date; deadline timestamptz; k text;
begin
  select * into s from schedule limit 1;
  if s.remind_minutes is null or s.remind_minutes = 0 then return; end if;
  d := (at at time zone s.tz)::date;
  if not is_play_date(d) or not rsvp_open(d, at) then return; end if;
  deadline := coalesce((select p.answer_by from play_dates p where p.day = d and p.kind = 'extra'),
                       (d + play_time_on(d) - make_interval(mins => s.rsvp_until_minutes)) at time zone s.tz);
  k := case when at >= deadline - interval '30 minutes' then 'last'
            when (at at time zone s.tz) >= d + play_time_on(d) - make_interval(mins => s.remind_minutes) then 'day' end;
  if k is null then return; end if;
  insert into push_sent values (d, k) on conflict do nothing;
  if not found then return; end if;   -- already sent (or another run got there first)
  return query
    select ps.endpoint, ps.p256dh, ps.auth, k, to_char(play_time_on(d), 'HH24:MI'), coalesce(pr.lang, 'en')
    from push_subs ps join players p on p.user_id = ps.user_id and p.active
    left join profiles pr on pr.id = ps.user_id
    where not exists (select 1 from rsvps r where r.day_date = d and r.player_id = p.id);
end $$;
revoke execute on function claim_reminders(timestamptz) from public, anon, authenticated;
grant execute on function claim_reminders(timestamptz) to service_role;

-- run the edge function every 5 minutes (only on Supabase, where pg_cron and pg_net exist)
do $do$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('badminton-reminders', '*/5 * * * *',
      $c$select net.http_post(url := 'https://lhpfiyvsgibxkayepxml.supabase.co/functions/v1/remind', body := '{}'::jsonb)$c$);
  end if;
end $do$;

create or replace function db_version() returns int language sql immutable as $$ select 20261107 $$;
