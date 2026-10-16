const { run } = require('./harness');
// People stay logged in; the login box remembers who they are; a hiccup never logs anyone out.
run('stay signed in', async h => {
  const { mk, signup, st, assert, sleep } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  await A.reload(); await A.waitForSelector('text=Next match day');                                  // closing and reopening the app: still in
  await A.goto(h.base + '/'); await A.waitForSelector('text=Next match day');                         // opening the plain address: still in

  // light/dark theme: chosen in the profile, kept after a reload
  await A.click('.top .me'); await A.click('.seg >> text=Light');
  assert.equal(await A.evaluate(() => document.documentElement.dataset.theme), 'light');
  await A.reload(); await A.waitForSelector('text=Next match day');
  assert.equal(await A.evaluate(() => document.documentElement.dataset.theme), 'light', 'theme survives a reload');

  // a failed load of the member list (empty answer) must not look like "your account was removed"
  st.emptyProfiles = true;
  await A.evaluate(() => refresh()); await sleep(300);
  assert((await A.locator('text=Next match day').count()) > 0 && (await A.locator('text=Log in to see the scores').count()) === 0, 'still signed in after an empty answer');
  st.emptyProfiles = false;

  // logging out by choice: the box remembers the name (not the password) and does not claim you were thrown out
  await A.click('text=Log out'); await A.waitForSelector('text=Log in to see the scores');
  assert.equal(await A.inputValue('[name=login]'), '', 'nothing remembered before a login by username');
  await A.fill('[name=login]', 'anna'); await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Next match day');
  await A.click('text=Log out'); await A.waitForSelector('text=Log in to see the scores');
  assert.equal(await A.inputValue('[name=login]'), 'anna', 'name pre-filled');
  assert.equal(await A.inputValue('[name=password]'), '', 'password never stored');
  assert.equal(await A.locator('text=You were signed out').count(), 0, 'no warning after a normal logout');
  await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Next match day');

  // if the session ends on its own (expired), say so instead of silently showing the login page
  await A.evaluate(() => sb.auth.signOut());
  await A.waitForSelector('text=You were signed out. Please log in again.');
  assert.equal(await A.inputValue('[name=login]'), 'anna');
});
