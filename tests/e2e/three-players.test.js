const { run } = require('./harness');
// 3 players play singles: the winner stays on, but after 3 games in a row the winner sits out one game.
run('three players: winner stays', async h => {
  const { mk, signup, st, assert, win, until } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  await A.click('button:has-text("3 players")'); await until(() => st.days[st.days.length - 1].mode === 3, 'three players chosen');
  await A.click('text=Start playing'); await A.waitForSelector('text=Match 1');
  assert((await A.textContent('#app')).includes('Winner stays · game 1/3'), 'the rule is shown');
  for (let i = 0; i < 4; i++) await win(A, 1);                 // team 1 (the player on court longest) wins 4 times
  await until(() => st.matches.length === 4, 'four matches recorded');
  const p = st.matches.map(m => [m.t1[0], m.t2[0], m.rest]);
  assert(st.matches.every(m => m.t1.length === 1 && m.t2.length === 1), 'singles');
  assert.equal(p[1][0], p[0][0], 'the winner stays on'); assert.equal(p[2][0], p[0][0], 'and again');
  assert.equal(p[3][2], p[0][0], 'after 3 games in a row the winner sits out');
  // singles stay out of the doubles tables for Month and All time, and have their own view
  await A.click('nav >> text=Board'); await A.click('.seg >> text=All time'); await A.waitForSelector('text=No matches yet');
  await A.click('.seg >> text=Singles'); await A.waitForSelector('.podium');
  await A.click('.seg >> text=Day'); await A.waitForSelector('.podium');
  assert(A.errs.length === 0, A.errs.join());
});
