const { run } = require('./harness');
// Players leave early or arrive late: from the next match on the day is played with who is left (down to 2), the rotation restarts.
run('leave early, join late', async h => {
  const { mk, signup, st, assert, win, until } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  await A.click('button:has-text("5 players")'); await until(() => st.days[st.days.length - 1].mode === 5, 'five players chosen');
  await A.click('text=Start playing'); await A.waitForSelector('text=Match 1');
  await win(A, 1); await win(A, 2); await until(() => st.matches.length === 2, 'two matches');
  const day = () => st.days[st.days.length - 1], name = id => st.players.find(p => p.id === id).name;
  const leave = async () => { const n = day().mode, who = name(day().player_order[n - 1]);
    await A.click(`.lineup .row:has-text("${who}") >> text=Leaves`); await until(() => day().mode === n - 1, `${who} left`); return day().player_order[n - 1]; };
  await A.click('summary:has-text("More")'); await A.click('summary:has-text("Someone leaving")');
  const gone = await leave();
  assert.equal(day().rot_from, 2, 'the rotation restarts after match 2');
  await win(A, 1); await until(() => st.matches.length === 3, 'match 3');
  const m3 = st.matches[2], o = day().player_order;
  assert.deepEqual([m3.t1, m3.t2], [[o[0], o[1]], [o[2], o[3]]], 'first match of the 4-player rotation');
  assert(![...m3.t1, ...m3.t2].includes(gone), 'the one who left does not play');
  // 4 players: the same teams until one side has won 2, then the next pairing
  assert((await A.textContent('#app')).includes('Best of 3: 1–0'), 'the series score is shown');
  await win(A, 2); await until(() => st.matches.length === 4, 'match 4');
  assert.deepEqual([st.matches[3].t1, st.matches[3].t2], [m3.t1, m3.t2], '1–1: same teams');
  await win(A, 1); await until(() => st.matches.length === 5, 'match 5');
  assert.deepEqual([st.matches[4].t1, st.matches[4].t2], [m3.t1, m3.t2], 'the deciding game: same teams');
  await win(A, 1); await until(() => st.matches.length === 6, 'match 6');
  assert.deepEqual([st.matches[5].t1, st.matches[5].t2], [[o[0], o[2]], [o[1], o[3]]], '2–1 done: new teams');
  await leave(); await win(A, 1); await until(() => st.matches.length === 7, 'match 7');
  assert(st.matches[6].t1.length === 1 && st.matches[6].rest, '3 players: singles with one resting');
  await leave(); await win(A, 2); await until(() => st.matches.length === 8, 'match 8');
  assert(st.matches[7].t1.length === 1 && !st.matches[7].rest, '2 players: singles, nobody resting');
  assert(!(await A.isVisible('.lineup >> text=Leaves')), 'cannot go below 2');
  await A.click(`.lineup .row:has-text("${name(gone)}") >> text=Joins`); await until(() => day().mode === 3 && day().player_order.slice(0, 3).includes(gone), 'a late arrival joins');
  await win(A, 1); await until(() => st.matches.length === 9, 'match 9');
  const games = id => st.matches.slice(0, 8).filter(m => [...m.t1, ...m.t2].includes(id)).length, m6 = st.matches[8];
  assert(m6.rest !== gone && [m6.t1[0], m6.t2[0], m6.rest].every(x => games(m6.rest) >= games(x)), 'whoever played most rests first');
  // reset and undo must not leave a stale rotation start behind (it made a new day repeat match 1)
  await A.click('text=Undo last'); await until(() => st.matches.length === 8, 'undo');
  await A.click('text=Undo last');   // back past the late arrival
  await until(() => st.matches.length === 7 && day().rot_from === 7, 'undo before a line-up change moves the rotation start back');
  await h.more(A); await A.click('text=Reset day'); await until(() => !day().started && day().rot_from === 0, 'reset clears the rotation start');
  assert(A.errs.length === 0, A.errs.join());
});
