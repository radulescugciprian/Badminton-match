const { run } = require('./harness');
// Only you or an admin change your answer. Past the deadline you ask an admin, who opens the sign-up for you (that day only).
run('late answers: ask an admin to open it for you', async h => {
  const { mk, signup, st, assert, until } = h;
  h.defaultNow = st.now = Date.parse('2026-11-19T15:45:00Z');   // Thursday 16:45 in Berlin: answers closed at 16:30, the card still shows
  const A = await mk(), B = await mk(), C = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2'); await signup(C, 'Cleo', 'c@x.com', '3');
  const today = '.rsvp[data-day="2026-11-19"]';   // tonight's card (the later weeks are still open)
  await B.waitForSelector('text=Answers closed at 16:30.');
  assert.equal(await B.locator(today + ' .seg button').count(), 0, 'no answer buttons after the deadline');
  await B.waitForSelector(today + ' .chips'); assert.equal(await B.locator(today + ' .chips button').count(), 0, 'members cannot answer for anyone else');
  // Bob asks; the admins see it on the sign-up card (and a dot on Play)
  await B.click('text=Ask an admin to change my answer'); await until(() => st.rsvp_unlocks.some(u => u.player_id === 2 && !u.opened), 'request saved');
  await B.waitForSelector('text=You asked an admin to open it for you.');
  await A.waitForSelector('.unlockreq >> text=Dani asks to change their answer.');
  assert((await A.textContent('nav [data-v=play]')).includes('•'), 'a dot on Play for the admin');
  await A.click('.unlockreq >> text=Open for Dani'); await until(() => st.rsvp_unlocks.some(u => u.player_id === 2 && u.opened), 'opened');
  // now Bob answers himself; Cleo is still closed
  await B.waitForSelector('text=An admin opened the sign-up for you.'); await B.click(today + " .seg >> text=I'm out");
  await until(() => st.rsvps.some(r => r.player_id === 2 && r.day_date === '2026-11-19' && r.status === 'out'), "Bob's own answer saved");
  assert.equal(await C.locator(today + ' .seg button').count(), 0, 'still closed for everyone else');
  assert(A.errs.length + B.errs.length + C.errs.length === 0, [A.errs, B.errs, C.errs].join());
});
