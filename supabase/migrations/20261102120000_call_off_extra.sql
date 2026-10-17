-- (Safe to run more than once.)
-- An extra game can be called off (not enough players) without deleting it: the booking stays in the calendar, marked as cancelled.
-- Whoever added it, or an admin, can call it off and bring it back.
alter table play_dates add column if not exists called_off boolean not null default false;

drop policy if exists "members change own extra games" on play_dates;
create policy "members change own extra games" on play_dates for update to authenticated
  using (kind = 'extra' and created_by = auth.uid()) with check (kind = 'extra' and created_by = auth.uid());

create or replace function is_play_date(c date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from play_dates p where p.day = c and p.kind = 'extra' and not p.called_off)
      or (extract(dow from c) = (select dow from schedule)
          and not exists (select 1 from play_dates p where p.day = c and p.kind = 'cancelled'))
$$;

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
    elsif tg_op = 'UPDATE' and new.called_off is distinct from old.called_off then
      perform log_action(case when new.called_off then 'call_off_extra' else 'restore_extra' end, jsonb_build_object('date', new.day));
    else perform log_action('mark_play_date', jsonb_build_object('date', new.day, 'kind', new.kind)); end if;
  end if;
  return new;
end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261102 $$;
