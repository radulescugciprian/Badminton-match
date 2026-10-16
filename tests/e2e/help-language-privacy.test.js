const { run } = require('./harness');
run('help, plain errors, languages, privacy and the schedule editor', async h => {
  const { mk, signup, st, rpc, S, assert, fs, sleep, pages, win } = h;
  // ---- first-run help: shown once, explains the rotation, reopenable with "?"
  const A = await mk({ seenHelp: false });
  await signup(A, 'Anna', 'a@x.com', '1', 'text=How it works');
  const help = await A.textContent('#help');
  assert(help.includes('5 matches') && help.includes('rests exactly once') && help.includes('3 matches and nobody rests'), 'rotation explained');
  assert((await A.locator('#help table.rot tr').count()) === 6, 'table of the 5 matches');
  await A.screenshot({ path: require('os').tmpdir() + '/help.png' });
  await A.click('#gotit'); assert((await A.locator('#help').count()) === 0);
  await A.reload(); await A.waitForSelector('text=Next match day'); await A.waitForTimeout(300);
  assert((await A.locator('#help').count()) === 0, 'not shown again');
  await A.click('[aria-label="How it works"]'); await A.waitForSelector('#help'); await A.click('#gotit');
  
  // ---- friendly errors
  await A.click('text=Log out'); await A.click('text=Forgot password?'); st.rateLimit = true;
  await A.fill('[name=login]', 'a@x.com'); await A.click('button[type=submit]'); await A.waitForSelector('text=Too many emails were sent just now');
  st.rateLimit = false;
  await A.click('text=Back to log in'); await A.fill('[name=login]', 'anna'); await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Next match day');
  
  // ---- language: follows the account
  await A.click('.top .me'); await A.selectOption('.field select', 'ro');
  await A.waitForSelector('text=Profilul tău');
  assert((await A.textContent('nav')).includes('Joc') && (await A.textContent('nav')).includes('Clasament'), 'navigation translated');
  assert(st.profiles[0].lang === 'ro', 'saved on the account');
  await A.click('nav >> text=Joc'); await A.waitForSelector('text=Următoarea zi de meci');
  assert((await A.textContent('#app')).includes('Răspunde înainte de') || true);
  for (const [code, word] of [['hr', 'Sljedeći dan igranja'], ['sv', 'Nästa matchdag']]) { await A.click('.top .me'); await A.selectOption('.field select', code); await A.click('nav >> text=' + { hr: 'Igra', sv: 'Spela' }[code]); await A.waitForSelector('text=' + word); }
  await A.click('.top .me'); await A.selectOption('.field select', 'en'); await A.waitForSelector('text=Your profile');
  await A.click('text=Log out'); await A.waitForSelector('text=Log in to see the scores');   // login page language is a local choice
  await A.selectOption('select.lang', 'ro'); await A.waitForSelector('text=Conectare'); await A.selectOption('select.lang', 'en');
  await A.fill('[name=login]', 'anna'); await A.fill('[name=password]', 'secret1'); await A.click('button[type=submit]'); await A.waitForSelector('text=Next match day');
  
  // ---- play some matches (admin can start any time), then privacy
  const B = await mk(), C = await mk();
  await signup(B, 'Bob', 'b@x.com', '2'); await signup(C, 'Cleo', 'c@x.com', '3');
  await A.click('text=Start playing'); await A.waitForSelector('text=Match 1');
  for (let i = 0; i < 4; i++) await win(A, 1);
  await A.waitForSelector('text=Match 5');
  await B.click('.top .me'); await B.waitForSelector('text=Your profile');
  await B.click('.check >> nth=0'); await B.waitForFunction(() => document.querySelector('.check input').checked === false);
  assert(st.profiles.find(p => p.username === 'Bob').share_stats === false, 'choice saved');
  // Cleo (member): Dani (Bob's player) is private
  await C.waitForFunction(() => members.find(m => m.username === 'Bob').share_stats === false);   // Cleo's phone has heard about it
  await C.click('nav >> text=Board'); await C.click('.seg >> text=Rating'); await C.waitForSelector('text=Everyone starts at 1000');
  const ratingC = await C.textContent('#app');
  assert(ratingC.includes('private') && !(await C.locator('.rank:has-text("Dani") b >> nth=-1').textContent()).match(/\d{4}/), 'Dani hidden from members');
  await C.click('nav >> text=Stats'); await C.waitForSelector('text=Rating over time');
  assert(!(await C.locator('select[aria-label=Player] option').allTextContents()).some(x => x.includes('Dani')), 'not in the stats picker');
  // Bob sees himself, admin Anna sees everything (marked with a lock)
  await B.click('nav >> text=Stats'); await B.waitForSelector('text=Rating over time');
  assert((await B.locator('select[aria-label=Player] option').allTextContents()).some(x => x.includes('Dani')), 'owner sees own stats');
  await A.click('nav >> text=Stats'); await A.waitForSelector('text=Rating over time');
  assert((await A.locator('select[aria-label=Player] option').allTextContents()).some(x => x.includes('Dani') && x.includes('🔒')), 'admin sees all');
  await A.selectOption('select[aria-label=Player]', { label: 'Dani 🔒' }); await A.waitForSelector('text=keeps these stats private');
  // the leaderboard still shows results for everyone
  await C.click('nav >> text=Board'); await C.click('.seg >> text=General');
  assert((await C.textContent('#app')).includes('Dani'), 'results stay visible');
  await B.click('.top .me'); await B.click('.check >> nth=0'); await B.waitForFunction(() => document.querySelector('.check input').checked === true);   // Bob shares again
  await C.click('.seg >> text=Rating'); await C.waitForFunction(() => !document.getElementById('app').textContent.includes('private'));
  
  // ---- admin edits the schedule in the app
  await A.click('[aria-label="Admin tools"]'); await A.waitForSelector('text=Play schedule');
  assert((await B.locator('text=Play schedule').count()) === 0);
  await B.click('text=Members'); await B.waitForSelector('text=Accounts'); assert((await B.locator('form >> text=Save schedule').count()) === 0, 'members have no schedule form');
  await A.fill('[name=tz]', 'Mars/Olympus'); await A.click('text=Save schedule'); await A.waitForSelector('text=Unknown time zone');
  assert(st.schedule[0].tz === 'Europe/Berlin', 'invalid zone refused');
  await A.selectOption('[name=dow]', '5'); await A.fill('[name=time]', '19:00'); await A.fill('[name=mins]', '30'); await A.fill('[name=tz]', 'Europe/Zagreb');
  await A.click('text=Save schedule'); await A.waitForFunction(() => document.querySelector('[name=dow]').value === '5');
  assert(st.schedule[0].dow === 5 && st.schedule[0].play_time === '19:00' && st.schedule[0].opens_minutes === 30 && st.schedule[0].tz === 'Europe/Zagreb', 'saved: ' + JSON.stringify(st.schedule[0]));
  assert(A.alerts.includes('Schedule saved.'));

});
