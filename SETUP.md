# Setting up the shared backend (about 10 minutes, free)

The app stores everything in a free [Supabase](https://supabase.com) project so every phone sees the same players, scores and photos.

1. **Create a project.** Sign in at supabase.com → *New project*. Pick any name and region and save the database password somewhere.
2. **Create the tables.** (If the Supabase GitHub integration has *Deploy to production* on, pushes to `main` apply everything in `supabase/migrations/` automatically and you can skip this step. Migrations are safe to re-run.)
   Otherwise: Open *SQL Editor* → *New query*, paste all of `supabase/migrations/20261015120000_init.sql`, press *Run*. It should say "Success".
3. **Let people sign up straight away.** *Authentication* → *Sign In / Providers* → *Email* → turn **off** "Confirm email" → *Save*.
   (Leave it on if you want people to confirm their email first.)
4. **Copy the two keys.** *Project Settings* → *API*: copy the **Project URL** and the **anon public** key into `config.js`.
   The anon key is safe to publish; the rules in the migration file decide who can read or change what.
5. **Publish.** Merge to `main`; GitHub Pages redeploys. Share the link.
6. **First login.** The **first account created becomes the admin**, so sign up yourself before sharing the link.
   Admins can then promote others under *Members*.

## Usernames and password reset
- Run the migrations in `supabase/migrations/` **in order** (`..._init.sql`, then `..._username.sql`, then `..._player_accounts.sql`, then `..._admin_tools.sql`, then `..._play_schedule.sql`, then `..._fun_features.sql`).
- People log in with a username **or** an email. Trade-off: the login box looks up the email for a username, so anyone who knows a username can find that account's email. Fine for a friends group; say if you want it locked down.
- "Forgot password?" emails a reset link. Add the app address under *Authentication → URL Configuration → Redirect URLs* or the link will not return to the app. Supabase's built-in email sender is limited to a few emails per hour; add your own SMTP under *Authentication → Emails* if that is not enough.

## Accounts and players
- Every account is a player. On the sign-up form people pick which existing player they are (Vali, Dani, ...) or "I'm a new player", which creates one.
- Only the account owner can change their own avatar (**Profile** at the top of the app). The database refuses anyone else, admins included.
- Players without an account (guests) are added by admins only, with "Add guest player" on the new-day screen. Guests have no avatar until someone claims them.

## Admin tools
- **Members** lists every account and every player. Players without an account are tagged "no account" (also on the new-day screen).
- Admins can remove an account (✕). The person can no longer log in; their player and results stay and become a "no account" guest.
- **Delete this day's leaderboard** (Board → Day) removes that day, its matches and its group photo. Deleting today's day starts a fresh one.
- **Delete a photo**: ✕ on a photo card in Photos, or Delete when it's open.
- **Reset all scores** (Board → General) deletes every day, match and group photo; players and accounts are kept.
- Check that every account has a player (the second list should be empty after running `..._admin_tools.sql`, which also repairs any gaps):
```sql
select pr.username, p.name as player from profiles pr left join players p on p.user_id = pr.id order by pr.username;
select name from players where user_id is null and active;   -- guests (no account)
```

## Play schedule
We play on Thursday at 18:30 (Europe/Berlin time). Regular members can only press **Start day** on Thursday from 17:30 until midnight; admins can start a day at any time. The database enforces this, not just the button. To change it, run in SQL Editor:
```sql
update schedule set tz = 'Europe/Berlin', dow = 4 /* 0=Sunday .. 6=Saturday */, play_time = '18:30', opens_minutes = 60;
```

## Sign-up, ratings, photos
- **Thursday sign-up:** the Play screen shows the coming play date with *I'm in / I'm out*. Everyone answers for themselves; admins can tap a name to answer for guests, and **Reset answers** clears everyone's answers for the coming play date. The player list fills itself (in, then no answer, then out) and 4 or 5 confirmed players set the 4/5 mode.
- **Reminder:** *Remind me every Thursday* downloads a calendar event with an alert when starting opens, so the phone notifies you without any server. (Real push notifications from the app would need a Supabase Edge Function plus secrets; not set up.)
- **Rating (Elo):** everyone starts at 1000 and moves after every match; computed from the match log (`analytics.js`, tested in `tests/`). Badges: 5 in a row, perfect night (4+ matches, all won), comeback (lost the first two, finished ahead), most improved (last 4 nights), player of the night.
- **Result card:** on the closed-day screen or in a photo, *Share result card* makes a 1080×1350 picture of the podium over the group photo.
- **Team names** (✎ under a team on the match screen) are saved with the match and shown in the day's match list. **Reactions** (👏🔥😂❤️🏆) go on the group photo.

## Who can do what
| | Member | Admin |
|---|---|---|
| See scores, leaderboards, photos | ✅ | ✅ |
| Rename players, set the order | ✅ | ✅ |
| Start a day | Thursday from 17:30 | any time |
| Change *your own* avatar | ✅ | ✅ |
| Add a guest player (no account) | ❌ | ✅ |
| Record a match result, undo the last one | ✅ | ✅ |
| Take or retake the group photo | ✅ | ✅ |
| Close / reopen / reset a day | ❌ | ✅ |
| Remove a player, delete a photo, erase all data | ❌ | ✅ |
| Promote members to admin, remove accounts, reset all scores | ❌ | ✅ |

These rules are enforced by the database (see the migration file), not just by hidden buttons.

## Notes
- Data from the old single-phone version is not carried over.
- Free Supabase projects pause after a week of no activity; opening the Supabase dashboard un-pauses them.
