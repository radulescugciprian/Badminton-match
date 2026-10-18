// Run: node tests/analytics.test.js
const assert = require('assert');
const { analyse, playerOfNight, nightAwards, relations, bestPair, ratingChart } = require('../analytics.js');

const players = [1, 2, 3, 4, 5].map(id => ({ id }));
const m = (n, t1, t2, win) => ({ n, t1, t2, win });
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

// equal teams: the winners gain 16, the losers lose 16, everyone else is untouched
let a = analyse([{ id: 1, date: 'd1', matches: [m(1, [1, 2], [3, 4], 1)] }], players);
near(a.rating.get(1), 1016, 'winner'); near(a.rating.get(2), 1016, 'partner');
near(a.rating.get(3), 984, 'loser'); near(a.rating.get(5), 1000, 'resting player');
assert.equal(a.hist.get(5).length, 0);
assert.equal(playerOfNight(a, 1).delta > 0, true);

// a favourite gains less than an underdog for the same result
a = analyse([{ id: 1, date: 'd1', matches: [m(1, [1, 2], [3, 4], 1), m(2, [1, 2], [3, 4], 1)] }], players);
assert(a.rating.get(1) - 1016 < 16, 'second win is worth less');

// 5 wins in a row (across matches), counted once per run; the 6th win does not count again
const wins = n => Array.from({ length: n }, (_, i) => m(i + 1, [1, 2], [3, 4], 1));
a = analyse([{ id: 1, date: 'd1', matches: wins(6) }], players);
assert.equal(a.badges.get(1).fire, 1); assert.equal(a.badges.get(1).bestStreak, 6); assert.equal(a.badges.get(3).fire, 0);
// ...and a loss in between resets the run
a = analyse([{ id: 1, date: 'd1', matches: [...wins(4), m(5, [1, 2], [3, 4], 2), ...wins(4).map((x, i) => m(6 + i, [1, 2], [3, 4], 1))] }], players);
assert.equal(a.badges.get(1).fire, 0);

// perfect night needs 4+ matches, all won
a = analyse([{ id: 1, date: 'd1', matches: wins(4) }], players);
assert.equal(a.badges.get(1).perfect, 1); assert.equal(a.badges.get(3).perfect, 0);
a = analyse([{ id: 1, date: 'd1', matches: wins(3) }], players);
assert.equal(a.badges.get(1).perfect, 0, 'only 3 matches');
assert.deepEqual(nightAwards(analyse([{ id: 1, date: 'd1', matches: wins(4) }], players), 1).map(x => x.id + x.kind).sort(), ['1perfect', '2perfect']);

// comeback: lose the first two, finish with more wins than losses
a = analyse([{ id: 1, date: 'd1', matches: [m(1, [1, 2], [3, 4], 2), m(2, [1, 2], [3, 4], 2), m(3, [1, 2], [3, 4], 1), m(4, [1, 2], [3, 4], 1), m(5, [1, 2], [3, 4], 1)] }], players);
assert.equal(a.badges.get(1).comeback, 1); assert.equal(a.badges.get(3).comeback, 0);

// player of the night: biggest rating gain; ties go to more wins
a = analyse([{ id: 1, date: 'd1', matches: [m(1, [1, 2], [3, 4], 1), m(2, [1, 5], [3, 4], 1)] }], players);
assert.equal(playerOfNight(a, 1).id, 1);

// most improved only after several days, and only for a positive gain
const day = (id, win) => ({ id, date: 'd' + id, matches: [m(1, [1, 2], [3, 4], win)] });
a = analyse([day(1, 1), day(2, 1)], players);
assert.equal(a.badges.get(1).improved, true);
a = analyse([day(1, 2)], players);
assert.equal([...a.badges.values()].some(b => b.improved), false, 'a single day has no "improved"');

// relations: partners and opponents
const days = [{ id: 1, matches: [m(1, [1, 2], [3, 4], 1), m(2, [1, 3], [2, 4], 2), m(3, [1, 2], [3, 5], 1)] }];
const r = relations(days, 1);
assert.deepEqual(r.mate.get(2), { w: 2, g: 2 }); assert.deepEqual(r.mate.get(3), { w: 0, g: 1 });
assert.deepEqual(r.foe.get(4), { w: 1, g: 2 }); assert.equal(r.mate.get(5), undefined);
assert.deepEqual(bestPair(days, 2).ids.sort(), [1, 2]);
assert.equal(bestPair(days, 5), null, 'not enough games together');
assert.equal(bestPair(days, 2, ids => !ids.includes(1)), null, 'privacy filter hides pairs with a private player');

// chart: needs 2+ points, renders the numbers
assert.equal(ratingChart([1000]), '');
assert(ratingChart([1000, 1032, 1010]).includes('1032'));

// 3 players: winner stays, but sits out after 3 games in a row
{
  const { winnerStays } = require('../analytics.js');
  const ms = [], play = win => { const m = winnerStays([1, 2, 3], ms); ms.push({ ...m, win }); return m; };
  assert.deepEqual(play(1), { t1: [1], t2: [2], rest: 3 });          // 1 beats 2
  assert.deepEqual(play(1), { t1: [1], t2: [3], rest: 2 });          // winner 1 stays, 3 comes in; 1 wins again
  assert.deepEqual(play(1), { t1: [1], t2: [2], rest: 3 });          // 1 plays a third game in a row and wins
  assert.deepEqual(winnerStays([1, 2, 3], ms), { t1: [2], t2: [3], rest: 1 }, 'after 3 games in a row the winner sits out');
  ms.push({ t1: [2], t2: [3], rest: 1, win: 2 });                    // 3 beats 2
  assert.deepEqual(winnerStays([1, 2, 3], ms), { t1: [3], t2: [1], rest: 2 }, '1 comes back in against the winner');
}

// singles move the rating half as much as doubles
{
  const pl = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const dbl = analyse([{ id: 1, date: 'x', matches: [{ n: 1, t1: [1, 2], t2: [3, 4], win: 1 }] }], pl).rating.get(1) - 1000;
  const sgl = analyse([{ id: 1, date: 'x', matches: [{ n: 1, t1: [1], t2: [3], win: 1 }] }], pl).rating.get(1) - 1000;
  assert(Math.abs(sgl - dbl / 2) < 1e-9, 'singles count half: ' + sgl + ' vs ' + dbl);
}

console.log('analytics tests passed');
