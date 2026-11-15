-- (Safe to run more than once.)
-- 1) Short on time: from match number quick_from on, a 4-player night plays one match per pairing instead of a best of 3.
-- 2) Every member may close the day; reopening it, resetting it and deleting its photo stay with the admins.
alter table days add column if not exists quick_from int;

create or replace function guard_day() returns trigger language plpgsql as $$
begin
  if ((old.closed and not new.closed)                              -- reopen
      or (old.started and not new.started)                         -- reset day
      or (old.photo_path is not null and new.photo_path is null))  -- delete photo
     and not is_admin() then
    raise exception 'Admins only';
  end if;
  if not old.started and new.started and not is_admin() and not can_start_now() then
    raise exception 'A day can only be started during the play window. Ask an admin.';
  end if;
  return new;
end $$;

create or replace function db_version() returns int language sql immutable as $$ select 20261116 $$;
