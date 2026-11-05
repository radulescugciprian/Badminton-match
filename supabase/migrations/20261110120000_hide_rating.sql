-- (Safe to run more than once.)
-- "Hide my rating": the person and everyone else see badges, results and fun stats, but not their rating number or rank.
alter table profiles add column if not exists hide_rating boolean not null default false;

create or replace function db_version() returns int language sql immutable as $$ select 20261110 $$;
