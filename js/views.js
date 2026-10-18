// Screens: everything that turns the state in data.js into HTML. render() redraws the current screen.
// ---- views
const langPicker = () => `<select class="lang" onchange="setLang(this.value)" aria-label="${t('Language')}">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === lang ? 'selected' : ''}>${v}</option>`).join('')}</select>`;

function login_() {
  const m = authMode, up = m === 'up';
  return `<h1 style="font-size:var(--fs-2xl);margin-top:40px">🏸 Badminton</h1>${lostSession && m === 'in' ? `<p class="mut" role="status">${t('You were signed out. Please log in again.')}</p>` : ''}<p class="mut">${up ? t('Create your account') : m === 'reset' ? t('Reset your password') : m === 'link' ? t('We email you a link that logs you in, no password needed.') : t('Log in to see the scores')}</p>
    <form onsubmit="authForm(event)">
      ${up ? `<input type="text" name="username" placeholder="${t('Username (3-20 letters, numbers, . _)')}" required pattern="[A-Za-z0-9_.]{3,20}" title="${t('3-20 letters, numbers, dot or underscore')}" autocapitalize="none" autocomplete="username">` : ''}
      ${up ? `<select name="player" aria-label="${t('Which player are you?')}"><option value="">${t("I'm a new player")}</option>${unclaimed.map(p => `<option value="${p.id}">${t("I'm {name}", { name: esc(p.name) })}</option>`).join('')}</select>` : ''}
      ${up ? `<input type="email" name="email" placeholder="${t('Email')}" required autocomplete="email">`
           : m === 'reset' || m === 'link' ? `<input type="email" name="login" placeholder="${t('Email')}" required autocomplete="email" ${m === 'link' ? 'autofocus' : ''}>`
           : `<input type="text" name="login" placeholder="${t('Username or email')}" value="${esc(lastLogin())}" required autocapitalize="none" autocomplete="username" ${lastLogin() ? '' : 'autofocus'}>`}
      ${m === 'reset' || m === 'link' ? '' : `<div class="pw"><input type="password" name="password" placeholder="${t('Password (6+ characters)')}" required minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}" ${m === 'in' && lastLogin() ? 'autofocus' : ''}>
        <button type="button" class="link" onclick="const i=this.previousElementSibling;i.type=i.type==='password'?'text':'password';this.textContent=i.type==='password'?'👁':'🙈'" aria-label="${t('Show password')}">👁</button></div>`}
      <p class="msg" role="alert"></p>
      <button class="primary" type="submit">${up ? t('Create account') : m === 'reset' ? t('Send reset link') : m === 'link' ? t('Email me a login link') : t('Log in')}</button>
    </form>
    <div class="actions">${m === 'in' ? `<button class="link" onclick="setAuthMode('up')">${t('Create an account')}</button>
      <button class="link" onclick="setAuthMode('reset')">${t('Forgot password?')}</button></div>
    <div class="actions" style="margin-top:0"><button class="link" onclick="setAuthMode('link')">✉️ ${t('Log in with an email link instead')}</button>` : `<button class="link" onclick="setAuthMode('in')">${t('Back to log in')}</button>`}</div>
    <div class="actions">${langPicker()}</div>`;
}

// Profile: a card with quick links, then a short settings list; each row opens its own small panel (one at a time)
function profileView() {
  const mine = db.players.find(p => p.user === session.user.id), an = analyse(db.days, db.players), ms = mine && stats(db.days.flatMap(d => d.matches)).find(r => r.id === mine.id);
  const pst = mine && ms && { rating: an.rating.get(mine.id), p: ms.p, w: ms.w };
  const row = (k, icon, label, value) => `<button class="srow" data-row="${k}" aria-expanded="${profPanel === k}" onclick="profPanel=profPanel==='${k}'?'':'${k}';render()"><span>${icon} ${label}</span><span class="mut">${value} ${profPanel === k ? '▾' : '›'}</span></button>`;
  const panel = (k, html) => profPanel === k ? `<div class="spanel">${html}</div>` : '';
  const games = mine ? slideDates().map(d => { const a = answerOf(mine.id, d), open = rsvpPhase(d) === 'open' || isAdmin();
    return `<div class="member"><span>${esc(niceDate(d))} · ${hhmm(playMinsOn(d))}${extraOf(d) ? ` <span class="tag">${t('Extra game')}</span>` : ''}</span>
      ${open ? `<span class="seg mini"><button class="${a === 'in' ? 'on' : ''}" onclick="setRsvp(${mine.id}, ${a === 'in' ? 'null' : "'in'"}, '${d}')">✅</button><button class="${a === 'out' ? 'on' : ''}" onclick="setRsvp(${mine.id}, ${a === 'out' ? 'null' : "'out'"}, '${d}')">❌</button></span>` : `<span class="mut">🔒</span>`}</div>`; }).join('') : '';
  return `<div class="top"><button class="link" onclick="go(prevView)">← ${t('Back')}</button></div><h1>${t('Your profile')}</h1>
    ${mine ? `<div class="card" style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:14px">${av(mine.id, 64)}
      <div style="flex:1;min-width:0"><b style="font-size:var(--fs-lg)">${esc(mine.name)}</b><div class="mut" style="margin:0">@${esc(me.username || '')} · ${isAdmin() ? t('admin') : t('Member')}</div></div>
      <button onclick="avatar(${mine.id})" aria-label="${t('Change photo')}">📷 ${t('Change photo')}</button></div>
      ${pst ? `<div class="tiles" style="margin-top:12px"><div class="tile"><b>${Math.round(pst.rating)}</b>${t('Rating')}</div><div class="tile"><b>${pst.p}</b>${t('matches')}</div><div class="tile"><b>${pst.p ? Math.round(100 * pst.w / pst.p) : 0}%</b>${t('win rate')}</div></div>` : ''}
      <div class="quick"><button onclick="statsId=${mine.id};go('stats')">📊 ${t('My stats')}</button><button onclick="profPanel=profPanel==='games'?'':'games';render()">📅 ${t('My next games')}</button><button onclick="photosTab='receipts';go('photos')">🧾 ${t('Receipts')}</button></div>
      ${profPanel === 'games' ? `<div class="spanel" style="margin-top:10px">${games}</div>` : ''}</div>` : ''}
    <h2 class="sgroup">${t('Appearance')}</h2><div class="card slist">
      ${row('lang', '🌐', t('Language'), LANGS[lang])}${panel('lang', `<label class="field" style="margin:0">${langPicker()}</label>`)}
      ${row('theme', '🌗', t('Theme'), { auto: t('Auto'), light: t('Light'), dark: t('Dark') }[themePref()])}${panel('theme', `<div class="seg" style="margin:0">${[['auto', t('Auto')], ['light', t('Light')], ['dark', t('Dark')]].map(([k, l]) => `<button class="${themePref() === k ? 'on' : ''}" onclick="setTheme('${k}')">${l}</button>`).join('')}</div>`)}</div>
    <h2 class="sgroup">${t('Privacy and fun')}</h2><div class="card slist">
      ${row('share', '🔓', t('Share my stats'), me.share_stats !== false ? t('On') : t('Off'))}${panel('share', `<label class="check"><input type="checkbox" ${me.share_stats !== false ? 'checked' : ''} onchange="setShare(this.checked)">
        <span>${t('Share my rating and stats with the others')}<br><small class="mut">${t('The leaderboards always show results.')}</small></span></label>`)}
      ${row('fx', '🎉', t('Confetti and sound'), fxOn() ? t('On') : t('Off'))}${panel('fx', `<label class="check"><input type="checkbox" ${fxOn() ? 'checked' : ''} onchange="setFx(this.checked);render()">
        <span>${t('Confetti and sound when a match is recorded')}</span></label>`)}</div>
    <h2 class="sgroup">${t('Account')}</h2><div class="card slist">
      <div class="srow static"><span>✉ ${t('Email')}</span><span class="mut">${esc(session.user.email || '')}</span></div>
      ${row('password', '🔒', t('Password'), t('Change'))}${panel('password', `<h2 style="margin:0 0 8px">${t('New password')}</h2><form onsubmit="newPassword(event)">
        <input type="password" name="password" placeholder="${t('New password (6+ characters)')}" required minlength="6" autocomplete="new-password">
        <p class="msg" role="alert"></p><button class="primary" type="submit">${t('Save password')}</button></form>`)}
      ${row('help', '❔', t('Help and tour'), '')}${panel('help', `<button class="add" style="margin:0 0 8px" onclick="showHelp()">${t('How it works')}</button><button class="add" style="margin:0" onclick="startTour()">▶ ${t('Show me around')}</button>`)}
      <button class="srow" onclick="logout()"><span>⎋ ${t('Log out')}</span><span class="mut">›</span></button></div>
    <p class="mut" style="text-align:center">${t('Member since')}: ${esc(niceDate(String(session.user.created_at || '').slice(0, 10) || tzParts().date, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>`;
}

function rsvpCard(date = nextPlayDate(), first = true) {
  const mine = db.players.find(p => p.user === session.user.id), act_ = db.players.filter(p => !p.removed), admin = isAdmin();
  const ans = id => answerOf(id, date), icon = id => ({ in: '✅', out: '❌' }[ans(id)] || '⏳');
  const by = deadlineText(date), phase = rsvpPhase(date), locked = phase !== 'open' && !admin;
  if (phase === 'hidden' && !admin) return '';
  const n = act_.filter(p => ans(p.id) === 'in').length;
  const open = rsvpIsOpen(date);
  return `<div class="card rsvp ${dayTint(date)}" data-day="${date}"><div class="rhead"><div><div class="mut" style="margin:0;font-size:var(--fs-sm)">${first ? t('Next match day') : extraOf(date) ? t('Extra game') : t('Later')}</div><b>${niceDate(date)}${extraOf(date) && extraOf(date).play_time ? ' · ' + hhmm(playMinsOn(date)) : ''}</b> <span class="mut">· ${t('{n} in', { n })}</span></div>
      <span><button class="link" onclick="shareSignup('${date}')" aria-label="${t('Share on WhatsApp')}" title="${t('Share on WhatsApp')}">💬</button><button class="link" onclick="go('calendar')" aria-label="${t('Calendar')}">📅</button><button class="link" onclick="toggleRsvp('${date}')" aria-expanded="${open}">${open ? '▴' : '▾'} ${t('Details')}</button></span></div>
    ${extraOf(date) && canCallOff(date) ? `<button class="link" onclick="callOff('${date}', true)">🚫 ${t('Cancel this game')}</button>` : ''}
    ${mine && locked ? `<p class="mut" style="margin:8px 0 0">🔒 ${t('Answers closed at {time}.', { time: by })}</p>` : ''}
    ${mine && !locked ? `<div class="seg"><button class="${ans(mine.id) === 'in' ? 'on' : ''}" onclick="setRsvp(${mine.id}, ${ans(mine.id) === 'in' ? 'null' : "'in'"}, '${date}')">✅ ${t("I'm in")}</button>
      <button class="${ans(mine.id) === 'out' ? 'on' : ''}" onclick="setRsvp(${mine.id}, ${ans(mine.id) === 'out' ? 'null' : "'out'"}, '${date}')">❌ ${t("I'm out")}</button></div>` : ''}
    ${open ? `<div class="chips">${act_.map(p => admin ? `<button class="chip ${ans(p.id) || ''}" onclick="cycleRsvp(${p.id}, '${date}')" aria-label="${t('Answer for {name}', { name: esc(p.name) })}">${av(p.id, 22)} ${esc(p.name)} ${icon(p.id)}</button>`
      : `<span class="chip ${ans(p.id) || ''}">${av(p.id, 22)} ${esc(p.name)} ${icon(p.id)}</span>`).join('')}</div>
    <p class="mut" style="margin:6px 0 0">${by && !locked ? t('Answer before {time}.', { time: by }) + ' ' : ''}${t('The list below fills itself: players who are in first.')}${admin ? ' ' + t('Admins can tap a name to answer for them.') : ''}</p>
    ${admin && rsvps.some(x => x.day_date === date) ? `<button class="link danger" onclick="resetRsvps('${date}')">↺ ${t('Reset answers')}</button>` : ''}
    <button class="link" onclick="remindMe()">🔔 ${t('Remind me every {day}', { day: dayName(sched ? sched.dow : 4) })}</button>` : ''}</div>`;
}

// the play days in the swipe cards (a member no longer sees today's card once the sign-up is hidden)
const slideDates = () => upcomingPlayDates(3).filter(d => isAdmin() || rsvpPhase(d) !== 'hidden');
const dayTint = d => extraOf(d) ? 'extra' : 'regular';
// a later play day: everyone's answers for that day, players who are in first (read-only)
function laterList(d) {
  const rank = id => ({ in: 0, out: 2 }[answerOf(id, d)] ?? 1), icon = id => ({ in: '✅', out: '❌' }[answerOf(id, d)] || '⏳');
  const ps = db.players.filter(p => !p.removed).sort((x, y) => rank(x.id) - rank(y.id));
  return `<p class="mut" style="margin:4px 0 8px">${t('Answers for {date}. The playing order is set on the day itself.', { date: esc(niceDate(d)) })}</p>
    <ol>${ps.map((p, i) => `<li class="row ${rank(p.id) === 2 ? 'bench' : ''}"><span class="slot">${rank(p.id) === 0 ? i + 1 : ''}</span><span class="ph">${av(p.id, 36)}</span><span class="nm">${icon(p.id)} ${esc(p.name)}</span></li>`).join('')}</ol>`;
}
// the next 3 play days side by side: swipe left and right; the dots show where you are
function rsvpSlides() {
  const cards = slideDates().map((d, k) => rsvpCard(d, k === 0));
  if (cards.length < 2) return cards.join('');
  return `<div class="slides" onpointerdown="const k=[...this.children].indexOf(event.target.closest('.slide'));if(k>=0)slideIdx=k" onscroll="onSlides(this)">${cards.map(c => `<div class="slide">${c}</div>`).join('')}</div>
    <div class="dots">${cards.map((_, k) => `<i class="${k === slideIdx ? 'on' : ''}"></i>`).join('')}</div>`;
}

// month calendar: weekly play days are highlighted; admins tap a date to add an extra day or cancel a normal one
function calledOffCards() {
  return playDates.filter(p => p.kind === 'extra' && p.called_off && p.day >= tzParts().date).sort((x, y) => x.day < y.day ? -1 : 1)
    .map(p => `<div class="card invite off">🚫 ${t('The extra game on {date} at {time} is cancelled.', { date: esc(niceDate(p.day)), time: esc(hhmm(playMinsOn(p.day))) })}
      ${canCallOff(p.day) ? `<button class="link" onclick="callOff('${p.day}', false)">↺ ${t('Bring the game back')}</button>` : ''}</div>`).join('');
}
function inviteCards() {
  const mine = db.players.find(p => p.user === session.user.id), by = p => esc((members.find(m => m.id === p.created_by) || {}).username || '?');
  return invites().map(p => `<div class="card invite" data-day="${p.day}"><div>🏸 <b>${t('Extra game')}</b> · ${esc(niceDate(p.day))} ${sched ? esc(hhmm(playMinsOn(p.day))) : ''}
      <div class="mut" style="margin:2px 0 8px">${t('Added by {name}. Do you want to join?', { name: by(p) })} ${t('Answer before {time}.', { time: esc(deadlineText(p.day)) })} · ${t('{n} in', { n: rsvps.filter(r => r.day_date === p.day && r.status === 'in').length })}</div></div>
    <div class="seg"><button onclick="setRsvp(${mine.id}, 'in', '${p.day}')">✅ ${t("I'm in")}</button><button onclick="setRsvp(${mine.id}, 'out', '${p.day}')">❌ ${t("I'm out")}</button></div>
    <button class="link wa" onclick="shareExtra('${p.day}')">💬 ${t('Share on WhatsApp')}</button></div>`).join('');
}

function calendarView() {
  const now = tzParts(), [Y, M] = (calMonth || now.date.slice(0, 7)).split('-').map(Number), admin = isAdmin();
  const first = new Date(Date.UTC(Y, M - 1, 1)), lead = (first.getUTCDay() + 6) % 7, count = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  const title = first.toLocaleDateString(LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const played = new Set(db.days.filter(d => d.started).map(d => d.date));
  const head = [1, 2, 3, 4, 5, 6, 0].map(d => `<div class="wd">${esc(dayName(d).slice(0, 2))}</div>`).join('');
  const cells = Array.from({ length: lead }, () => '<div></div>').concat(Array.from({ length: count }, (_, i) => {
    const iso = `${Y}-${String(M).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, k = markOf(iso);
    const cls = ['d', isPlayDate(iso) ? 'play' : '', k === 'extra' ? (extraOf(iso).called_off ? 'xoff' : 'extra') : '', k === 'cancelled' ? 'off' : '', iso === now.date ? 'today' : '', played.has(iso) ? 'dot' : ''].join(' ');
    if (admin && iso < now.date) return `<button class="${cls}" onclick="backfill('${iso}')" aria-label="${esc(niceDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}">${i + 1}</button>`;
    const canTap = admin || (k === 'extra' && (playDates.find(p => p.day === iso) || {}).created_by === session.user.id) || (!k && sched && dowOf(iso) !== sched.dow);
    return canTap && iso >= now.date ? `<button class="${cls}" onclick="markDate('${iso}')" aria-label="${esc(niceDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}">${i + 1}</button>` : `<div class="${cls}">${i + 1}</div>`;
  })).join('');
  return `<div class="top"><button class="link" onclick="go('play')">← ${t('Back')}</button></div><h1>📅 ${t('Calendar')}</h1>
    <div class="calnav"><button onclick="calShift(-1)" aria-label="${t('Previous month')}">‹</button><b>${esc(title)}</b><button onclick="calShift(1)" aria-label="${t('Next month')}">›</button></div>
    <div class="cal">${head}${cells}</div>
    <p class="mut legend"><span class="key play"></span>${t('Play day')} <span class="key extra"></span>${t('Extra play day')} <span class="key off"></span>${t('Cancelled')} <span class="key dot"></span>${t('Played')}</p>
    ${admin ? `<p class="mut">${t('Tap a date to add an extra play day or cancel a normal one.')} ${t('Tap an earlier date to add the results of a day that was played.')}</p>` : `<p class="mut">${t('Tap a free date to add an extra game; the others are asked if they join. Tap your own extra game to remove it.')}</p>`}`;
}

function backfillView() {
  const ids = bf.ids, cyc = ids.length === 4 ? C4 : ids.length === 5 ? C5 : null, who_ = id => `<button class="chip ${ids.includes(id) ? 'in' : ''}" onclick="bfWho(${id})" aria-pressed="${ids.includes(id)}">${av(id, 22)} ${name(id)}${ids.includes(id) ? ' ' + (ids.indexOf(id) + 1) : ''}</button>`;
  const rows = cyc ? Array.from({ length: bfRows() }, (_, i) => cyc[i % cyc.length]).map(([t1, t2], i) => `<div class="card"><div>${t('Match {n}', { n: i + 1 })}: ${pair(slots(ids, t1))} <span class="mut">${t('vs')}</span> ${pair(slots(ids, t2))}</div>
    <div class="seg" style="margin-top:8px"><button class="${bf.res[i] === 1 ? 'on' : ''}" onclick="bfWin(${i},1)">${t('Team 1 Wins')}</button><button class="${bf.res[i] === 2 ? 'on' : ''}" onclick="bfWin(${i},2)">${t('Team 2 Wins')}</button></div></div>`).join('') : '';
  const saved = bf.editId ? [] : db.days.filter(d => d.date === bf.date && d.closed && d.matches.length);
  return `<div class="top"><button class="link" onclick="go('calendar')">← ${t('Back')}</button></div><h1>${bf.editId ? t('Edit match day') : t('Add an old match day')}</h1><p class="mut">${niceDate(bf.date)}</p>
    ${saved.map(d => `<div class="card" style="margin-bottom:12px"><b>${tp('{n} matches', d.matches.length)}</b> <span class="mut">· ${d.order.slice(0, d.mode).map(name).join(', ')}</span>
      <div class="actions" style="margin:8px 0 0"><button class="link" onclick="bfEdit(${d.id})">✎ ${t('Edit')}</button><button class="link danger" onclick="deleteDay(${d.id})">🗑 ${t('Delete')}</button></div></div>`).join('')}
    <p class="mut">${t('Who played? Pick 4 or 5 players, in the order they were listed.')}</p>
    <div class="chips">${db.players.filter(p => !p.removed || ids.includes(p.id)).map(p => who_(p.id)).join('')}</div>
    ${rows}${cyc ? `<button class="add" onclick="bfMore()">+ ${t('Add another match')}</button><p class="mut">${t('Set the winner of each match; matches are saved up to the first one left empty.')}</p><button class="primary" onclick="bfSave()" ${bf.res[0] ? '' : 'disabled'}>${t('Save this day')}</button>` : ''}`;
}

function setup(d) {
  const m = d.mode, o = d.order, first = nextTeams(d), admin = isAdmin();
  const date = nextPlayDate(), ins = o.filter(id => answerOf(id, date) === 'in').length, auto = ins >= 3, icon = id => ({ in: '✅', out: '❌' }[answerOf(id, date)] || '⏳');
  const open = admin || startOpen();
  // the swipe cards pick the day; the list below belongs to that day (the editable line-up only exists for the next match day)
  const sd = slideDates(), sel = slideIdx && sd[Math.min(slideIdx, sd.length - 1)] || date;
  const rowOf = (id, i) => `<li class="row ${i >= m ? 'bench' : ''}">
        <span class="slot">${i + 1}</span>
        ${player(id).user === session.user.id ? `<button class="ph" onclick="avatar(${id})" aria-label="${t('Change your photo')}">${av(id, 36)}</button>` : `<span class="ph">${av(id, 36)}</span>`}
        <button class="nm" ${admin || player(id).user === session.user.id ? `onclick="rename(${id})" aria-label="${t('Rename {name}', { name: name(id) })}"` : 'tabindex="-1"'}>${icon(id)} ${name(id)}${admin || player(id).user === session.user.id ? ' ✎' : ''}${player(id).user ? '' : `<span class="tag">${t('no account')}</span>`}</button>
        <button onclick="move(${i},-1)" aria-label="${t('Move up')}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button onclick="move(${i},1)" aria-label="${t('Move down')}" ${i === o.length - 1 ? 'disabled' : ''}>▼</button>
        ${!admin && ownFreshGuest(player(id)) ? `<button class="danger" onclick="removePlayer(${id})" aria-label="${t('Remove {name}', { name: name(id) })}">✕</button>` : ''}</li>`;
  const idle = db.players.filter(p => !p.removed && !o.includes(p.id));
  // who plays with whom is shown from 15 minutes before play time (and on the match screen once started)
  // the sign-ups fill the list and decide 4 or 5 players; the date is today's. Only when nobody has answered can an admin pick 4 or 5 by hand.
  return `${calledOffCards()}${inviteCards()}<div class="dayzone ${dayTint(sel)}">${rsvpSlides()}${sel !== date ? laterList(sel) : `${rsvps.some(x => x.day_date === date) && ins < 3 ? `<p class="mut">${t('Only {n} confirmed so far, you need at least 3.', { n: ins })}</p>` : ''}
      ${auto ? '' : `<div class="seg" style="margin:0 0 12px"><button class="${m === 3 ? 'on' : ''}" onclick="setMode(3)" ${o.length < 3 ? 'disabled' : ''}>${t('3 players')}</button><button class="${m === 4 ? 'on' : ''}" onclick="setMode(4)">${t('4 players')}</button>
        <button class="${m === 5 ? 'on' : ''}" onclick="setMode(5)" ${o.length < 5 ? 'disabled' : ''}>${t('5 players')}</button></div>`}
      <ol>${o.slice(0, m).map((id, i) => rowOf(id, i)).join('')}</ol>
      ${!sched || minsUntilPlay(date) <= 15 ? `<div class="next"><small>${t('Match {n}', { n: 1 })}</small>
        <div class="vs"><b style="--c:var(--t1)">${pair(first.t1)}</b><span>${t('vs')}</span><b style="--c:var(--t2)">${pair(first.t2)}</b></div>
        ${first.rest ? `<div class="rs">${t('Resting:')} <b>${name(first.rest)}</b></div>` : ''}<button class="link wa" onclick="shareLineup()">💬 ${t('Share the line-up on WhatsApp')}</button></div>` : ''}
      <button class="add" onclick="addPlayer()">${t('+ Add guest player (no account)')}</button>
      ${idle.length ? `<details class="fold"><summary>${t('Guests who have not played lately')} (${idle.length})</summary><div class="chips">${idle.map(p => `<button class="chip" onclick="bringBack(${p.id})">${av(p.id, 22)} ${esc(p.name)} +</button>`).join('')}</div></details>` : ''}
      ${o.length > m ? `<details class="fold" ${benchOpen ? 'open' : ''} ontoggle="benchOpen=this.open"><summary>${t('Sitting out')} (${o.length - m})</summary><ol>${o.slice(m).map((id, k) => rowOf(id, m + k)).join('')}</ol></details>` : ''}
`}</div>
      ${date === tzParts().date ? `<div class="startbar">${open ? '' : `<p class="mut" role="status">🔒 ${startNote()}</p>`}
      <button class="primary" onclick="start()" ${open ? '' : 'disabled'}>${t('Start playing')}</button></div>`
      : admin ? `<button class="link" style="display:block;margin:0 auto" onclick="start()">▶ ${t('Start playing')} (${t('admin')})</button>` : ''}`;
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
  const d = cur(), n = d.matches.length, admin = isAdmin();
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
  const { t1, t2, rest } = nextTeams(d);
  return `<p class="mut" style="margin:0">${esc(d.date)} · ${t('{n} played', { n })}${d.mode === 3 ? ' · ' + t('Winner stays on, at most 3 games in a row.') : ''}</p>
    <p class="num">${t('Match {n}', { n: n + 1 })}</p>
    <div class="teams">
      <div class="team" style="--c:var(--t1)"><small>${esc(tn[1] || t('Team 1'))}</small>${t1.map(who).join('')}<button class="tname" onclick="nameTeam(1)">✎ ${t('name')}</button></div>
      <div class="team" style="--c:var(--t2)"><small>${esc(tn[2] || t('Team 2'))}</small>${t2.map(who).join('')}<button class="tname" onclick="nameTeam(2)">✎ ${t('name')}</button></div>
    </div>
    ${rest ? `<div class="rest">${t('Resting:')} <b>${name(rest)}</b></div>` : ''}
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
  const ym = lbMonth || tzParts().date.slice(0, 7), champ = monthChamps().find(c => c.ym === ym);
  const ms = tab === 'all' ? db.days.flatMap(d => d.matches) : tab === 'month' ? monthMatches(ym) : sel ? sel.matches : [];
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
      <button class="${tab === 'month' ? 'on' : ''}" onclick="tab='month';render()">${t('Month')}</button>
      <button class="${tab === 'all' ? 'on' : ''}" onclick="tab='all';render()">${t('General')}</button>
      <button class="${tab === 'rating' ? 'on' : ''}" onclick="tab='rating';render()">${t('Rating')}</button></div>`;
  if (tab === 'rating') return head + ratingList();
  const side = (m, k) => { const ids = k === 1 ? m.t1 : m.t2, nm = m['team' + k + '_name'];
    return `${m.win === k ? '🏆 ' : ''}${nm ? `<b>${esc(nm)}</b> (${pair(ids)})` : pair(ids)}`; };
  const mpick = tab === 'month' ? `<div class="calnav"><button onclick="monthShift(-1)" aria-label="${t('Previous month')}">‹</button><b>${esc(monthName(ym))}</b><button onclick="monthShift(1)" aria-label="${t('Next month')}">›</button></div>
    ${champ ? `<p class="mut" style="text-align:center">👑 ${t('Champion of {month}: {name}', { month: esc(monthName(ym)), name: name(champ.id) })}</p>` : ''}` : '';
  return head + picker + mpick + `${ms.length ? `<div class="podium">${podium[1]}${podium[0]}${podium[2]}</div>
      <div class="card" style="padding:4px 16px">${rows.slice(3).map((r, i) => `<div class="rank"><span class="r">${i + 4}</span>${av(r.id, 32)}
        <b>${esc(r.name)}</b><span class="mut" style="margin:0">${r.w}/${r.p}</span><b>${Math.round(pct(r) * 100)}%</b></div>`).join('')}</div>
      ${tab === 'day' && sel ? `<h2 class="sec">${t('Matches')}</h2><div class="card" style="padding:4px 16px">${sel.matches.map(m => `<div class="mrow"><span class="r">${m.n}</span>
        <span style="flex:1">${side(m, 1)} <span class="mut">${t('vs')}</span> ${side(m, 2)}</span><span class="mut">${m.created_at ? new Date(m.created_at).toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>`).join('')}</div>` : ''}`
      : `<div class="empty">${t('No matches yet.')}<br>${t('Play one and the podium shows up here.')}</div>`}`;
}

function ratingList() {
  const an = analyse(db.days, db.players), lastDay = [...an.night.keys()].pop(), ranked = db.players.filter(p => an.hist.get(p.id).length)
    .sort((x, y) => an.rating.get(y.id) - an.rating.get(x.id));
  if (!ranked.length) return `<div class="empty">${t('No matches yet.')}<br>${t('Ratings start at 1000 and move with every result.')}</div>`;
  const shown = ranked.filter(p => canSee(p.id)), hidden = ranked.filter(p => !canSee(p.id));
  return `<p class="mut">${t('Everyone starts at 1000. Beat a stronger team and you gain more.')}</p><div class="card" style="padding:4px 16px">${shown.map((p, i) => {
    const dl = (an.night.get(lastDay).get(p.id) || {}).delta;
    return `<div class="rank tap" role="button" tabindex="0" onclick="openStats(${p.id})" onkeydown="if(event.key==='Enter')openStats(${p.id})"><span class="r">${i + 1}</span>${av(p.id, 32)}<b>${esc(p.name)}${sharing(p.id) ? '' : ' 🔒'}</b>
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
  const crowns = monthChamps().filter(c => c.id === id).length;
  const badges = [crowns && `👑 ${t('Champion of the month')} ×${crowns}`, b.potn && `⭐ ${t('Player of the night')} ×${b.potn}`, b.perfect && `💯 ${t('Perfect night')} ×${b.perfect}`, b.fire && `🔥 ${t('5 in a row')} ×${b.fire}`,
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
    <h2 class="sec">${t('Head-to-head')}</h2><div class="card" style="padding:4px 16px">${[...rel.foe].filter(([pid]) => canSee(pid)).sort((p, q) => q[1].g - p[1].g).map(x => `<div class="member"><span>${line(x)}</span></div>`).join('') || `<p class="mut">${t('No opponents yet.')}</p>`}</div>
    <h2 class="sec">${t('Best pair in the group')}</h2><div class="card">${pair_ ? `${pair(pair_.ids)} <span class="mut">${t('{record} together', { record: `${pair_.w}-${pair_.g - pair_.w}` })}</span>` : `<span class="mut">${t('needs 3 games together')}</span>`}</div>`;
}


function membersView() {
  const own = id => db.players.find(p => p.user === id);
  return `<h1>${t('Members')}</h1>
    <h2 style="margin:0 0 8px">${t('Accounts ({n})', { n: members.length })}</h2>
    <div class="card" style="padding:4px 16px;margin-bottom:20px">${members.map(m => `<div class="member"><span>${own(m.id) ? av(own(m.id).id, 28) + ' ' : ''}${esc(m.username)}${m.is_admin ? ` · <b>${t('admin')}</b>` : ''}</span></div>`).join('')}</div>
    <h2 style="margin:0 0 8px">${t('Players')}</h2>
    <div class="card" style="padding:4px 16px">${db.players.filter(p => !p.removed).map(p => `<div class="member"><span>${av(p.id, 28)} ${esc(p.name)}</span>
      ${p.user ? `<span class="mut" style="margin:0">${esc((members.find(m => m.id === p.user) || {}).username || '')}</span>` : `<span class="tag">${t('no account')}</span>`}</div>`).join('')}</div>`;
}

// every admin tool on one page (opened from the top bar)
// Admin tools: a status card, then a grouped list. Big sections (players, accounts, usage, log) open as their own page,
// small settings (schedule, times, background, icons) open as a panel under their row.
function adminView() {
  const d = cur(), o = d.order, own = id => db.players.find(p => p.user === id), back = `<div class="top"><button class="link" onclick="adminPage='';render()">← ${t('Admin tools')}</button></div>`;
  if (adminPage === 'players') return back + `<h1>${t('Players')}</h1><div class="card" style="padding:4px 16px">${db.players.filter(p => !p.removed).map(p => `<div class="member"><span>${av(p.id, 28)} ${esc(p.name)} ${p.user ? '' : `<span class="tag">${t('no account')}</span>`}</span>
      ${d.started || !o.includes(p.id) ? '' : `<button class="link danger" onclick="removePlayer(${p.id})" aria-label="${t('Remove {name}', { name: esc(p.name) })}">✕</button>`}</div>`).join('')}
      <button class="add" style="margin:8px 0" onclick="addPlayers()">+ ${t('Add players without an account')}</button></div>`;
  if (adminPage === 'accounts') return back + `<h1>${t('Accounts ({n})', { n: members.length })}</h1>
    <div class="card" style="padding:4px 16px">${members.map(a => `<div class="member"><span>${own(a.id) ? av(own(a.id).id, 28) + ' ' : ''}${esc(a.username)}${a.is_admin ? ` · <b>${t('admin')}</b>` : ''}</span>
      ${a.id !== me.id ? `<span><button class="link" onclick="toggleAdmin('${a.id}',${!a.is_admin})">${a.is_admin ? t('Remove admin') : t('Make admin')}</button>
        <button class="link danger" onclick="removeAccount('${a.id}','${esc(a.username)}')" aria-label="${t('Remove account {name}', { name: esc(a.username) })}">✕</button></span>` : ''}</div>`).join('')}</div>`;
  if (adminPage === 'usage') return back + usageCard();
  if (adminPage === 'log') return back + logCard();
  const row = (k, icon, label, value, page) => `<button class="srow" data-adm="${k}" onclick="${page ? `adminPage='${k}'` : `admPanel=admPanel==='${k}'?'':'${k}'`};render()"><span>${icon} ${label}</span><span class="mut">${value} ${!page && admPanel === k ? '▾' : '›'}</span></button>`;
  const panel = (k, html) => admPanel === k ? `<div class="spanel">${html}</div>` : '';
  const zones = ['Europe/Berlin', 'Europe/Bucharest', 'Europe/Zagreb', 'Europe/Stockholm', 'Europe/London', 'Europe/Paris', 'Europe/Rome', 'Europe/Madrid'];
  const week = new Set(usage.filter(r => r.day > addDays(tzParts().date, -7)).map(r => r.user_id)).size, last = adminLog[0];
  const pm = sched ? playMins() : 0, times = sched ? `${t('Start')} ${hhmm(pm - sched.opens_minutes)} · ${t('answers')} ${hhmm(pm - sched.rsvp_until_minutes)}` : '';
  return `<div class="top"><button class="link" onclick="go(prevView)">← ${t('Back')}</button></div><h1>${t('Admin tools')}</h1>
    <div class="card astatus"><span>👥 ${db.players.filter(p => !p.removed).length} ${t('players')}</span><span>🔑 ${members.length} ${t('accounts')}</span><span>📊 ${week} ${t('active, 7 days')}</span>
      <span>${dbBehind ? `⚠ ${t('Database needs updates')}` : `✅ ${t('Database up to date')}`}</span></div>
    <h2 class="sgroup">${t('People')}</h2><div class="card slist">
      ${row('players', '👥', t('Players'), db.players.filter(p => !p.removed).length, true)}${row('accounts', '🔑', t('Accounts'), members.length, true)}</div>
    <h2 class="sgroup">${t('Games and schedule')}</h2><div class="card slist">
      ${sched ? row('schedule', '🗓', t('Play schedule'), `${esc(dayName(sched.dow))} ${hhmm(pm)}`) + panel('schedule', `<form onsubmit="saveSchedule(event)">
        <label class="field">${t('Play day')}<select name="dow">${[1, 2, 3, 4, 5, 6, 0].map(x => `<option value="${x}" ${x === sched.dow ? 'selected' : ''}>${dayName(x)}</option>`).join('')}</select></label>
        <label class="field">${t('Play time')}${timeSel('time', pm)}</label>
        <label class="field">${t('Time zone')}<input type="text" name="tz" list="tzs" value="${esc(sched.tz)}" required autocapitalize="none"><datalist id="tzs">${zones.map(z => `<option value="${z}">`).join('')}</datalist></label>
        <p class="msg" role="alert"></p><button class="primary" type="submit">${t('Save schedule')}</button></form>`)
      + row('times', '⏱', t('Times'), times) + panel('times', `<form onsubmit="saveSchedule(event)">
        <label class="field">${t('Members can press Start playing this many minutes before play time')}<input type="number" name="mins" min="0" max="720" value="${sched.opens_minutes}" required></label>
        <label class="field">${t('Answers (in / out) close this many minutes before play time')}<input type="number" name="until" min="0" max="1440" value="${sched.rsvp_until_minutes}" required></label>
        <label class="field">${t('The sign-up section is hidden this many minutes before play time')}<input type="number" name="hide" min="0" max="1440" value="${sched.rsvp_hide_minutes}" required></label>
        <p class="msg" role="alert"></p><button class="primary" type="submit">${t('Save schedule')}</button></form>`) : ''}
      <button class="srow" onclick="go('calendar')"><span>📅 ${t('Calendar')}</span><span class="mut">${t('extra days, cancelled days, old days')} ›</span></button></div>
    <h2 class="sgroup">${t('Look')}</h2><div class="card slist">
      ${row('bg', '🖼', t('Play background'), dim() ? `${t('Photo dimming')} ${dim()}%` : '')}${panel('bg', `<p class="mut" style="margin:0 0 8px">${t('Shown behind the Play tab for everyone.')}</p>
        <button onclick="pickBg()">🖼 ${t('Change background')}</button> <button class="link" onclick="resetBg()">${t('Use default background')}</button>
        <label class="field" style="margin:12px 0 0">${t('Photo dimming')}: <b id="dimv">${dim()}%</b><input type="range" min="0" max="90" step="5" value="${dim()}" oninput="previewDim(this.value)" onchange="saveDim(this.value)"></label>`)}
      ${row('icons', '✏', t('Icons'), iconSet() === 'minimal' ? t('Minimal') : t('Neon'))}${panel('icons', `<div class="seg" style="margin:0 0 8px">${[['neon', t('Neon')], ['minimal', t('Minimal')]].map(([k, l]) => `<button class="${iconSet() === k ? 'on' : ''}" onclick="saveIconSet('${k}')">${l}</button>`).join('')}</div>
        <div class="iconrow">${['play', 'board', 'photos', 'stats', 'members', 'admin', 'logout', 'help'].map(k => svgIcon(k)).join('')}</div><p class="mut" style="margin:6px 0 0">${t('The minimal set follows the light or dark theme.')}</p>`)}</div>
    <h2 class="sgroup">${t('Insights')}</h2><div class="card slist">
      ${row('usage', '📊', t('Usage'), `${week} ${t('active, 7 days')}`, true)}${row('log', '📜', t('Activity log'), last ? esc((last.actor_name || '') + ' ' + (LOG[last.action] || (() => last.action))(last.detail)) : '', true)}</div>
    <h2 class="sgroup danger">${t('Danger zone')}</h2><div class="card slist">
      ${row('danger', '⚠', t('Reset all scores'), '')}${panel('danger', `<p class="mut" style="margin:0 0 8px">${t('Reset ALL scores? This deletes every day, match and group photo for everyone. Players and accounts are kept. This cannot be undone.')}</p><button class="danger" onclick="eraseAll()">${t('Reset all scores')}</button>`)}</div>`;
}

// admins only: how the app is used (last 30 days): who is active, which tabs, what people do, and when
function usageCard() {
  const today = tzParts().date, tabs = ['play', 'board', 'photos', 'stats', 'profile', 'members', 'calendar', 'admin'];
  const label = { play: t('Play'), board: t('Board'), photos: t('Photos'), stats: t('Stats'), profile: t('Profile'), members: t('Members'), calendar: t('Calendar'), admin: t('Admin tools') };
  const sum = rows => rows.reduce((x, r) => x + r.n, 0), views = usage.filter(r => tabs.includes(r.what));
  const active = days => new Set(usage.filter(r => r.day > addDays(today, -days)).map(r => r.user_id)).size;
  const pct = rows => { const tot = sum(rows); return tabs.map(k => [k, sum(rows.filter(r => r.what === k))]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${label[k]} ${Math.round(100 * n / tot)}%`).join(' · '); };
  // when: by weekday and by hour of day
  const byDow = [1, 2, 3, 4, 5, 6, 0].map(d => [d, sum(views.filter(r => dowOf(r.day) === d))]), byHour = Array.from({ length: 24 }, (_, h) => sum(views.filter(r => r.hour === h)));
  const topDow = [...byDow].sort((a, b) => b[1] - a[1])[0], two = byHour.map((n, h) => n + (byHour[h + 1] || 0)), topH = two.indexOf(Math.max(...two)), max = Math.max(1, ...byDow.map(x => x[1]));
  const bars = byDow.map(([d, n]) => `<div class="ubar"><i style="height:${Math.round(40 * n / max)}px"></i><small>${esc(dayName(d).slice(0, 2))}</small></div>`).join('');
  // what each person does
  const person = m => {
    const mine = usage.filter(r => r.user_id === m.id), pl = db.players.find(p => p.user === m.id), seen = mine.map(r => r.day).sort().pop();
    const ans = pl ? rsvps.filter(r => r.player_id === pl.id && r.updated_at) : [];
    const early = ans.length ? Math.round(ans.reduce((x, r) => x + (Date.parse(`${r.day_date}T${hhmm(playMinsOn(r.day_date))}`) - Date.parse(r.updated_at)) / 36e5, 0) / ans.length) : null;
    const recorded = db.days.reduce((x, d) => x + d.matches.filter(mt => mt.created_by === m.id).length, 0), act = k => sum(mine.filter(r => r.what === k));
    return { m, seen, html: `<div class="urow"><b>${esc(m.username)}</b> <span class="mut">${seen ? t('last seen {date}', { date: esc(niceDate(seen)) }) : t('not seen in 30 days')}</span>
      ${mine.length ? `<small>${pct(mine.filter(r => tabs.includes(r.what)))}</small>` : ''}
      <small>✅ ${ans.length}${early !== null ? ` (${t('~{h} h before', { h: early })})` : ''} · 🏸 ${recorded} · 📷 ${act('act:photo')} · 🧾 ${receipts.filter(r => r.created_by === m.id).length} · 💬 ${act('act:whatsapp')}</small></div>` };
  };
  const people = members.map(person).sort((a, b) => (b.seen || '').localeCompare(a.seen || ''));
  return `<h2 class="sec">${t('Usage (last 30 days)')}</h2><div class="card usage">
      <div class="tiles"><div class="tile"><b>${active(7)}</b>${t('active, 7 days')}</div><div class="tile"><b>${active(30)}</b>${t('active, 30 days')}</div><div class="tile"><b>${sum(views)}</b>${t('screens opened')}</div></div>
      ${views.length ? `<p><b>${t('Most used')}:</b> ${pct(views)}</p><p><b>${t('Busiest')}:</b> ${esc(dayName(topDow[0]))} ${hhmm(topH * 60)}–${hhmm((topH + 2) * 60)}</p><div class="ubars">${bars}</div>` : `<p class="mut">${t('No usage counted yet.')}</p>`}
      <p class="mut" style="margin:8px 0 0">✅ ${t('answers')} · 🏸 ${t('matches recorded')} · 📷 ${t('photos')} · 🧾 ${t('receipts')} · 💬 ${t('WhatsApp shares')}</p>
      ${people.map(x => x.html).join('')}</div>`;
}

// admins only: who did what (written by the database itself, nobody can edit it)
const LOG = {
  delete_day: d => t('deleted the day {date} with {matches}', { date: d.date, matches: tp('{n} matches', d.matches) }),
  delete_match: d => t('removed match {n} of {date}', { n: d.n, date: d.date }),
  close_day: d => t('closed the day {date}', d), reopen_day: d => t('reopened the day {date}', d), reset_day: d => t('reset the day {date}', d),
  mark_play_date: d => d.kind === 'extra' ? t('added an extra play day on {date}', d) : t('cancelled the play day {date}', d), clear_play_date: d => t('cleared the mark on {date}', d), call_off_extra: d => t('cancelled the extra game on {date}', d), restore_extra: d => t('brought back the extra game on {date}', d),
  delete_photo: d => t('deleted the photo of {date}', d), remove_player: d => t('removed the player {name}', d),
  make_admin: d => t('made {name} an admin', { name: d.username }), remove_admin: d => t('removed admin rights from {name}', { name: d.username }),
  remove_account: d => t('removed the account of {name}', { name: d.username }), edit_schedule: () => t('changed the play schedule'),
};
function logCard() {
  if (!isAdmin()) return '';
  const when = r => new Date(r.at).toLocaleString(LOCALE[lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const rows = logAll ? adminLog : adminLog.slice(0, 5);   // the latest 5; the rest one tap away
  return `<h2 class="sec">${t('Activity log')}</h2><div class="card log">${rows.map(r => `<div><span class="mut">${when(r)}</span>
    <b>${esc(r.actor_name || t('system'))}</b> ${esc((LOG[r.action] || (() => r.action))(r.detail))}</div>`).join('') || `<p class="mut">${t('No activity yet.')}</p>`}
    ${adminLog.length > 5 ? `<button class="link" onclick="logAll=!logAll;render()">${logAll ? t('Show less') : t('Show all ({n})', { n: adminLog.length })}</button>` : ''}</div>`;
}

let urls = {};
async function gallery() {
  if (photosTab === 'receipts') return receiptList();
  const days = db.days.filter(d => d.photo).reverse();
  urls = {};
  if (days.length) for (const x of ok(await sb.storage.from('photos').createSignedUrls(days.map(d => d.photo), 3600))) urls[x.path] = x.signedUrl;
  if (view !== 'photos') return;
  gal.innerHTML = days.length ? `<div class="grid">${days.map(d => `<div class="cell"><button onclick="openPhoto(${d.id})">
      <img src="${urls[d.photo]}" alt=""><span>${esc(d.date)} · ${tp('{n} matches', d.matches.length)}<br>🏆 ${esc((stats(d.matches)[0] || { name: '-' }).name)}${KINDS.map(([k, e]) => { const n = reactions.filter(r => r.day_id === d.id && r.kind === k).length; return n ? ` ${e}${n}` : ''; }).join('')}</span></button>
      ${isAdmin() ? `<button class="x" onclick="removePhoto(${d.id})" aria-label="${t('Delete photo of {date}', { date: esc(d.date) })}">✕</button>` : ''}</div>`).join('')}</div>`
    : `<div class="empty">${t('No photos yet.')}<br>${t('Close the day and take the group photo.')}</div>`;
  minimalize(gal);
}
async function receiptList() {
  const sig = {}, paths = receipts.map(r => r.photo_path).filter(Boolean);
  if (paths.length) for (const x of ok(await sb.storage.from('photos').createSignedUrls(paths, 3600))) sig[x.path] = x.signedUrl;
  if (view !== 'photos') return;
  const who = r => esc((members.find(m => m.id === r.created_by) || {}).username || '?');
  gal.innerHTML = `<button class="add" onclick="addReceipt()">🧾 ${t('Add a receipt')}</button>` + (receipts.length ? `<div class="card" style="padding:4px 16px">${receipts.map(r => `<div class="member">
      <a href="${sig[r.photo_path] || '#'}" target="_blank" rel="noopener" style="display:flex;gap:12px;align-items:center;color:inherit;text-decoration:none;flex:1;min-width:0">
        ${sig[r.photo_path] ? `<img src="${sig[r.photo_path]}" alt="${t('Receipt')}" style="width:52px;height:52px;object-fit:cover;border-radius:8px">` : '🧾'}
        <span style="min-width:0"><b>${esc(r.note || t('Receipt'))}</b>${r.amount != null ? ` · ${(+r.amount).toFixed(2)}` : ''}<br><span class="mut" style="margin:0">${who(r)} · ${esc(niceDate(r.created_at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }))}</span></span></a>
      ${r.created_by === session.user.id || isAdmin() ? `<button class="link danger" onclick="removeReceipt(${r.id})" aria-label="${t('Delete this receipt?')}">✕</button>` : ''}</div>`).join('')}</div>`
    : `<div class="empty">${t('No receipts yet.')}<br>${t('Add one when you pay for an extra court or shuttles.')}</div>`);
  minimalize(gal);
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
  document.body.append(el); minimalize(el);
  lbDay = id; drawReactions();
  el.querySelector('#cl').onclick = () => { el.remove(); URL.revokeObjectURL(u); lbDay = null; };
  el.querySelector('#cd').onclick = () => shareCard(id);
  const rm = el.querySelector('#rm');
  if (rm) rm.onclick = () => { el.remove(); removePhoto(d.id); };
  const sh = el.querySelector('#sh'); if (sh) sh.onclick = () => navigator.share({ files: [f] }).catch(() => {});
}

const drawReactions = () => { const el = document.getElementById('rx'); if (el && lbDay) el.innerHTML = reactionBar(lbDay); };
// two icon sets, chosen by an admin for everyone: the neon pictures, or minimal line icons that take the text colour
const LINE = {
  play: '<circle cx="12" cy="18" r="3"/><path d="M9.6 16.2 6 4h12l-3.6 12.2M7.2 8.5h9.6M10.2 4l.9 11.2M13.8 4l-.9 11.2"/>',
  board: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3.5 3.8M16 6h3a3 3 0 0 1-3.5 3.8M12 13v4M8.5 20h7M10 17h4"/>',
  photos: '<path d="M4 8h3.2l1.8-2.8h6L16.8 8H20v11H4z"/><circle cx="12" cy="13.2" r="3.3"/>',
  stats: '<path d="M4 20h16M7 16.5V12M12 16.5V7.5M17 16.5V10"/>',
  members: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.6 14.2A4.5 4.5 0 0 1 21 18.5"/>',
  admin: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17.5 12v3M20.5 12v2.2"/>',
  logout: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.6"/><path d="M12 17h.01"/>',
};
Object.assign(LINE, {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>', bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>', image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>', undo: '<path d="M4 9h11a5 5 0 0 1 0 10h-4M8 5 4 9l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', go: '<path d="M8 5l11 7-11 7z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  flag: '<path d="M5 21V4h12l-2 4 2 4H5"/>', warn: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>', save: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
});
// minimal set: the emoji used as icons anywhere in the app become line icons (reactions, medals and badges stay as they are)
const EMO = { '👁': 'eye', '💬': 'chat', '📅': 'calendar', '✅': 'check', '❌': 'cross', '✕': 'cross', '⏳': 'clock', '✎': 'pencil', '📤': 'share', '🔔': 'bell',
  '🧾': 'receipt', '🖼': 'image', '🚫': 'ban', '↺': 'undo', '↶': 'undo', '🗑': 'trash', '▶': 'go', '🔒': 'lock', '✉': 'mail', '🏁': 'flag', '📷': 'photos',
  '📊': 'stats', '🏆': 'board', '🏸': 'play', '👥': 'members', '❔': 'help', '❓': 'help', '⚙': 'gear', '⚠': 'warn', '🔑': 'admin', '⬇': 'save' };
const EMO_RE = new RegExp('(' + Object.keys(EMO).join('|') + ')\uFE0F?', 'gu');
function minimalize(root) {
  if (!root || iconSet() !== 'minimal') return;
  const skip = n => /^(OPTION|SELECT|TEXTAREA|SCRIPT|STYLE|TITLE)$/.test(n.parentNode.nodeName) || n.parentNode.closest('#rx, .podium, .badge, .rx, .lic');
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), hits = [];
  while (w.nextNode()) { EMO_RE.lastIndex = 0; if (EMO_RE.test(w.currentNode.data) && !skip(w.currentNode)) hits.push(w.currentNode); }
  for (const n of hits) { const s = document.createElement('span'); s.innerHTML = esc(n.data).replace(EMO_RE, (_, e) => svgIcon(EMO[e], 'inl i-' + EMO[e])); n.replaceWith(...s.childNodes); }
}
const svgIcon = (k, cls = '') => `<svg class="lic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE[k]}</svg>`;
const ICON = k => iconSet() === 'minimal' ? svgIcon(k) : `<img class="on" src="ic-${k}-on.png" alt=""><img class="off" src="ic-${k}-off.png" alt="">`;
const TOPIMG = { members: 'tm-members.png', admin: 'tm-adminkey.png', logout: 'tm-logout.png', help: 'tm-help.png' };
const topIcon = k => iconSet() === 'minimal' ? svgIcon(k) : `<img src="${TOPIMG[k]}" alt="">`;
const NAV = { play: () => ICON('play') + '<span>' + t('Play') + (session && loaded && invites().length ? ' •' : '') + '</span>', board: () => ICON('board') + '<span>' + t('Board') + '</span>', photos: () => ICON('photos') + '<span>' + t('Photos') + '</span>', stats: () => ICON('stats') + '<span>' + t('Stats') + '</span>' };

function render() {
  if (session && loaded && view !== lastTracked) { lastTracked = view; track(view); }
  if (view === 'admin' && !isAdmin()) view = 'play';
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
  const top = `<div class="top"><button class="me" onclick="go('profile')" aria-label="${t('Profile')}">${mp ? av(mp.id, 44) : '👤'}<span class="col"><span class="n">${esc(me.username || '')}</span></span></button>
    <span class="bar">${me.is_admin && !asMember ? `<button class="link ico" onclick="toggleView()" aria-label="${t('View as member')}" title="${t('View as member')}">👁</button>` : ''}<button class="link ico" id="helpbtn" onclick="showHelp()" aria-label="${t('How it works')}" title="${t('How it works')}">${topIcon('help')}</button><button class="link" onclick="go('members')">${topIcon('members')}${t('Members')}</button>${isAdmin() ? `<button class="link" onclick="adminPage='';admPanel='';go('admin')" aria-label="${t('Admin tools')}" title="${t('Admin tools')}">${topIcon('admin')}${t('admin')}</button>` : ''}<button class="link" onclick="logout()">${topIcon('logout')}${t('Log out')}</button></span></div>`;
  const behind = isAdmin() && dbBehind ? `<div class="strip"><span>⚠️ ${t('The database is missing updates, so some buttons may fail. Apply the newest migrations in Supabase (see SETUP.md).')}</span></div>` : '';
  const strip = behind + (me.is_admin && asMember ? `<div class="strip"><span>👁 ${t('You are viewing the app as a member. Admin tools are hidden.')}</span><button onclick="toggleView()">${t('Back to admin')}</button></div>` : '');
  app.innerHTML = top + strip + (view === 'play' ? play() : view === 'board' ? board() : view === 'members' ? membersView() : view === 'admin' && isAdmin() ? adminView() : view === 'profile' ? profileView() : view === 'stats' ? statsView() : view === 'calendar' ? calendarView() : view === 'backfill' && bf ? backfillView() : `<h1>${t('Photos')}</h1><div class="seg" style="margin-bottom:12px"><button class="${photosTab === 'photos' ? 'on' : ''}" onclick="photosTab='photos';render()">📷 ${t('Photos')}</button><button class="${photosTab === 'receipts' ? 'on' : ''}" onclick="photosTab='receipts';render()">🧾 ${t('Receipts')}</button></div><div id="gal"></div>`);
  drawReactions();
  const sl = document.querySelector('.slides'); shownSlide = slideIdx; if (sl && slideIdx) sl.scrollLeft = slideIdx * sl.clientWidth;
  minimalize(app);
  if (view === 'photos') gallery().catch(e => { gal.innerHTML = `<p class="msg">${esc(friendly(e))}</p>`; });
}

// ---- guided tour: a spotlight on each part of the app with a short explanation (first run, and from the help screen)
const TOUR = () => [
  ['.invite, .rsvp', '👋 ' + t('Welcome!'), t('Before each play day tap “I\'m in” or “I\'m out” here. The player list fills itself from the answers.')],
  ['#app ol .row', '👥 ' + t('The players'), t('The first 5 (or 4) in the list play, the others sit out. Move people with ▲ ▼ and pick 4 or 5 players above the list.')],
  ['.startbar', '▶️ ' + t('Start playing'), t('It opens shortly before play time. Who plays with whom shows 15 minutes before.')],
  ['.win', '🏆 ' + t('Record the winner'), t('After every match tap the team that won. Everyone sees the scores live.')],
  ['nav [data-v=board]', '🏆 ' + t('Board'), t('Leaderboards for the day, the month and all time, plus everyone\'s rating.')],
  ['nav [data-v=photos]', '📷 ' + t('Photos'), t('The group photo of each day, and receipts for extra courts or shuttles.')],
  ['nav [data-v=stats]', '📊 ' + t('Stats'), t('Your rating over time, badges, best partners and head-to-head records.')],
  ['.top .me', '🙂 ' + t('Your profile'), t('Tap your photo for your profile: picture, language, light or dark theme and privacy.')],
  ['[aria-label="Admin tools"]', '🔑 ' + t('Admin tools'), t('Players, accounts, the play schedule, the background and the activity log.')],
  ['#helpbtn', '❔ ' + t('Help'), t('Badminton rules, the rotation and this tour are always here.')],
];
function startTour() {
  helpShown = true; go('play');
  document.getElementById('tour')?.remove();
  const steps = TOUR().filter(([sel]) => { const el = document.querySelector(sel); return el && el.getClientRects().length; });
  const el = document.createElement('div'); el.id = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = '<div class="spot"></div><div class="tip" aria-live="polite"></div>';
  document.body.append(el);
  let i = 0;
  const end = () => { try { localStorage.setItem('seenHelp', '1'); } catch {} el.remove(); removeEventListener('resize', show); };
  function show() {
    const [sel, title, text] = steps[i], target = document.querySelector(sel);
    if (!target) return end();
    target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect(), spot = el.querySelector('.spot'), tip = el.querySelector('.tip'), pad = 6;
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
    tip.innerHTML = `<b>${title}</b><p>${text}</p><div class="tnav"><span class="mut">${i + 1} / ${steps.length}</span>
      <button class="link" id="tskip">${t('Skip')}</button>${i ? `<button id="tback">${t('Back')}</button>` : ''}<button class="primary" id="tnext">${i === steps.length - 1 ? t('Done') : t('Next')}</button></div>`;
    minimalize(tip);
    const below = r.bottom + 12 + tip.offsetHeight < innerHeight;  // the bubble goes under the highlight when it fits, otherwise above
    tip.style.top = (below ? r.bottom + pad + 10 : Math.max(8, r.top - pad - 10 - tip.offsetHeight)) + 'px';
    tip.querySelector('#tnext').onclick = () => (++i < steps.length ? show() : end());
    tip.querySelector('#tskip').onclick = end;
    if (i) tip.querySelector('#tback').onclick = () => { i--; show(); };
    tip.querySelector('#tnext').focus();
  }
  el.onkeydown = e => { if (e.key === 'Escape') end(); };
  addEventListener('resize', show);
  steps.length ? show() : end();
}
