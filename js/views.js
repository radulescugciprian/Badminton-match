// Screens: everything that turns the state in data.js into HTML. render() redraws the current screen.
// ---- views
const langPicker = () => `<select class="lang" onchange="setLang(this.value)" aria-label="${t('Language')}">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === lang ? 'selected' : ''}>${v}</option>`).join('')}</select>`;

function login_() {
  const m = authMode, up = m === 'up';
  return `<h1 style="font-size:var(--fs-2xl);margin-top:40px">🏸 Badminton</h1>${lostSession && m === 'in' ? `<p class="mut" role="status">${t('You were signed out. Please log in again.')}</p>` : ''}<p class="mut">${up ? t('Create your account') : m === 'reset' ? t('Reset your password') : t('Log in to see the scores')}</p>
    <form onsubmit="authForm(event)">
      ${up ? `<input type="text" name="username" placeholder="${t('Username (3-20 letters, numbers, . _)')}" required pattern="[A-Za-z0-9_.]{3,20}" title="${t('3-20 letters, numbers, dot or underscore')}" autocapitalize="none" autocomplete="username">` : ''}
      ${up ? `<select name="player" aria-label="${t('Which player are you?')}"><option value="">${t("I'm a new player")}</option>${unclaimed.map(p => `<option value="${p.id}">${t("I'm {name}", { name: esc(p.name) })}</option>`).join('')}</select>` : ''}
      ${up ? `<input type="email" name="email" placeholder="${t('Email')}" required autocomplete="email">`
           : m === 'reset' ? `<input type="email" name="login" placeholder="${t('Email')}" required autocomplete="email">`
           : `<input type="text" name="login" placeholder="${t('Username or email')}" value="${esc(lastLogin())}" required autocapitalize="none" autocomplete="username">`}
      ${m === 'reset' ? '' : `<input type="password" name="password" placeholder="${t('Password (6+ characters)')}" required minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}">`}
      <p class="msg" role="alert"></p>
      <button class="primary" type="submit">${up ? t('Create account') : m === 'reset' ? t('Send reset link') : t('Log in')}</button>
    </form>
    <div class="actions">${m === 'in' ? `<button class="link" onclick="setAuthMode('up')">${t('Create an account')}</button>
      <button class="link" onclick="setAuthMode('reset')">${t('Forgot password?')}</button>` : `<button class="link" onclick="setAuthMode('in')">${t('Back to log in')}</button>`}</div>
    <div class="actions">${langPicker()}</div>`;
}

function profileView() {
  const mine = db.players.find(p => p.user === session.user.id), an = analyse(db.days, db.players), ms = mine && stats(db.days.flatMap(d => d.matches)).find(r => r.id === mine.id);
  const pst = mine && ms && { rating: an.rating.get(mine.id), p: ms.p, w: ms.w };
  return `<h1>${t('Your profile')}</h1>
    ${mine ? `<div class="card" style="margin-bottom:20px"><div style="display:flex;align-items:center;gap:14px">${av(mine.id, 72)}
      <div style="flex:1;min-width:0"><b style="font-size:var(--fs-lg)">${esc(mine.name)}</b><div class="mut" style="margin:0">@${esc(me.username || '')} · ${isAdmin() ? t('admin') : t('Member')}</div></div>
      <button onclick="avatar(${mine.id})" >📷 ${t('Change photo')}</button></div>
      <div class="mut" style="margin:12px 0 0">${t('Email')}: ${esc(session.user.email || '')}<br>${t('Member since')}: ${esc(niceDate(String(session.user.created_at || '').slice(0, 10) || tzParts().date, { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
      ${pst ? `<div class="tiles" style="margin-top:12px"><div class="tile"><b>${Math.round(pst.rating)}</b>${t('Rating')}</div><div class="tile"><b>${pst.p}</b>${t('matches')}</div><div class="tile"><b>${pst.p ? Math.round(100 * pst.w / pst.p) : 0}%</b>${t('win rate')}</div></div>
        <button class="add" style="margin:12px 0 0" onclick="statsId=${mine.id};go('stats')">📊 ${t('View my stats')}</button>` : ''}</div>` : ''}
    <label class="field">${t('Language')}${langPicker()}</label>
    <div class="field">${t('Theme')}<div class="seg" style="margin-top:6px">${[['auto', t('Auto')], ['light', t('Light')], ['dark', t('Dark')]].map(([k, l]) => `<button class="${themePref() === k ? 'on' : ''}" onclick="setTheme('${k}')">${l}</button>`).join('')}</div></div>
    <label class="card check"><input type="checkbox" ${me.share_stats !== false ? 'checked' : ''} onchange="setShare(this.checked)">
      <span>🔓 ${t('Share my rating and stats with the others')}<br><small class="mut">${t('The leaderboards always show results. Admins can always see everything.')}</small></span></label>
    <label class="card check"><input type="checkbox" ${fxOn() ? 'checked' : ''} onchange="setFx(this.checked)">
      <span>🎉 ${t('Confetti and sound when a match is recorded')}</span></label>
    <button class="add" onclick="showHelp()">❓ ${t('How it works')}</button>
    <h2 style="margin:0 0 8px">${t('New password')}</h2>
    <form onsubmit="newPassword(event)">
      <input type="password" name="password" placeholder="${t('New password (6+ characters)')}" required minlength="6" autocomplete="new-password">
      <p class="msg" role="alert"></p><button class="primary" type="submit">${t('Save password')}</button></form>`;
}

function rsvpCard() {
  const date = nextPlayDate(), mine = db.players.find(p => p.user === session.user.id), act_ = db.players.filter(p => !p.removed), admin = isAdmin();
  const ans = id => answerOf(id, date), icon = id => ({ in: '✅', out: '❌' }[ans(id)] || '⏳');
  const by = sched ? hhmm(playMins() - sched.opens_minutes) : '';
  const n = act_.filter(p => ans(p.id) === 'in').length;
  const open = rsvpIsOpen(date);
  return `<div class="card rsvp"><div class="rhead"><div><div class="mut" style="margin:0;font-size:var(--fs-sm)">${t('Next match day')}</div><b>${niceDate(date)}</b> <span class="mut">· ${t('{n} in', { n })}</span></div>
      <span><button class="link" onclick="go('calendar')" aria-label="${t('Calendar')}">📅</button><button class="link" onclick="toggleRsvp()" aria-expanded="${open}">${open ? '▴' : '▾'} ${t('Details')}</button></span></div>
    ${mine ? `<div class="seg"><button class="${ans(mine.id) === 'in' ? 'on' : ''}" onclick="setRsvp(${mine.id}, ${ans(mine.id) === 'in' ? 'null' : "'in'"})">✅ ${t("I'm in")}</button>
      <button class="${ans(mine.id) === 'out' ? 'on' : ''}" onclick="setRsvp(${mine.id}, ${ans(mine.id) === 'out' ? 'null' : "'out'"})">❌ ${t("I'm out")}</button></div>` : ''}
    ${open ? `<div class="chips">${act_.map(p => admin ? `<button class="chip ${ans(p.id) || ''}" onclick="cycleRsvp(${p.id})" aria-label="${t('Answer for {name}', { name: esc(p.name) })}">${av(p.id, 22)} ${esc(p.name)} ${icon(p.id)}</button>`
      : `<span class="chip ${ans(p.id) || ''}">${av(p.id, 22)} ${esc(p.name)} ${icon(p.id)}</span>`).join('')}</div>
    <p class="mut" style="margin:6px 0 0">${by ? t('Answer before {time}.', { time: by }) + ' ' : ''}${t('The list below fills itself: players who are in first.')}${admin ? ' ' + t('Admins can tap a name to answer for them.') : ''}</p>
    ${admin && rsvps.some(x => x.day_date === date) ? `<button class="link danger" onclick="resetRsvps()">↺ ${t('Reset answers')}</button>` : ''}
    <button class="link" onclick="remindMe()">🔔 ${t('Remind me every {day}', { day: dayName(sched ? sched.dow : 4) })}</button>` : ''}</div>`;
}

// month calendar: weekly play days are highlighted; admins tap a date to add an extra day or cancel a normal one
function calendarView() {
  const now = tzParts(), [Y, M] = (calMonth || now.date.slice(0, 7)).split('-').map(Number), admin = isAdmin();
  const first = new Date(Date.UTC(Y, M - 1, 1)), lead = (first.getUTCDay() + 6) % 7, count = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  const title = first.toLocaleDateString(LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const played = new Set(db.days.filter(d => d.started).map(d => d.date));
  const head = [1, 2, 3, 4, 5, 6, 0].map(d => `<div class="wd">${esc(dayName(d).slice(0, 2))}</div>`).join('');
  const cells = Array.from({ length: lead }, () => '<div></div>').concat(Array.from({ length: count }, (_, i) => {
    const iso = `${Y}-${String(M).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, k = markOf(iso);
    const cls = ['d', isPlayDate(iso) ? 'play' : '', k === 'extra' ? 'extra' : '', k === 'cancelled' ? 'off' : '', iso === now.date ? 'today' : '', played.has(iso) ? 'dot' : ''].join(' ');
    if (admin && iso < now.date) return `<button class="${cls}" onclick="backfill('${iso}')" aria-label="${esc(niceDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}">${i + 1}</button>`;
    return admin && iso >= now.date ? `<button class="${cls}" onclick="markDate('${iso}')" aria-label="${esc(niceDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}">${i + 1}</button>` : `<div class="${cls}">${i + 1}</div>`;
  })).join('');
  return `<div class="top"><button class="link" onclick="go('play')">← ${t('Back')}</button></div><h1>📅 ${t('Calendar')}</h1>
    <div class="calnav"><button onclick="calShift(-1)" aria-label="${t('Previous month')}">‹</button><b>${esc(title)}</b><button onclick="calShift(1)" aria-label="${t('Next month')}">›</button></div>
    <div class="cal">${head}${cells}</div>
    <p class="mut legend"><span class="key play"></span>${t('Play day')} <span class="key extra"></span>${t('Extra play day')} <span class="key off"></span>${t('Cancelled')} <span class="key dot"></span>${t('Played')}</p>
    ${admin ? `<p class="mut">${t('Tap a date to add an extra play day or cancel a normal one.')} ${t('Tap an earlier date to add the results of a day that was played.')}</p>` : ''}`;
}

function backfillView() {
  const ids = bf.ids, cyc = ids.length === 4 ? C4 : ids.length === 5 ? C5 : null, who_ = id => `<button class="chip ${ids.includes(id) ? 'in' : ''}" onclick="bfWho(${id})" aria-pressed="${ids.includes(id)}">${av(id, 22)} ${name(id)}${ids.includes(id) ? ' ' + (ids.indexOf(id) + 1) : ''}</button>`;
  const rows = cyc ? cyc.map(([t1, t2], i) => `<div class="card"><div>${t('Match {n}', { n: i + 1 })}: ${pair(slots(ids, t1))} <span class="mut">${t('vs')}</span> ${pair(slots(ids, t2))}</div>
    <div class="seg" style="margin-top:8px"><button class="${bf.res[i] === 1 ? 'on' : ''}" onclick="bfWin(${i},1)">${t('Team 1 Wins')}</button><button class="${bf.res[i] === 2 ? 'on' : ''}" onclick="bfWin(${i},2)">${t('Team 2 Wins')}</button></div></div>`).join('') : '';
  return `<div class="top"><button class="link" onclick="go('calendar')">← ${t('Back')}</button></div><h1>${t('Add an old match day')}</h1><p class="mut">${niceDate(bf.date)}</p>
    <p class="mut">${t('Who played? Pick 4 or 5 players, in the order they were listed.')}</p>
    <div class="chips">${db.players.filter(p => !p.removed).map(p => who_(p.id)).join('')}</div>
    ${rows}${cyc ? `<p class="mut">${t('Set the winner of each match; matches are saved up to the first one left empty.')}</p><button class="primary" onclick="bfSave()" ${bf.res[0] ? '' : 'disabled'}>${t('Save this day')}</button>` : ''}`;
}

function setup(d) {
  const m = d.mode, cyc = m === 4 ? C4 : C5, o = d.order, [a, b, r] = cyc[0], admin = isAdmin();
  const date = nextPlayDate(), ins = o.filter(id => answerOf(id, date) === 'in').length, auto = ins >= 4, icon = id => ({ in: '✅', out: '❌' }[answerOf(id, date)] || '⏳');
  const open = admin || startOpen();
  // the sign-ups fill the list and decide 4 or 5 players; the date is today's. Only when nobody has answered can an admin pick 4 or 5 by hand.
  return `${rsvpCard()}${rsvps.some(x => x.day_date === date) && ins < 4 ? `<p class="mut">${t('Only {n} confirmed so far, you need at least 4.', { n: ins })}</p>` : ''}
      ${admin && !auto ? `<div class="seg" style="margin:0 0 12px"><button class="${m === 4 ? 'on' : ''}" onclick="setMode(4)">${t('4 players')}</button>
        <button class="${m === 5 ? 'on' : ''}" onclick="setMode(5)" ${o.length < 5 ? 'disabled' : ''}>${t('5 players')}</button></div>` : ''}
      <ol>${o.map((id, i) => `${i === m ? `<li class="sep">${t('Sitting out')}</li>` : ''}<li class="row ${i >= m ? 'bench' : ''}">
        <span class="slot">${i + 1}</span>
        ${player(id).user === session.user.id ? `<button class="ph" onclick="avatar(${id})" aria-label="${t('Change your photo')}">${av(id)}</button>` : `<span class="ph">${av(id)}</span>`}
        <button class="nm" onclick="rename(${id})" aria-label="${t('Rename {name}', { name: name(id) })}">${icon(id)} ${name(id)} ✎${player(id).user ? '' : `<span class="tag">${t('no account')}</span>`}</button>
        <button onclick="move(${i},-1)" aria-label="${t('Move up')}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button onclick="move(${i},1)" aria-label="${t('Move down')}" ${i === o.length - 1 ? 'disabled' : ''}>▼</button>
        ${admin ? `<button class="danger" onclick="removePlayer(${id})" aria-label="${t('Remove {name}', { name: name(id) })}">✕</button>` : ''}</li>`).join('')}</ol>
      ${admin ? `<button class="add" onclick="addPlayer()">${t('+ Add guest player (no account)')}</button>` : ''}
      <p class="preview">${t('Match 1: {a} vs {b}', { a: pair(slots(o, a)), b: pair(slots(o, b)) })}${r ? ' · ' + t('{name} rests', { name: name(o[r - 1]) }) : ''}</p>
      ${open ? '' : `<p class="mut" role="status">🔒 ${startNote()}</p>`}
      <button class="primary" onclick="start()" ${open ? '' : 'disabled'}>${t('Start playing')}</button>`;
}

const AWARD = { perfect: () => '💯 ' + t('Perfect night'), comeback: () => '🔄 ' + t('Comeback') };
function closedExtras(d) {
  const an = analyse(db.days, db.players), top = playerOfNight(an, d.id);
  if (!top) return '';
  return `<div class="card potn">${av(top.id, 56)}<div><div class="mut">⭐ ${t('Player of the night')}</div><b style="font-size:var(--fs-lg)">${name(top.id)}</b>
      <div class="mut">${canSee(top.id) ? `${top.delta >= 0 ? '+' : ''}${Math.round(top.delta)} ${t('rating')} · ` : ''}${t('{w} of {p} won', { w: top.w, p: top.p })}</div></div></div>
    ${nightAwards(an, d.id).map(x => `<span class="badge">${name(x.id)}: ${AWARD[x.kind]()}</span>`).join('')}<div style="height:10px"></div>`;
}

function play() {
  const d = cur(), n = d.matches.length, cyc = d.mode === 4 ? C4 : C5, o = d.order, admin = isAdmin();
  if (!d.started) return setup(d);
  if (d.closed) {
    return `<h1>${t('Day closed')} 🏁</h1><p class="mut">${esc(d.date)} · ${tp('{n} matches', n)}</p>
      <div class="card" style="padding:4px 16px;margin-bottom:16px">${stats(d.matches).slice(0, 3).map((r, i) => `<div class="rank"><span class="r">${['🥇', '🥈', '🥉'][i]}</span>${av(r.id, 32)}
        <b>${esc(r.name)}</b><span class="mut" style="margin:0">${r.w}/${r.p}</span><b>${Math.round(pct(r) * 100)}%</b></div>`).join('')}</div>
      ${closedExtras(d)}
      <button class="primary" onclick="photo(${d.id})">📷 ${d.photo ? t('Retake group photo') : t('Take group photo')}</button>
      ${d.photo ? `<p class="mut" style="text-align:center;margin:8px 0 0">✓ ${t('Photo saved in Photos')}</p>` : ''}
      <button class="add" style="margin-top:12px" onclick="shareCard(${d.id})">📤 ${t('Share result card')}</button>
      <button class="add" onclick="newDayBtn()">${t('Start next match day')}</button>
      ${admin ? `<div class="actions"><button class="link" onclick="reopenDay()">${t('Reopen day')}</button></div>` : ''}`;
  }
  const [t1, t2, rest] = cyc[n % cyc.length];
  return `<p class="mut" style="margin:0">${esc(d.date)} · ${t('{n} played', { n })}</p>
    <p class="num">${t('Match {n}', { n: n + 1 })}</p>
    <div class="teams">
      <div class="team" style="--c:var(--t1)"><small>${esc(tn[1] || t('Team 1'))}</small>${slots(o, t1).map(who).join('')}<button class="tname" onclick="nameTeam(1)">✎ ${t('name')}</button></div>
      <div class="team" style="--c:var(--t2)"><small>${esc(tn[2] || t('Team 2'))}</small>${slots(o, t2).map(who).join('')}<button class="tname" onclick="nameTeam(2)">✎ ${t('name')}</button></div>
    </div>
    ${rest ? `<div class="rest">${t('Resting:')} <b>${name(o[rest - 1])}</b></div>` : ''}
    <div class="win">
      <button style="--c:var(--t1)" onclick="recordWin(1)">${t('Team 1 Wins')}</button>
      <button style="--c:var(--t2)" onclick="recordWin(2)">${t('Team 2 Wins')}</button>
    </div>
    <div class="actions">
      <button class="link" onclick="undo()" ${n ? '' : 'disabled'}>↶ ${t('Undo last')}</button>
      ${admin ? `<button class="link" onclick="closeDay()" ${n ? '' : 'disabled'}>🏁 ${t('Close day')}</button>` : ''}
      <button class="link" onclick="newDayBtn()">${t('Next match day')}</button>
      ${admin ? `<button class="link danger" onclick="resetDay()">${t('Reset day')}</button>` : ''}
    </div>`;
}

function board() {
  const days = db.days.filter(d => d.matches.length), sel = days.find(d => d.id === selId) || days[days.length - 1];
  const ms = tab === 'all' ? db.days.flatMap(d => d.matches) : sel ? sel.matches : [];
  const rows = tab === 'all' ? allTime() : stats(ms);
  const picker = tab === 'day' && days.length
    ? `<select onchange="selId=+this.value;render()" aria-label="${t('Day')}">${days.map(d =>
        `<option value="${d.id}" ${d === sel ? 'selected' : ''}>${esc(d.date)} · ${tp('{n} matches', d.matches.length)}</option>`).join('')}</select>`
      + (isAdmin() && sel ? `<div class="actions" style="margin:4px 0 0"><button class="link danger" onclick="deleteDay(${sel.id})">🗑 ${t("Delete this day's leaderboard")}</button></div>` : '') : '';
  const podium = !ms.length ? [] : [[0, '🥇', '#facc15', 120], [1, '🥈', '#cbd5e1', 90], [2, '🥉', '#d97706', 64]].map(([i, medal, c, h]) =>
    `<div class="pod"><div class="medal">${medal}</div>${av(rows[i].id)}<div class="pn">${esc(rows[i].name)}</div>
     <div class="pw">${tp('{n} wins', rows[i].w)} · ${Math.round(pct(rows[i]) * 100)}%</div>
     <div class="bar" style="--c:${c};--h:${h}px">${i + 1}</div></div>`);
  const head = `<h1>${t('Leaderboard')}</h1>
    <div class="seg"><button class="${tab === 'day' ? 'on' : ''}" onclick="tab='day';render()">${t('Day')}</button>
      <button class="${tab === 'all' ? 'on' : ''}" onclick="tab='all';render()">${t('General')}</button>
      <button class="${tab === 'rating' ? 'on' : ''}" onclick="tab='rating';render()">${t('Rating')}</button></div>`;
  if (tab === 'rating') return head + ratingList();
  const side = (m, k) => { const ids = k === 1 ? m.t1 : m.t2, nm = m['team' + k + '_name'];
    return `${m.win === k ? '🏆 ' : ''}${nm ? `<b>${esc(nm)}</b> (${pair(ids)})` : pair(ids)}`; };
  return head + picker + `${ms.length ? `<div class="podium">${podium[1]}${podium[0]}${podium[2]}</div>
      <div class="card" style="padding:4px 16px">${rows.slice(3).map((r, i) => `<div class="rank"><span class="r">${i + 4}</span>${av(r.id, 32)}
        <b>${esc(r.name)}</b><span class="mut" style="margin:0">${r.w}/${r.p}</span><b>${Math.round(pct(r) * 100)}%</b></div>`).join('')}</div>
      ${tab === 'day' && sel ? `<h2 class="sec">${t('Matches')}</h2><div class="card" style="padding:4px 16px">${sel.matches.map(m => `<div class="mrow"><span class="r">${m.n}</span>
        <span style="flex:1">${side(m, 1)} <span class="mut">${t('vs')}</span> ${side(m, 2)}</span><span class="mut">${m.created_at ? new Date(m.created_at).toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>`).join('')}</div>` : ''}`
      : `<div class="empty">${t('No matches yet.')}<br>${t('Play one and the podium shows up here.')}</div>`}
    ${tab === 'all' && isAdmin() ? `<div class="actions"><button class="link danger" onclick="eraseAll()">${t('Reset all scores')}</button></div>` : ''}`;
}

function ratingList() {
  const an = analyse(db.days, db.players), lastDay = [...an.night.keys()].pop(), ranked = db.players.filter(p => an.hist.get(p.id).length)
    .sort((x, y) => an.rating.get(y.id) - an.rating.get(x.id));
  if (!ranked.length) return `<div class="empty">${t('No matches yet.')}<br>${t('Ratings start at 1000 and move with every result.')}</div>`;
  const shown = ranked.filter(p => canSee(p.id)), hidden = ranked.filter(p => !canSee(p.id));
  return `<p class="mut">${t('Everyone starts at 1000. Beat a stronger team and you gain more.')}</p><div class="card" style="padding:4px 16px">${shown.map((p, i) => {
    const dl = (an.night.get(lastDay).get(p.id) || {}).delta;
    return `<div class="rank"><span class="r">${i + 1}</span>${av(p.id, 32)}<b>${esc(p.name)}${sharing(p.id) ? '' : ' 🔒'}</b>
      <span class="mut" style="margin:0">${dl === undefined ? '' : (dl >= 0 ? '▲' : '▼') + Math.abs(Math.round(dl))}</span><b>${Math.round(an.rating.get(p.id))}</b></div>`; }).join('')}
    ${hidden.map(p => `<div class="rank" style="opacity:.6"><span class="r">–</span>${av(p.id, 32)}<b>${esc(p.name)}</b><span class="mut" style="margin:0">🔒 ${t('private')}</span><span></span></div>`).join('')}</div>`;
}

function statsView() {
  const an = analyse(db.days, db.players), mine = db.players.find(p => p.user === session.user.id), played = db.players.filter(p => an.hist.get(p.id).length && canSee(p.id));
  if (!played.length) return `<h1>${t('Stats')}</h1><div class="empty">${t('Stats appear after the first match.')}</div>`;
  const id = played.some(p => p.id === statsId) ? statsId : mine && played.some(p => p.id === mine.id) ? mine.id : played[0].id;
  const h = an.hist.get(id), b = an.badges.get(id), rel = relations(db.days, id), me_ = stats(db.days.flatMap(d => d.matches)).find(r => r.id === id);
  const rate = x => Math.round(100 * x.w / x.g), byRate = (m, min) => [...m].filter(([pid, x]) => x.g >= min && canSee(pid)).sort((p, q) => rate(q[1]) - rate(p[1]) || q[1].g - p[1].g);
  const mates = byRate(rel.mate, 1), foes = byRate(rel.foe, 2), pair_ = bestPair(db.days, 3, ids => ids.every(canSee));
  const nemesis = foes.length ? foes[foes.length - 1] : null, victim = foes.length ? foes[0] : null, line = ([pid, x]) => `${av(pid, 24)} ${name(pid)} <span class="mut">${x.w}-${x.g - x.w} · ${rate(x)}%</span>`;
  const none = `<span class="mut">${t('none yet')}</span>`;
  const badges = [b.potn && `⭐ ${t('Player of the night')} ×${b.potn}`, b.perfect && `💯 ${t('Perfect night')} ×${b.perfect}`, b.fire && `🔥 ${t('5 in a row')} ×${b.fire}`,
    b.comeback && `🔄 ${t('Comeback')} ×${b.comeback}`, b.improved && `📈 ${t('Most improved')}`].filter(Boolean);
  return `<h1>${t('Stats')}</h1>
    <select onchange="statsId=+this.value;render()" aria-label="${t('Player')}">${played.map(p => `<option value="${p.id}" ${p.id === id ? 'selected' : ''}>${esc(p.name)}${sharing(p.id) ? '' : ' 🔒'}</option>`).join('')}</select>
    ${sharing(id) ? '' : `<p class="mut" role="status">🔒 ${t('{name} keeps these stats private. You can see them because you are an admin or it is you.', { name: esc(player(id).name) })}</p>`}
    <div class="card" style="display:flex;align-items:center;gap:14px;margin:12px 0">${av(id, 64)}<div style="flex:1"><b style="font-size:var(--fs-lg)">${name(id)}</b>
      <div class="mut" style="margin:0">${t('Rating')}</div></div><b style="font-size:var(--fs-2xl)">${Math.round(an.rating.get(id))}</b></div>
    <div class="tiles"><div class="tile"><b>${me_.p}</b>${t('matches')}</div><div class="tile"><b>${Math.round(100 * pct(me_))}%</b>${t('win rate')}</div><div class="tile"><b>${b.bestStreak}</b>${t('best streak')}</div></div>
    <h2 class="sec">${t('Badges')}</h2>${badges.map(x => `<span class="badge">${x}</span>`).join('') || `<p class="mut">${t('None yet. Win 5 in a row or finish a night unbeaten.')}</p>`}
    <h2 class="sec">${t('Rating over time')}</h2><div class="card" style="color:var(--mut)">${ratingChart(h.map(x => x.r), 320, 150, t('Rating over time')) || `<p class="mut" style="margin:0">${t('Play a few more matches to see the chart.')}</p>`}</div>
    <h2 class="sec">${t('Partners')}</h2><div class="card" style="padding:4px 16px">${mates.map(x => `<div class="member"><span>${line(x)}</span></div>`).join('') || `<p class="mut">${t('No partners yet.')}</p>`}</div>
    <h2 class="sec">${t('Rivals')}</h2><div class="card" style="padding:4px 16px">
      <div class="member"><span>😈 ${t('Nemesis')}</span><span>${nemesis && rate(nemesis[1]) < 50 ? line(nemesis) : none}</span></div>
      <div class="member"><span>🎯 ${t('Favourite victim')}</span><span>${victim && rate(victim[1]) > 50 ? line(victim) : none}</span></div></div>
    <h2 class="sec">${t('Best pair in the group')}</h2><div class="card">${pair_ ? `${pair(pair_.ids)} <span class="mut">${t('{record} together', { record: `${pair_.w}-${pair_.g - pair_.w}` })}</span>` : `<span class="mut">${t('needs 3 games together')}</span>`}</div>`;
}

function scheduleForm() {
  if (!isAdmin() || !sched) return '';
  const zones = ['Europe/Berlin', 'Europe/Bucharest', 'Europe/Zagreb', 'Europe/Stockholm', 'Europe/London', 'Europe/Paris', 'Europe/Rome', 'Europe/Madrid'];
  return `<h2 class="sec">${t('Play schedule')}</h2><form class="card" onsubmit="saveSchedule(event)">
    <label class="field">${t('Play day')}<select name="dow">${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}" ${d === sched.dow ? 'selected' : ''}>${dayName(d)}</option>`).join('')}</select></label>
    <label class="field">${t('Play time')}<input type="time" name="time" value="${sched.play_time.slice(0, 5)}" required></label>
    <label class="field">${t('Members can start a day this many minutes before play time')}<input type="number" name="mins" min="0" max="720" value="${sched.opens_minutes}" required></label>
    <label class="field">${t('Time zone')}<input type="text" name="tz" list="tzs" value="${esc(sched.tz)}" required autocapitalize="none"><datalist id="tzs">${zones.map(z => `<option value="${z}">`).join('')}</datalist></label>
    <p class="msg" role="alert"></p><button class="primary" type="submit">${t('Save schedule')}</button></form>`;
}

function membersView() {
  const admin = isAdmin(), own = id => db.players.find(p => p.user === id);
  return `<h1>${t('Members')}</h1>${admin ? `<p class="mut">${t('Accounts can log in. Admins can close or reset days, remove players, delete photos and remove accounts.')}</p>` : ''}
    <h2 style="margin:0 0 8px">${t('Accounts ({n})', { n: members.length })}</h2>
    <div class="card" style="padding:4px 16px;margin-bottom:20px">${members.map(m => `<div class="member"><span>${own(m.id) ? av(own(m.id).id, 28) + ' ' : ''}${esc(m.username)}${m.is_admin ? ` · <b>${t('admin')}</b>` : ''}</span>
      ${admin && m.id !== me.id ? `<span><button class="link" onclick="toggleAdmin('${m.id}',${!m.is_admin})">${m.is_admin ? t('Remove admin') : t('Make admin')}</button>
        <button class="link danger" onclick="removeAccount('${m.id}','${esc(m.username)}')" aria-label="${t('Remove account {name}', { name: esc(m.username) })}">✕</button></span>` : ''}</div>`).join('')}</div>
    <h2 style="margin:0 0 8px">${t('Players')}</h2>
    <div class="card" style="padding:4px 16px">${db.players.filter(p => !p.removed).map(p => `<div class="member"><span>${av(p.id, 28)} ${esc(p.name)}</span>
      ${p.user ? `<span class="mut" style="margin:0">${esc((members.find(m => m.id === p.user) || {}).username || '')}</span>` : `<span class="tag">${t('no account')}</span>`}</div>`).join('')}</div>
    ${admin ? `<div class="card"><b>${t('Play background')}</b><p class="mut" style="margin:4px 0 8px">${t('Shown behind the Play tab for everyone.')}</p>
      <button onclick="pickBg()">🖼 ${t('Change background')}</button> <button class="link" onclick="resetBg()">${t('Use default background')}</button>
      <label class="field" style="margin:12px 0 0">${t('Photo dimming')}: <b id="dimv">${dim()}%</b><input type="range" min="0" max="90" step="5" value="${dim()}" oninput="previewDim(this.value)" onchange="saveDim(this.value)"></label></div>` : ''}
    ${scheduleForm()}${logCard()}`;
}

// admins only: who did what (written by the database itself, nobody can edit it)
const LOG = {
  delete_day: d => t('deleted the day {date} with {matches}', { date: d.date, matches: tp('{n} matches', d.matches) }),
  delete_match: d => t('removed match {n} of {date}', { n: d.n, date: d.date }),
  close_day: d => t('closed the day {date}', d), reopen_day: d => t('reopened the day {date}', d), reset_day: d => t('reset the day {date}', d),
  mark_play_date: d => d.kind === 'extra' ? t('added an extra play day on {date}', d) : t('cancelled the play day {date}', d), clear_play_date: d => t('cleared the mark on {date}', d),
  delete_photo: d => t('deleted the photo of {date}', d), remove_player: d => t('removed the player {name}', d),
  make_admin: d => t('made {name} an admin', { name: d.username }), remove_admin: d => t('removed admin rights from {name}', { name: d.username }),
  remove_account: d => t('removed the account of {name}', { name: d.username }), edit_schedule: () => t('changed the play schedule'),
};
function logCard() {
  if (!isAdmin()) return '';
  const when = r => new Date(r.at).toLocaleString(LOCALE[lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<h2 class="sec">${t('Activity log')}</h2><div class="card" style="padding:4px 16px">${adminLog.map(r => `<div class="mrow" style="display:block"><span class="mut">${when(r)}</span><br>
    <b>${esc(r.actor_name || t('system'))}</b> ${esc((LOG[r.action] || (() => r.action))(r.detail))}</div>`).join('') || `<p class="mut">${t('No activity yet.')}</p>`}</div>`;
}

let urls = {};
async function gallery() {
  const days = db.days.filter(d => d.photo).reverse();
  urls = {};
  if (days.length) for (const x of ok(await sb.storage.from('photos').createSignedUrls(days.map(d => d.photo), 3600))) urls[x.path] = x.signedUrl;
  if (view !== 'photos') return;
  gal.innerHTML = days.length ? `<div class="grid">${days.map(d => `<div class="cell"><button onclick="openPhoto(${d.id})">
      <img src="${urls[d.photo]}" alt=""><span>${esc(d.date)} · ${tp('{n} matches', d.matches.length)}<br>🏆 ${esc((stats(d.matches)[0] || { name: '-' }).name)}${KINDS.map(([k, e]) => { const n = reactions.filter(r => r.day_id === d.id && r.kind === k).length; return n ? ` ${e}${n}` : ''; }).join('')}</span></button>
      ${isAdmin() ? `<button class="x" onclick="removePhoto(${d.id})" aria-label="${t('Delete photo of {date}', { date: esc(d.date) })}">✕</button>` : ''}</div>`).join('')}</div>`
    : `<div class="empty">${t('No photos yet.')}<br>${t('Close the day and take the group photo.')}</div>`;
}
async function openPhoto(id) {
  const d = db.days.find(x => x.id === id), blob = await (await fetch(urls[d.photo])).blob(), u = URL.createObjectURL(blob);
  const nm = `badminton-${d.date}.jpg`, f = new File([blob], nm, { type: 'image/jpeg' });
  const el = document.createElement('div'); el.id = 'lb';
  el.innerHTML = `<img src="${u}" alt="${t('Group photo')}"><div class="actions" id="rx" style="margin:0"></div><div class="actions">
    <button id="cd">📤 ${t('Result card')}</button>
    <a href="${u}" download="${nm}">⬇ ${t('Save')}</a>
    ${navigator.canShare && navigator.canShare({ files: [f] }) ? `<button id="sh">${t('Share')}</button>` : ''}
    ${isAdmin() ? `<button id="rm" class="danger">${t('Delete')}</button>` : ''}<button id="cl">${t('Close')}</button></div>`;
  document.body.append(el);
  lbDay = id; drawReactions();
  el.querySelector('#cl').onclick = () => { el.remove(); URL.revokeObjectURL(u); lbDay = null; };
  el.querySelector('#cd').onclick = () => shareCard(id);
  const rm = el.querySelector('#rm');
  if (rm) rm.onclick = () => { el.remove(); removePhoto(d.id); };
  const sh = el.querySelector('#sh'); if (sh) sh.onclick = () => navigator.share({ files: [f] }).catch(() => {});
}

const drawReactions = () => { const el = document.getElementById('rx'); if (el && lbDay) el.innerHTML = reactionBar(lbDay); };
const ICON = k => `<img class="on" src="ic-${k}-on.png" alt=""><img class="off" src="ic-${k}-off.png" alt="">`;
const NAV = { play: () => ICON('play') + '<span>' + t('Play') + '</span>', board: () => ICON('board') + '<span>' + t('Board') + '</span>', photos: () => ICON('photos') + '<span>' + t('Photos') + '</span>', stats: () => ICON('stats') + '<span>' + t('Stats') + '</span>' };

function render() {
  document.documentElement.style.setProperty('--dim', dim() / 100);
  document.body.classList.toggle('out', !session);
  document.body.dataset.view = session ? view : '';
  document.documentElement.lang = lang;
  document.querySelectorAll('nav button').forEach(b => { b.innerHTML = NAV[b.dataset.v](); b.setAttribute('aria-current', b.dataset.v === view ? 'page' : ''); });
  if (!sb) { app.innerHTML = `<h1>${t('Almost there')}</h1><p class="mut">${t('Add your Supabase URL and key to config.js (see SETUP.md).')}</p>`; return; }
  if (!authReady) { app.innerHTML = `<p class="mut">${t('Loading…')}</p>`; return; }
  if (!session) { app.innerHTML = login_(); return; }
  if (!loaded) { app.innerHTML = `<p class="mut">${t('Loading…')}</p>`; return; }
  const mp = db.players.find(p => p.user === session.user.id);
  const top = `<div class="top"><button class="me" onclick="go('profile')" aria-label="${t('Profile')}">${mp ? av(mp.id, 44) : '👤'}<span class="col"><span class="n">${esc(me.username || '')}</span>${isAdmin() ? `<img class="adm" src="tm-admin.png" alt="${t('admin')}" title="${t('admin')}">` : ''}</span></button>
    <span class="bar">${me.is_admin && !asMember ? `<button class="link ico" onclick="toggleView()" aria-label="${t('View as member')}" title="${t('View as member')}">👁</button>` : ''}<button class="link ico" onclick="showHelp()" aria-label="${t('How it works')}" title="${t('How it works')}"><img src="tm-help.png" alt=""></button><button class="link" onclick="go('members')"><img src="tm-members.png" alt="">${t('Members')}</button><button class="link" onclick="logout()"><img src="tm-logout.png" alt="">${t('Log out')}</button></span></div>`;
  const strip = me.is_admin && asMember ? `<div class="strip"><span>👁 ${t('You are viewing the app as a member. Admin tools are hidden.')}</span><button onclick="toggleView()">${t('Back to admin')}</button></div>` : '';
  app.innerHTML = top + strip + (view === 'play' ? play() : view === 'board' ? board() : view === 'members' ? membersView() : view === 'profile' ? profileView() : view === 'stats' ? statsView() : view === 'calendar' ? calendarView() : view === 'backfill' && bf ? backfillView() : `<h1>${t('Photos')}</h1><div id="gal"></div>`);
  drawReactions();
  if (view === 'photos') gallery().catch(e => { gal.innerHTML = `<p class="msg">${esc(friendly(e))}</p>`; });
}
