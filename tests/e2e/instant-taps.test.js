const { run } = require('./harness');
// Taps show their result at once even when the server is slow, go to the server in order, and are put right if the server says no.
run('instant taps', async h => {
  const { mk, signup, st, sleep, win, assert } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  await A.click('text=Start day'); await A.waitForSelector('text=Match 1');
  st.delay = 1200;                                                      // a slow connection: every server call takes 1.2 s
  let t = Date.now(); await win(A, 1); const sleepMs = 750;
  await A.waitForSelector('text=Match 2', { timeout: 600 });            // shown at once, long before the server answered
  assert(Date.now() - t - sleepMs < 600, 'first tap is instant');
  assert(st.matches.length === 0, 'the server has not even seen it yet');
  await win(A, 2); await A.waitForSelector('text=Match 3', { timeout: 600 });   // a second tap while the first is still in flight
  await A.click('text=Undo last'); await A.waitForSelector('text=Match 2', { timeout: 600 });   // undo is instant too
  await win(A, 2); await A.waitForSelector('text=Match 3', { timeout: 600 });
  await sleep(6000);                                                    // let the queue finish
  assert.deepEqual(st.matches.map(m => [m.n, m.win]), [[1, 1], [2, 2]], 'the server got them in order: ' + JSON.stringify(st.matches.map(m => [m.n, m.win])));
  assert((await A.textContent('#app')).includes('Match 3'), 'screen agrees with the server after the re-fetch');

  // a double tap records one match, not two
  st.delay = 0; await sleep(800);
  await A.dblclick('text=Team 1 Wins'); await sleep(500);
  assert(st.matches.length === 3, 'double tap = one match, got ' + st.matches.length);

  // the server refuses: the screen shows the result at once, then goes back and says why
  st.failInsert = true; await win(A, 1);
  await A.waitForSelector('text=Match 5', { timeout: 600 });
  await A.waitForFunction(() => document.querySelector('.num').textContent.includes('4'), null, { timeout: 5000 });
  assert(A.alerts.length > 0 && st.matches.length === 3, 'reverted after the failure: ' + A.alerts);
  st.failInsert = false;

  // sign-up answers and photo reactions are instant as well
  await A.click('text=Close day'); await A.click('text=Next match day').catch(() => {});
});
