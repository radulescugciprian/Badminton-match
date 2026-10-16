const { run } = require('./harness');
// What admins can see and do: activity log, match times, standings counted by the database.
run('admin tools', async h => {
  const { mk, signup, st, sleep, win, assert } = h;
  const A = await mk(), B = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2');
  await A.click('text=Start day'); await A.waitForSelector('text=Match 1');
  await win(A, 1); await win(A, 2); await win(A, 1); await A.waitForSelector('text=Match 4');
  await sleep(300);

  // standings: the database count equals the local count, and the General board shows them
  await A.click('nav >> text=Board'); await A.click('.seg >> text=General'); await A.waitForSelector('.podium');
  assert(await A.evaluate(() => std !== null && JSON.stringify(allTime()) === JSON.stringify(stats(db.days.flatMap(d => d.matches)))), 'database standings = local standings');
  assert(h.calls.includes('standings'));

  // match times are recorded and shown
  await A.click('.seg >> text=Day'); await A.waitForSelector('h2.sec:has-text("Matches")');
  assert(/\d\d:\d\d/.test(await A.textContent('.mrow')), 'a time next to each match');
  assert(st.matches.every(m => m.created_at), 'matches are timestamped');

  // Bob (a member) undoes the last match; Anna closes the day and deletes it: all of it lands in the log, only admins can read it
  await B.click('text=Undo last'); await A.waitForFunction(() => cur().matches.length === 2);
  await A.click('nav >> text=Play'); await A.click('text=Close day'); await A.waitForSelector('text=Day closed');
  await A.click('nav >> text=Board'); await A.click('text=Delete this day'); await A.waitForSelector('text=No matches yet');
  await A.click('text=Members'); await A.waitForSelector('text=Activity log');
  const log = await A.textContent('#app');
  assert(log.includes('Bob') && log.includes('removed match 3'), 'the undo is attributed to Bob');
  assert(log.includes('Anna') && log.includes('closed the day') && /deleted the day .* with 2 matches/.test(log), 'closing and deleting are attributed to Anna');
  assert.deepEqual(st.log.map(x => x.action), ['delete_match', 'close_day', 'delete_day']);
  await B.click('text=Members'); await B.waitForSelector('text=Accounts');
  assert(!(await B.textContent('#app')).includes('Activity log'), 'members cannot see the log');
  assert(h.assert && A.errs.length + B.errs.length === 0, 'no page errors');
});
