const { run } = require('./harness');
// The morning after a closed night, Play shows the next match day by itself, with a small link to last night's results.
// During play there is one Undo at a time, "Close day" is set apart, and closing ends on the results.
run('play: next day by itself, safer match buttons', async h => {
  const { mk, signup, st, assert, until, win } = h;
  st.days.push({ id: 90, date: '2026-11-05', player_order: [1, 2, 3, 4, 5], mode: 5, started: true, closed: true, photo_path: null, rot_from: 0 });
  [[[1, 2], [3, 4], 5, 1], [[2, 3], [4, 5], 1, 1]].forEach(([t1, t2, rest, win_], n) => st.matches.push({ id: 900 + n, day_id: 90, n: n + 1, t1, t2, rest, win: win_, created_at: '2026-11-05T17:00:00Z' }));
  const A = await mk({ now: Date.parse('2026-11-06T09:00:00Z') });   // Friday morning
  await signup(A, 'Anna', 'a@x.com', '1');
  await until(() => st.days.length === 2 && !st.days[1].closed, 'a new day was added');
  await A.waitForSelector('.lastnight'); assert((await A.textContent('.lastnight')).includes('2 matches'), 'last night, in one line');
  assert.equal(await A.locator('h1:has-text("Results")').count(), 0, 'no old results on Play');
  await A.click('.lastnight'); await A.waitForSelector('.podium'); assert.equal(await A.evaluate(() => [view, tab]).then(x => x.join()), 'board,day', 'opens that day on the Board');
  // before match day, members get no reorder arrows or 4/5 choice (admins do)
  await A.evaluate(() => { asMember = true; go('play'); }); await A.waitForSelector('.row');
  assert.equal(await A.locator('[aria-label="Move up"]').count(), 0, 'no arrows for members before match day');
  await A.evaluate(() => { asMember = false; render(); }); assert(await A.locator('[aria-label="Move up"]').count() > 0, 'admins can still arrange');
  // match night: one Undo at a time, no "Next match day" during play, closing shows the results
  await A.evaluate(() => { window.__t = Date.parse('2026-11-12T17:00:00Z'); start(); }); await A.waitForSelector('.team');
  await win(A, 1); await A.waitForSelector('.toast'); assert.equal(await A.locator('.pbtns >> text=Undo last').count(), 0, 'the toast has the only Undo');
  await h.more(A); assert.equal(await A.locator('.pmore >> text=Next match day').count(), 0, 'no new day in the middle of play');
  await A.click('.closeday'); await A.waitForSelector('h1:has-text("Results")');
  assert(A.errs.length === 0, A.errs.join());
});
