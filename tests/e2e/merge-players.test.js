const { run } = require('./harness');
// Someone made a new account instead of claiming their old player: an admin merges the two, the old results now belong to the account.
run('merge players', async h => {
  const { mk, signup, st, assert, until } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  st.days.push({ id: 99, date: '2026-10-01', player_order: [1, 2, 3, 4, 5], mode: 5, started: true, closed: true, photo_path: null });
  st.matches.push({ id: 99, day_id: 99, n: 1, t1: [4, 2], t2: [1, 3], rest: 5, win: 1, created_at: '2026-10-01T17:00:00Z' });   // Zjepko (no account) won a match
  const B = await mk(); await signup(B, 'brada87', 'z@x.com', '');                                   // ... but signed up as a new player
  const fresh = st.players.find(p => p.user_id === st.users['z@x.com'].id);
  st.files[`avatars/p${fresh.id}.jpg`] = [1, 2, 3];   // his sharp card photo, uploaded with the new account
  assert(fresh && fresh.id !== 4, 'a second player was made');
  await A.reload(); await A.waitForSelector('text=Next match day');
  await A.evaluate(() => { adminPage = 'players'; go('admin'); }); await A.waitForSelector('text=Merge two players');
  await A.selectOption('select[name=keep]', '4'); await A.selectOption('select[name=dup]', String(fresh.id));
  await A.click('button:has-text("Merge")');
  await until(() => !st.players.includes(fresh) && st.players.find(p => p.id === 4).user_id === st.users['z@x.com'].id, 'merged');
  await until(() => st.files['avatars/p4.jpg'] && !st.files[`avatars/p${fresh.id}.jpg`], 'the card photo moved to the old player');
  await B.reload(); await B.waitForSelector('text=Next match day');
  await B.click('nav >> text=Stats'); await B.waitForSelector('img.pcimg[alt*="matches 1,"]');   // the new account now has the old player's match
  assert(st.log.some(l => l.action === 'merge_players'), 'logged');
  assert(A.errs.length === 0 && B.errs.length === 0, A.errs.concat(B.errs).join());
});
