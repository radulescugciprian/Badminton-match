-- (Safe to run more than once.)
-- Members may add an extra game on a future date (and remove the ones they added); cancelling normal play days stays admin-only.
drop policy if exists "members add extra games" on play_dates;
create policy "members add extra games" on play_dates for insert to authenticated
  with check (kind = 'extra' and created_by = auth.uid()
              and day >= (now() at time zone (select tz from schedule))::date
              and extract(dow from day) <> (select dow from schedule));
drop policy if exists "members remove own extra games" on play_dates;
create policy "members remove own extra games" on play_dates for delete to authenticated
  using (kind = 'extra' and created_by = auth.uid());

create or replace function db_version() returns int language sql immutable as $$ select 20261030 $$;
