const { run } = require('./harness');
// With 4 players a pairing plays a best of 3; when it ends and partners change, Play says "New teams" (with the swap
// animation) until the first match of the new pairing is recorded. Not after a single match, and never when nothing changes.
run('new teams notice when partners change', async h => {
  const { st, sleep, mk, signup, until, assert } = h;
  h.defaultNow = st.now = Date.parse('2026-11-19T17:20:00Z');
  st.days.push({ id: 50, date: '2026-11-19', player_order: [1, 2, 3, 4], mode: 4, started: false, closed: false, photo_path: null, rot_from: 0 });
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1'); await A.click('text=Start playing'); await A.waitForSelector('text=Match 1');
  const tap = async k => { if (await A.locator('.winpop').count()) { await A.click('.winpop'); await sleep(300); } await A.click(`text=Team ${k} Wins`); };
  await tap(1); await until(() => st.matches.length === 1, 'match 1');   // straight after opening: the double-tap guard must not swallow it
  assert.equal(await A.locator('.newteams').count(), 0, 'not after the first match of a best of 3');
  await sleep(800); await tap(1); await until(() => st.matches.length === 2, 'match 2: 2-0, the best of 3 is over');
  await A.waitForSelector('.newteams >> text=New teams');
  await A.click('.winpop'); await A.waitForSelector('.newteams .ntic svg');   // the swap animation, once the popup is closed
  await sleep(800); await tap(2); await until(() => st.matches.length === 3, 'match 3');
  assert.equal(await A.locator('.newteams').count(), 0, 'gone once the new pairing has played');
  assert(A.errs.length === 0, A.errs.join());
});
