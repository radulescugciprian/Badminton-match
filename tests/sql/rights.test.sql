-- Who may do what, as the database sees it. Any failed check aborts the run.
create function check_that(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create function must_fail(q text, expect text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if position(lower(expect) in lower(sqlerrm)) > 0 then return; end if;
    raise exception 'ASSERT FAILED: "%" failed with "%" (wanted "%")', q, sqlerrm, expect;
  end;
  raise exception 'ASSERT FAILED: expected an error from: %', q;
end $$;
create function rows_changed(q text) returns int language plpgsql as $$
declare n int; begin execute q; get diagnostics n = row_count; return n; end $$;
create function as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;

-- accounts: the first one becomes admin; member1 claims player 2, member2 player 3 (4 and 5 stay guests)
insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x.com',   extensions.crypt('adminpw1',  extensions.gen_salt('bf')), '{"username":"Admin1","player_id":"1"}'),
  ('00000000-0000-0000-0000-00000000000b', 'member@x.com',  extensions.crypt('secret1', extensions.gen_salt('bf')), '{"username":"member1","player_id":"2"}'),
  ('00000000-0000-0000-0000-00000000000c', 'member2@x.com', extensions.crypt('secret2', extensions.gen_salt('bf')), '{"username":"member2","player_id":"3"}'),
  ('00000000-0000-0000-0000-00000000000d', 'late@x.com',    extensions.crypt('secret3', extensions.gen_salt('bf')), '{"username":"latecomer","player_id":"1"}');   -- player 1 is taken -> gets a new player
select check_that((select is_admin from profiles where username = 'Admin1'), 'first account is the admin');
select check_that((select count(*) from profiles where is_admin) = 1, 'only one admin');
select check_that((select user_id from players where id = 2) = '00000000-0000-0000-0000-00000000000b', 'member1 claimed Dani');
select check_that((select count(*) from players where name = 'latecomer') = 1, 'a taken player is not claimed twice');
select check_that((select count(*) from players where user_id is null) = 2, 'two guests remain');

create temp table ids as select '00000000-0000-0000-0000-00000000000a'::uuid adm, '00000000-0000-0000-0000-00000000000b'::uuid m1, '00000000-0000-0000-0000-00000000000c'::uuid m2;
grant all on ids to authenticated, anon;

-- ================= as a member =================
update schedule set opens_minutes = 60;   -- the tests below assume Start playing opens 60 minutes before play time
set role authenticated; select as_user((select m1 from ids));
select check_that((select count(*) from players) = 6, 'members read players');
update players set avatar = 'data:ok' where id = 2;
select check_that((select avatar from players where id = 2) = 'data:ok', 'own avatar');
select must_fail($$update players set avatar = 'x' where id = 3$$, 'own avatar');
select must_fail($$update players set avatar = 'x' where id = 4$$, 'own avatar');
update players set name = 'Dani2' where id = 2;
select must_fail($$update players set name = 'X' where id = 3$$, 'change this name');   -- someone else's player
select must_fail($$update players set user_id = null where id = 2$$, 're-linked');
select must_fail($$insert into players (name, user_id) values ('Hacker', '00000000-0000-0000-0000-00000000000c')$$, 'row-level security');
insert into players (name) values ('Guest by member');
select check_that((select count(*) from players where name = 'Guest by member') = 1, 'members may add guests');
update players set active = false where name = 'Guest by member';
select check_that((select not active from players where name = 'Guest by member'), 'a member removes the guest they added today');
select must_fail($$update players set active = false where id = 4$$, 'admins only');
select must_fail($$update players set active = false where id = 4$$, 'admins only');

insert into days (player_order) values ('{1,2,3,4,5}');
select must_fail($$insert into days (player_order, started) values ('{1,2,3,4,5}', true)$$, 'row-level security');
select must_fail($$insert into matches (day_id, n, t1, t2, rest, win) values (1, 1, '{1,2}', '{3,4}', 5, 1)$$, 'row-level security');   -- day not started
select check_that(rows_changed($$update schedule set play_time = '19:00'$$) = 0, 'members cannot edit the schedule');
select check_that(can_start_now('2026-10-14 15:00Z') = false and can_start_now('2026-10-15 15:29Z') = false and can_start_now('2026-10-15 15:30Z') = true
  and can_start_now('2026-10-15 21:59Z') = true and can_start_now('2026-10-15 22:00Z') = false and can_start_now('2026-10-29 16:30Z') = true and can_start_now('2026-10-29 16:29Z') = false,
  'play window: Thursday 17:30 Berlin until midnight, also after the clocks change');
reset role; update schedule set dow = (extract(dow from now() at time zone tz)::int + 1) % 7; set role authenticated;   -- "today" is not a play day
select must_fail($$update days set started = true where id = 1$$, 'play window');

-- reactions, sign-ups
select must_fail($$insert into rsvps values ('2099-10-22', 1, 'in')$$, 'row-level security');    -- someone else's player
select must_fail($$insert into rsvps values ('2099-10-22', 4, 'in')$$, 'row-level security');    -- a guest
insert into rsvps values ('2099-10-22', 2, 'in');
update rsvps set status = 'out' where player_id = 2;
select check_that((select status from rsvps where player_id = 2) = 'out', 'own answer changed');
-- profile settings
update profiles set lang = 'ro', share_stats = false where id = (select m1 from ids);
select must_fail($$update profiles set is_admin = true where id = (select m1 from ids)$$, 'admins only');
select must_fail($$update profiles set username = 'hacker' where id = (select m1 from ids)$$, 'admins only');
select check_that(rows_changed($$update profiles set lang = 'sv' where id = (select adm from ids)$$) = 0, 'cannot change someone else''s settings');
select must_fail($$update profiles set lang = 'xx' where id = (select m1 from ids)$$, 'profiles_lang_check');
select check_that((select count(*) from admin_log) = 0, 'members cannot read the admin log');
select check_that((select count(*) from profiles) = 4, 'members see the member list');

-- ================= as the admin =================
select as_user((select adm from ids));
update days set started = true where id = 1;                                                       -- admins start any time
select must_fail($$insert into matches (day_id, n, t1, t2, rest, win) values (1, 1, '{1,2}', '{3,4}', 5, 3)$$, 'check constraint');
insert into matches (day_id, n, t1, t2, rest, win) values (1, 1, '{1,2}', '{3,4}', 5, 1), (1, 2, '{2,3}', '{4,5}', 1, 2), (1, 3, '{3,5}', '{1,4}', 2, 1);
select must_fail($$insert into matches (day_id, n, t1, t2, rest, win) values (1, 2, '{2,3}', '{4,5}', 1, 2)$$, 'duplicate key');   -- same match recorded twice
select check_that((select count(*) from matches where created_at > now() - interval '1 minute') = 3, 'matches are timestamped');
update players set active = false where id = 5;
select must_fail($$update players set avatar = 'x' where id = 4$$, 'own avatar');                       -- not even admins change someone else's avatar
insert into players (name) values ('Guest');
insert into rsvps values ('2099-10-22', 4, 'in');                                                  -- admins answer for guests
select check_that((select count(*) from rsvps) = 2, 'both answers visible');
select check_that(rows_changed($$update schedule set play_time = '19:00', tz = 'Europe/Zagreb', opens_minutes = 45$$) = 1, 'admin edits the schedule');
select must_fail($$update schedule set tz = 'Mars/Olympus'$$, 'unknown time zone');
select must_fail($$update schedule set opens_minutes = 5000$$, 'between 0 and 720');
select check_that(rows_changed($$update profiles set is_admin = true where username = 'member2'$$) = 1, 'admin promotes');
select check_that(rows_changed($$update profiles set is_admin = false where username = 'member2'$$) = 1, 'admin demotes');

-- ================= member again: undo rules, closing =================
select as_user((select m1 from ids));
select check_that(rows_changed($$delete from matches where n = 1$$) = 0, 'cannot undo an older match');
select check_that(rows_changed($$delete from matches where n = 3$$) = 1, 'undo the latest');
select must_fail($$update days set closed = true where id = 1$$, 'admins only');
select must_fail($$update days set started = false where id = 1$$, 'admins only');
select check_that(rows_changed($$delete from days where id = 1$$) = 0, 'members cannot delete days');
insert into reactions (day_id, kind) values (1, 'fire');
select must_fail($$insert into reactions (day_id, kind, user_id) values (1, 'clap', (select adm from ids))$$, 'row-level security');
select must_fail($$insert into reactions (day_id, kind) values (1, 'fire')$$, 'duplicate key');
select must_fail($$insert into reactions (day_id, kind) values (1, 'poop')$$, 'reactions_kind_check');

select as_user((select adm from ids));
update days set photo_path = 'days/1.jpg' where id = 1;
update days set closed = true where id = 1;
select as_user((select m1 from ids));
select check_that(rows_changed($$delete from matches where n = 2$$) = 0, 'no undo once the day is closed');
select must_fail($$update days set photo_path = null where id = 1$$, 'admins only');
update days set photo_path = 'days/1.jpg' where id = 1;                                             -- retaking the photo (same path) is fine

-- ================= standings counted in the database =================
select as_user((select adm from ids));
select check_that((select wins from standings() where player_id = 1) = 1 and (select played from standings() where player_id = 1) = 1, 'standings: player 1 (1 match, 1 win)');
select check_that((select wins from standings() where player_id = 2) = 1 and (select played from standings() where player_id = 2) = 2, 'standings: player 2 (2 matches, 1 win)');
select check_that((select count(*) from standings(1)) = 5 and (select count(*) from standings(999)) = 0, 'standings per day');

-- ================= the admin log =================
select check_that((select count(*) from admin_log where action = 'delete_match') = 1, 'the undo was logged');
select check_that((select count(*) from admin_log where action = 'close_day') = 1, 'closing was logged');
select check_that((select count(*) from admin_log where action = 'remove_player' and detail ->> 'name' = 'Ciprian') = 1, 'player removal logged');
select check_that((select count(*) from admin_log where action = 'edit_schedule' and actor_name = 'Admin1') = 1, 'schedule edit logged');
select check_that((select count(*) from admin_log where action in ('make_admin', 'remove_admin')) = 2, 'role changes logged');
select check_that((select actor_name from admin_log where action = 'close_day') = 'Admin1', 'who did it is recorded');
select must_fail($$insert into admin_log (action) values ('forged')$$, 'row-level security');
select check_that(rows_changed($$delete from admin_log$$) = 0, 'the log cannot be edited');
-- deleting a day with matches: ONE entry carrying the match count, not one per cascaded match
delete from days where id = 1;
select check_that((select detail ->> 'matches' from admin_log where action = 'delete_day') = '2', 'day deletion logged with its match count');
select check_that((select count(*) from admin_log where action = 'delete_match') = 1, 'cascaded matches are not logged one by one');
-- accounts
select must_fail($$select delete_account((select adm from ids))$$, 'your own account');
select must_fail($$select delete_account('00000000-0000-0000-0000-0000000000ff')$$, 'no such account');
select delete_account((select m2 from ids));
select check_that((select count(*) from profiles) = 3, 'account removed');
select check_that((select user_id from players where id = 3) is null, 'its player stays, now without an account');
select check_that((select count(*) from admin_log where action = 'remove_account' and detail ->> 'username' = 'member2') = 1, 'account removal logged');
select as_user((select m1 from ids));
select must_fail($$select delete_account((select adm from ids))$$, 'admins only');

-- ================= the play calendar =================
select as_user((select adm from ids));
update schedule set tz = 'Europe/Berlin', dow = 4, play_time = '18:30', opens_minutes = 60;   -- the standard schedule again
insert into play_dates values ('2026-10-21', 'extra');                    -- an extra Wednesday
insert into play_dates values ('2026-10-22', 'cancelled');                -- the normal Thursday is off
select check_that(can_start_now('2026-10-21 15:30Z') and not can_start_now('2026-10-21 15:29Z'), 'extra day: members can start from 17:30 Berlin');
select check_that(not can_start_now('2026-10-22 16:00Z'), 'cancelled play day: members cannot start');
select check_that(can_start_now('2026-10-29 16:30Z'), 'the following Thursday is normal again');
select check_that((select count(*) from admin_log where action = 'mark_play_date') = 2, 'marking logged');
select as_user((select m1 from ids));
select must_fail($$insert into play_dates values ('2099-01-01', 'extra')$$, 'row-level security');      -- a normal play day (Thursday)
select must_fail($$insert into play_dates values ('2099-01-03', 'cancelled')$$, 'row-level security');  -- members cannot cancel
select must_fail($$insert into play_dates values ('2020-01-04', 'extra')$$, 'row-level security');      -- the past
select must_fail($$insert into play_dates (day, kind) values ('2099-01-03', 'extra')$$, 'row-level security');   -- without a time and deadline
select must_fail($$insert into play_dates (day, kind, play_time, answer_by) values ('2099-01-03', 'extra', '10:00', '2099-01-03 12:00+01')$$, 'deadline must be before');
insert into play_dates (day, kind, play_time, answer_by) values ('2099-01-03', 'extra', '10:00', '2099-01-02 20:00+01');   -- a member adds an extra Saturday game
select check_that(play_time_on('2099-01-03') = '10:00' and rsvp_open('2099-01-03', '2099-01-02 18:59Z') and not rsvp_open('2099-01-03', '2099-01-02 19:01Z'), 'the extra game has its own time and deadline');
select check_that(rows_changed($$delete from play_dates where day = '2026-10-21'$$) = 0, 'members cannot remove someone else''s extra day');
select check_that(rows_changed($$update play_dates set called_off = true where day = '2099-01-03'$$) = 1, 'the member calls off their extra game');
select check_that(not is_play_date('2099-01-03') and exists (select 1 from play_dates where day = '2099-01-03'), 'a called-off extra game is no play day but stays booked');
select check_that(rows_changed($$update play_dates set called_off = true where day = '2026-10-21'$$) = 0, 'members cannot call off someone else''s extra game');
select check_that(rows_changed($$delete from play_dates where day = '2099-01-03'$$) = 1, 'members remove their own extra game');
select check_that(rows_changed($$delete from play_dates$$) = 0, 'members cannot clear marks');
select check_that((select count(*) from play_dates) = 2, 'members can read the calendar');
-- sign-up window (18:30 game, answers close 120 min before = 16:30 Berlin): members cannot answer for a day that is over, admins can
select check_that(rsvp_open('2026-10-22', '2026-10-22 14:29Z') and not rsvp_open('2026-10-22', '2026-10-22 14:31Z'), 'answers close at 16:30 on the play day');
select check_that(rsvp_open('2026-10-29', '2026-10-22 20:00Z') and not rsvp_open('2026-10-21', '2026-10-22 12:00Z'), 'later days stay open, past days are closed');
select must_fail($$insert into rsvps values ('2020-01-01', 2, 'in')$$, 'Answers are closed');
select as_user((select adm from ids));
insert into rsvps values ('2020-01-01', 4, 'in');
select check_that(true, 'admins may answer after the deadline');
select must_fail($$update schedule set rsvp_hide_minutes = 200$$, 'cannot be hidden before');
select must_fail($$update schedule set rsvp_until_minutes = 5000$$, 'between 0 and 1440');
-- windows that reach back past midnight (a 00:30 game that opens 60 minutes before, on Wednesday evening Berlin)
update schedule set play_time = '00:30', opens_minutes = 60, rsvp_until_minutes = 120, rsvp_hide_minutes = 90;
select check_that(can_start_now('2026-10-28 22:35Z') and not can_start_now('2026-10-28 22:25Z'), 'opening the evening before a 00:30 game');
select check_that(rsvp_open('2026-10-29', '2026-10-28 21:20Z') and not rsvp_open('2026-10-29', '2026-10-28 21:40Z'), 'answers close at 22:30 the evening before');
update schedule set play_time = '18:30', opens_minutes = 60;
select check_that(db_version() >= 20261029, 'db_version reports the newest migration');
-- receipts: members add their own, read all, delete only their own (admins any)
select as_user((select m1 from ids));
insert into receipts (note, amount, photo_path) values ('extra court', 24, 'receipts/a.jpg');
select must_fail($$insert into receipts (note, created_by) values ('x', (select adm from ids))$$, 'row-level security');
select as_user((select m2 from ids));
select check_that((select count(*) from receipts) = 1, 'members read receipts');
select check_that(rows_changed($$delete from receipts$$) = 0, 'members cannot delete someone else''s receipt');
select as_user((select adm from ids));
select check_that(rows_changed($$delete from receipts$$) = 1, 'admins delete any receipt');
-- usage counters: everyone adds to their own through track(), only admins read them
select as_user((select m1 from ids));
select track('play'); select track('play'); select track('stats');
select check_that((select count(*) from usage) = 0, 'members cannot read usage');
select must_fail($$insert into usage (user_id, day, hour, what) values ((select adm from ids), current_date, 1, 'x')$$, 'row-level security');
select as_user((select adm from ids));
select check_that((select n from usage where what = 'play') = 2 and (select count(*) from usage) = 2, 'admins read the counts');
delete from play_dates where day = '2026-10-22';
select check_that((select count(*) from admin_log where action = 'clear_play_date') = 2, 'clearing logged (the member''s own extra game and the admin''s)');
select must_fail($$insert into play_dates values ('2026-10-24', 'party')$$, 'check constraint');

-- ================= logged out (anon) =================
reset role; set role anon;
select check_that((select count(*) from players) = 0 and (select count(*) from profiles) = 0 and (select count(*) from matches) = 0, 'nothing readable when logged out');
select must_fail($$select * from auth.users$$, 'permission denied');
select must_fail($$select email_for_username('member1')$$, 'does not exist');                       -- the leaky function is gone
select check_that(username_taken('MEMBER1') and not username_taken('nobody'), 'username check');
select check_that((select count(*) from unclaimed_players()) >= 1, 'sign-up can list unclaimed players');

-- login by username: the email is only released for the right password, wrong guesses are throttled
select check_that(login_email('member1', 'secret1') = 'member@x.com', 'right password releases the email');
select check_that(login_email('MEMBER1 ', 'secret1') = 'member@x.com', 'case and spaces do not matter');
select check_that(login_email('member1', 'wrong') is null, 'wrong password gives nothing');
select check_that(login_email('nobody', 'secret1') is null, 'unknown user gives the same nothing');
select login_email('member1', 'secret1');                                                           -- a correct login resets the counter
select login_email('member1', 'bad1'); select login_email('member1', 'bad2'); select login_email('member1', 'bad3'); select login_email('member1', 'bad4'); select login_email('member1', 'bad5');
select must_fail($$select login_email('member1', 'secret1')$$, 'too many attempts');                -- locked, even with the right password
select check_that(login_email('Admin1', 'adminpw1') = 'admin@x.com', 'other usernames are not affected');
select check_that((select count(*) from login_attempts) = 0, 'the attempts table is invisible to visitors (it has rows)');
reset role;
update login_attempts set since = now() - interval '16 minutes';
set role anon;
select check_that(login_email('member1', 'secret1') = 'member@x.com', 'the lock expires after 15 minutes');
reset role;
select 'sql rights tests ok' as result;
