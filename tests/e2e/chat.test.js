const { run } = require('./harness');
// Group chat: messages arrive live with an unread badge, reactions, deleting, the app's own notes, and typing survives live updates.
run('chat', async h => {
  const { mk, signup, st, assert, until } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  const B = await mk(); await signup(B, 'Bob', 'b@x.com', '2');
  await A.click('nav [data-v=group]'); await A.waitForSelector('text=No messages yet');
  await A.fill('.cform input', 'Who brings shuttles?'); await A.click('.cform button'); await until(() => st.chat.some(m => m.body === 'Who brings shuttles?'), 'message saved');
  await B.waitForSelector('.cbadge:has-text("1")');                                                  // unread badge on the other phone
  await B.click('nav [data-v=group]'); await B.waitForSelector('text=Who brings shuttles?');
  assert.equal(await B.locator('.cbadge').count(), 0, 'opening the chat marks it read');
  assert.equal(await B.locator('.cnew + .cmsg:has-text("Who brings shuttles?")').count(), 1, 'a "New messages" line marks where the unread ones start');
  assert.equal(await A.locator('.cnew').count(), 0, 'your own messages are never "new"');
  await B.fill('.cform input', 'half-typed');
  await A.fill('.cform input', 'Anyone?'); await A.click('.cform button'); await B.waitForSelector('text=Anyone?');
  assert.equal(await B.inputValue('.cform input'), 'half-typed', 'a live update keeps what you are typing');
  await B.click('.cb:has-text("Who brings shuttles?")'); await B.click('.ctools button:has-text("👍")');
  await until(() => st.chat_reactions.length === 1, 'reaction saved'); await A.waitForSelector('.crx button:has-text("👍 1")');
  assert.equal(await B.locator('.cb:has-text("Who brings shuttles?") .ctools .danger').count(), 0, 'no delete on other people\'s messages');
  await B.click('.cform button'); await until(() => st.chat.some(m => m.body === 'half-typed'), 'B sends');
  await A.click('.cb:has-text("half-typed")'); await A.click('.ctools .danger'); await until(() => !st.chat.some(m => m.body === 'half-typed'), 'admins delete any message');
  // the app's own note when someone answers
  await B.click('nav >> text=Play'); await B.click("text=I'm in"); await A.waitForSelector('.cev:has-text("is in for")');
  assert(A.errs.length === 0 && B.errs.length === 0, A.errs.concat(B.errs).join());
});
