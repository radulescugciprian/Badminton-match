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

// doubles and singles have their own ratings: a singles match never moves the doubles rating, and the other way round
{
  const pl = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const a = analyse([{ id: 1, date: 'x', matches: [{ n: 1, t1: [1, 2], t2: [3, 4], win: 1 }, { n: 2, t1: [1], t2: [3], win: 2 }] }], pl);
  assert.equal(a.rating.get(1), 1016, 'doubles: full weight'); assert.equal(a.ratingS.get(1), 984, 'singles: its own rating, full weight');
  assert.equal(a.hist.get(1).length, 1); assert.equal(a.histS.get(1).length, 1);
  assert.equal(a.main(1), 'doubles', 'a tie counts as doubles');
}

// showing-up badges and the monthly recap
{
  const { analyse, recap } = require('../analytics.js');
  const P = [1, 2, 3, 4, 5].map(id => ({ id }));
  const night = (id, date, ms) => ({ id, date, matches: ms.map(([t1, t2, win], i) => ({ n: i + 1, t1, t2, win })) });
  const R = [[[1, 2], [3, 4], 1], [[1, 3], [2, 4], 1], [[1, 4], [2, 3], 1]];   // 1 partners 2, 3 and 4 and wins every time
  const days = [night(1, '2026-01-08', R), night(2, '2026-02-05', R), night(3, '2026-03-05', R), night(4, '2026-03-12', [[[2, 3], [4, 5], 2]])];
  const b = analyse(days, P).badges;
  assert.equal(b.get(1).nightsRun, 3, 'three nights in a row, then missed one');
  assert.equal(b.get(2).nightsRun, 4);
  assert(b.get(1).everyone, 'partnered every regular');
  assert(!b.get(5).everyone, 'not a regular');
  assert(b.get(1).everyMonth && b.get(4).everyMonth && !b.get(5).everyMonth, 'every month since the first one, at least 3');
  const r = recap(days, P, '2026-03', 1);
  assert.equal(r.nights, 2); assert.equal(r.matches, 4);
  assert.equal(r.most.id, 2, 'played every match of the month');
  assert.deepEqual(r.me && [r.me.p, r.me.w, r.me.nights], [3, 3, 1]);
  assert(r.me.delta > 0, 'rating went up');
  assert.equal(r.streak.id, 1); assert.equal(r.streak.n, 3);
  assert.equal(recap(days, P, '2026-03', 5).me.p, 1);
  assert.equal(recap(days, P, '2026-04', 1), null, 'nothing played');
  const up = recap([night(9, '2026-05-01', [1, 1, 1, 1, 2].map(w => [[1, 2], [3, 4], w]))], P, '2026-05', null);
  assert.deepEqual(up.upset.won, [3, 4], 'the favourites lost the last one');
}

// weekly challenges
{
  const { challenge, challengeWins, challengeFor, mondayOf } = require('../analytics.js');
  assert.equal(mondayOf('2026-11-12'), '2026-11-09'); assert.equal(mondayOf('2026-11-09'), '2026-11-09'); assert.equal(mondayOf('2026-11-15'), '2026-11-09');
  const weeks = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21'];
  assert.equal(new Set(weeks.map(challengeFor)).size, 7, 'a different challenge each week, all 7 in turn');
  const P = [1, 2, 3, 4, 5].map(id => ({ id })), night = (id, date, ms) => ({ id, date, matches: ms.map(([t1, t2, win], i) => ({ n: i + 1, t1, t2, win })) });
  const at = kind => weeks.find(w => challengeFor(w) === kind), day = (w, k) => new Date(Date.parse(w + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10);
  const R = [[[1, 2], [3, 4], 1], [[1, 3], [2, 4], 2], [[1, 4], [2, 3], 1]];   // player 1: won with 2, lost with 3, won with 4
  for (const [kind, want] of [['partners3', [3, true]], ['streak2', [1, false]], ['bounce', [1, true]], ['opponents4', [3, false]], ['six', [3, false]]]) {
    const w = at(kind), c = challenge([night(1, day(w, 3), R)], P, w).of.get(1);
    assert.deepEqual([c.have, c.done], want, kind);
  }
  const w = at('newpartner');   // won with 2 before this week: winning with 2 again does not count, winning with 4 does
  const before = night(1, day(w, -5), [[[1, 2], [3, 4], 1]]);
  assert(!challenge([before, night(2, day(w, 2), [[[1, 2], [3, 4], 1]])], P, w).of.get(1).done, 'same partner');
  assert(challenge([before, night(2, day(w, 2), [[[1, 4], [3, 2], 1]])], P, w).of.get(1).done, 'new partner');
  assert.equal(challengeWins([before, night(2, day(w, 2), [[[1, 4], [3, 2], 1]])], P).get(1), 1);
}

// player card
{
  const { playerCard, seasonOf } = require('../analytics.js');
  const P = [1, 2, 3, 4, 5].map(id => ({ id })), night = (id, date, ms) => ({ id, date, matches: ms.map(([t1, t2, win], i) => ({ n: i + 1, t1, t2, win })) });
  // 4 players, best of 3: 1&2 v 3&4 goes 1–1, player 1 wins the decider; then a 2–0 with other teams
  const d = [night(1, '2026-11-05', [[[1, 2], [3, 4], 1], [[1, 2], [3, 4], 2], [[1, 2], [3, 4], 1], [[1, 3], [2, 4], 1], [[1, 3], [2, 4], 1]])];
  const c = playerCard(d, P, 1);
  assert.deepEqual([c.matches, c.nights, c.bestRun, c.deciders.w, c.deciders.p, c.partner, c.tier], [5, 1, 3, 1, 1, 2, 'bronze']);
  assert.equal(playerCard(d, P, 4).deciders.p, 1, 'the losers of a decider played one too');
  // best partner: win rate with at least 3 together beats playing together most often
  const bp = [night(5, '2026-11-01', [[[1, 2], [3, 4], 2], [[1, 2], [3, 4], 2], [[1, 2], [3, 4], 2], [[1, 2], [3, 4], 1], [[1, 3], [2, 4], 1], [[1, 3], [2, 4], 1], [[1, 3], [2, 4], 1]])];
  assert.deepEqual([playerCard(bp, P, 1).partner, Math.round(100 * playerCard(bp, P, 1).partnerRate)], [3, 100], '3 of 3 with Costi beats 1 of 4 with Dani');
  assert.equal(c.title, 'rookie', 'fewer than 10 matches');
  const many = Array.from({ length: 4 }, (_, i) => night(10 + i, `2026-10-0${i + 1}`, [[[1, 2], [3, 4], 1], [[1, 2], [3, 4], 2], [[1, 2], [3, 4], 1]]));
  assert.equal(playerCard(many, P, 1).title, 'clutch', 'wins the deciders');
  const solo = Array.from({ length: 4 }, (_, i) => night(200 + i, '2026-02-0' + (i + 1), [[[1], [2], 1], [[1], [3], 1], [[1], [2], 2]]));
  assert.equal(playerCard(solo, P, 2).title, 'lonewolf', 'mostly singles');
  const wins = Array.from({ length: 4 }, (_, i) => night(300 + i, '2026-03-0' + (i + 1), [[[1, 2], [3, 4], 1], [[1, 3], [2, 4], 1], [[1, 4], [2, 3], 1], [[1, 2], [3, 4], 2]]));
  assert.equal(playerCard(wins, P, 1).title, 'machine', '12 of 16 won');
  assert.equal(playerCard(Array.from({ length: 25 }, (_, i) => night(100 + i, '2026-01-01', [[[1, 2], [3, 4], 1]])), P, 3).tier, 'gold');
  assert.deepEqual([seasonOf('2026-11-10'), seasonOf('2026-12-03'), seasonOf('2027-02-01'), seasonOf('2027-04-01')].map(x => x.k + ' ' + x.y), ['autumn 2026', 'winter 2026/27', 'winter 2026/27', 'spring 2027']);
}

// loyalty bonus: per night played 3 + 1 a match (max 2), per weekly challenge 2; per season
{
  const { loyalty, nightBonus } = require('../analytics.js');
  const P = [1, 2, 3, 4, 5].map(id => ({ id })), night = (id, date, ms) => ({ id, date, matches: ms.map(([t1, t2, win], i) => ({ n: i + 1, t1, t2, win })) });
  assert.equal(nightBonus({ p: 7 }), 5, '3 + 2 (capped)'); assert.equal(nightBonus({ p: 1 }), 4);
  const days = [night(1, '2026-10-01', [[[1, 2], [3, 4], 1], [[1, 3], [2, 4], 1]]), night(2, '2026-10-08', [[[1, 2], [3, 4], 2]]), night(3, '2026-07-01', [[[1, 2], [3, 4], 1]])];
  const l = loyalty(days, P, 'autumn 2026');
  assert(!l.has(5), 'never played'); assert.equal(l.get(1).nights, 2, 'only autumn nights');
  assert.equal(l.get(1).bonus - 2 * l.get(1).challenges, 5 + 4, 'two nights: 3+2 and 3+1');
  assert.equal(l.get(3).bonus - 2 * l.get(3).challenges, l.get(1).bonus - 2 * l.get(1).challenges, 'winning or losing makes no difference to the bonus');
}

{ // hall of fame, card collection, season album
  const { records, collection, album } = require('../analytics.js');
  const P = [1, 2, 3, 4, 5].map(id => ({ id })), night = (id, date, ms) => ({ id, date, matches: ms.map(([t1, t2, win], i) => ({ n: i + 1, t1, t2, win })) });
  const ds = [night(1, '2026-10-01', [[[1, 2], [3, 4], 1], [[1, 3], [2, 4], 1]]), night(2, '2026-10-08', [[[1, 2], [3, 4], 1], [[1, 2], [3, 5], 1], [[1], [5], 2]])];
  const r = Object.fromEntries(records(ds, P).map(x => [x.key, x]));
  assert.deepEqual([r.streak.ids, r.streak.value, r.streak.day], [[1], 4, 2], 'Vali won 4 in a row, set on the second night');
  assert.deepEqual([r.pair.ids, r.pair.value], [[1, 2], 3], 'Vali & Dani: 3 matches together');
  assert.deepEqual([r.matches.value, r.matches.day], [3, 2], 'most matches in one night');
  assert.equal(r.nights.value, 2);
  const c = collection(ds, 1);
  assert.deepEqual([...c.keys()].sort(), [2, 3, 4, 5], 'Vali beat or won with everyone');
  assert.equal(c.get(2).how, 'partner'); assert.equal(c.get(4).how, 'beat');
  assert.equal(collection(ds, 5).size, 1, 'Ciprian only beat Vali');
  const al = Object.fromEntries(album(ds, P, 'autumn 2026', 1).map(x => [x.k, x]));
  assert.deepEqual([al.nights5.have, al.streak3.done, al.partners5.have, al.beat5.have, al.singles.done], [2, true, 2, 4, false]);
  assert.equal(album(ds, P, 'spring 2027', 1).filter(x => x.done).length, 0, 'every season starts empty');
}

console.log('analytics tests passed');
