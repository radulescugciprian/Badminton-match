const { run } = require('./harness');
// An admin can preview the app exactly as a normal member sees it, and switch back.
run('admin views the app as a member', async h => {
  const { mk, signup, st, assert, win } = h;
  h.defaultNow = st.now = Date.parse('2026-10-19T10:00:00Z');                       // Monday: members cannot start a day
  const A = await mk(), B = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2');
  assert.equal(await B.locator('[aria-label="View as member"]').count(), 0, 'members do not get the switch');
  await B.click('text=Profile'); await B.click('.check >> nth=0');                    // Bob keeps his stats private
  await A.waitForFunction(() => (members.find(m => m.username === 'Bob') || {}).share_stats === false);

  // as admin: guest controls, remove buttons, a start button that always works
  assert((await A.locator('[aria-label^="Remove"]').count()) > 0 && (await A.locator('text=Add guest player').count()) === 1);
  assert(await A.locator('button:has-text("Start day")').isEnabled());
  await A.click('[aria-label="View as member"]');
  await A.waitForSelector('.strip');
  assert((await A.textContent('.strip')).includes('viewing the app as a member'));
  assert.equal(await A.locator('[aria-label^="Remove"]').count(), 0, 'no remove buttons in the preview');
  assert.equal(await A.locator('text=Add guest player').count(), 0);
  assert(await A.locator('button:has-text("Start day")').isDisabled(), 'locked outside the play window, like for a member');
  assert(!(await A.textContent('.top')).includes('admin'), 'the top bar shows no admin tag');
  assert.equal(await A.locator('[aria-label="View as member"]').count(), 0);
  await A.click('text=Members'); await A.waitForSelector('text=Accounts');
  assert.equal(await A.locator('text=Make admin').count() + await A.locator('text=Activity log').count() + await A.locator('[aria-label^="Remove account"]').count(), 0, 'Members page without admin tools');
  await A.click('[aria-label=Calendar]').catch(() => {});
  await A.evaluate(() => go('calendar')); await A.waitForSelector('text=Calendar');
  assert.equal(await A.locator('.cal button.d').count(), 0, 'nothing to tap in the calendar as a member');

  // a member's screens never talk about what admins can do (the one privacy sentence in Profile is the exception)
  const seen = [];
  for (const v of ['play', 'members', 'calendar', 'board', 'stats', 'photos']) { await B.evaluate(x => go(x), v); await B.waitForTimeout(150); seen.push(await B.textContent('#app')); }
  await B.evaluate(() => { tab = 'all'; go('board'); }); seen.push(await B.textContent('#app'));
  for (const text of seen) assert(!/Admins can|an admin|Only admins|admin tools|starts any time/i.test(text), 'admin talk on a member screen: ' + text.match(/.{30}(Admins can|an admin|Only admins|admin tools).{30}/i));
  assert.equal(await B.locator('input[type=date]').count(), 0, 'no date picker: the day gets its date when it starts');
  await B.evaluate(() => go('play')); assert.equal(await B.locator('text=Choose 4 or 5').count(), 0);

  // privacy follows: Bob's stats are hidden from the preview, visible again as admin
  await A.evaluate(() => go('stats')); await A.waitForFunction(() => !document.getElementById('app').textContent.includes('Bob') || true);
  assert.equal(await A.evaluate(() => canSee(2)), false, "a member does not see Bob's private stats");
  await A.click('text=Back to admin'); await A.waitForFunction(() => !document.querySelector('.strip'));
  assert.equal(await A.evaluate(() => canSee(2)), true, 'the admin sees everything again');
  await A.evaluate(() => go('play'));
  assert((await A.locator('[aria-label^="Remove"]').count()) > 0 && await A.locator('button:has-text("Start day")').isEnabled(), 'admin tools are back');
  // it is only a preview: the choice is not kept after logging out
  await A.click('[aria-label="View as member"]'); await A.click('text=Log out'); await A.waitForSelector('text=Log in to see the scores');
  await A.fill('[name=login]', 'a@x.com'); await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Next match day');
  assert.equal(await A.locator('.strip').count(), 0, 'back to the admin view after logging in again');
  assert(A.errs.length + B.errs.length === 0, [A.errs, B.errs].join());
});
