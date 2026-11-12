// Ratings, badges and pair statistics. Pure functions: everything is computed from the match log
// (days -> matches), nothing is stored, so correcting or deleting a match fixes every number.
const START_RATING = 1000, K_FACTOR = 32;

// days: [{id, date, matches: [{n, t1: [ids], t2: [ids], win: 1|2}]}] in play order; players: [{id}]
// doubles and singles have separate ratings (rating / ratingS, hist / histS); a match only moves the rating of its own kind
function analyse(days, players) {
  const rating = new Map(players.map(p => [p.id, START_RATING])), ratingS = new Map(players.map(p => [p.id, START_RATING]));
  const hist = new Map(players.map(p => [p.id, []])), histS = new Map(players.map(p => [p.id, []]));   // rating after each match the player played
  const results = new Map(players.map(p => [p.id, []]));   // win/loss in play order
  const night = new Map();                                  // dayId -> Map(playerId -> {delta, w, p, res})
  const dayEnd = [];                                        // rating of everyone after each day
  const log = [];                                           // every match with the winners' chance beforehand (for upsets)
  const mates = new Map(players.map(p => [p.id, new Set()]));
  for (const d of days.filter(x => x.matches.length)) {
    const nd = new Map(), row = id => nd.get(id) || nd.set(id, { delta: 0, w: 0, p: 0, res: [] }).get(id);
    for (const m of d.matches) {
      const single = m.t1.length === 1, R = single ? ratingS : rating, H = single ? histS : hist;
      const avg = ids => ids.reduce((s, id) => s + R.get(id), 0) / ids.length;
      const e1 = 1 / (1 + 10 ** ((avg(m.t2) - avg(m.t1)) / 400)); // expected score of team 1
      const d1 = K_FACTOR * ((m.win === 1 ? 1 : 0) - e1);             // both partners get the same change
      log.push({ day: d.id, date: d.date, n: m.n, won: m.win === 1 ? m.t1 : m.t2, lost: m.win === 1 ? m.t2 : m.t1, chance: m.win === 1 ? e1 : 1 - e1 });
      for (const ids of [m.t1, m.t2]) for (const a of ids) for (const b of ids) if (a !== b) mates.get(a).add(b);
      for (const [ids, sign, won] of [[m.t1, 1, m.win === 1], [m.t2, -1, m.win === 2]]) for (const id of ids) {
        R.set(id, R.get(id) + sign * d1);
        H.get(id).push({ day: d.id, date: d.date, n: m.n, r: R.get(id) });
        results.get(id).push(won);
        const r = row(id); r.delta += sign * d1; r.p++; r.w += won ? 1 : 0; r.res.push(won);
      }
    }
    night.set(d.id, nd);
    dayEnd.push({ id: d.id, rating: new Map(rating) });
  }

  const badges = new Map(players.map(p => [p.id, { fire: 0, bestStreak: 0, perfect: 0, comeback: 0, potn: 0, improved: false, nightsRun: 0, everyone: false, everyMonth: false }]));
  for (const [id, rs] of results) {                         // 5 wins in a row (counted once per run), across all days
    let run = 0; const b = badges.get(id);
    for (const won of rs) { run = won ? run + 1 : 0; b.bestStreak = Math.max(b.bestStreak, run); if (run === 5) b.fire++; }
  }
  const potn = new Map();
  for (const [dayId, nd] of night) {
    for (const [id, r] of nd) {
      const b = badges.get(id);
      if (r.p >= 4 && r.w === r.p) b.perfect++;                                  // won every match, at least 4 played
      if (r.res[0] === false && r.res[1] === false && r.w > r.p - r.w) b.comeback++; // lost the first two, still finished ahead
    }
    const best = playerOfNight({ night }, dayId);
    if (best) { potn.set(dayId, best); badges.get(best.id).potn++; }
  }
  // most improved: biggest rating gain over the last 4 play days (current holder only)
  const from = dayEnd.length > 4 ? dayEnd[dayEnd.length - 5].rating : null; let top = null;
  for (const [id, r] of rating) { const gain = r - (from ? from.get(id) : START_RATING); if (gain > 0 && (!top || gain > top.gain)) top = { id, gain }; }
  if (top && dayEnd.length > 1) badges.get(top.id).improved = true;
  // showing up counts too: nights in a row, partners with everyone, every month since the first one
  const nights = days.filter(x => x.matches.length).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const was = (d, id) => d.matches.some(m => m.t1.includes(id) || m.t2.includes(id));
  const regulars = players.filter(p => results.get(p.id).length >= 5).map(p => p.id), groupMonths = [...new Set(nights.map(d => d.date.slice(0, 7)))];
  for (const p of players) {
    const b = badges.get(p.id); let run = 0;
    for (const d of nights) { run = was(d, p.id) ? run + 1 : 0; b.nightsRun = Math.max(b.nightsRun, run); }
    b.everyone = regulars.length >= 4 && regulars.includes(p.id) && regulars.every(x => x === p.id || mates.get(p.id).has(x));
    const mine = new Set(nights.filter(d => was(d, p.id)).map(d => d.date.slice(0, 7))), since = groupMonths.filter(ym => ym >= [...mine].sort()[0]);
    b.everyMonth = since.length >= 3 && since.every(ym => mine.has(ym));
  }
  const main = id => histS.get(id).length > hist.get(id).length ? 'singles' : 'doubles';   // the kind a player plays most
  return { rating, ratingS, hist, histS, main, night, badges, potn, dayEnd, log };
}

// the player who gained the most rating that night (ties: more wins)
function playerOfNight(a, dayId) {
  const nd = a.night.get(dayId); let best = null;
  for (const [id, r] of nd || []) {
    if (!best || r.delta > best.delta + 1e-9 || (Math.abs(r.delta - best.delta) < 1e-9 && r.w > best.w)) best = { id, ...r };
  }
  return best;
}

// small awards for one night, shown when the day is closed
function nightAwards(a, dayId) {
  const out = [];
  for (const [id, r] of a.night.get(dayId) || []) {
    if (r.p >= 4 && r.w === r.p) out.push({ id, kind: 'perfect' });
    if (r.res[0] === false && r.res[1] === false && r.w > r.p - r.w) out.push({ id, kind: 'comeback' });
  }
  return out;
}

// how `pid` fares with each partner and against each opponent: Map(otherId -> {w, g})
function relations(days, pid) {
  const mate = new Map(), foe = new Map(), bump = (m, id, won) => { const x = m.get(id) || { w: 0, g: 0 }; x.g++; x.w += won ? 1 : 0; m.set(id, x); };
  for (const d of days) for (const m of d.matches) {
    const side = m.t1.includes(pid) ? 1 : m.t2.includes(pid) ? 2 : 0;
    if (!side) continue;
    const won = m.win === side;
    (side === 1 ? m.t1 : m.t2).filter(x => x !== pid).forEach(x => bump(mate, x, won));
    (side === 1 ? m.t2 : m.t1).forEach(x => bump(foe, x, won));
  }
  return { mate, foe };
}

// best pair in the group: highest win rate, at least `min` games together; `allow(ids)` can exclude pairs (privacy)
function bestPair(days, min = 3, allow = () => true) {
  const pairs = new Map();
  for (const d of days) for (const m of d.matches) for (const [ids, won] of [[m.t1, m.win === 1], [m.t2, m.win === 2]]) {
    const key = [...ids].sort((x, y) => x - y).join('-'), x = pairs.get(key) || { ids: [...ids], w: 0, g: 0 };
    x.g++; x.w += won ? 1 : 0; pairs.set(key, x);
  }
  return [...pairs.values()].filter(x => x.ids.length === 2 && x.g >= min && allow(x.ids)).sort((x, y) => y.w / y.g - x.w / x.g || y.g - x.g)[0] || null;
}

// a month in review (ym = 'YYYY-MM') for the group, and for player `pid` if they played; null when nothing was played
// allow(ids) can leave pairs out of the duo of the month (privacy)
function recap(days, players, ym, pid, allow = () => true) {
  const a = analyse(days, players), md = days.filter(d => d.matches.length && d.date.slice(0, 7) === ym).sort((x, y) => x.date < y.date ? -1 : 1), ms = md.flatMap(d => d.matches);
  if (!ms.length) return null;
  const inM = (m, id) => m.t1.includes(id) || m.t2.includes(id), won = (m, id) => (m.win === 1 ? m.t1 : m.t2).includes(id);
  const count = new Map(); ms.forEach(m => [...m.t1, ...m.t2].forEach(id => count.set(id, (count.get(id) || 0) + 1)));
  const [mostId, mostN] = [...count].sort((x, y) => y[1] - x[1])[0];
  let streak = null;   // longest winning run inside the month, at least 3
  for (const p of players) { let run = 0, best = 0; for (const m of ms) if (inM(m, p.id)) { run = won(m, p.id) ? run + 1 : 0; best = Math.max(best, run); } if (best >= 3 && (!streak || best > streak.n)) streak = { id: p.id, n: best }; }
  const upset = a.log.filter(x => x.date.slice(0, 7) === ym && x.chance < 0.4).sort((x, y) => x.chance - y.chance)[0] || null;
  const bigNight = md.map(d => ({ date: d.date, players: new Set(d.matches.flatMap(m => [...m.t1, ...m.t2])).size, n: d.matches.length })).sort((x, y) => y.players - x.players || y.n - x.n)[0];
  let me = null;
  if (pid && count.get(pid)) {
    const mine = ms.filter(m => inM(m, pid)), partner = [...relations(md, pid).mate].sort((x, y) => y[1].g - x[1].g)[0] || null, nightsP = md.filter(d => d.matches.some(m => inM(m, pid)));
    const best = nightsP.map(d => { const mm = d.matches.filter(m => inM(m, pid)); return { date: d.date, w: mm.filter(m => won(m, pid)).length, p: mm.length }; }).sort((x, y) => y.w - x.w || x.p - y.p)[0];
    const h = (a.main(pid) === 'singles' ? a.histS : a.hist).get(pid) || [], before = h.filter(x => x.date.slice(0, 7) < ym).pop(), after = h.filter(x => x.date.slice(0, 7) <= ym).pop();
    me = { p: mine.length, w: mine.filter(m => won(m, pid)).length, nights: nightsP.length, partner: partner && { id: partner[0], ...partner[1] }, best, delta: after ? after.r - (before ? before.r : START_RATING) : 0 };
  }
  return { nights: md.length, matches: ms.length, most: { id: mostId, n: mostN }, streak, upset, duo: bestPair(md, 2, allow), bigNight, me };
}

// ---- player card: six stats, a fun title from how the player plays, and a colour for loyalty (nights played)
function playerCard(days, players, pid, a = analyse(days, players)) {
  const inM = (m, id) => m.t1.includes(id) || m.t2.includes(id), won = (m, id) => (m.win === 1 ? m.t1 : m.t2).includes(id);
  const played = days.filter(d => d.matches.length), mine = played.flatMap(d => d.matches.filter(m => inM(m, pid)));
  const nights = played.filter(d => d.matches.some(m => inM(m, pid))).length, w = mine.filter(m => won(m, pid)).length;
  // deciders: the third game of a best of 3 at 1–1 (same teams as the two before)
  const dec = { w: 0, p: 0 }, key = ids => [...ids].sort((x, y) => x - y).join('-');
  for (const d of played) { let k = null, sc = {}; for (const m of d.matches) {
    const mk = [key(m.t1), key(m.t2)].sort().join('|'); if (mk !== k) { k = mk; sc = {}; }
    const [a1, a2] = [sc[key(m.t1)] || 0, sc[key(m.t2)] || 0];
    if (a1 === 1 && a2 === 1 && inM(m, pid)) { dec.p++; if (won(m, pid)) dec.w++; }
    const wk = key(m.win === 1 ? m.t1 : m.t2); sc[wk] = (sc[wk] || 0) + 1; if (sc[wk] >= 2) sc = {};
  } }
  // best partner: the highest win rate together, at least 3 matches (ties: more matches); until then, the most matches together
  const rel = relations(days, pid), mates = [...rel.mate], enough = mates.filter(([, x]) => x.g >= 3);
  const fav = (enough.length ? enough.sort((a, b) => b[1].w / b[1].g - a[1].w / a[1].g || b[1].g - a[1].g) : mates.sort((a, b) => b[1].g - a[1].g))[0];
  // glue: partners win more often with this player than they do overall
  const overall = id => { const ms = played.flatMap(d => d.matches.filter(m => inM(m, id))); return ms.length ? ms.filter(m => won(m, id)).length / ms.length : 0; };
  let lift = 0, liftG = 0; for (const [q, x] of rel.mate) if (x.g >= 3) { lift += (x.w / x.g - overall(q)) * x.g; liftG += x.g; }
  const res = mine.map(m => won(m, pid)), flips = res.filter((r, i) => i && r !== res[i - 1]).length;
  const b = a.badges.get(pid) || {}, upsets = a.log.filter(x => x.won.includes(pid) && x.chance < 0.4).length;
  // workhorse: plays clearly more matches a night than the group's average player
  const seats = played.reduce((n, d) => n + d.matches.reduce((k, m) => k + m.t1.length + m.t2.length, 0), 0), playerNights = played.reduce((n, d) => n + new Set(d.matches.flatMap(m => [...m.t1, ...m.t2])).size, 0);
  const singles = mine.filter(m => m.t1.length === 1).length, rate = mine.length ? w / mine.length : 0;
  const title = dec.p >= 3 && dec.w / dec.p >= 0.6 ? 'clutch' : upsets >= 3 ? 'giant' : mine.length >= 15 && rate >= 0.7 ? 'machine' : (b.bestStreak || 0) >= 8 ? 'hotstreak'
    : liftG >= 10 && lift / liftG >= 0.1 ? 'glue' : b.comeback >= 2 ? 'comeback' : b.improved ? 'onrise' : singles >= 8 && singles / mine.length >= 0.5 ? 'lonewolf'
    : nights >= 8 && nights / played.length >= 0.8 ? 'ironman' : b.everyone ? 'teamplayer' : nights >= 5 && mine.length / nights >= 1.2 * seats / playerNights ? 'workhorse' : res.length >= 10 && flips / (res.length - 1) >= 0.6 ? 'rollercoaster' : mine.length < 10 ? 'rookie' : 'allround';
  return { matches: mine.length, rate, bestRun: b.bestStreak || 0, deciders: dec, partner: fav ? fav[0] : null, partnerRate: fav ? fav[1].w / fav[1].g : 0, partnerGames: fav ? fav[1].g : 0, nights,
    tier: nights >= 25 ? 'gold' : nights >= 10 ? 'silver' : 'bronze', title };
}
// the season of a date: winter (Dec–Feb), spring, summer, autumn; winter spans two years
const seasonOf = iso => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
  return m === 12 ? { k: 'winter', y: `${y}/${String(y + 1).slice(2)}` } : m <= 2 ? { k: 'winter', y: `${y - 1}/${String(y).slice(2)}` } : { k: m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn', y: String(y) }; };

// ---- loyalty bonus: showing up raises the rating everyone sees (match rating + bonus), while the match rating itself stays
// pure for odds and upsets. Per night played: +3, +1 per match (at most 2), +2 per weekly challenge; it starts again each season.
const LOYALTY = { night: 3, match: 1, maxMatches: 2, challenge: 2 };
const seasonKey = iso => { const s = seasonOf(iso); return s.k + ' ' + s.y; };
const nightBonus = r => LOYALTY.night + Math.min(LOYALTY.maxMatches, r.p * LOYALTY.match);   // r = a.night.get(dayId).get(playerId)
// the season's bonus per player: Map(id -> { bonus, nights, challenges })
function loyalty(days, players, season, a = analyse(days, players)) {
  const out = new Map(), row = id => out.get(id) || out.set(id, { bonus: 0, nights: 0, matches: 0, challenges: 0 }).get(id);
  const ds = days.filter(d => d.matches.length && seasonKey(d.date) === season);
  for (const d of ds) for (const [id, r] of a.night.get(d.id) || []) { const x = row(id); x.nights++; x.matches += nightBonus(r) - LOYALTY.night; x.bonus += nightBonus(r); }
  for (const w of new Set(ds.map(d => mondayOf(d.date)))) for (const [id, c] of challenge(days, players, w, a).of) if (c.done) { const x = row(id); x.challenges++; x.bonus += LOYALTY.challenge; }
  return out;
}

// ---- weekly mini-challenge: the same light goal for everyone, a new one every Monday, checked from the match log
const CHALLENGES = ['newpartner', 'partners3', 'streak2', 'upset', 'six', 'bounce', 'opponents4'];
const NEED = { newpartner: 1, partners3: 3, streak2: 2, upset: 1, six: 6, bounce: 1, opponents4: 4 };
const mondayOf = iso => { const d = Date.parse(iso + 'T12:00:00Z'), k = (new Date(d).getUTCDay() + 6) % 7; return new Date(d - k * 864e5).toISOString().slice(0, 10); };
const challengeFor = monday => CHALLENGES[Math.round(Date.parse(monday + 'T12:00:00Z') / (7 * 864e5)) % CHALLENGES.length];
// the week starting `monday`: { kind, need, of: Map(playerId -> { have, done }) } for everyone who played that week
function challenge(days, players, monday, a = analyse(days, players)) {
  const kind = challengeFor(monday), need = NEED[kind], of = new Map();
  const week = d => mondayOf(d.date) === monday, inM = (m, id) => m.t1.includes(id) || m.t2.includes(id), won = (m, id) => (m.win === 1 ? m.t1 : m.t2).includes(id);
  const ms = days.filter(d => d.matches.length && week(d)).sort((x, y) => x.date < y.date ? -1 : 1).flatMap(d => d.matches);
  const from30 = new Date(Date.parse(monday + 'T12:00:00Z') - 30 * 864e5).toISOString().slice(0, 10);
  const before = days.filter(d => d.date >= from30 && d.date < monday).flatMap(d => d.matches);
  for (const p of players) {
    const mine = ms.filter(m => inM(m, p.id)); if (!mine.length) continue;
    const side = m => m.t1.includes(p.id) ? m.t1 : m.t2, other = m => m.t1.includes(p.id) ? m.t2 : m.t1, mates = m => side(m).filter(x => x !== p.id);
    let have = 0;
    if (kind === 'newpartner') { const old = new Set(before.filter(m => inM(m, p.id) && won(m, p.id)).flatMap(mates)); have = mine.some(m => won(m, p.id) && mates(m).some(x => !old.has(x))) ? 1 : 0; }
    if (kind === 'partners3') have = new Set(mine.flatMap(mates)).size;
    if (kind === 'streak2') { let run = 0; for (const m of mine) { run = won(m, p.id) ? run + 1 : 0; have = Math.max(have, run); } }
    if (kind === 'upset') have = a.log.some(x => mondayOf(x.date) === monday && x.won.includes(p.id) && x.chance < 0.5) ? 1 : 0;
    if (kind === 'six') have = mine.length;
    if (kind === 'bounce') have = mine.some((m, i) => i && won(m, p.id) && !won(mine[i - 1], p.id)) ? 1 : 0;
    if (kind === 'opponents4') have = new Set(mine.flatMap(other)).size;
    of.set(p.id, { have: Math.min(have, need), done: have >= need });
  }
  return { kind, need, of };
}
// how many weekly challenges each player has completed: Map(playerId -> n)
function challengeWins(days, players) {
  const a = analyse(days, players), out = new Map();
  for (const w of new Set(days.filter(d => d.matches.length).map(d => mondayOf(d.date))))
    for (const [id, x] of challenge(days, players, w, a).of) if (x.done) out.set(id, (out.get(id) || 0) + 1);
  return out;
}

// ---- hall of fame: group records from the whole match log. Each names the day it was set (beaten only by a strictly better
// value), so a closed night can say "new record". ids: the player(s), value: the number, day/date: when it was set.
function records(days, players, a = analyse(days, players)) {
  const ds = days.filter(d => d.matches.length), out = {}, set = (key, ids, value, d, better, extra) => { if (!out[key] || better(value, out[key].value)) out[key] = { key, ids, value, day: d.id, date: d.date, ...extra }; };
  const gt = (x, y) => x > y, run = new Map(), nights = new Map(), dec = new Map(), key = ids => [...ids].sort((x, y) => x - y).join('-');
  for (const d of ds) {
    let k = null, sc = {};   // deciders: the third game of a best of 3 at 1–1 (same teams), as on the player card
    for (const m of d.matches) {
      for (const [ids, won] of [[m.t1, m.win === 1], [m.t2, m.win === 2]])
        for (const id of ids) { const r = won ? (run.get(id) || 0) + 1 : 0; run.set(id, r); if (r) set('streak', [id], r, d, gt); }
      const mk = [key(m.t1), key(m.t2)].sort().join('|'); if (mk !== k) { k = mk; sc = {}; }
      if ((sc[key(m.t1)] || 0) === 1 && (sc[key(m.t2)] || 0) === 1) for (const id of m.win === 1 ? m.t1 : m.t2) { const n = (dec.get(id) || 0) + 1; dec.set(id, n); set('deciders', [id], n, d, gt); }
      const wk = key(m.win === 1 ? m.t1 : m.t2); sc[wk] = (sc[wk] || 0) + 1; if (sc[wk] >= 2) sc = {};
    }
    for (const [id, r] of a.night.get(d.id) || []) {
      set('wins', [id], r.w, d, gt); set('night', [id], Math.round(r.delta), d, gt);
      const n = (nights.get(id) || 0) + 1; nights.set(id, n); set('nights', [id], n, d, gt);
    }
  }
  for (const x of a.log) if (x.chance < 0.5) set('upset', x.won, Math.round(100 * x.chance), ds.find(y => y.id === x.day), (v, old) => v < old);
  // highest rating ever (doubles or singles), in the order it happened so the first to reach it keeps it
  [...a.hist, ...a.histS].flatMap(([id, h]) => h.map(e => ({ id, ...e }))).sort((x, y) => x.date.localeCompare(y.date) || x.n - y.n)
    .forEach(e => set('peak', [e.id], Math.round(e.r), ds.find(y => y.id === e.day), gt));
  // best pair: the highest win rate together over at least 10 matches; "since" is their last match together
  const bp = bestPair(ds, 10);
  if (bp) { const last = ds.filter(d => d.matches.some(m => [m.t1, m.t2].some(t => t.length === 2 && bp.ids.every(i => t.includes(i))))).pop(); set('pair', bp.ids, Math.round(100 * bp.w / bp.g), last, gt, { w: bp.w, g: bp.g }); }
  return ['streak', 'upset', 'night', 'wins', 'peak', 'deciders', 'pair', 'nights'].filter(k => out[k]).map(k => out[k]);
}

// ---- card collection: you collect someone's card the first time you beat them or win with them as your partner
function collection(days, pid) {
  const got = new Map();
  for (const d of days) for (const m of d.matches) {
    const [w, l] = m.win === 1 ? [m.t1, m.t2] : [m.t2, m.t1];
    if (w.includes(pid)) for (const [ids, how] of [[w, 'partner'], [l, 'beat']]) for (const id of ids) if (id !== pid && !got.has(id)) got.set(id, { how, date: d.date });
  }
  return got;
}

// ---- season album: stickers for one season; filling it gives that season's card a gold edge
const ALBUM = { nights5: 5, matches20: 20, partners5: 5, beat5: 5, streak3: 3, decider: 1, singles: 1, perfect: 1, challenge: 1 };
function album(days, players, season, pid) {
  const ds = days.filter(d => d.matches.length && seasonKey(d.date) === season), inM = m => m.t1.includes(pid) || m.t2.includes(pid), won = m => (m.win === 1 ? m.t1 : m.t2).includes(pid);
  const mine = ds.flatMap(d => d.matches.filter(inM)), wins = mine.filter(won);
  let run = 0, best = 0; for (const m of mine) { run = won(m) ? run + 1 : 0; best = Math.max(best, run); }
  const have = {
    nights5: ds.filter(d => d.matches.some(inM)).length, matches20: mine.length,
    partners5: new Set(wins.flatMap(m => (m.win === 1 ? m.t1 : m.t2).filter(x => x !== pid))).size,
    beat5: new Set(wins.flatMap(m => m.win === 1 ? m.t2 : m.t1)).size, streak3: best,
    decider: ds.length ? playerCard(ds, players, pid).deciders.w : 0, singles: wins.filter(m => m.t1.length === 1).length,
    perfect: ds.filter(d => { const x = d.matches.filter(inM); return x.length >= 3 && x.every(won); }).length,
    challenge: ds.length ? challengeWins(ds, players).get(pid) || 0 : 0 };
  return Object.entries(ALBUM).map(([k, need]) => ({ k, need, have: Math.min(have[k], need), done: have[k] >= need }));
}

// 3 players play singles: the winner stays on, but after 3 games in a row they sit out one game.
// order: the 3 player ids; matches: the day's matches so far. Returns the next match as { t1: [id], t2: [id], rest: id }.
function winnerStays(order, matches) {
  if (!matches.length) return { t1: [order[0]], t2: [order[1]], rest: order[2] };
  const last = matches[matches.length - 1], winner = (last.win === 1 ? last.t1 : last.t2)[0], loser = (last.win === 1 ? last.t2 : last.t1)[0], waiting = last.rest;
  let streak = 0;
  for (let i = matches.length - 1; i >= 0 && [...matches[i].t1, ...matches[i].t2].includes(winner); i--) streak++;
  return streak >= 3 ? { t1: [loser], t2: [waiting], rest: winner } : { t1: [winner], t2: [waiting], rest: loser };
}

// rating line chart as an inline SVG string
function ratingChart(vals, w = 320, h = 150, label = 'Rating over time') {
  if (vals.length < 2) return '';
  const lo = Math.min(...vals, START_RATING) - 10, hi = Math.max(...vals, START_RATING) + 10;
  const x = i => 8 + (w - 16) * i / (vals.length - 1), y = v => h - 16 - (h - 32) * (v - lo) / (hi - lo);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), last = vals.length - 1;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${label}: ${Math.round(vals[0])} → ${Math.round(vals[last])}">
    <line x1="8" x2="${w - 8}" y1="${y(START_RATING)}" y2="${y(START_RATING)}" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="4 4"/>
    <polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(last)}" cy="${y(vals[last])}" r="5" fill="var(--acc)"/>
    <text x="8" y="12" font-size="12" fill="currentColor" fill-opacity=".7">${Math.round(Math.max(...vals))}</text>
    <text x="8" y="${h - 3}" font-size="12" fill="currentColor" fill-opacity=".7">${Math.round(Math.min(...vals))}</text></svg>`;
}

if (typeof module !== 'undefined') module.exports = { records, collection, album, ALBUM, winnerStays, recap, loyalty, nightBonus, seasonKey, LOYALTY, playerCard, seasonOf, challenge, challengeWins, challengeFor, mondayOf, analyse, playerOfNight, nightAwards, relations, bestPair, ratingChart, START_RATING };
