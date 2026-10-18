// The match rules for 2-5 players, checked over thousands of random evenings (logic taken straight from js/data.js).
const fs = require('fs'), assert = require('assert');
const { winnerStays } = require('../analytics.js');
const src = fs.readFileSync(require('path').join(__dirname, '../js/data.js'), 'utf8');
const grab = re => src.match(re)[0];
eval([grab(/const C5 = \[[\s\S]*?\n\];/), grab(/const C4 = .*;/), grab(/const series = .*;/), grab(/const cycAt = .*;/), grab(/const slots = .*;/), grab(/function nextTeams\(d\) \{[\s\S]*?\n\}/)].join('\n').replace(/const (\w+) =/g, 'global.$1 ='));
const P = [1, 2, 3, 4, 5], key = (a, b) => [a, b].sort().join();
const play = (mode, wins) => { const d = { order: P.slice(0, mode), mode, matches: [], rotFrom: 0 }; for (const w of wins) d.matches.push({ ...nextTeams(d), win: w }); return d.matches; };
const rnd = n => Array.from({ length: n }, () => 1 + (Math.random() < .5));
// 5 players: per 5 matches everyone rests once and partners each other player once
for (let k = 0; k < 200; k++) { const ms = play(5, rnd(10));
  for (let r = 0; r < 2; r++) { const c = ms.slice(r * 5, r * 5 + 5), rests = c.map(m => m.rest).sort(), pairs = c.flatMap(m => [key(...m.t1), key(...m.t2)]);
    assert.deepEqual(rests, P); assert.equal(new Set(pairs).size, 10); } }
// 4 players: same teams until one side has 2 wins, then the next split; 3 splits = everyone partners everyone
for (let k = 0; k < 2000; k++) { const ms = play(4, rnd(12)); let w = [0, 0], split = 0, seen = [];
  for (const m of ms) { assert.equal(m.rest, null); const s = [key(...m.t1), key(...m.t2)].sort().join('|');
    if (!seen.length || seen[seen.length - 1] !== s) { if (seen.length) assert(Math.max(...w) === 2, 'teams only change after a best of 3'); seen.push(s); w = [0, 0]; }
    w[m.win - 1]++; assert(Math.max(...w) <= 2); }
  const firstThree = new Set(seen.slice(0, 3).flatMap(s => s.split('|'))); if (seen.length >= 3) assert.equal(firstThree.size, 6, 'all 6 partnerships in one cycle'); }
// 3 players: singles, winner stays, nobody wins more than 3 in a row, the resting player always comes on next
for (let k = 0; k < 2000; k++) { const ms = play(3, rnd(30)); let run = {};
  ms.forEach((m, i) => { assert(m.t1.length === 1 && m.rest); const on = [m.t1[0], m.t2[0]];
    if (i) { assert(on.includes(ms[i - 1].rest), 'the one who rested plays next');
      const prevWin = (ms[i - 1].win === 1 ? ms[i - 1].t1 : ms[i - 1].t2)[0]; if (on.includes(prevWin)) assert(true); else assert.equal(m.rest, prevWin, 'a winner only leaves to rest'); }
    const w = (m.win === 1 ? m.t1 : m.t2)[0]; run = { [w]: (run[w] || 0) + 1 }; assert(run[w] <= 3, 'max 3 wins in a row');
    if (ms[i + 1]) assert.equal(ms[i + 1].rest === w, run[w] === 3, 'the winner rests exactly after 3 wins in a row'); }); }
// 2 players: singles, nobody rests
for (const m of play(2, rnd(5))) assert(m.t1.length === 1 && m.t2.length === 1 && m.rest === null);
console.log('rules tests passed');
