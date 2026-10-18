-- (Safe to run more than once.)
-- Which icon set the app uses for everyone ('neon' pictures or 'minimal' line icons), chosen by an admin.
alter table schedule add column if not exists icon_set text not null default 'neon';
alter table schedule drop constraint if exists schedule_icon_set_check;
alter table schedule add constraint schedule_icon_set_check check (icon_set in ('neon', 'minimal'));

create or replace function db_version() returns int language sql immutable as $$ select 20261105 $$;
