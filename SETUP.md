# Setting up the shared backend (about 10 minutes, free)

The app stores everything in a free [Supabase](https://supabase.com) project so every phone sees the same players, scores and photos.

1. **Create a project.** Sign in at supabase.com → *New project*. Pick any name and region and save the database password somewhere.
2. **Create the tables.** Open *SQL Editor* → *New query*, paste all of `supabase/schema.sql`, press *Run*. It should say "Success".
3. **Let people sign up straight away.** *Authentication* → *Sign In / Providers* → *Email* → turn **off** "Confirm email" → *Save*.
   (Leave it on if you want people to confirm their email first.)
4. **Copy the two keys.** *Project Settings* → *API*: copy the **Project URL** and the **anon public** key into `config.js`.
   The anon key is safe to publish; the rules in `schema.sql` decide who can read or change what.
5. **Publish.** Merge to `main`; GitHub Pages redeploys. Share the link.
6. **First login.** The **first account created becomes the admin**, so sign up yourself before sharing the link.
   Admins can then promote others under *Members*.

## Who can do what
| | Member | Admin |
|---|---|---|
| See scores, leaderboards, photos | ✅ | ✅ |
| Add players, rename, change avatar, set the order, start a day | ✅ | ✅ |
| Record a match result, undo the last one | ✅ | ✅ |
| Take or retake the group photo | ✅ | ✅ |
| Close / reopen / reset a day | ❌ | ✅ |
| Remove a player, delete a photo, erase all data | ❌ | ✅ |
| Promote members to admin | ❌ | ✅ |

These rules are enforced by the database (see `schema.sql`), not just by hidden buttons.

## Notes
- Data from the old single-phone version is not carried over.
- Free Supabase projects pause after a week of no activity; opening the Supabase dashboard un-pauses them.
