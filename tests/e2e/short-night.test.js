const { run } = require('./harness');
// Short on time with 4 players: switch to one match per pairing, so every pairing still gets played. Any member can close the day.
run('short on time: one match per pairing, members close the day', async h => {
  const { mk, signup, st, assert, until, win } = h;
  h.defaultNow = st.now = Date.parse('2026-11-12T18:00:00Z');   // Thursday evening in Berlin
  const A = await mk(), B = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2');
  await A.evaluate(() => { setMode(4); }); await until(() => st.days[st.days.length - 1].mode === 4, '4 players');
  await A.click('text=Start playing'); await B.waitForSelector('text=Match 1');
  const split = () => B.evaluate(() => { const d = cur(), x = nextTeams(d); return [x.t1, x.t2].map(t => [...t].sort().join('+')).sort().join(' v '); });
  // best of 3: the first pairing stays after one win
  const first = await split(); await win(B, 1); await B.waitForSelector('text=Match 2'); assert.equal(await split(), first, 'best of 3 keeps the teams');
  // the switch is in ⋯ More for everyone; from now on every match is a new pairing
  await h.more(B); await B.click('text=Short on time? One match per pairing'); await until(() => st.days[st.days.length - 1].quick_from === 1, 'switch saved');
  await B.waitForSelector('.pchips >> text=One match per pairing');
  const seen = [await split()]; assert.notEqual(seen[0], first, 'the pairing being played moves on at once');
  for (let i = 0; i < 2; i++) { await win(B, 1); await B.waitForSelector(`text=Match ${3 + i}`); seen.push(await split()); }
  assert.equal(new Set([first, ...seen]).size, 3, 'all three pairings played: ' + [first, ...seen].join(' | '));
  await A.waitForFunction(() => cur().quickFrom === 1 && cur().matches.length === 3);   // the other phone gets the switch live
  assert.equal(await A.evaluate(() => nextTeams(cur()).t1.join()), await B.evaluate(() => nextTeams(cur()).t1.join()), 'every phone follows the switch');
  // a member closes the day
  await B.click('.closeday'); await B.waitForSelector('h1:has-text("Results")'); await until(() => st.days.find(d => d.started && d.closed), 'closed by a member');
  assert(A.errs.length + B.errs.length === 0, [A.errs, B.errs].join());
});
