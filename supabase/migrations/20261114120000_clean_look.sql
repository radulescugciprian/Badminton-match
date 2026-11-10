-- Clean look: photo backgrounds are off by default; an admin can switch them back on for everyone.
alter table schedule add column if not exists bg_photos boolean not null default false;

create or replace function db_version() returns int language sql immutable as $$ select 20261114 $$;
