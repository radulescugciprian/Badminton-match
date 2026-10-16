// Run: node tests/build.test.js  - every script and stylesheet of the app is requested with the release stamp, so a new release is never served from an old cache.
const assert = require('assert'), fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const local = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map(m => m[1]).filter(u => !u.startsWith('http') && !u.startsWith('config.js'));
assert(local.length >= 7, 'found the local files: ' + local.join());
for (const u of local) assert(u.endsWith('?v=__BUILD__'), u + ' has no release stamp');
for (const u of local) assert(fs.existsSync(__dirname + '/../' + u.split('?')[0]), u + ' exists');
assert(/cache: 'no-cache'/.test(fs.readFileSync(__dirname + '/../sw.js', 'utf8')), 'the service worker revalidates');
assert(/__BUILD__/.test(fs.readFileSync(__dirname + '/../.github/workflows/pages.yml', 'utf8')), 'the deploy stamps the release');
console.log('build tests passed (' + local.length + ' files stamped)');
