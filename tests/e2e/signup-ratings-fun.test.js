const { run } = require('./harness');
run('sign-up list, ratings, badges, result card and reactions', async h => {
  const { mk, signup, st, rpc, S, assert, fs, sleep, pages, win, until } = h;
  h.defaultNow = st.now = Date.parse('2026-10-14T10:00:00Z');   // Wednesday noon in Berlin: the sign-up is for Thursday 15 Oct
  const A = await mk(), B = await mk(), C = await mk();
  await signup(A, 'Anna', 'a@x.com', '1'); await signup(B, 'Bob', 'b@x.com', '2'); await signup(C, 'Cleo', 'c@x.com', '3');
  
  // ---- sign-up fills the player list
  assert((await A.textContent('.card')).includes('15 Oct'), 'sign-up is for Thursday 15 Oct');
  await B.click("text=I'm out"); await A.click("text=I'm in"); await C.click("text=I'm in");
  await A.click('text=Details'); await A.waitForSelector('.chips');
  await A.click('[aria-label="Answer for Zjepko"]'); await A.click('[aria-label="Answer for Ciprian"]');   // admin answers for guests
  await A.waitForFunction(() => document.querySelectorAll('.row').length === 5 && document.querySelector('.row:last-child .nm').textContent.includes('Dani'));
  await until(() => st.days[st.days.length - 1].mode === 4, 'the list and the 4-player mode to follow the answers');
  const d0 = st.days[st.days.length - 1];
  assert(d0.player_order.join() === '1,3,4,5,2', 'players who are in first, Dani (out) last: ' + d0.player_order);
  assert(d0.mode === 4, '4 confirmed -> 4 play');
  assert.equal(await A.locator('button:has-text("5 players")').count(), 0, 'no 4/5 switch: the sign-ups decide');
  assert(rpc('u2', { table: 'rsvps', op: 'upsert', payload: { day_date: '2026-10-15', player_id: 1, status: 'out' } }).error, 'cannot answer for someone else');
  assert(!st.rsvps.some(x => x.player_id === 1 && x.status === 'out'));
  await B.click("text=I'm in");                                                                       // Dani changes their mind -> 5 players
  await until(() => st.days[st.days.length - 1].mode === 5, 'five players once everybody is in');
  assert(st.days[st.days.length - 1].mode === 5);
  await B.click("text=I'm out"); await until(() => st.days[st.days.length - 1].mode === 4, 'four players again');
  
  // calendar reminder
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('text=Remind me every Thursday')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  assert(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=TH') && ics.includes('DTSTART;TZID=Europe/Berlin:20261015T173000') && ics.includes('TRIGGER:PT0M') && ics.includes('TZID:Europe/Berlin'), 'ics content');
  
  // ---- play: team names, celebration
  await A.click('text=Start day'); await A.waitForSelector('text=Match 1');
  A.promptAnswer = 'Smashers'; await A.click('.team >> nth=0 >> .tname'); await A.waitForSelector('text=Smashers');
  await win(A, 1);
  await A.waitForSelector('canvas.confetti', { timeout: 3000 });
  await A.waitForSelector('text=Match 2');
  assert(st.matches[0].team1_name === 'Smashers' && !st.matches[0].team2_name, 'team name saved with the match');
  assert(!(await A.textContent('.team')).includes('Smashers'), 'name resets for the next match');
  for (let i = 0; i < 3; i++) await win(A, 1);
  await A.waitForSelector('text=Match 5');
  
  // ---- close day: player of the night, awards, result card
  await A.click('text=Close day'); await A.waitForSelector('text=Player of the night');
  assert((await A.textContent('.potn')).includes('Vali'), 'Vali won everything');
  assert((await A.textContent('#app')).includes('Perfect night'), 'perfect night award');
  const [card] = await Promise.all([A.waitForEvent('download'), A.click('text=Share result card')]);
  await card.saveAs(require('os').tmpdir() + '/card.png');
  const png = fs.readFileSync(require('os').tmpdir() + '/card.png'); assert(png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1350, 'PNG 1080x1350');
  await C.click('nav >> text=Play'); await C.click('text=Take group photo'); await C.setInputFiles('#shot', S + 'red.png'); await C.waitForSelector('text=Photo saved');
  
  // ---- reactions on the photo
  await A.click('nav >> text=Photos'); await B.click('nav >> text=Photos'); await A.waitForSelector('.grid img'); await B.waitForSelector('.grid img');
  await A.click('.grid button >> nth=0'); await B.click('.grid button >> nth=0'); await B.waitForSelector('#rx button');
  await B.click('#rx [aria-label=clap]'); await A.waitForSelector('#rx [aria-label=clap].on, #rx [aria-label=clap]:has-text("1")');
  assert((await A.textContent('#rx')).includes('👏 1'), 'A sees B’s clap live');
  await A.click('#rx [aria-label=fire]'); await B.waitForSelector('#rx [aria-label=fire]:has-text("1")');
  await B.click('#rx [aria-label=clap]'); await A.waitForFunction(() => !document.querySelector('#rx [aria-label=clap]').textContent.includes('1'));   // toggled off
  assert(st.reactions.length === 1 && st.reactions[0].kind === 'fire');
  await A.click('#lb >> text=Close'); await B.click('#lb >> text=Close');
  
  // ---- stats + rating
  await A.click('nav >> text=Stats'); await A.waitForSelector('text=Rating over time');
  const sx = await A.textContent('#app');
  assert(sx.includes('Perfect night') && sx.includes('Partners') && sx.includes('Best pair') && (await A.locator('svg[aria-label^="Rating over time"]').count()) === 1, 'stats page parts');
  await A.screenshot({ path: require('os').tmpdir() + '/stats.png', fullPage: true });
  await A.click('nav >> text=Board'); await A.click('.seg >> text=Rating'); await A.waitForSelector('text=Everyone starts at 1000');
  assert((await A.textContent('.card .rank >> nth=0')).includes('Vali'), 'highest rating first');
  await A.click('.seg >> text=Day'); await A.waitForSelector('text=Smashers');                              // match list shows the team name
  await A.screenshot({ path: require('os').tmpdir() + '/board2.png', fullPage: true });
  // ---- admin resets the answers for the coming play date
  await A.click('nav >> text=Play'); await A.click('text=Start next match day'); await A.waitForSelector('text=Reset answers');
  assert((await B.locator('text=Reset answers').count()) === 0, 'members have no reset button');
  assert(st.rsvps.length > 0);
  await A.click('text=Reset answers');
  await A.waitForFunction(() => !document.getElementById('app').textContent.includes('Reset answers'));
  assert(st.rsvps.length === 0, 'all answers cleared');
  await B.click('nav >> text=Play'); await B.waitForFunction(() => document.querySelector('.card').textContent.includes('0 in'));
  assert(rpc('u2', { table: 'rsvps', op: 'delete', f: [['eq', 'day_date', '2026-10-15']] }) && true);

});
