-- (Safe to run more than once.)
-- Calendar of play days: the weekly play day is the default; admins can add an extra day or cancel a normal one.

create table if not exists play_dates (
  day date primary key,
  kind text not null check (kind in ('extra', 'cancelled')),
  created_by uuid default auth.uid()
);
alter table play_dates enable row level security;
drop policy if exists "members read" on play_dates;
create policy "members read" on play_dates for select to authenticated using (true);
drop policy if exists "admin marks" on play_dates;
create policy "admin marks" on play_dates for all to authenticated using (is_admin()) with check (is_admin());

-- members can start a day on the weekly play day (unless it is cancelled) or on an extra day, from `opens_minutes` before play time
create or replace function can_start_now(at timestamptz default now()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from schedule s
    where (at at time zone s.tz)::time >= s.play_time - make_interval(mins => s.opens_minutes)
      and (
        exists (select 1 from play_dates p where p.day = (at at time zone s.tz)::date and p.kind = 'extra')
        or (extract(dow from (at at time zone s.tz)) = s.dow
            and not exists (select 1 from play_dates p where p.day = (at at time zone s.tz)::date and p.kind = 'cancelled'))))
$$;

-- activity log entries for the calendar
create or replace function audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'days' and tg_op = 'DELETE' then
    perform log_action('delete_day', jsonb_build_object('date', old.date, 'matches', (select count(*) from matches where day_id = old.id)));
    return old;
  elsif tg_table_name = 'days' then
    if new.closed is distinct from old.closed then perform log_action(case when new.closed then 'close_day' else 'reopen_day' end, jsonb_build_object('date', new.date)); end if;
    if old.started and not new.started then perform log_action('reset_day', jsonb_build_object('date', new.date)); end if;
    if old.photo_path is not null and new.photo_path is null then perform log_action('delete_photo', jsonb_build_object('date', new.date)); end if;
  elsif tg_table_name = 'matches' then
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
  elsif tg_table_name = 'play_dates' then
    if tg_op = 'DELETE' then perform log_action('clear_play_date', jsonb_build_object('date', old.day)); return old;
    else perform log_action('mark_play_date', jsonb_build_object('date', new.day, 'kind', new.kind)); end if;
  end if;
  return new;
end $$;
drop trigger if exists audit_play_dates on play_dates;
create trigger audit_play_dates after insert or update or delete on play_dates for each row execute function audit();

do $$ begin alter publication supabase_realtime add table play_dates; exception when duplicate_object then null; end $$;
