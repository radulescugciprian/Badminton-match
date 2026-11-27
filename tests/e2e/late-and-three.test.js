const { run } = require('./harness');
// The day after, an admin settles matches still waiting for a confirmation (even ones they recorded, even in member view).
// Playing in 3: anyone playing that night records the winner, and nothing waits for a confirmation.
run('admins settle leftovers the day after; playing in 3 needs no confirmation', async h => {
  const { st, sleep, mk, signup, until, assert } = h;
  h.defaultNow = st.now = Date.parse('2026-11-20T09:00:00Z');   // Friday morning
  const A = await mk(), B = await mk(), C = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2'); await signup(C, 'Cleo', 'c@x.com', '3');
  const ua = st.players.find(p => p.id === 1).user_id;
  st.days.push({ id: 60, date: '2026-11-19', player_order: [1, 2, 3, 4], mode: 4, started: true, closed: false, photo_path: null, rot_from: 0 });
  st.matches.push({ id: 601, day_id: 60, n: 1, t1: [1, 2], t2: [3, 4], rest: null, win: 1, confirmed: false, confirm_player: 3, created_by: ua, created_at: '2026-11-19T17:30:00Z' });
  await A.evaluate(() => { asMember = true; go('play'); refresh(); });   // the admin looks at the app as a member
  await A.waitForSelector('.rescard >> text=is still not confirmed');
  await A.click('.rescard >> text=Right'); await until(() => st.matches.find(m => m.id === 601).confirmed, 'the admin confirmed it');
  // playing in 3 tonight: Bob plays (he is not resting) and records; nobody has to confirm
  h.defaultNow = st.now = Date.parse('2026-11-26T17:20:00Z');
  st.days.push({ id: 61, date: '2026-11-26', player_order: [2, 1, 3], mode: 3, started: true, closed: false, photo_path: null, rot_from: 0 });
  const B2 = await mk(); await B2.goto(h.base + '/index.html'); await B2.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, await B.evaluate(() => Object.fromEntries(Object.entries(localStorage))));
  await B2.reload(); await B2.waitForSelector('text=Match 1');
  assert(!(await B2.locator('button.team').first().isDisabled()), 'a player of tonight records, even with an account resting');
  await sleep(800); await B2.click('text=Team 1 Wins'); await until(() => st.matches.some(m => m.day_id === 61), 'recorded');
  const m = st.matches.find(x => x.day_id === 61); assert(m.confirmed === true && m.confirm_player == null, 'nothing to confirm');
  await C.evaluate(() => refresh()); await sleep(500); assert.equal(await C.locator('.rescard').count(), 0, 'no confirmation asked from anyone');
  assert(A.errs.length + B2.errs.length === 0, [A.errs, B2.errs].join());
});
