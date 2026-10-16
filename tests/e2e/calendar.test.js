const { run } = require('./harness');
// The sign-up card is compact until the play day; the calendar shows play days and lets admins add or cancel one.
run('compact sign-up card and play calendar', async h => {
  const { mk, signup, st, assert, until } = h;
  const at = async (pages, iso) => { st.now = Date.parse(iso); for (const p of pages) await p.evaluate(t => { window.__t = t; render(); }, st.now); };
  h.defaultNow = st.now = Date.parse('2026-10-19T10:00:00Z');                    // Monday 12:00 Berlin
  const A = await mk(), B = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2');

  // compact before the play day: the date, the count and the two answer buttons; the details are one tap away
  assert((await B.textContent('.rsvp')).includes('Thursday 22 Oct') && (await B.textContent('.rsvp')).includes('0 in'));
  assert.equal(await B.locator('.rsvp .chips').count(), 0, 'no list of names before the play day');
  assert((await B.locator('.rsvp').boundingBox()).height < 150, 'the card is short: ' + (await B.locator('.rsvp').boundingBox()).height);
  await B.click("text=I'm in"); await B.waitForSelector('text=1 in');
  await B.click('text=Details'); await B.waitForSelector('.rsvp .chips'); await B.click('text=Details'); await B.waitForFunction(() => !document.querySelector('.rsvp .chips'));

  // the calendar: all Thursdays are play days, nothing can be changed by a member
  await B.click('[aria-label=Calendar]'); await B.waitForSelector('text=October 2026');
  assert.equal(await B.locator('.cal .d.play').count(), 5, 'five Thursdays in October 2026');
  assert.equal(await B.locator('.cal button.d').count(), 0, 'members only look');
  assert(!/admin/i.test(await B.textContent('.cal, .legend')), 'no admin talk for members in the calendar');

  // admin: Wednesday 21 becomes an extra play day; the sign-up card follows
  await A.click('[aria-label=Calendar]'); await A.waitForSelector('text=October 2026');
  assert((await A.locator('.cal button.d').count()) > 0 && (await A.locator('.cal .d.today').count()) === 1);
  assert.equal(await A.locator('.cal button.d:has-text("5")').count() >= 0, true);
  await A.click('.cal button[aria-label*="21 October"]'); await A.waitForSelector('.cal .d.extra');
  await until(() => st.play_dates.some(x => x.day === '2026-10-21' && x.kind === 'extra'), 'the extra day on the server');
  await A.click('text=Back'); await A.waitForSelector('text=Wednesday 21 Oct');
  await B.click('text=Back'); await B.waitForSelector('text=Wednesday 21 Oct');                    // everyone sees it
  // cancel Thursday 22 (a normal play day), tap again to bring it back
  await A.click('[aria-label=Calendar]'); await A.click('.cal button[aria-label*="22 October"]'); await A.waitForSelector('.cal .d.off');
  await A.click('.cal button[aria-label*="22 October"]'); await A.waitForFunction(() => !document.querySelector('.cal .d.off'));
  await A.click('.cal button[aria-label*="22 October"]'); await A.waitForSelector('.cal .d.off');
  // a past date opens the "old match day" form instead of marking the date
  await A.click('.cal button[aria-label*="12 October"]'); await A.waitForSelector('text=Add an old match day');
  for (const n of ['Vali', 'Dani', 'Costi', 'Zjepko']) await A.click(`.chips button:has-text("${n}")`);
  await A.click('text=Team 1 Wins >> nth=0'); await A.click('text=Team 2 Wins >> nth=1'); await A.click('text=Save this day'); await A.waitForSelector('text=Calendar');
  await until(() => st.days.some(d => d.date === '2026-10-12' && d.closed), 'the old day on the server');
  const old = st.days.find(d => d.date === '2026-10-12');
  assert.deepEqual(st.matches.filter(m => m.day_id === old.id).map(m => m.win), [1, 2], 'two matches saved in rotation order');
  assert(!st.play_dates.some(x => x.day === '2026-10-12'), 'the past date was not marked');
  await until(() => st.play_dates.some(x => x.day === '2026-10-22' && x.kind === 'cancelled'), 'the cancelled day on the server');
  assert.deepEqual(st.log.map(x => x.action).filter(a => a !== 'close_day'), ['mark_play_date', 'mark_play_date', 'clear_play_date', 'mark_play_date']);

  await B.waitForFunction(() => playDates.some(p => p.day === '2026-10-22' && p.kind === 'cancelled'));   // Bob's phone has heard about it
  // members can start a day on an extra day from 17:30, and not on a cancelled one
  await A.click('text=Back'); await B.evaluate(() => go('play'));
  await at([A, B], '2026-10-21T15:29:00Z'); assert(await B.locator('button:has-text("Start day")').isDisabled(), 'locked at 17:29 on the extra day');
  await at([A, B], '2026-10-21T15:31:00Z'); assert(await B.locator('button:has-text("Start day")').isEnabled(), 'open at 17:31 on the extra day');
  await at([A, B], '2026-10-22T16:00:00Z'); assert(await B.locator('button:has-text("Start day")').isDisabled(), 'locked on the cancelled Thursday');
  assert((await B.textContent('.rsvp')).includes('Thursday 29 Oct'), 'the card moved on to the next play day');
  assert(await A.locator('button:has-text("Start day")').isEnabled(), 'admins can always start');
  // on the play day itself the details are open
  await at([A, B], '2026-10-29T10:00:00Z'); await B.waitForSelector('.rsvp .chips');
  assert(h.rpc('u2', { table: 'play_dates', op: 'upsert', payload: { day: '2026-10-30', kind: 'extra' } }).error, 'the server refuses a member');
  assert(A.errs.length + B.errs.length === 0, [A.errs, B.errs].join());
});
