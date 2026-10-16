// Run: node tests/i18n.test.js  - every text the app shows must exist in every language, with the same {placeholders}.
const assert = require('assert'), fs = require('fs');
const { LANGS, TR, PL, tp, friendly, setLangLocal } = require('../i18n.js');

const code = ['data', 'views', 'main'].map(f => fs.readFileSync(`${__dirname}/../js/${f}.js`, 'utf8')).join('\n') + fs.readFileSync(__dirname + '/../i18n.js', 'utf8').split('function friendly')[1].split('const TR')[0];
const used = new Set();
for (const m of code.matchAll(/\bt\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g)) used.add(new Function('return ' + (m[1] !== undefined ? `'${m[1]}'` : `"${m[2]}"`))());
assert(used.size > 150, 'found the t() calls: ' + used.size);

const holes = x => [...x.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
for (const lang of Object.keys(LANGS).filter(l => l !== 'en')) {
  assert(TR[lang], 'language present: ' + lang);
  const missing = [...used].filter(k => !TR[lang][k]);
  assert.deepEqual(missing, [], `${lang}: missing translations`);
  const unused = Object.keys(TR[lang]).filter(k => !used.has(k));
  assert.deepEqual(unused, [], `${lang}: translations for texts the app no longer uses (typo?)`);
  for (const k of used) assert.equal(holes(TR[lang][k]), holes(k), `${lang}: placeholders differ for "${k}"`);
  for (const [k, forms] of Object.entries(PL)) { assert(forms[lang] && forms[lang].other, `${lang}: plural "other" for ${k}`); for (const f of Object.values(forms[lang])) assert(f.includes('{n}')); }
}

// plurals follow each language's rules
setLangLocal('en'); assert.equal(tp('{n} matches', 1), '1 match'); assert.equal(tp('{n} matches', 3), '3 matches'); assert.equal(tp('{n} wins', 0), '0 wins');
setLangLocal('ro'); assert.equal(tp('{n} matches', 1), '1 meci'); assert.equal(tp('{n} matches', 3), '3 meciuri'); assert.equal(tp('{n} matches', 20), '20 de meciuri');
setLangLocal('hr'); assert.equal(tp('{n} matches', 1), '1 meč'); assert.equal(tp('{n} matches', 3), '3 meča'); assert.equal(tp('{n} matches', 5), '5 mečeva'); assert.equal(tp('{n} matches', 21), '21 meč');
setLangLocal('sv'); assert.equal(tp('{n} matches', 1), '1 match'); assert.equal(tp('{n} matches', 2), '2 matcher');

// plain-language errors
setLangLocal('en');
assert(friendly({ message: 'email rate limit exceeded' }).startsWith('Too many emails'));
assert(friendly({ code: 'over_email_send_rate_limit', message: 'x' }).startsWith('Too many emails'));
assert.equal(friendly({ message: 'Invalid login credentials' }), 'Wrong username/email or password.');
assert(friendly({ message: 'Email not confirmed' }).includes('confirm your email'));
assert(friendly({ message: 'TypeError: Failed to fetch' }).startsWith('No connection'));
assert(friendly({ message: 'A day can only be started during the play window. Ask an admin.' }).includes('play window'));
assert(friendly({ message: 'new row violates row-level security policy for table "days"' }).includes('permission'));
assert(friendly({ message: 'Could not find the function public.email_for_username(u) in the schema cache' }).includes('needs an update'));
assert.equal(friendly({ message: 'something unusual' }), 'something unusual', 'unknown errors keep their text');
setLangLocal('sv'); assert(friendly({ message: 'email rate limit exceeded' }).startsWith('För många'));
console.log('i18n tests passed (' + used.size + ' texts x ' + (Object.keys(LANGS).length - 1) + ' languages)');
