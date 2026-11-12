const { run } = require('./harness');
// Adding a picture opens a crop screen first: pick a shape, move/zoom/turn, then "Use photo" (or cancel).
run('crop a picture before upload', async h => {
  const { mk, signup, assert, st, until, S } = h;
  const A = await mk(); await signup(A, 'Anna', 'a@x.com', '1');
  // a 400×200 test picture; the result of cropPhoto is measured in the page
  const crop = async (opts, steps) => {
    await A.evaluate(o => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; c.getContext('2d').fillRect(0, 0, 400, 200);
      c.toBlob(b => { window.__crop = cropPhoto(b, o).then(r => r ? createImageBitmap(r).then(i => [i.width, i.height]) : null); }); }, opts);
    await A.waitForSelector('#crop canvas'); await steps(); return A.evaluate(() => window.__crop);
  };
  assert.deepEqual(await crop({ shapes: ['free', '1:1'] }, () => A.click('#crop [data-ok]')), [400, 200], 'Original keeps the whole picture, full size');
  assert.deepEqual(await crop({ shapes: ['free', '1:1'] }, async () => { await A.click('#crop [data-shape="1:1"]'); await A.click('#crop [data-ok]'); }), [200, 200], 'Square crops the middle');
  assert.deepEqual(await crop({ shapes: ['free'] }, async () => { await A.click('#crop [data-turn]'); await A.click('#crop [data-ok]'); }), [200, 400], 'turned by 90°');
  const zoomed = await crop({ shapes: ['1:1'], round: true }, async () => { await A.fill('#crop input[type=range]', '2'); await A.dispatchEvent('#crop input[type=range]', 'input'); await A.click('#crop [data-ok]'); });
  assert.deepEqual(zoomed, [100, 100], 'zoomed in 2×: half as many pixels kept');
  assert.equal(await crop({}, () => A.click('#crop [data-no]')), null, 'cancel: nothing is uploaded');
  assert.equal(await A.locator('#crop').count(), 0, 'the crop screen closes');
  // the real flow: a new profile photo goes through the crop screen, then uploads
  await A.click('.top .me'); await A.click('text=Change photo'); await A.setInputFiles('#pick', S + 'red.png');
  await A.waitForSelector('#crop'); assert.equal(await A.locator('#crop [data-shape]').count(), 0, 'profile photos are always square');
  await A.click('#crop [data-ok]'); await until(() => st.files['avatars/p1.jpg'], 'uploaded after cropping');
  assert(A.errs.length === 0, A.errs.join());
});
