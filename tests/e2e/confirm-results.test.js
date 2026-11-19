const { run } = require('./harness');
// The player resting during a match records the winner; the player resting next confirms it (or says the other team won).
// After the day is closed an admin can change a winner; a player of the team that would then lose confirms it.
run('record by the resting player, confirm by the next one; admin changes confirmed by the losers', async h => {
  const { mk, signup, st, assert, until, win } = h;
  h.defaultNow = st.now = Date.parse('2026-11-19T17:20:00Z');   // Thursday 18:20 in Berlin
  // line-up Costi, Dani, Vali, guest Zjepko, guest Ciprian: match 1 Costi+Dani v Vali+Zjepko (Ciprian rests),
  // match 2 Dani+Vali v Zjepko+Ciprian (Costi rests), match 3 (Dani rests)
  st.days.push({ id: 50, date: '2026-11-19', player_order: [3, 2, 1, 4, 5], mode: 5, started: false, closed: false, photo_path: null, rot_from: 0 });
  const A = await mk(), B = await mk(), C = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2'); await signup(C, 'Cleo', 'c@x.com', '3');
  await A.click('text=Start playing'); await B.waitForSelector('text=Match 1');
  const m = n => st.matches.find(x => x.day_id === 50 && x.n === n);
  // match 1: a guest rests, so any player of the night records it; Costi (resting next) confirms it
  await win(B, 1); await until(() => m(1), 'match 1 saved');
  assert.deepEqual([m(1).confirmed, m(1).confirm_player], [false, 3], 'waits for Costi');
  await B.waitForSelector('text=Costi is resting and records this match.'); assert(await B.locator('button.team').first().isDisabled(), "Bob can't record match 2");
  await C.waitForSelector('.rescard >> text=Please confirm match 1'); assert.equal(await B.locator('.rescard').count(), 0, 'the recorder does not confirm');
  await C.click('.rescard >> text=The other team won'); await until(() => m(1).confirmed && m(1).win === 2, 'confirmed, winner swapped');
  // match 2: Costi rests and records; Dani (resting next) confirms
  await win(C, 1); await until(() => m(2) && m(2).confirm_player === 2, 'match 2 saved, Dani confirms');
  await B.click('.rescard >> text=Right'); await until(() => m(2).confirmed && m(2).win === 1, 'confirmed as it was');
  // after closing: the admin changes the winner of match 2; Dani & Vali would lose, so Bob (Dani) confirms — not the admin who proposed it
  await A.click('.closeday'); await A.waitForSelector('h1:has-text("Results")');
  await A.click('summary:has-text("Matches")'); await A.click('[aria-label="Change the winner of match 2"]'); await until(() => m(2).fix_win === 2, 'change proposed');
  await A.waitForSelector('.mrow >> text=change waiting'); assert.equal(await A.locator('.rescard').count(), 0, 'the admin who proposed it cannot confirm');
  await B.click('nav >> text=Play'); await B.waitForSelector('.rescard >> text=An admin wants to change match 2');
  assert.equal(await C.locator('.rescard').count(), 0, 'Costi was not on that team');
  await B.click('.rescard >> text=Confirm the change'); await until(() => m(2).win === 2 && m(2).fix_win == null, 'changed');
  assert(st.log.some(x => x.action === 'fix_match'), 'logged');
  assert(A.errs.length + B.errs.length + C.errs.length === 0, [A.errs, B.errs, C.errs].join());
});
