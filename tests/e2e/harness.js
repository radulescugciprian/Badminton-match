// Shared set-up for the browser tests: a static server for the app, a headless browser, the fake Supabase server, and helpers.
// The app is loaded unchanged; only the Supabase library is replaced (mock-client.js) and talks to mock-server.js in this process.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const server = require('./mock-server.js');
const ROOT = path.join(__dirname, '..', '..'), FIXTURES = path.join(__dirname, 'fixtures') + path.sep;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(name, body) {
  const web = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => web.listen(0, r));
  const base = `http://localhost:${web.address().port}`, browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const { st, pages } = server, h = { ...server, assert, fs, sleep, S: FIXTURES, base, defaultNow: null, calls: [] };   // calls: what the app asked the server, in order
  // a new phone (isolated browser context). opts: seenHelp (default true: skip the first-run help), now (pretend it is this time)
  h.mk = async ({ seenHelp = true, now = h.defaultNow } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block', acceptDownloads: true }), p = await ctx.newPage();
    p.errs = []; p.alerts = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('dialog', d => { if (d.type() === 'alert') p.alerts.push(d.message()); d.accept(d.type() === 'prompt' ? (p.promptAnswer || 'Eve') : undefined); });
    await p.exposeFunction('__rpc', async (u, r) => { h.calls.push(r.op === 'rpc' ? r.name : `${r.op} ${r.table || ''}`.trim()); if (st.delay) await sleep(st.delay); return server.rpc(u, r); });
    await p.exposeFunction('__auth', (op, a) => server.auth(op, a));
    await p.route('**/supabase.js', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'mock-client.js')) }));
    await p.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.CONFIG={url:'https://x.supabase.co',key:'k'}" }));
    await p.route('http://localhost:8766/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from(st.files[r.request().url().replace('http://localhost:8766/', '')]) }));
    await p.addInitScript(({ seen, t0 }) => {
      if (seen) localStorage.setItem('seenHelp', '1');
      const R = Date; window.__t = t0;                                   // lets a test move the app's clock: window.__t = timestamp
      window.Date = class extends R { constructor(...a) { a.length === 0 && window.__t ? super(window.__t) : super(...a); } static now() { return window.__t || R.now(); } };
    }, { seen: seenHelp, t0: now });
    pages.push(p); await p.goto(base + '/index.html'); return p;
  };
  h.signup = async (p, name, email, player = '', wait = 'text=Next match day') => {
    await p.click('text=Create an account'); await p.fill('[name=username]', name); await p.selectOption('[name=player]', player);
    await p.fill('[name=email]', email); await p.fill('[name=password]', 'secret1'); await p.click('button[type=submit]'); await p.waitForSelector(wait);
  };
  h.until = async (fn, what = 'condition', ms = 8000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(50); } };   // wait for the server side of something
  h.win = async (p, team = 1) => { await sleep(750); await p.click(`text=Team ${team} Wins`); };   // a second tap within 0.7s counts as a double tap
  let failed = false;
  try { await body(h); console.log('ok  ' + name); }
  catch (e) {
    failed = true; console.error('FAIL ' + name + ': ' + e.message.split('\n').slice(0, 3).join(' '));
    for (const p of pages) console.error('  page:', (await p.textContent('#app').catch(() => '?')).replace(/\s+/g, ' ').slice(0, 200), p.errs.join(), p.alerts.join(' | '));
  }
  await browser.close(); web.close();
  if (failed) process.exit(1);
}
module.exports = { run };
