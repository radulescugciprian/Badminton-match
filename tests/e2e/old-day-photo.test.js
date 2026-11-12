const { run } = require('./harness');
const path = require('path');
// Admins add a group photo to a day that was closed without one (Photos tab), or replace it later (Board → Day → ⋯).
run('photo for an earlier day', async h => {
  const { mk, signup, st, assert, until } = h;
  st.days.push({ id: 77, date: '2026-10-29', player_order: [1, 2, 3, 4, 5], mode: 5, started: true, closed: true, photo_path: null, rot_from: 0 });
  st.matches.push({ id: 770, day_id: 77, n: 1, t1: [1, 2], t2: [3, 4], rest: 5, win: 1, created_at: '2026-10-29T17:00:00Z' });
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  const B = await mk(); await signup(B, 'Bob', 'b@x.com', '2');
  const img = path.join(__dirname, '..', '..', 'icon-192.png');
  await A.click('nav >> text=Photos'); await A.waitForSelector('.addold >> text=Add a photo to an earlier day');
  const [fc] = await Promise.all([A.waitForEvent('filechooser'), A.click('.addold >> text=Choose photo')]); await fc.setFiles(img); await A.click('#crop [data-ok]');
  await until(() => st.days.find(d => d.id === 77).photo_path === 'days/77.jpg' && st.files['days/77.jpg'], 'photo stored for that day');
  await A.waitForSelector('.grid img'); assert.equal(await A.locator('.addold').count(), 0, 'no day left without a photo');
  // replace it later from the Board
  const before = st.files['days/77.jpg'].length;
  await A.click('nav >> text=Board'); await A.click('.seg >> text=Day'); await A.evaluate(() => { dayMore = true; render(); });
  const [fc2] = await Promise.all([A.waitForEvent('filechooser'), A.click('text=Replace the group photo')]); await fc2.setFiles(path.join(__dirname, '..', '..', 'icon-512.png')); await A.click('#crop [data-ok]');
  await until(() => st.files['days/77.jpg'].length !== before, 'replaced');
  // members do not get these options
  await B.click('nav >> text=Photos'); await B.waitForSelector('.grid img'); assert.equal(await B.locator('.addold').count(), 0);
  assert(A.errs.length === 0 && B.errs.length === 0, A.errs.concat(B.errs).join());
});
