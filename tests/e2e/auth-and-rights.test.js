const { run } = require('./harness');
run('sign-in, rights, photos and the play schedule', async h => {
  const { mk, signup, st, rpc, S, assert, fs, sleep, pages, win } = h;
  const A = await mk(), B = await mk();
  await A.waitForSelector('text=Log in to see the scores',{timeout:4000}).catch(async e=>{console.log(await A.textContent('body'), A.errs); throw e});
  await signup(A, 'Anna', 'a@x.com', '1'); await A.waitForSelector('text=Next match day');
  assert((await A.textContent('.top')).includes('admin'));
  await signup(B, 'Bob', 'b@x.com', '2'); await B.waitForSelector('text=Next match day');
  assert(!(await B.textContent('.top')).includes('admin'));
  assert((await A.locator('[aria-label^="Remove"]').count()) === 5 && (await B.locator('[aria-label^="Remove"]').count()) === 0, 'remove only for admin');
  // each account is its own player: avatar buttons only on your own row; guests are added by admins only
  assert((await A.locator('button.ph').count()) === 1 && (await B.locator('button.ph').count()) === 1, 'only own avatar editable');
  assert((await A.locator('text=Add guest player').count()) === 1 && (await B.locator('text=Add guest player').count()) === 0);
  assert(st.players.length === 5, 'claiming existing players creates no duplicates');
  await B.click('text=Profile'); await B.click('text=Change photo'); await B.setInputFiles('#pick', S + 'red.png');
  await A.waitForSelector('img.av'); // Dani's new avatar is visible to everyone
  assert(st.players[1].avatar && !st.players[0].avatar, 'avatar stored on the right player');
  const r = rpc('u2', { table: 'players', op: 'update', f: [['eq', 'id', 1]], payload: { avatar: 'x' } });
  assert(r.error, 'server refuses avatar change for someone else');
  await B.click('nav >> text=Play');
  // shared state: A changes mode, B sees it live
  assert.equal(await B.locator('button:has-text("4 players")').count(), 0, 'members do not pick 4 or 5 by hand');
  await A.click('button:has-text("4 players")'); await B.waitForFunction(() => cur().mode === 4);
  await A.click('button:has-text("5 players")'); await B.waitForFunction(() => cur().mode === 5);
  await A.click('text=Start day'); await B.waitForSelector('text=Match 1');
  assert((await B.locator('text=Close day').count()) === 0, 'member cannot close');
  await win(B, 1); await A.waitForSelector('text=Match 2');
  await win(A, 2); await B.waitForSelector('text=Match 3');
  // both leaderboards identical
  await A.click('nav >> text=Board'); await B.click('nav >> text=Board');
  assert((await A.textContent('.podium')) === (await B.textContent('.podium')), 'same leaderboard');
  // stale double-record -> friendly message, no duplicate
  await B.evaluate(() => { cur().matches.pop(); }); // B believes match 2 is still open
  await B.click('nav >> text=Play'); await win(B, 1).catch(() => {});
  await B.waitForTimeout(400);
  assert(B.alerts.some(a => a.includes('already recorded')), 'duplicate warned: ' + B.alerts);
  assert(st.matches.length === 2, 'no duplicate match stored');
  // close day (admin) -> member photo -> shared library
  await A.click('nav >> text=Play'); await A.click('text=Close day'); await B.waitForSelector('text=Day closed');
  await B.click('text=Take group photo'); await B.setInputFiles('#shot', S + 'red.png');
  await B.waitForSelector('text=Photo saved'); await A.waitForSelector('text=Photo saved');
  await A.click('nav >> text=Photos'); await A.waitForSelector('.grid img');
  await B.click('nav >> text=Photos'); await B.waitForSelector('.grid img');
  await B.click('.grid button'); await B.waitForSelector('#lb img');
  assert((await B.locator('#lb >> text=Delete').count()) === 0, 'member cannot delete photo');
  await B.click('#lb >> text=Close');
  // admin promotes Bob
  await A.click('text=Members'); await A.click('text=Make admin');
  await B.waitForFunction(() => document.querySelector('.top').textContent.includes('admin'));
  // logout / bad login / login
  await A.click('text=Log out'); await A.waitForSelector('text=Log in to see the scores',{timeout:4000}).catch(async e=>{console.log(await A.textContent('body'), A.errs); throw e});
  await A.fill('[name=login]', 'a@x.com'); await A.fill('[name=password]', 'nope123'); await A.click('button[type=submit]'); await A.waitForSelector('text=Wrong username');
  await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Day closed');
  await A.reload(); await A.waitForSelector('text=Day closed'); // session survives reload
  // username login (case-insensitive), unknown user, taken username, forgot password, recovery link
  await A.click('text=Log out'); await A.waitForSelector('text=Log in to see the scores');
  await A.fill('[name=login]', 'nobody'); await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Wrong username/email or password');
  await A.fill('[name=login]', 'ANNA'); await A.click('button[type=submit]'); await A.waitForSelector('text=Day closed');
  assert((await A.textContent('.top')).includes('Anna'), 'username shown');
  await A.click('text=Log out'); await A.click('text=Create an account'); await A.fill('[name=username]', 'anna'); await A.fill('[name=email]', 'z@x.com'); await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=username is taken');
  await A.click('text=Back to log in'); await A.click('text=Forgot password?');
  await A.fill('[name=login]', 'a@x.com'); await A.click('button[type=submit]'); await A.waitForSelector('text=reset link is on its way');
  assert(st.resets.includes('a@x.com'), 'reset mail requested for the right email');
  await A.fill('[name=login]', 'ghost@x.com'); await A.click('button[type=submit]'); await A.waitForSelector('text=reset link is on its way'); // same answer, no leak
  await A.click('text=Back to log in'); await A.fill('[name=login]', 'a@x.com'); await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Day closed');
  await A.evaluate(() => window.__recover()); await A.waitForSelector('text=New password');
  await A.fill('[name=password]', 'brandnew1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Day closed');
  assert(A.alerts.includes('Password changed.'));
  await A.click('text=Log out'); await A.fill('[name=login]', 'anna'); await A.fill('[name=password]', 'brandnew1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Day closed');
  // reset day (admin) clears matches + photo for everyone
  await A.click('text=Reopen day'); await A.click('text=Reset day'); await B.waitForSelector('text=No photos yet'); await B.click('nav >> text=Play'); await B.waitForSelector('text=Next match day');
  assert(st.matches.length === 0 && Object.keys(st.files).length === 0, 'reset cleaned matches and photo');
  // admin tools: guests are marked, accounts can be removed, scores can be reset
  await A.click('nav >> text=Play'); await A.waitForSelector('text=Next match day');
  assert((await A.locator('.row .tag').count()) === 3, 'three players have no account (Costi, Zjepko, Ciprian)');
  await A.click('text=Members'); await A.waitForSelector('text=Players');
  assert((await A.locator('.card .tag').count()) === 3, 'guests marked in the Members list too');
  assert((await B.locator('[aria-label^="Remove account"]').count()) === 0, 'member has no remove-account button');
  await A.click('[aria-label="Remove account bob"], [aria-label="Remove account Bob"]');
  await B.waitForSelector('text=Log in to see the scores');                       // removed account is signed out
  assert(!st.profiles.some(p => p.username === 'Bob') && st.players.find(p => p.name === 'Dani').user_id === null, 'Bob gone, Dani kept as guest');
  await A.waitForFunction(() => document.querySelectorAll('.card .tag').length === 4);
  // reset all scores
  await A.click('nav >> text=Play'); await A.click('text=Start day'); await win(A, 1);
  await A.click('nav >> text=Board'); await A.click('text=General'); await A.click('text=Reset all scores');
  await A.waitForSelector('text=No matches yet');
  assert(st.matches.length === 0 && st.players.length === 5 && st.profiles.length === 1, 'scores reset, players and accounts kept');
  // delete a photo (card button) and delete single days (admin)
  await A.click('nav >> text=Play'); await A.waitForSelector('text=Next match day');
  await A.click('text=Start day'); await win(A, 1); await A.click('text=Close day'); await A.waitForSelector('text=Day closed');
  await A.click('text=Take group photo'); await A.setInputFiles('#shot', S + 'red.png'); await A.waitForSelector('text=Photo saved');
  await A.click('nav >> text=Photos'); await A.waitForSelector('.grid img');
  await A.click('.grid .x'); await A.waitForSelector('text=No photos yet');
  assert(Object.keys(st.files).length === 0 && st.days.every(d => !d.photo_path), 'photo deleted from storage and day');
  await A.click('nav >> text=Play'); await A.click('text=Start next match day'); await A.click('text=Start day'); await win(A, 2);
  await A.click('nav >> text=Board'); await A.click('.seg >> text=Day'); await A.waitForSelector('select option', { state: 'attached' });
  assert((await A.locator('select option').count()) === 2, 'two days with matches');
  await A.selectOption('select', { index: 0 }); await A.click('text=Delete this day');
  await A.waitForFunction(() => document.querySelectorAll('select option').length === 1);
  assert(st.days.length === 1 && st.matches.length === 1, 'old day deleted with its matches');
  await A.click('text=Delete this day');                                      // the current day: a fresh one replaces it
  await A.waitForSelector('text=No matches yet');
  assert(st.matches.length === 0 && st.days.length === 1 && !st.days[0].started, 'current day deleted and replaced by an open one');
  await A.click('nav >> text=Play'); await A.waitForSelector('text=Next match day');
  assert((await B.locator('text=Delete this day').count()) === 0);
  // play schedule: members can start a day only on Thursday from 17:30 (Berlin); admins any time
  const C = await mk(); await signup(C, 'Cleo', 'c@x.com', '3'); await C.waitForSelector('text=Next match day');
  const at = async iso => { st.now = Date.parse(iso); await C.evaluate(t => { window.__t = t; render(); }, st.now); await A.evaluate(t => { window.__t = t; render(); }, st.now); };
  await at('2026-10-14T15:00:00Z');                                     // Wednesday 17:00 Berlin
  assert(await C.locator('button:has-text("Start day")').isDisabled(), 'member locked on Wednesday');
  assert((await C.textContent('[role=status]')).includes('Thursday at 18:30') && (await C.textContent('[role=status]')).includes('17:30'));
  assert(await A.locator('button:has-text("Start day")').isEnabled(), 'admin never locked');
  await at('2026-10-15T15:29:00Z');                                     // Thursday 17:29 Berlin (CEST)
  assert(await C.locator('button:has-text("Start day")').isDisabled(), 'locked at 17:29');
  await at('2026-10-15T15:31:00Z');                                     // Thursday 17:31
  assert(await C.locator('button:has-text("Start day")').isEnabled(), 'open at 17:31');
  await at('2026-10-15T22:00:00Z');                                     // Friday 00:00 Berlin
  assert(await C.locator('button:has-text("Start day")').isDisabled(), 'closed again after midnight');
  st.now = Date.parse('2026-10-14T15:00:00Z');                          // server refuses a direct attempt too
  assert(rpc('u3', { table: 'days', op: 'update', f: [['eq', 'id', st.days[st.days.length - 1].id]], payload: { started: true } }).error, 'server enforces the window');
  await at('2026-10-29T16:31:00Z');                                     // Thursday 17:31 Berlin after the clocks changed (CET)
  await C.click('button:has-text("Start day")'); await C.waitForSelector('text=Match 1');
});
