const { run } = require('./harness');
// What admins can see and do: activity log, match times, standings counted by the database.
run('admin tools', async h => {
  const { mk, signup, st, sleep, win, assert } = h;
  const A = await mk(), B = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2');
  await A.click('text=Start playing'); await A.waitForSelector('text=Match 1');
  await win(A, 1); await win(A, 2); await win(A, 1); await A.waitForSelector('text=Match 4');
  await sleep(300);

  // standings: the database count equals the local count, and the General board shows them
  await A.click('nav >> text=Board'); await A.click('.seg >> text=All time'); await A.waitForSelector('.podium');
  assert(await A.evaluate(() => std !== null && JSON.stringify(allTime()) === JSON.stringify(stats(db.days.flatMap(d => d.matches)))), 'database standings = local standings');
  assert(h.calls.includes('standings'));

  // match times are recorded and shown
  await A.click('.seg >> text=Day'); await A.click('summary:has-text("Matches")'); await A.waitForSelector('.mrow');
  assert(/\d\d:\d\d/.test(await A.textContent('.mrow')), 'a time next to each match');
  assert(st.matches.every(m => m.created_at), 'matches are timestamped');

  // Bob (a member) undoes the last match; Anna closes the day and deletes it: all of it lands in the log, only admins can read it
  await B.click('text=Undo last'); await A.waitForFunction(() => cur().matches.length === 2);
  await A.click('nav >> text=Play'); await h.more(A); await A.click('text=Close day'); await A.waitForSelector('text=Day closed');
  await A.click('nav >> text=Board'); await A.click('.more summary'); await A.click('text=Delete this day'); await A.waitForSelector('text=No matches yet');
  await A.click('[aria-label="Admin tools"]'); await A.click('[data-adm=log]'); await A.waitForSelector('text=Activity log');
  const log = await A.textContent('#app');
  assert(log.includes('Bob') && log.includes('removed match 3'), 'the undo is attributed to Bob');
  assert(log.includes('Anna') && log.includes('closed the day') && /deleted the day .* with 2 matches/.test(log), 'closing and deleting are attributed to Anna');
  assert.deepEqual(st.log.map(x => x.action), ['delete_match', 'close_day', 'delete_day']);
  await B.click('text=Members'); await B.waitForSelector('text=Accounts');
  assert(!(await B.textContent('#app')).includes('Activity log'), 'members cannot see the log');
  // an out-of-date database is shown to admins only
  st.dbVersion = 1; await A.reload(); await A.waitForSelector('text=The database is missing updates');
  await B.reload(); await B.waitForSelector('text=Next match day'); assert.equal(await B.locator('text=The database is missing updates').count(), 0);
  st.dbVersion = undefined; await A.reload(); await A.waitForSelector('text=Next match day');
  // a member adds a guest and may remove that guest again
  await B.click('text=Add guest player'); await B.click('summary:has-text("Sitting out")'); await B.waitForSelector('[aria-label="Remove Eve"]');
  await B.click('[aria-label="Remove Eve"]'); await h.until(() => st.players.find(p => p.name === 'Eve').active === false, 'guest removed by the member who added it');
  await A.click('[aria-label="Admin tools"]'); await A.click('[data-adm=players]');
  // admins add several players without an account at once; they join the next match day
  A.promptAnswer = 'Ana, Mihai'; await A.click('text=Add players without an account');
  await h.until(() => ['Ana', 'Mihai'].every(n => st.players.some(p => p.name === n && !p.user_id)), 'two players added');
  await h.until(() => ['Ana', 'Mihai'].every(n => st.days[st.days.length - 1].player_order.includes(st.players.find(p => p.name === n).id)), 'they join the setup');
  A.promptAnswer = undefined;
  // usage: tabs opened are counted per person; only admins see the summary
  await B.click('nav >> text=Stats'); await B.click('nav >> text=Board'); await B.click('nav >> text=Play');
  await h.until(() => st.usage.some(r => r.what === 'stats') && st.usage.some(r => r.what === 'board'), 'tabs counted');
  assert(h.rpc('u2', { table: 'usage', op: 'select', f: [] }).data.length === 0, 'members cannot read usage');
  await A.reload(); await A.click('[aria-label="Admin tools"]'); await A.click('[data-adm=usage]'); await A.waitForSelector('text=Usage (last 30 days)');
  const ut = await A.textContent('.usage'); assert(ut.includes('Most used') && ut.includes('Bob') && ut.includes('last seen'), ut.slice(0, 200));
  // icons: an admin switches everyone to the minimal line icons
  await A.click('text=← Admin tools'); await A.click('[data-adm=icons]'); await A.click('.seg >> text=Minimal'); await h.until(() => st.schedule[0].icon_set === 'minimal', 'icon set saved');
  await A.waitForFunction(() => document.querySelectorAll('nav svg.lic').length === 4 && document.querySelectorAll('.top svg.lic').length >= 3);
  await B.reload(); await B.waitForFunction(() => document.querySelectorAll('nav svg.lic').length === 4);
  // photo dimming: the admin's slider is saved for everyone, members have no slider
  assert.equal(await B.locator('input[type=range]').count(), 0, 'members cannot set the dimming');
  await A.click('[data-adm=bg]');
  await A.locator('input[type=range]').evaluate(el => { el.value = 40; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await h.until(() => st.schedule[0].bg_dim === 40, 'dimming saved');
  assert.equal(await A.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dim').trim()), '0.4');
  await B.reload(); await B.waitForSelector('text=Next match day').catch(() => {});
  // receipts on the Photos tab: a member adds one, everyone sees it, the member deletes it again
  await B.click('nav >> text=Photos'); await B.click('.seg >> text=Receipts'); await B.waitForSelector('text=Add a receipt');
  B.promptAnswer = '12.50'; await B.setInputFiles('#rcpt', h.S + 'red.png');
  await h.until(() => st.receipts.length === 1 && st.receipts[0].amount === 12.5 && st.files[st.receipts[0].photo_path], 'receipt saved with its photo');
  await A.click('nav >> text=Photos'); await A.click('.seg >> text=Receipts'); await A.waitForSelector('#gal .member');
  await B.waitForSelector('#gal .member'); await B.click('[aria-label="Delete this receipt?"]');
  await h.until(() => st.receipts.length === 0, 'receipt deleted by the member who added it');
  // Members: one row per person, filters, a mini profile on tap, and an invite to share
  await B.click('text=Members'); await B.waitForSelector('.mrow2');
  const everyone = await B.locator('.mrow2').count(); await B.click('.chip >> text=Guests');
  assert(await B.locator('.mrow2').count() < everyone && await B.locator('.mrow2 .tag').count() === await B.locator('.mrow2').count(), 'only guests');
  await B.click('.chip >> text=All'); await B.click('.mrow2 >> nth=0'); await B.waitForSelector('.spanel');
  await B.click('text=Invite to the app'); assert(decodeURIComponent(await B.evaluate(() => window.__wa)).includes('Join our badminton app'), 'invite shared');
  assert(h.assert && A.errs.length + B.errs.length === 0, 'no page errors');
});
