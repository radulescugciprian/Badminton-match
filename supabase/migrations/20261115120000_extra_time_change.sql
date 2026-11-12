-- (Safe to run more than once.)
-- Changing the start time of an extra game: the app keeps the old time (time_was) so the cards can say "new time, was 19:00",
-- and the players who said they are in get a notification, once per change (time_told = the time they were last told about).
alter table play_dates add column if not exists time_was time;
alter table play_dates add column if not exists time_told time;

-- a changed start time pings the edge function `remind` (pg_net exists only on Supabase); "by" is who changed it, so they are not told
create or replace function extra_moved() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'extra' and new.play_time is distinct from old.play_time and not new.called_off and to_regnamespace('net') is not null then
    execute 'select net.http_post(url := $1, body := $2)'
      using 'https://lhpfiyvsgibxkayepxml.supabase.co/functions/v1/remind', jsonb_build_object('moved', new.day, 'by', auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists extra_moved on play_dates;
create trigger extra_moved after update on play_dates for each row execute function extra_moved();

-- the phones to tell about the new time of the extra game on day d: everyone who said "I'm in", except whoever changed it
create or replace function claim_moved(d date, by_user uuid default null)
returns table (endpoint text, p256dh text, auth text, kind text, play text, was text, day text, lang text)
language sql security definer set search_path = public as $$
  with m as (update play_dates pd set time_told = pd.play_time
             where pd.day = d and pd.kind = 'extra' and not pd.called_off and pd.time_was is not null and pd.time_told is distinct from pd.play_time
             returning pd.play_time, pd.time_was)
  select ps.endpoint, ps.p256dh, ps.auth, 'moved', to_char(m.play_time, 'HH24:MI'), coalesce(to_char(m.time_was, 'HH24:MI'), ''), to_char(d, 'DD.MM.'), coalesce(pr.lang, 'en')
  from m
  join rsvps r on r.day_date = d and r.status = 'in'
  join players p on p.id = r.player_id and p.active
  join push_subs ps on ps.user_id = p.user_id and ps.user_id is distinct from by_user
  left join profiles pr on pr.id = ps.user_id
$$;
revoke execute on function claim_moved(date, uuid) from public, anon, authenticated;
grant execute on function claim_moved(date, uuid) to service_role;

create or replace function db_version() returns int language sql immutable as $$ select 20261115 $$;
