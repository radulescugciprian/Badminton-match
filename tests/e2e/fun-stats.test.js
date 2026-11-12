const { run } = require('./harness');
// Less pressure on points: hide your rating, badges for showing up, and a monthly recap you can share.
run('hide rating, showing-up badges, monthly recap', async h => {
  const { mk, signup, st, assert, until } = h;
  ['2026-09-10', '2026-09-17', '2026-10-01', '2026-10-08', '2026-10-15'].forEach((date, i) => {   // Vali plays 5 nights in a row
    st.days.push({ id: 90 + i, date, player_order: [1, 2, 3, 4, 5], mode: 5, started: true, closed: true, photo_path: null, rot_from: 0 });
    [[[1, 2], [3, 4], 5, 1], [[2, 3], [4, 5], 1, 1], [[3, 5], [1, 4], 2, 2]].forEach(([t1, t2, rest, win], n) => st.matches.push({ id: 900 + i * 10 + n, day_id: 90 + i, n: n + 1, t1, t2, rest, win, created_at: date + 'T17:00:00Z' }));
  });
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  await A.waitForSelector('.chal >> text=Challenge of the week'); assert((await A.textContent('.chal')).includes('Play this week to take part'), 'the weekly challenge, nothing played yet this week');
  await A.click('nav >> text=Stats'); await A.waitForSelector('.badge:has-text("5 nights in a row")');
  // the player card: bronze for 5 nights, its stats, and a picture to share
  await A.waitForSelector('img.pcimg[src^="blob:"]');
  assert(/win rate 100%, best run 10, matches 10/.test(await A.getAttribute('img.pcimg', 'alt')), 'the card picture, described for screen readers');
  assert.equal(await A.evaluate(() => cardSpec(1).tier), 'bronze', 'bronze under 10 nights');
  assert((await A.evaluate(() => cardSpec(1).footer)).includes('Autumn 2026'), 'the season');
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('text=Share card')]);
  assert.equal(dl.suggestedFilename(), 'badminton-Vali.png');
  // the recap of the last finished month, with your own cards, and a WhatsApp share
  await A.click('.recapbtn'); await A.waitForSelector('#recap .rcard');
  const txt = await A.textContent('#recap');
  assert(txt.includes('October 2026') && txt.includes('You played 6 matches on 3 nights') && txt.includes('Ever-present'), txt.slice(0, 300));
  await A.click('#recap [aria-label="Previous month"]'); await A.waitForSelector('#recap >> text=September 2026');
  await A.click('#rshare'); assert(decodeURIComponent(await A.evaluate(() => window.__wa || '')).includes('September 2026'), 'shared to WhatsApp');
  await A.click('#rclose'); assert.equal(await A.locator('#recap').count(), 0);
  // hall of fame in the Group tab, and the season album + card collection under Stats
  await A.click('nav >> text=Group'); await A.click('.seg >> text=Hall of fame'); await A.waitForSelector('.hof');
  const hof = await A.textContent('#app'); assert(hof.includes('Longest win streak') && hof.includes('Most nights played'), hof.slice(0, 300));
  await A.click('nav >> text=Stats'); await A.click('.stseg >> text=Collection'); await A.waitForSelector('.album .stk');
  assert.equal(await A.locator('.album .stk').count(), 9, 'nine stickers'); assert(await A.locator('.ccard').count() >= 1, 'cards to collect');
  await A.click('.stseg >> text=Badges');
  // hide my rating: no number and no rank, but the badges stay
  await A.click('.top .me'); await A.click('[data-row=hiderating]'); await A.click('text=Hide my rating number and rank');
  await until(() => st.profiles.find(p => p.username === 'Anna').hide_rating === true, 'saved');
  await A.click('nav >> text=Board'); await A.waitForSelector('.rank:has-text("Vali") >> text=just playing');
  assert.equal(await A.locator('.podium >> text=Vali').count(), 0, 'not on the podium');
  await A.click('nav >> text=Stats'); await A.waitForSelector('.badge:has-text("5 nights in a row")');
  assert(!(await A.textContent('#app')).includes('Rating over time'), 'no rating chart');
  assert(A.errs.length === 0, A.errs.join());
});
