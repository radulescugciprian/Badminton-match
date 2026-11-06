const { run } = require('./harness');
// Video tips (Group → Videos, the chat is off for now): admins share YouTube links (played in the app) or short clips from the phone; everyone watches, sorted by topic.
run('video tips', async h => {
  const { mk, signup, st, assert, until } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  const B = await mk(); await signup(B, 'Bob', 'b@x.com', '2');
  await A.click('nav [data-v=group]'); assert.equal(await A.locator('.seg >> text=Chat').count(), 0, 'the chat is off'); await A.click('.seg >> text=Videos'); await A.waitForSelector('text=No video tips yet');
  await A.click('button:has-text("Add a video tip")');
  await A.fill('[name=title]', 'x'); await A.click('text=Share with everyone'); await A.waitForSelector('.msg:has-text("Paste the link")');   // a title alone is not enough
  await A.fill('[name=url]', 'https://youtu.be/dQw4w9WgXcQ?si=x'); await A.fill('[name=title]', 'High serve'); await A.selectOption('[name=topic]', 'serve');
  await A.click('text=Share with everyone'); await until(() => st.tips.length === 1, 'link saved');
  await A.click('button:has-text("Add a video tip")'); await A.fill('[name=title]', 'Split step'); await A.selectOption('[name=topic]', 'footwork');
  await A.setInputFiles('[name=clip]', { name: 'drill.MOV', mimeType: 'video/quicktime', buffer: Buffer.from('fake video') });
  await A.click('text=Share with everyone'); await until(() => st.tips.length === 2, 'clip saved');
  const clip = st.tips.find(x => x.video_path); assert(/^tips\/.+\.mov$/.test(clip.video_path) && st.files[clip.video_path], 'the clip is stored under tips/');
  // everyone watches; only admins add or remove
  await B.click('nav [data-v=group]'); await B.waitForSelector('.tip:has-text("High serve") img[src*="dQw4w9WgXcQ"]');
  assert.equal(await B.locator('button:has-text("Add a video tip")').count() + await B.locator('.tdel').count(), 0, 'members cannot add or remove');
  await B.click('.tip:has-text("High serve") .thumb'); await B.waitForSelector('#player iframe[src*="embed/dQw4w9WgXcQ"]'); await B.click('#player .ptop button');
  await B.click('.tip:has-text("Split step") .thumb'); await B.waitForSelector('#player video[src*="tips/"]'); await B.click('#player .ptop button');
  await B.click('.chips >> text=Footwork'); assert.equal(await B.locator('.tip').count(), 1, 'filter by topic');
  await A.click('.tip:has-text("Split step") .tdel'); await until(() => st.tips.length === 1 && !st.files[clip.video_path], 'removed with its file');
  assert(A.errs.length === 0 && B.errs.length === 0, A.errs.concat(B.errs).join());
});
