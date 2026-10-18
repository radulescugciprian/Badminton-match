// Ratings, badges and pair statistics. Pure functions: everything is computed from the match log
// (days -> matches), nothing is stored, so correcting or deleting a match fixes every number.
const START_RATING = 1000, K_FACTOR = 32;

// days: [{id, date, matches: [{n, t1: [ids], t2: [ids], win: 1|2}]}] in play order; players: [{id}]
function analyse(days, players) {
  const rating = new Map(players.map(p => [p.id, START_RATING]));
  const hist = new Map(players.map(p => [p.id, []]));      // rating after each match the player played
  const results = new Map(players.map(p => [p.id, []]));   // win/loss in play order
  const night = new Map();                                  // dayId -> Map(playerId -> {delta, w, p, res})
  const dayEnd = [];                                        // rating of everyone after each day
  for (const d of days.filter(x => x.matches.length)) {
    const nd = new Map(), row = id => nd.get(id) || nd.set(id, { delta: 0, w: 0, p: 0, res: [] }).get(id);
    for (const m of d.matches) {
      const avg = ids => ids.reduce((s, id) => s + rating.get(id), 0) / ids.length;
      const e1 = 1 / (1 + 10 ** ((avg(m.t2) - avg(m.t1)) / 400)); // expected score of team 1
      const k = m.t1.length === 1 ? K_FACTOR / 2 : K_FACTOR;           // singles (3-player nights) count half, so one evening cannot swing the rating
      const d1 = k * ((m.win === 1 ? 1 : 0) - e1);                    // both partners get the same change
      for (const [ids, sign, won] of [[m.t1, 1, m.win === 1], [m.t2, -1, m.win === 2]]) for (const id of ids) {
        rating.set(id, rating.get(id) + sign * d1);
        hist.get(id).push({ day: d.id, date: d.date, n: m.n, r: rating.get(id) });
        results.get(id).push(won);
        const r = row(id); r.delta += sign * d1; r.p++; r.w += won ? 1 : 0; r.res.push(won);
      }
    }
    night.set(d.id, nd);
    dayEnd.push({ id: d.id, rating: new Map(rating) });
  }

  const badges = new Map(players.map(p => [p.id, { fire: 0, bestStreak: 0, perfect: 0, comeback: 0, potn: 0, improved: false }]));
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
  return { rating, hist, night, badges, potn, dayEnd };
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
    <text x="8" y="12" font-size="11" fill="currentColor" fill-opacity=".7">${Math.round(Math.max(...vals))}</text>
    <text x="8" y="${h - 3}" font-size="11" fill="currentColor" fill-opacity=".7">${Math.round(Math.min(...vals))}</text></svg>`;
}

if (typeof module !== 'undefined') module.exports = { winnerStays, analyse, playerOfNight, nightAwards, relations, bestPair, ratingChart, START_RATING };
