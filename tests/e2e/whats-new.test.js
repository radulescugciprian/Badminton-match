const { run } = require('./harness');
// After an update everyone sees "What's new" once, can share it on WhatsApp, and can open it again from the help screen.
run("what's new", async h => {
  const { mk, signup, assert } = h;
  const A = await mk({ seenNews: false }); await signup(A, 'Anna', 'a@x.com', '1', "#news >> text=What's new");   // used the app before this release
  await A.click('#newsshare'); assert(decodeURIComponent(await A.evaluate(() => window.__wa)).includes("What's new in our badminton app"), 'shared');
  await A.click('#newsok'); await A.reload(); await A.waitForSelector('text=Next match day'); await A.waitForTimeout(800);
  assert.equal(await A.locator('#news').count(), 0, 'only once');
  await A.click('#helpbtn'); await A.click('#newsbtn'); await A.waitForSelector('#news .news li');
  const B = await mk({ seenHelp: false }); await signup(B, 'Bob', 'b@x.com', '2', '#tour .tip');   // new people get the tour, not the news
  assert.equal(await B.locator('#news').count(), 0);
  assert(A.errs.length === 0 && B.errs.length === 0, A.errs.concat(B.errs).join());
});
