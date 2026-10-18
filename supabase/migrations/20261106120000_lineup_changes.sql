-- (Safe to run more than once.)
-- Players can leave early or arrive late during a day: the line-up changes and the rotation restarts at that match.
-- Down to 2 players (singles, the same two every match).
alter table days add column if not exists rot_from int not null default 0;
alter table days drop constraint if exists days_mode_check;
alter table days add constraint days_mode_check check (mode between 2 and 5);

create or replace function db_version() returns int language sql immutable as $$ select 20261106 $$;
