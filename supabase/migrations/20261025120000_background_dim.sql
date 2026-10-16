-- (Safe to run more than once.)
-- How much the background photos are darkened/lightened, 0-90 %, set by admins in the app and shared by everyone.
alter table schedule add column if not exists bg_dim int not null default 0;
alter table schedule drop constraint if exists schedule_bg_dim_check;
alter table schedule add constraint schedule_bg_dim_check check (bg_dim between 0 and 90);
