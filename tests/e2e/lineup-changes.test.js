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
  await A.click('summary:has-text("Someone leaving")');
  const gone = await leave();
  assert.equal(day().rot_from, 2, 'the rotation restarts after match 2');
  await win(A, 1); await until(() => st.matches.length === 3, 'match 3');
  const m3 = st.matches[2], o = day().player_order;
  assert.deepEqual([m3.t1, m3.t2], [[o[0], o[1]], [o[2], o[3]]], 'first match of the 4-player rotation');
  assert(![...m3.t1, ...m3.t2].includes(gone), 'the one who left does not play');
  await leave(); await win(A, 1); await until(() => st.matches.length === 4, 'match 4');
  assert(st.matches[3].t1.length === 1 && st.matches[3].rest, '3 players: singles with one resting');
  await leave(); await win(A, 2); await until(() => st.matches.length === 5, 'match 5');
  assert(st.matches[4].t1.length === 1 && !st.matches[4].rest, '2 players: singles, nobody resting');
  assert(!(await A.isVisible('.lineup >> text=Leaves')), 'cannot go below 2');
  await A.click(`.lineup .row:has-text("${name(gone)}") >> text=Joins`); await until(() => day().mode === 3 && day().player_order[2] === gone, 'a late arrival joins');
  assert(A.errs.length === 0, A.errs.join());
});
