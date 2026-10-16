// Data layer: state, loading from Supabase, live updates, sign-in, and every action that changes something.
// Loaded before views.js; the screens only read this state and call these functions.
// Slots 1-5 are filled by the players chosen in setup; C5[i] = [team1 slots, team2 slots, resting slot]
const C5 = [
  [[1, 2], [3, 4], 5],
  [[2, 3], [4, 5], 1],
  [[3, 5], [1, 4], 2],
  [[4, 2], [5, 1], 3],
  [[5, 2], [1, 3], 4],
];
// 4 players: nobody rests, every pairing happens once
const C4 = [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]];
const today = () => new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD

// Everything lives in Supabase (see supabase/migrations); this is the last fetched copy, shared by all logged-in members.
let db = { players: [], days: [] }, members = [], me = {}, session = null, loaded = false, authReady = false;
let sched = null; // play schedule (null until loaded / before its migration): no restriction then
let std = null, adminLog = []; // standings counted by the database (null before its migration); activity log (admins)
let rsvps = [], reactions = [], tn = { 1: '', 2: '' }, statsId = null, dateTouched = null, lbDay = null; // sign-ups, photo reactions, team names for the next match
let view = 'play', tab = 'day', selId = null, authMode = 'in', unclaimed = [], helpShown = false, lastWin = 0, manualLogout = false, lostSession = false;
// the sign-in is kept on the phone (localStorage) and renewed automatically, so people stay logged in until they log out
const sb = window.supabase && CONFIG.url && !CONFIG.url.includes('YOUR-')
  ? supabase.createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cur = () => db.days[db.days.length - 1];
const player = id => db.players.find(p => p.id === id);
const name = id => esc(player(id).name);
const pair = ids => ids.map(name).join(' &amp; ');
const av = (id, s = 40) => {
  const p = player(id);
  return p.avatar ? `<img class="av" style="--s:${s}px" src="${p.avatar}" alt="">`
    : `<span class="av" style="--s:${s}px;background:hsl(${id * 67 % 360} 50% 36%)">${esc(p.name[0].toUpperCase())}</span>`;
};
const who = id => `<div class="who">${av(id, 34)}<b>${name(id)}</b></div>`;
const slots = (order, ids) => ids.map(s => order[s - 1]);
const ok = r => { if (r.error) throw r.error; return r.data; };
const dayName = dow => new Date(Date.UTC(2024, 0, 7 + dow)).toLocaleDateString(LOCALE[lang], { weekday: 'long', timeZone: 'UTC' }); // 7 Jan 2024 was a Sunday
const niceDate = (iso, o = { weekday: 'long', day: 'numeric', month: 'short' }) => new Date(iso + 'T12:00:00Z').toLocaleDateString(LOCALE[lang], { ...o, timeZone: 'UTC' });

// ---- who may see whose rating and stats: players decide for themselves, admins see everything. Guests (no account) are shared.
const profileOf = pid => { const u = player(pid).user; return u && members.find(m => m.id === u); };
const sharing = pid => { const pr = profileOf(pid); return !pr || pr.share_stats !== false; };
const canSee = pid => me.is_admin || player(pid).user === session.user.id || sharing(pid);

// ---- loading + live updates
async function refresh() {
  if (!session) return;
  const seq = changeSeq;
  const [p, d, m, sc, rs, rx, sd] = await Promise.all([
    sb.from('players').select('*').order('id'),
    sb.from('days').select('*, matches(*)').order('id'),
    sb.from('profiles').select('*').order('name'),
    sb.from('schedule').select('*'),
    sb.from('rsvps').select('*'),
    sb.from('reactions').select('*'),
    sb.rpc('standings'),
  ]);
  if (pending > 0 || seq !== changeSeq) return; // taps happened while this was loading: its answer is out of date, the next re-fetch will show the truth
  std = sd.error ? null : sd.data;
  sched = !sc.error && sc.data[0] ? sc.data[0] : null;
  rsvps = rs.error ? [] : rs.data; reactions = rx.error ? [] : rx.data; // empty until the migration has been applied
  db.players = ok(p).map(x => ({ id: x.id, name: x.name, avatar: x.avatar, removed: !x.active, user: x.user_id }));
  db.days = ok(d).map(x => ({ id: x.id, date: x.date, order: x.player_order, mode: x.mode, started: x.started, closed: x.closed,
    photo: x.photo_path, matches: x.matches.sort((a, b) => a.n - b.n) }));
  if (!session) return; // logged out while loading
  members = ok(m); me = members.find(x => x.id === session.user.id);
  if (!me && !members.length) return; // an empty answer is a hiccup, not a removed account: never log anyone out because of it
  if (!me) { me = {}; manualLogout = true; await sb.auth.signOut(); return; } // an admin removed this account
  if (me.lang && me.lang !== lang) setLangLocal(me.lang); // the language follows the account
  if (me.is_admin) { const lg = await sb.from('admin_log').select('*').order('id', { ascending: false }).limit(40); adminLog = lg.error ? [] : lg.data; }

  if (!db.days.length) { ok(await sb.from('days').insert(dayRow(null))); return refresh(); }
  const day = cur(), missing = db.players.filter(x => !x.removed && !day.order.includes(x.id)).map(x => x.id);
  if (!day.started && missing.length) { await patchDay(day.id, { player_order: [...day.order, ...missing] })(); return refresh(); } // new accounts join today's setup
  // everyone's "I'm in / I'm out" answers fill the player list: in, then no answer, then out (stable, so manual order is kept inside each group)
  const date = nextPlayDate(), answer = id => (rsvps.find(r => r.day_date === date && r.player_id === id) || {}).status;
  if (!day.started && rsvps.some(r => r.day_date === date)) {
    const rank = id => answer(id) === 'in' ? 0 : answer(id) === 'out' ? 2 : 1, order = [...day.order].sort((a, b) => rank(a) - rank(b));
    const ins = order.filter(id => rank(id) === 0).length, mode = ins >= 4 ? Math.min(5, ins) : day.mode; // 4 or 5 in = 4 or 5 play
    if (order.join() !== day.order.join() || mode !== day.mode) { await patchDay(day.id, { player_order: order, mode })(); return refresh(); }
  }
  loaded = true; render();
  if (!helpShown && !helpSeen()) { helpShown = true; showHelp(); } // first run: explain the rotation once
}
// Every write goes through act(). `optimistic` changes the screen immediately; the server calls then run one after the other,
// and a single re-fetch at the end shows the server's truth (which also undoes the change if a call failed).
let queue = Promise.resolve(), pending = 0, epoch = 0, changeSeq = 0;
function act(fn, optimistic) {
  changeSeq++;
  if (optimistic) { optimistic(); render(); }
  const mine = epoch; pending++;
  queue = queue.then(async () => {
    if (mine === epoch) {                        // a failure cancels what was queued behind it: those taps built on the failed one
      try { await fn(); } catch (e) { epoch++; alert(e.code === '23505' ? t('Someone already recorded this match. Showing the latest.') : friendly(e)); }
    }
    if (--pending === 0) { try { await refresh(); } catch (e) { alert(friendly(e)); } }
  });
  return queue;
}
let timer, channel;
const later = () => { clearTimeout(timer); timer = setTimeout(() => session && pending === 0 && refresh().catch(() => {}), 200); };

// ---- auth
const showMsg = text => { document.querySelector('.msg').textContent = text; }; // keep what was typed
const authForm = e => {
  e.preventDefault(); showMsg('');
  const f = new FormData(e.target);
  (authMode === 'up' ? signup : authMode === 'reset' ? reset : login)(f).catch(err => showMsg(friendly(err)));
};
// The login box takes an email or a username. For a username the database releases the email only when the password is right
// (and throttles wrong guesses), so nobody can look up other people's emails.
// shortcut: until the database has the privacy migration, fall back to the old lookup so nobody is locked out; delete the fallbacks once it has been applied
const noFunction = r => r.error && /schema cache|could not find the function/i.test(r.error.message);
async function loginEmail(u, pw) { const r = await sb.rpc('login_email', { u, pw }); return noFunction(r) ? ok(await sb.rpc('email_for_username', { u })) : ok(r); }
async function usernameTaken(u) { const r = await sb.rpc('username_taken', { u }); return noFunction(r) ? !!ok(await sb.rpc('email_for_username', { u })) : ok(r); }
async function login(f) {
  const who = f.get('login').trim(), password = f.get('password');
  const email = who.includes('@') ? who : await loginEmail(who, password);
  if (!email) return showMsg(t('Wrong username/email or password.')); // same answer for an unknown user and a wrong password
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) showMsg(friendly(error));
  else try { localStorage.setItem('lastLogin', who); } catch {}   // remembered to pre-fill the box next time (never the password)
}
async function signup(f) {
  const u = f.get('username').trim();
  if (await usernameTaken(u)) return showMsg(t('That username is taken.'));
  const { data, error } = await sb.auth.signUp({ email: f.get('email'), password: f.get('password'),
    options: { data: { username: u, player_id: f.get('player'), lang }, emailRedirectTo: location.origin + location.pathname } });
  if (error) showMsg(friendly(error));
  else if (!data.session) showMsg(t('Account created. Check your email to confirm it, then log in.'));
}
async function reset(f) { // by email only: looking an email up from a username would reveal it
  const { error } = await sb.auth.resetPasswordForEmail(f.get('login').trim(), { redirectTo: location.origin + location.pathname });
  if (error) return showMsg(friendly(error));
  showMsg(t('If that account exists, a reset link is on its way. Check your email.')); // same answer either way
}
async function newPassword(e) {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('password') });
  if (error) return showMsg(friendly(error));
  alert(t('Password changed.')); go('play');
}
const logout = () => { manualLogout = true; return sb.auth.signOut(); };
const lastLogin = () => { try { return localStorage.getItem('lastLogin') || ''; } catch { return ''; } };
const setAuthMode = async m => {
  authMode = m;
  if (m === 'up') unclaimed = (await sb.rpc('unclaimed_players')).data || []; // players nobody has claimed yet
  render();
};

// ---- settings: language and sharing
const setLang = l => { // saved on this phone and, when logged in, on the account so it follows you
  setLangLocal(l); render();
  if (session && me.id) sb.from('profiles').update({ lang }).eq('id', me.id).then(() => {});
};
const setShare = on => act(async () => ok(await sb.from('profiles').update({ share_stats: on }).eq('id', me.id)));

// ---- first-run help
const helpSeen = () => { try { return localStorage.getItem('seenHelp') === '1'; } catch { return true; } };
function showHelp() {
  const rows = C5.map(([a, b, r], i) => `<tr><td>${i + 1}</td><td>${a.join(' + ')} ${t('vs')} ${b.join(' + ')}</td><td>${r}</td></tr>`).join('');
  const el = document.createElement('div'); el.id = 'help'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="card"><h1>${t('How it works')}</h1>
    <ol class="steps"><li>${t('Before play day tap “I\'m in” or “I\'m out”. The player list fills itself from the answers.')}</li>
      <li>${t('Starting a day opens one hour before play time. The first 5 (or 4) players in the list play, the others sit out.')}</li>
      <li>${t('After every match tap the winning team. The leaderboards and ratings update for everyone.')}</li>
      <li>${t('At the end an admin closes the day and anyone can take the group photo.')}</li></ol>
    <h2 class="sec">${t('The rotation')}</h2>
    <p>${t('With 5 players there are 5 matches, 2 against 2, and one player rests each time. Everyone rests exactly once and plays with every other player exactly once.')}</p>
    <table class="rot"><tr><th>${t('Match')}</th><th>${t('Teams')}</th><th>${t('Rests')}</th></tr>${rows}</table>
    <p class="mut">${t('The numbers are places in the player list (1 = top).')}</p>
    <p>${t('With 4 players there are 3 matches and nobody rests.')}</p>
    <h2 class="sec">${t('Rating')}</h2><p>${t('Everyone starts at 1000 points. Beating stronger players earns more.')}</p>
    <button class="primary" id="gotit">${t('Got it')}</button></div>`;
  document.body.append(el);
  el.querySelector('#gotit').onclick = () => { try { localStorage.setItem('seenHelp', '1'); } catch {} el.remove(); };
}

// ---- actions
const go = v => { view = v; render(); };
const dayRow = prev => { // a new day inherits the previous order/mode; players added since then go to the end
  const ids = db.players.filter(p => !p.removed).map(p => p.id), old = prev ? prev.order.filter(id => ids.includes(id)) : [];
  return { date: today(), player_order: [...old, ...ids.filter(id => !old.includes(id))], mode: Math.min(prev ? prev.mode : 5, ids.length) };
};
const patchDay = (id, o) => async () => ok(await sb.from('days').update(o).eq('id', id));
const move = (i, d) => { const day = cur(), o = [...day.order]; [o[i], o[i + d]] = [o[i + d], o[i]];
  return act(patchDay(day.id, { player_order: o }), () => { day.order = o; }); };
const setDate = v => v && (dateTouched = cur().id, act(patchDay(cur().id, { date: v })));
const setMode = n => { const day = cur(); return n <= day.order.length && act(patchDay(day.id, { mode: n }), () => { day.mode = n; }); };
// the day gets today's date when it starts (it may have been created days earlier), unless someone picked a date by hand
const start = () => { const day = cur(), date = dateTouched === day.id ? day.date : today();
  return act(patchDay(day.id, { started: true, date }), () => Object.assign(day, { started: true, date })); };
const rename = id => {
  const n = (prompt(t('Player name'), player(id).name) || '').trim().slice(0, 20);
  if (n) act(async () => ok(await sb.from('players').update({ name: n }).eq('id', id)));
};
const addPlayer = () => {
  const n = (prompt(t('New player name')) || '').trim().slice(0, 20);
  if (!n) return;
  act(async () => {
    const p = ok(await sb.from('players').insert({ name: n }).select().single());
    await patchDay(cur().id, { player_order: [...cur().order, p.id] })();
  });
};
// Removed players are only hidden (active = false) so past matches and leaderboards keep working. Admins only.
const removePlayer = id => {
  const d = cur();
  if (d.order.length <= 4) return alert(t('You need at least 4 players.'));
  if (!confirm(t('Remove {name}? Past results stay in the leaderboards.', { name: player(id).name }))) return;
  act(async () => {
    ok(await sb.from('players').update({ active: false }).eq('id', id));
    const order = d.order.filter(x => x !== id);
    await patchDay(d.id, { player_order: order, mode: Math.min(d.mode, order.length) })();
  });
};
let pickFor;
const avatar = id => { pickFor = id; pick.value = ''; pick.click(); };
const shrink = (file, max, q, square) => new Promise(ok => {
  const img = new Image();
  img.onload = () => {
    const s = square ? Math.min(img.width, img.height) : 0, k = square ? max / s : Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = square ? max : img.width * k; c.height = square ? max : img.height * k;
    square ? c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, max, max)
           : c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src); c.toBlob(ok, 'image/jpeg', q);
  };
  img.src = URL.createObjectURL(file);
});
const toDataUrl = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
pick.onchange = async () => {
  const f = pick.files[0]; if (!f) return;
  const url = await toDataUrl(await shrink(f, 96, .8, true)), id = pickFor; // 96px square, stored in the players table
  act(async () => ok(await sb.from('players').update({ avatar: url }).eq('id', id)));
};
let shotFor;
const photo = id => { shotFor = id; shot.value = ''; shot.click(); };
shot.onchange = async () => {
  const f = shot.files[0]; if (!f) return;
  const blob = await shrink(f, 1280, .8), path = `days/${shotFor}.jpg`, id = shotFor;
  act(async () => {
    ok(await sb.storage.from('photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' }));
    await patchDay(id, { photo_path: path })();
  });
};
const nameTeam = n => { const v = prompt(t('Name for team {n}', { n }), tn[n]); if (v !== null) { tn[n] = v.trim().slice(0, 24); render(); } };
const recordWin = team => {
  if (performance.now() - lastWin < 700) return; lastWin = performance.now(); // a double tap must not record two matches
  primeAudio();
  const d = cur(), cyc = d.mode === 4 ? C4 : C5, [t1, t2, rest] = cyc[d.matches.length % cyc.length];
  const names = { ...(tn[1] && { team1_name: tn[1] }), ...(tn[2] && { team2_name: tn[2] }) }; // only sent when set
  const row = { day_id: d.id, n: d.matches.length + 1, t1: slots(d.order, t1), t2: slots(d.order, t2), rest: rest ? d.order[rest - 1] : null, win: team, ...names };
  return act(async () => ok(await sb.from('matches').insert(row)), () => {
    d.matches.push({ ...row, id: null, created_at: new Date().toISOString() }); tn = { 1: '', 2: '' }; celebrate();
  });
};

// ---- Thursday sign-up
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function nextPlayDate() { // the play date people are answering for (this week's play day, or next week's once tonight's day has started)
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: sched ? sched.tz : undefined, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date());
  const g = x => f.find(y => y.type === x).value, ahead = sched ? (sched.dow - DAYS.indexOf(g('weekday')) + 7) % 7 : 0;
  const iso = n => new Date(Date.UTC(+g('year'), +g('month') - 1, +g('day') + ahead + n)).toISOString().slice(0, 10);
  return db.days.some(d => d.started && d.date === iso(0)) ? iso(7) : iso(0);
}
const answerOf = (id, date) => (rsvps.find(r => r.day_date === date && r.player_id === id) || {}).status;
const setRsvp = (id, status) => { const date = nextPlayDate();
  return act(async () => {
    if (status) ok(await sb.from('rsvps').upsert({ day_date: date, player_id: id, status, updated_at: new Date().toISOString() }));
    else ok(await sb.from('rsvps').delete().eq('day_date', date).eq('player_id', id));
  }, () => { rsvps = rsvps.filter(r => !(r.day_date === date && r.player_id === id)); if (status) rsvps.push({ day_date: date, player_id: id, status }); });
};
const resetRsvps = () => { const date = nextPlayDate();
  if (confirm(t('Clear everyone\'s answers for {date}? Everybody will show as "no answer" again.', { date: niceDate(date) }))) act(async () => ok(await sb.from('rsvps').delete().eq('day_date', date))); };
const cycleRsvp = id => setRsvp(id, { in: 'out', out: null }[answerOf(id, nextPlayDate())] ?? 'in'); // admins: in -> out -> no answer
const remindMe = () => saveFile(calendarFile(sched || { tz: 'Europe/Berlin', dow: 4, play_time: '18:30', opens_minutes: 60 }, nextPlayDate(), location.href,
  t('Badminton: starting opens now'), t('Open the app, answer I\'m in / I\'m out and start the day.')), 'badminton.ics');

// ---- photo reactions
const KINDS = [['clap', '👏'], ['fire', '🔥'], ['laugh', '😂'], ['love', '❤️'], ['trophy', '🏆']];
const mineOn = (day, kind) => reactions.some(r => r.day_id === day && r.kind === kind && r.user_id === session.user.id);
const react = (day, kind) => { const had = mineOn(day, kind), uid = session.user.id;
  return act(async () => had ? ok(await sb.from('reactions').delete().eq('day_id', day).eq('kind', kind).eq('user_id', uid)) : ok(await sb.from('reactions').insert({ day_id: day, kind })),
    () => { reactions = reactions.filter(r => !(r.day_id === day && r.kind === kind && r.user_id === uid)); if (!had) reactions.push({ day_id: day, kind, user_id: uid }); }); };
const reactionBar = day => KINDS.map(([k, e]) => { const n = reactions.filter(r => r.day_id === day && r.kind === k).length;
  return `<button class="rx ${mineOn(day, k) ? 'on' : ''}" onclick="react(${day},'${k}')" aria-pressed="${mineOn(day, k)}" aria-label="${k}">${e}${n ? ' ' + n : ''}</button>`; }).join('');

// ---- shareable result card
async function shareCard(dayId) {
  const d = db.days.find(x => x.id === dayId), an = analyse(db.days, db.players), top = playerOfNight(an, dayId);
  const bitmap = async url => { try { return await createImageBitmap(await (await fetch(url)).blob()); } catch { return null; } };
  const person = async (id, line) => { const p = player(id); return { name: p.name, line, hue: id * 67 % 360, initial: p.name[0].toUpperCase(), img: p.avatar ? await bitmap(p.avatar) : null }; };
  let bg = null;
  if (d.photo) { const u = (await sb.storage.from('photos').createSignedUrl(d.photo, 300)).data; bg = u && await bitmap(u.signedUrl); }
  const rows = await Promise.all(stats(d.matches).slice(0, 3).map(r => person(r.id, tp('{n} wins', r.w))));
  const blob = await drawCard({ title: t('Badminton night'), subtitle: `${niceDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${tp('{n} matches', d.matches.length)}`,
    rows, bg, potnTitle: t('Player of the night'), footer: t('Badminton Thursdays'),
    potn: top && await person(top.id, canSee(top.id) ? `${player(top.id).name}  ·  +${Math.round(top.delta)} ${t('rating')}` : player(top.id).name) });
  const file = new File([blob], `badminton-${d.date}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: t('Badminton night') }).catch(() => {});
  else saveFile(blob, file.name);
}
const undo = () => { const d = cur(), last = d.matches[d.matches.length - 1];   // by day and number: the last match may not have reached the server yet
  return act(async () => ok(await sb.from('matches').delete().eq('day_id', d.id).eq('n', last.n)), () => d.matches.pop()); };
const closeDay = () => { const d = cur(); return confirm(t('Close the day? No more matches can be added.')) && act(patchDay(d.id, { closed: true }), () => { d.closed = true; }); };
const reopenDay = () => { const d = cur(); return act(patchDay(d.id, { closed: false }), () => { d.closed = false; }); };
const dropPhotos = async paths => { paths = paths.filter(Boolean); if (paths.length) ok(await sb.storage.from('photos').remove(paths)); };
const resetDay = () => confirm(t('Reset today? This deletes all matches of this day and goes back to player order.')) && act(async () => {
  const d = cur();
  ok(await sb.from('matches').delete().eq('day_id', d.id));
  await patchDay(d.id, { started: false, closed: false, photo_path: null })();
  await dropPhotos([d.photo]);
});
const newDayBtn = () => act(async () => {
  if (cur().matches.length) ok(await sb.from('days').insert(dayRow(cur())));
  else await patchDay(cur().id, { started: false })();
});
const eraseAll = () => confirm(t('Reset ALL scores? This deletes every day, match and group photo for everyone. Players and accounts are kept. This cannot be undone.')) && act(async () => {
  await dropPhotos(db.days.map(d => d.photo));
  ok(await sb.from('days').delete().gt('id', 0));
  selId = null;
});
const removeAccount = (id, uname) => confirm(t('Remove the account of {name}? They can no longer log in. Their player and results stay and show as "no account".', { name: uname }))
  && act(async () => ok(await sb.rpc('delete_account', { uid: id })));
// delete one day's leaderboard = delete the day with its matches and group photo (admins only)
const deleteDay = id => {
  const d = db.days.find(x => x.id === id);
  if (!d || !confirm(t('Delete the leaderboard of {date}? Its matches and group photo are removed for everyone. This cannot be undone.', { date: d.date }))) return;
  act(async () => {
    ok(await sb.from('days').delete().eq('id', id));
    if (d === cur()) ok(await sb.from('days').insert(dayRow(d))); // the app always needs an open day
    await dropPhotos([d.photo]); selId = null;
  });
};
const removePhoto = id => {
  const d = db.days.find(x => x.id === id);
  if (d && confirm(t('Delete this photo for everyone?'))) act(async () => { await patchDay(id, { photo_path: null })(); await dropPhotos([d.photo]); });
};
const toggleAdmin = (id, v) => act(async () => ok(await sb.from('profiles').update({ is_admin: v }).eq('id', id)));
function saveSchedule(e) { // admins only; the database also refuses unknown time zones
  e.preventDefault();
  const f = new FormData(e.target), tz = f.get('tz').trim();
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return showMsg(t('Unknown time zone.')); }
  act(async () => {
    ok(await sb.from('schedule').update({ tz, dow: +f.get('dow'), play_time: f.get('time'), opens_minutes: +f.get('mins') }).eq('id', true));
    alert(t('Schedule saved.'));
  });
}

// ---- stats
const pct = r => (r.p ? r.w / r.p : 0);
const byWins = (a, b) => b.w - a.w || pct(b) - pct(a) || a.name.localeCompare(b.name);
function stats(matches) {
  const s = new Map(db.players.map(p => [p.id, { id: p.id, name: p.name, w: 0, p: 0 }]));
  for (const m of matches) {
    [...m.t1, ...m.t2].forEach(id => s.get(id).p++);
    (m.win === 1 ? m.t1 : m.t2).forEach(id => s.get(id).w++);
  }
  return [...s.values()].filter(r => r.p).sort(byWins);
}
// all-time standings: counted by the database (standings()); while taps are still on their way the local count is used
const allTime = () => std && pending === 0 ? std.filter(r => player(r.player_id)).map(r => ({ id: r.player_id, name: player(r.player_id).name, w: r.wins, p: r.played })).sort(byWins)
  : stats(db.days.flatMap(d => d.matches));

// regular members may start a day on the play day from `opens_minutes` before play time (server enforces the same rule)
function startOpen() {
  if (!sched) return true;
  const f = new Intl.DateTimeFormat('en-US', { timeZone: sched.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = x => f.find(y => y.type === x).value, [h, m] = sched.play_time.split(':');
  return DAYS.indexOf(g('weekday')) === sched.dow && +g('hour') * 60 + +g('minute') >= +h * 60 + +m - sched.opens_minutes;
}
const hhmm = mins => String(Math.floor(mins / 60) % 24).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
const playMins = () => +sched.play_time.split(':')[0] * 60 + +sched.play_time.split(':')[1];
const startNote = () => t('We play on {day} at {time}. Starting a day opens at {open} that day. Admins can start any time.',
  { day: dayName(sched.dow), time: hhmm(playMins()), open: hhmm(playMins() - sched.opens_minutes) });
