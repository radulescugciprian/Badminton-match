const { run } = require('./harness');
// Logging in with a username must never reveal anyone's email, and wrong guesses are throttled.
run('login privacy', async h => {
  const { mk, signup, st, assert, calls } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  await A.click('text=Log out'); await A.waitForSelector('text=Log in to see the scores');
  const asked = () => calls.filter(c => c === 'email_for_username');
  const login = async (who, pw) => { await A.fill('[name=login]', who); await A.fill('[name=password]', pw); await A.click('button[type=submit]'); };

  await login('anna', 'wrongpw'); await A.waitForSelector('text=Wrong username/email or password');
  await login('nobody', 'secret1'); await A.waitForSelector('text=Wrong username/email or password');       // an unknown name looks exactly the same
  assert.equal(await A.textContent('.msg'), 'Wrong username/email or password.');
  assert(!(await A.content()).includes('a@x.com'), 'the page never shows the email');
  await login('ANNA', 'secret1'); await A.waitForSelector('text=Next match day');                                  // right password: in
  assert.equal(asked().length, 0, 'the old lookup that returned emails is not used any more');
  assert(calls.includes('login_email'), 'username login goes through the password-checked lookup');

  await A.click('text=Log out'); const before = calls.filter(c => c === 'login_email').length;
  await login('a@x.com', 'secret1'); await A.waitForSelector('text=Next match day');                               // an email needs no lookup at all
  assert.equal(calls.filter(c => c === 'login_email').length, before, 'email login does not touch the lookup');

  // five wrong guesses lock the username (even for the right password) but the email still works
  await A.click('text=Log out');
  for (let i = 0; i < 5; i++) { await login('anna', 'guess' + i); await A.waitForSelector('text=Wrong username/email or password'); await A.fill('[name=password]', ''); }
  await login('anna', 'secret1'); await A.waitForSelector('text=Too many wrong passwords for this username');
  await login('a@x.com', 'secret1'); await A.waitForSelector('text=Next match day');

  // the sign-up form checks usernames without exposing emails; password reset is by email only
  await A.click('text=Log out'); await A.click('text=Create an account');
  await A.fill('[name=username]', 'ANNA'); await A.fill('[name=email]', 'z@x.com'); await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]');
  await A.waitForSelector('text=That username is taken');
  assert(calls.includes('username_taken') && asked().length === 0);
  await A.click('text=Back to log in'); await A.click('text=Forgot password?');
  assert.equal(await A.getAttribute('[name=login]', 'type'), 'email', 'reset asks for an email, not a username');

  // before the database has been updated the app still works (it falls back to the old lookup)
  await A.click('text=Back to log in'); await login('a@x.com', 'secret1'); await A.waitForSelector('text=Next match day');
  st.legacyDb = true; await A.click('text=Log out'); await login('anna', 'secret1'); await A.waitForSelector('text=Next match day');
  await A.click('text=Log out'); await login('anna', 'wrongpw'); await A.waitForSelector('text=Wrong username/email or password');
  assert(calls.includes('email_for_username'), 'fallback used');
});
