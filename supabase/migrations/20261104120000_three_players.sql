-- (Safe to run more than once.)
-- Days can also be played with 3 players (singles: the winner stays on, at most 3 games in a row, then sits out one).
alter table days drop constraint if exists days_mode_check;
alter table days add constraint days_mode_check check (mode in (3, 4, 5));

create or replace function db_version() returns int language sql immutable as $$ select 20261104 $$;
