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
// 4 players: nobody rests, every pairing happens once, each one played best of 3
const C4 = [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]];
// the best-of-3 state after these results (1/2 = winning team): how many series are done and the score of the current one
const series = wins => { let k = 0, w = [0, 0]; for (const x of wins) if (x && ++w[x - 1] === 2) { k++; w = [0, 0]; } return { k, w }; };
// the teams of match i (from 0) given the results before it: 4 players change teams after a best of 3, 5 players after every match
const cycAt = (size, wins, i) => size === 4 ? C4[series(wins.slice(0, i)).k % 3] : C5[i % 5];
const today = () => new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD

// Everything lives in Supabase (see supabase/migrations); this is the last fetched copy, shared by all logged-in members.
let db = { players: [], days: [] }, members = [], me = {}, session = null, loaded = false, authReady = false;
let sched = null; // play schedule (null until loaded / before its migration): no restriction then
let std = null, adminLog = []; // standings counted by the database (null before its migration); activity log (admins)
let playDates = [], rsvpOpen = null, calMonth = null; // calendar marks; hand-made open/close of the sign-up card; month shown
const DB_VERSION = 20261115; // bump together with db_version() in the newest migration
// links shared in the WhatsApp group open the app on the answer buttons for that day (?answer=YYYY-MM-DD)
const deepLink = new URLSearchParams(location.search).get('answer');
let cardOpen = false, loyaltyOpen = false, statsSeg = 'badges', boardKind = 'doubles', boardOpen = null, memFilter = 'all', memSort = 'name', memOpen = null, adminPage = '', admPanel = '', prevView = 'play', profPanel = '', usage = [], lastTracked = '', slideIdx = 0, deepDone = false, logAll = false, receipts = [], photosTab = 'photos', dbBehind = false, benchOpen = false, lineupOpen = false, moreOpen = false, dayMore = false, matchesOpen = {}, lastRec = 0, bgLoaded = false, rsvps = [], reactions = [], statsId = null, lbDay = null; // sign-ups, photo reactions, team names for the next match
function memberView() { try { return localStorage.getItem('adminView') !== '1'; } catch { return true; } }
let view = 'play', tab = 'all', selId = null, authMode = 'in', unclaimed = [], helpShown = false, lastWin = 0, manualLogout = false, lostSession = false, asMember = memberView();   // asMember: an admin seeing the app as a normal member (the default; remembered on this phone)
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
    : `<span class="av" style="--s:${s}px;background:hsl(${id * 67 % 360} 50% 30%)">${esc(p.name[0].toUpperCase())}</span>`;
};
const who = id => `<div class="who">${av(id, 34)}<b>${name(id)}</b></div>`;
const slots = (order, ids) => ids.map(s => order[s - 1]);
// a short "✓ done" note at the bottom instead of a pop-up that has to be closed
const toast = m => { let el = document.getElementById('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = '✓ ' + m; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2500); };
const ok = r => { if (r.error) throw r.error; return r.data; };
const dayName = dow => new Date(Date.UTC(2024, 0, 7 + dow)).toLocaleDateString(LOCALE[lang], { weekday: 'long', timeZone: 'UTC' }); // 7 Jan 2024 was a Sunday
const niceDate = (iso, o = { weekday: 'long', day: 'numeric', month: 'short' }) => new Date(iso + 'T12:00:00Z').toLocaleDateString(LOCALE[lang], { ...o, timeZone: 'UTC' });

// an admin can look at the app the way a member sees it (a preview only: the server still knows who they are)
const isAdmin = () => !!me.is_admin && !asMember;
const toggleView = () => { asMember = !asMember; try { localStorage.setItem('adminView', asMember ? '0' : '1'); } catch {} if (asMember && (view === 'members' || view === 'admin')) view = 'play'; render(); };

// ---- who may see whose rating and stats: players decide for themselves, admins see everything. Guests (no account) are shared.
const profileOf = pid => { const u = player(pid).user; return u && members.find(m => m.id === u); };
const sharing = pid => { const pr = profileOf(pid); return !pr || pr.share_stats !== false; };
// the seasons played (for the Loyal player badge and the rules card)
const seasonsPlayed = () => [...new Set([...db.days.filter(d => d.matches.length).map(d => seasonKey(d.date)), seasonKey(tzParts().date)])];
const seasonLabel = key => { const [k, y] = key.split(' '); return { winter: t('Winter {y}', { y }), spring: t('Spring {y}', { y }), summer: t('Summer {y}', { y }), autumn: t('Autumn {y}', { y }) }[k]; };
// 🏅 Loyal player: one of the 3 biggest loyalty bonuses of a finished season
const loyal = id => seasonsPlayed().filter(s => s !== seasonKey(tzParts().date))
  .filter(s => [...loyalty(db.days, db.players, s)].sort((x, y) => y[1].bonus - x[1].bonus).slice(0, 3).some(([pid]) => pid === id)).length;
// the rating everyone sees = the match rating (pure, used for odds and upsets) + this season's loyalty bonus
const loyaltyOf = (an, id) => (an.bonus || (an.bonus = loyalty(db.days, db.players, seasonKey(tzParts().date), an))).get(id) || { bonus: 0, nights: 0, matches: 0, challenges: 0 };
const bonusOf = (an, id) => loyaltyOf(an, id).bonus;
const matchRatingOf = (an, id) => (an.main(id) === 'singles' ? an.ratingS : an.rating).get(id);
const ratingOf = (an, id) => matchRatingOf(an, id) + bonusOf(an, id);   // in the kind a player plays most
const ratingHidden = pid => (profileOf(pid) || {}).hide_rating === true;   // "hide my rating": no number or rank for anyone, the person included
const canSee = pid => isAdmin() || player(pid).user === session.user.id || sharing(pid);

// ---- loading + live updates
async function refresh() {
  if (!session) return;
  const seq = changeSeq;
  const [p, d, m, sc, rs, rx, sd, pd, rc, ch, cr, tg] = await Promise.all([
    sb.from('players').select('*').order('id'),
    sb.from('days').select('*, matches(*)').order('id'),
    sb.from('profiles').select('*').order('name'),
    sb.from('schedule').select('*'),
    sb.from('rsvps').select('*'),
    sb.from('reactions').select('*'),
    sb.rpc('standings'),
    sb.from('play_dates').select('*'),
    sb.from('receipts').select('*').order('id', { ascending: false }),
    sb.from('chat').select('*').order('id', { ascending: false }).limit(200),
    sb.from('chat_reactions').select('*'),
    sb.from('tips').select('*').order('id', { ascending: false }),
  ]);
  if (pending > 0 || seq !== changeSeq) return; // taps happened while this was loading: its answer is out of date, the next re-fetch will show the truth
  std = sd.error ? null : sd.data; receipts = rc.error ? [] : rc.data; playDates = pd.error ? [] : pd.data;
  sched = !sc.error && sc.data[0] ? sc.data[0] : null;
  rsvps = rs.error ? [] : rs.data; reactions = rx.error ? [] : rx.data; // empty until the migration has been applied
  chat = ch.error ? [] : ch.data.reverse(); chatRx = cr.error ? [] : cr.data; tips = tg.error ? [] : tg.data;
  db.players = ok(p).map(x => ({ id: x.id, name: x.name, avatar: x.avatar, removed: !x.active, user: x.user_id, by: x.created_by, at: x.created_at }));
  db.days = ok(d).sort((a, b) => a.closed === b.closed ? (a.closed ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : 0) : a.closed ? -1 : 1).map(x => ({ id: x.id, date: x.date, order: x.player_order, mode: x.mode, rotFrom: x.rot_from || 0, started: x.started, closed: x.closed,
    photo: x.photo_path, matches: x.matches.sort((a, b) => a.n - b.n) }));
  if (!session) return; // logged out while loading
  const ms = ok(m), mine = ms.find(x => x.id === session.user.id);
  if (!mine && !ms.length) return; // an empty answer is a hiccup, not a removed account: never log anyone out, and keep what we knew
  members = ms; me = mine;
  if (!me) { me = {}; manualLogout = true; await sb.auth.signOut(); return; } // an admin removed this account
  if (me.lang && me.lang !== lang) setLangLocal(me.lang); // the language follows the account
  if (me.is_admin) { const v = await sb.rpc('db_version'); dbBehind = !!v.error || v.data < DB_VERSION; }
  if (me.is_admin) { const u = await sb.from('usage').select('*').gte('day', addDays(tzParts().date, -30)); usage = u.error ? [] : u.data; }
  if (me.is_admin) { const lg = await sb.from('admin_log').select('*').order('id', { ascending: false }).limit(40); adminLog = lg.error ? [] : lg.data; }

  if (!db.days.length) { ok(await sb.from('days').insert(dayRow(null))); return refresh(); }
  // the morning after a closed night, Play moves on to the next match day by itself (the night's results stay on the Board)
  // shortcut: two phones opening at the same moment can each add an empty day; harmless (empty days are never shown)
  if (cur().closed && cur().matches.length && cur().date < tzParts().date && !(await sb.from('days').insert(dayRow(cur()))).error) return refresh();
  const day = cur(), missing = db.players.filter(x => !x.removed && !day.order.includes(x.id) && !staleGuest(x)).map(x => x.id);
  if (!day.started && missing.length) { await patchDay(day.id, { player_order: [...day.order, ...missing] })(); return refresh(); } // new accounts join today's setup
  // everyone's "I'm in / I'm out" answers fill the player list: in, then no answer, then out (stable, so manual order is kept inside each group)
  const date = nextPlayDate(), answer = id => (rsvps.find(r => r.day_date === date && r.player_id === id) || {}).status;
  if (!day.started && rsvps.some(r => r.day_date === date)) {
    const rank = id => answer(id) === 'in' ? 0 : answer(id) === 'out' ? 2 : 1, order = [...day.order].sort((a, b) => rank(a) - rank(b));
    const ins = order.filter(id => rank(id) === 0).length, mode = ins >= 3 ? Math.min(5, ins) : day.mode; // 3, 4 or 5 in = 3, 4 or 5 play
    if (order.join() !== day.order.join() || mode !== day.mode) { await patchDay(day.id, { player_order: order, mode })(); return refresh(); }
  }
  loaded = true; render();
  if (pushOn === null) pushReady();
  if (!deepDone && new URLSearchParams(location.search).has('chat')) { deepDone = true; history.replaceState(null, '', location.pathname); go('chat'); }   // tapped a chat notification
  if (deepLink && !deepDone) { deepDone = true; history.replaceState(null, '', location.pathname); view = 'play'; render();
    const el = document.querySelector(`.invite[data-day="${deepLink}"], .rsvp[data-day="${deepLink}"]`) || document.querySelector('.rsvp');
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } }
  if (!bgLoaded) { bgLoaded = true; loadBg(); }
  if (!helpShown && !helpSeen()) { helpShown = true; markNews(); setTimeout(startTour, 300); } // first run: show people around once (the tour covers what is new)
  else if (!helpShown && newsSeen() < NEWS()[0].id) { helpShown = true; setTimeout(showNews, 400); } // after an update: what is new, once
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
  (authMode === 'up' ? signup : authMode === 'reset' ? reset : authMode === 'link' ? emailLink : login)(f).catch(err => showMsg(friendly(err)));
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
// log in without a password: Supabase emails a one-time link that opens the app logged in (only for existing accounts)
async function emailLink(f) {
  const email = f.get('login').trim();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
  if (error && !/signups not allowed|not found/i.test(error.message)) return showMsg(friendly(error));
  try { localStorage.setItem('lastLogin', email); } catch {}
  showMsg(t('If that account exists, a login link is on its way. Open it on this phone.'));   // same answer either way
}
async function newPassword(e) {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('password') });
  if (error) return showMsg(friendly(error));
  toast(t('Password changed.')); go('play');
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
const setHideRating = on => act(async () => ok(await sb.from('profiles').update({ hide_rating: on }).eq('id', me.id)), () => { me.hide_rating = on; });

// ---- first-run help
const helpSeen = () => { try { return localStorage.getItem('seenHelp') === '1'; } catch { return true; } };
// top-down badminton court (13.40 x 6.10 m; singles use the inner side lines): server (orange) serves diagonally to the receiver (blue)
function courtSvg(doubles, label) {
  const l = doubles ? 0 : 4.6, r = doubles ? 61 : 56.4, ln = 'stroke="#fff" stroke-width=".8" fill="none"';
  return `<svg viewBox="-6 -4 73 142" role="img" aria-label="${esc(label)}" style="width:150px;display:block;margin:8px auto;border-radius:10px;background:#1b5e44">
    <defs><marker id="ar${+doubles}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#fff"/></marker></defs>
    ${doubles ? '' : '<rect x="0" y="0" width="4.6" height="134" fill="#000" opacity=".35"/><rect x="56.4" y="0" width="4.6" height="134" fill="#000" opacity=".35"/>'}
    <rect x="30.5" y="86.8" width="${r - 30.5}" height="${(doubles ? 126.4 : 134) - 86.8}" fill="#f97316" opacity=".6"/>
    <rect x="${l}" y="${doubles ? 7.6 : 0}" width="${30.5 - l}" height="${47.2 - (doubles ? 7.6 : 0)}" fill="#3b82f6" opacity=".6"/>
    <rect x="0" y="0" width="61" height="134" ${ln}/><line x1="4.6" x2="4.6" y1="0" y2="134" ${ln}/><line x1="56.4" x2="56.4" y1="0" y2="134" ${ln}/>
    <line x1="0" x2="61" y1="47.2" y2="47.2" ${ln}/><line x1="0" x2="61" y1="86.8" y2="86.8" ${ln}/>
    <line x1="30.5" x2="30.5" y1="0" y2="47.2" ${ln}/><line x1="30.5" x2="30.5" y1="86.8" y2="134" ${ln}/>
    <line x1="0" x2="61" y1="7.6" y2="7.6" ${ln} ${doubles ? '' : 'opacity=".35"'}/><line x1="0" x2="61" y1="126.4" y2="126.4" ${ln} ${doubles ? '' : 'opacity=".35"'}/>
    <line x1="-4" x2="65" y1="67" y2="67" stroke="#e5e7eb" stroke-width="1.8" stroke-dasharray="2 1.2"/>
    <path d="M${(30.5 + r) / 2} 110 L${(l + 30.5) / 2} 28" stroke="#fff" stroke-width="1.4" stroke-dasharray="3 2" marker-end="url(#ar${+doubles})" fill="none"/></svg>`;
}
const rulesHtml = () => `<h2 class="sec">${t('Badminton rules')}</h2>
  <details class="fold"><summary>${t('The basics')}</summary>
    <ul class="rules"><li>${t('A match is the best of 3 games. A game goes to 21 points and every rally scores a point.')}</li>
      <li>${t('At 20-20 play on until one side leads by 2. At 29-29 the next point wins; 30 is the maximum.')}</li>
      <li>${t('The side that wins a rally serves next. Players change ends after each game, and in a third game when the first side reaches 11.')}</li>
      <li>${t('The serve is hit underhand, from below the waist, and lands in the diagonally opposite service court. Whoever serves stands in the right service court when their side\'s score is even, and in the left one when it is odd.')}</li>
      <li>${t('Faults: the shuttle lands outside the lines, goes under the net or touches the roof; a double hit; touching the net; reaching over the net. A shuttle on a line is in.')}</li>
      <li>${t('In this app one match is one result: tap the winning team.')}</li></ul></details>
  <details class="fold"><summary>${t('Singles (1 against 1)')}</summary>${courtSvg(false, t('Singles court diagram'))}
    <p class="mut">${t('Orange: the server. Blue: the receiver. The dashed arrow is the serve.')}</p>
    <ul class="rules"><li>${t('The court is narrower: the inner side lines are the edge (5.18 m wide) and the whole length (13.40 m) is in play.')}</li>
      <li>${t('The serve may go all the way to the back line, but not past it.')}</li></ul></details>
  <details class="fold"><summary>${t('Doubles (2 against 2)')}</summary>${courtSvg(true, t('Doubles court diagram'))}
    <p class="mut">${t('Orange: the server. Blue: the receiver. The dashed arrow is the serve.')}</p>
    <ul class="rules"><li>${t('Rallies use the full width (6.10 m), but the serve must land in the shorter service court, which ends at the second line from the back (0.76 m inside the back line).')}</li>
      <li>${t('When your side wins a rally while serving, the same player serves again from the other court and the two partners swap sides.')}</li>
      <li>${t('During a rally either partner may hit the shuttle. Only the serve and the return of serve are fixed by the diagonal.')}</li></ul></details>`;
// ---- release notes, newest first. A new id shows "What's new" once to everyone who used the app before (new people get the tour instead).
const NEWS = () => [{ id: '2026-11-12', items: [
  ['🃏', t('Six new card titles: The Machine, Hot streak, On the rise, Lone wolf, Team player and Workhorse.')],
  ['🏆', t('Records in the Group tab: the longest win streak, the biggest upset, the best night and more. Break a record and the closed night shows it.')],
  ['📒', t('Stats → Collection: a season album with 9 stickers to fill (a full album gives your card a gold edge) and a card collection: beat a player or win together to collect their card.')],
] }, { id: '2026-11-10.2', date: '2026-11-10', items: [
  ['📈', t('Separate ratings for doubles and singles, plus a loyalty bonus for showing up: +3 a night, +1 a match (max 2), +2 per weekly challenge. It starts again each season.')],
  ['🏆', t('The leaderboard is all about rating points: won that night, won that month, and your rating over all time. Share "How the rating works" from All time.')],
  ['🃏', t('New player cards in a clean style, with your best partner (best win rate together). Upload your profile photo again for a sharp card.')],
  ['🎬', t('Videos moved to the Group tab. The chat is switched off for now.')],
  ['✨', t('A cleaner look: a plain background, Stats in three sections (Badges, Partners, Rivals) and a clear next step after a match night. Admins can switch the photo backgrounds back on.')],
  ['👆', t('Easier to use: bigger buttons, a ⋯ menu at the top for admin tools and log out, and short "✓" messages instead of pop-ups.')],
] }, { id: '2026-11-10', items: [
  ['🎯', t('Challenge of the week: one light goal for everyone, a new one every Monday. Do it and collect the badge.')],
  ['🃏', t('Player cards on the Stats tab: your title, six stats and badges. Bronze, silver or gold depends on how many nights you played. Share yours on WhatsApp.')],
  ['📷', t('Admins can add or replace the group photo of an earlier day.')],
] }, { id: '2026-11-06', items: [
  ['🎬', t('Video tips: Group → Videos has short videos to get better (serve, smash, footwork…). Tap one to watch it in the app.')],
  ['📋', t('Every match of the night: open Matches on the closed-day screen, or any day later under Board → Day.')],
] }, { id: '2026-11-05', items: [
  ['💬', t('Group tab: chat with everyone, react to messages and see notes from the app (who is in, extra games, results). Members moved here too.')],
  ['🔔', t('Notifications: a reminder on play days if you have not answered yet, and if you like, for new chat messages. Turn them on under Details on the sign-up card.')],
  ['🎁', t('Monthly recap on the Stats tab: your month, the duo of the month, the biggest upset and more. Share it on WhatsApp.')],
  ['🙈', t('Hide my rating (Profile): play without a rating number or rank. Badges and results stay.')],
  ['🗓', t('New badges for showing up: nights in a row, matches played, played with everyone, never missed a month, early bird.')],
  ['🏸', t('A clearer Play screen: tap a team to record its win, see who plays next, and big Undo and Close day buttons.')],
  ['🔢', t('4 players play best of 3 before changing teams. Someone leaving early or arriving late? ⋯ More during play, down to 2 players.')],
  ['🎨', t('A new app icon. To see it on your home screen, remove the app and add it again.')],
] }];
const newsSeen = () => { try { return localStorage.getItem('seenNews') || ''; } catch { return '9999'; } };
const markNews = () => { try { localStorage.setItem('seenNews', NEWS()[0].id); } catch {} };
const newsText = () => { const r = NEWS()[0]; return `🏸 ${t("What's new in our badminton app")} (${niceDate(r.date || r.id, { day: 'numeric', month: 'long', year: 'numeric' })})\n\n` + r.items.map(([e, x]) => `${e} ${x}`).join('\n') + '\n\n' + appLink(); };
function showNews() {
  document.getElementById('news')?.remove(); markNews();
  const el = document.createElement('div'); el.id = 'news'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="card"><h1>🆕 ${t("What's new")}</h1>${NEWS().map(r => `<h2 class="sec">${esc(niceDate(r.date || r.id, { day: 'numeric', month: 'long', year: 'numeric' }))}</h2>
      <ul class="news">${r.items.map(([e, x]) => `<li><span>${e}</span><span>${esc(x)}</span></li>`).join('')}</ul>`).join('')}
    <button class="add" id="newsshare">💬 ${t('Share on WhatsApp')}</button><button class="primary" id="newsok">${t('Got it')}</button></div>`;
  document.body.append(el); minimalize(el);
  el.querySelector('#newsshare').onclick = () => waShare(newsText());
  el.querySelector('#newsok').onclick = () => el.remove();
}
function showHelp() {
  const rows = C5.map(([a, b, r], i) => `<tr><td>${i + 1}</td><td>${a.join(' + ')} ${t('vs')} ${b.join(' + ')}</td><td>${r}</td></tr>`).join('');
  const el = document.createElement('div'); el.id = 'help'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="card"><h1>${t('How it works')}</h1>
    <button class="add" id="tourbtn">▶ ${t('Show me around')}</button><button class="add" id="newsbtn">🆕 ${t("What's new")}</button>
    <ol class="steps"><li>${t('Before play day tap “I\'m in” or “I\'m out”. The player list fills itself from the answers.')}</li>
      <li>${t('Start playing opens shortly before play time. The first 5 (or 4) players in the list play, the others sit out.')}</li>
      <li>${t('After every match tap the winning team. The leaderboards and ratings update for everyone.')}</li>
      <li>${t('At the end the day is closed and anyone can take the group photo.')}</li></ol>
    <h2 class="sec">${t('The rotation')}</h2>
    <p>${t('With 5 players there are 5 matches, 2 against 2, and one player rests each time. Everyone rests exactly once and plays with every other player exactly once.')}</p>
    <table class="rot"><tr><th>${t('Match')}</th><th>${t('Teams')}</th><th>${t('Rests')}</th></tr>${rows}</table>
    <p class="mut">${t('The numbers are places in the player list (1 = top).')}</p>
    <p>${t('With 4 players nobody rests: the same teams play best of 3, then change teams, until everyone has played with everyone.')}</p>
    <p>${t('With 3 players you play singles: the winner stays on court, but after 3 games in a row the winner sits out one game.')}</p>
    <h2 class="sec">${t('Rating')}</h2><p>${t('Doubles and singles have separate ratings, both starting at 1000. Win and you gain points, lose and you drop; beating stronger players earns more.')}</p>
    <p>${t('On top comes a loyalty bonus that starts again each season: +3 for every night you play, +1 per match (at most 2 a night) and +2 per weekly challenge. The leaderboard shows your rating with the bonus.')}</p>
    ${rulesHtml()}
    <p class="mut">🔒 ${t('Admins can see how often each person opens each screen (only counts, nothing you type).')}</p>
    <button class="primary" id="gotit">${t('Got it')}</button></div>`;
  document.body.append(el); minimalize(el);
  el.querySelector('#tourbtn').onclick = () => { el.remove(); startTour(); };
  el.querySelector('#newsbtn').onclick = () => { el.remove(); showNews(); };
  el.querySelector('#gotit').onclick = () => { try { localStorage.setItem('seenHelp', '1'); } catch {} el.remove(); };
}

// ---- actions
const go = v => { if (v === 'chat' && !chatOn) v = 'tips'; if (v !== view && view !== 'profile') prevView = view; if (v === 'chat' && view !== 'chat') { chatJump = true; chatMark = chatSeen(); } if (v === 'chat' || v === 'tips' || v === 'members') groupTab = v; view = v; render(); };
// usage counters for the admins (which tab, which action); errors are ignored so the app never waits on this
const track = v => { try { sb.rpc('track', { v }).then(() => {}, () => {}); } catch {} };
// a guest (no account) who has not played for 8 weeks stops joining new days; they can be brought back from the setup screen
function staleGuest(p) {
  if (p.user || !p.at || Date.now() - Date.parse(p.at) < 56 * 864e5) return false;
  const since = addDays(tzParts().date, -56);
  return !db.days.some(d => d.date >= since && d.matches.some(m => m.t1.includes(p.id) || m.t2.includes(p.id)));
}
const bringBack = id => { const d = cur(), o = [...d.order, id]; act(patchDay(d.id, { player_order: o }), () => { d.order = o; }); };
// whoever added a guest may remove it again the same day (admins can always remove players)
const ownFreshGuest = p => !p.user && p.by === session.user.id && !!p.at && new Date(p.at).toLocaleDateString('en-CA', { timeZone: sched ? sched.tz : undefined }) === tzParts().date;
const dayRow = prev => { // a new day inherits the previous order/mode; players added since then go to the end
  const ids = db.players.filter(p => !p.removed && !staleGuest(p)).map(p => p.id), old = prev ? prev.order.filter(id => ids.includes(id)) : [];
  return { date: today(), player_order: [...old, ...ids.filter(id => !old.includes(id))], mode: Math.min(prev ? prev.mode : 5, ids.length) };
};
const patchDay = (id, o) => async () => ok(await sb.from('days').update(o).eq('id', id));
const move = (i, d) => { const day = cur(), o = [...day.order]; [o[i], o[i + d]] = [o[i + d], o[i]];
  return act(patchDay(day.id, { player_order: o }), () => { day.order = o; }); };
const setMode = n => { const day = cur(); return n <= day.order.length && act(patchDay(day.id, { mode: n }), () => { day.mode = n; }); };
// the day gets today's date when it starts (it may have been created days earlier)
const start = () => { const day = cur(), date = today();
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
// admins: add one or more players without an account at once ("Ana, Mihai, Paul"); they join the next match day unless it has started
const addPlayers = () => {
  const names = [...new Set((prompt(t('Names of the new players without an account, separated by commas')) || '').split(',').map(x => x.trim().slice(0, 20)).filter(Boolean))];
  if (!names.length) return;
  act(async () => {
    const ids = [];
    for (const name of names) ids.push(ok(await sb.from('players').insert({ name }).select().single()).id);
    if (!cur().started) await patchDay(cur().id, { player_order: [...cur().order, ...ids] })();
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
  // a small square in the players table for the lists (sharp on phone screens), and a big one in storage for the player card
  const id = pickFor, url = await toDataUrl(await shrink(f, 160, .82, true)), big = await shrink(f, 640, .85, true);
  act(async () => { ok(await sb.from('players').update({ avatar: url }).eq('id', id));
    const up = await sb.storage.from('photos').upload(`avatars/p${id}.jpg`, big, { upsert: true, contentType: 'image/jpeg' }); if (!up.error) delete bigAvatar[id]; });
};
let shotFor;
const photo = id => { shotFor = id; shot.value = ''; shot.click(); };
shot.onchange = async () => {
  track('act:photo');
  const f = shot.files[0]; if (!f) return;
  const blob = await shrink(f, 1280, .8), path = `days/${shotFor}.jpg`, id = shotFor;
  act(async () => {
    ok(await sb.storage.from('photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' }));
    await patchDay(id, { photo_path: path })();
  });
};
// Play-tab background: one shared file in the photos bucket (admins write it, everyone reads it); missing = the built-in default
const BG = 'bg/play.jpg';
const loadBg = async () => {
  const u = (await sb.storage.from('photos').createSignedUrl(BG, 86400)).data;
  document.documentElement.style.setProperty('--pbg', u ? `url("${u.signedUrl}")` : 'url(bg-play.jpg)');
};
const openStats = id => { statsId = id; go('stats'); };
const dim = () => (sched && sched.bg_dim) || 0;
// clean look by default; admins can switch the photo backgrounds back on for everyone (remembered for the login screen)
const photosOn = () => { if (sched) { try { localStorage.setItem('bgPhotos', sched.bg_photos ? '1' : '0'); } catch {} return !!sched.bg_photos; } try { return localStorage.getItem('bgPhotos') === '1'; } catch { return false; } };
const saveBgPhotos = on => act(async () => ok(await sb.from('schedule').update({ bg_photos: on }).eq('id', true)), () => { if (sched) sched.bg_photos = on; });
const previewDim = v => { document.documentElement.style.setProperty('--dim', v / 100); dimv.textContent = v + '%'; };
const saveDim = v => act(async () => ok(await sb.from('schedule').update({ bg_dim: +v }).eq('id', true)), () => { if (sched) sched.bg_dim = +v; });
// receipts: a photo of the bill, what it was for and (optionally) how much; whoever added it or an admin can delete it
const addReceipt = () => { rcpt.value = ''; rcpt.click(); };
rcpt.onchange = async () => {
  const f = rcpt.files[0]; if (!f) return;
  const note = prompt(t('What was it for? (e.g. extra court on 12 Nov, shuttles)'));
  if (note === null) return;
  const amt = (prompt(t('Amount (optional)')) || '').replace(',', '.').trim(), amount = amt && isFinite(amt) ? Math.abs(+amt) : null;
  const blob = await shrink(f, 1600, .8), path = `receipts/${Date.now()}-${session.user.id.slice(0, 8)}.jpg`;
  act(async () => {
    ok(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }));
    ok(await sb.from('receipts').insert({ note: note.trim().slice(0, 80), amount, photo_path: path, created_by: session.user.id }));
  });
};
const removeReceipt = id => { const r = receipts.find(x => x.id === id);
  if (r && confirm(t('Delete this receipt?'))) act(async () => {
    ok(await sb.from('receipts').delete().eq('id', id));
    await sb.storage.from('photos').remove([r.photo_path]); // shortcut: only admins may delete files, so a member's receipt photo stays in storage; fine for a few receipts a year
  });
};
const pickBg = () => { bgpick.value = ''; bgpick.click(); };
bgpick.onchange = async () => {
  const f = bgpick.files[0]; if (!f) return;
  const blob = await shrink(f, 1280, .8);
  act(async () => { ok(await sb.storage.from('photos').upload(BG, blob, { upsert: true, contentType: 'image/jpeg' })); await loadBg(); });
};
const resetBg = () => act(async () => { ok(await sb.storage.from('photos').remove([BG])); await loadBg(); });
// the next match of a day: the fixed rotation for 4 or 5 players, "winner stays" for 3 (player ids, not slots)
function nextTeams(d) {
  const ms = d.matches.slice(d.rotFrom || 0); // the rotation restarts whenever someone leaves or joins
  if (d.mode === 2) return { t1: [d.order[0]], t2: [d.order[1]], rest: null };
  if (d.mode === 3) return winnerStays(d.order, ms);
  const [a, b, r] = cycAt(d.mode, ms.map(m => m.win), ms.length);
  return { t1: slots(d.order, a), t2: slots(d.order, b), rest: r ? d.order[r - 1] : null };
}
// someone leaves early or arrives late: they play from / stop playing at the next match (2 to 5 players)
const changeLineup = (id, leaving) => {
  const d = cur(), on = d.order.slice(0, d.mode).filter(x => x !== id), off = d.order.slice(d.mode).filter(x => x !== id);
  if (leaving && !confirm(t('{name} leaves? The next matches are played without them.', { name: player(id).name }))) return;
  const games = x => d.matches.filter(m => [...m.t1, ...m.t2].includes(x)).length, most = [...on, ...leaving ? [] : [id]].sort((a, b) => games(b) - games(a));
  // the rest order is the last slot, then slot 1, 2…: whoever has played most so far rests first
  const playing = [...most.slice(1), most[0]], order = [...playing, ...off, ...leaving ? [id] : []], mode = playing.length, rotFrom = d.matches.length;
  act(patchDay(d.id, { player_order: order, mode, rot_from: rotFrom }), () => Object.assign(d, { order, mode, rotFrom }));
};
const recordWin = team => {
  if (performance.now() - lastWin < 700) return; lastWin = performance.now(); // a double tap must not record two matches
  primeAudio();
  const d = cur(), { t1, t2, rest } = nextTeams(d);
  const row = { day_id: d.id, n: d.matches.length + 1, t1, t2, rest: rest || null, win: team };
  return act(async () => ok(await sb.from('matches').insert(row)), () => {
    d.matches.push({ ...row, id: null, created_at: new Date().toISOString() }); celebrate(); const at = lastRec = Date.now(); setTimeout(() => lastRec === at && view === 'play' && render(), 5100); // the "recorded" note with its undo goes away after 5 s (only redraw the play screen, never a half-filled form)
  });
};

// ---- Thursday sign-up
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// ---- play days: the weekly play day, plus extra days and cancelled days marked in the calendar
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dowOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
function tzParts() { // today's date, weekday and minutes since midnight, in the group's time zone
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: sched ? sched.tz : undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = x => f.find(y => y.type === x).value, date = `${g('year')}-${g('month')}-${g('day')}`;
  return { date, dow: dowOf(date), mins: +g('hour') * 60 + +g('minute') };
}
const markOf = iso => (playDates.find(p => p.day === iso) || {}).kind;
const isPlayDate = iso => markOf(iso) === 'extra' ? !extraOf(iso).called_off : (markOf(iso) !== 'cancelled' && !!sched && dowOf(iso) === sched.dow);
function upcomingPlayDates(n) { // the next n play days that have not been played yet, starting with nextPlayDate()
  const out = [nextPlayDate()];
  for (let i = 1; out.length < n && i < 120; i++) { const d = addDays(out[0], i); if (isPlayDate(d)) out.push(d); }
  return sched ? out : out.slice(0, 1);
}
function nextPlayDate() { // the play date people are answering for: the next play day that has not been played yet
  const today = tzParts().date;
  if (!sched) return today;
  const played = new Set(db.days.filter(d => d.started).map(d => d.date));
  for (let i = 0; i < 120; i++) { const iso = addDays(today, i); if (isPlayDate(iso) && !played.has(iso)) return iso; }
  return today;
}
// admins: tap a date. A normal play day becomes cancelled (tap again to restore); any other day becomes an extra play day (tap again to clear)
const markDate = iso => {
  if (!sched || iso < tzParts().date) return;
  if (!isAdmin()) return memberExtra(iso);
  const kind = markOf(iso), normal = dowOf(iso) === sched.dow, want = normal ? 'cancelled' : 'extra', clear = kind === want;
  if (want === 'extra') return extraForm(iso, clear ? playDates.find(p => p.day === iso) : null);
  return act(async () => clear ? ok(await sb.from('play_dates').delete().eq('day', iso)) : ok(await sb.from('play_dates').upsert({ day: iso, kind: want })),
    () => { playDates = playDates.filter(p => p.day !== iso); if (!clear) playDates.push({ day: iso, kind: want }); });
};
const themePref = () => { try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; } };
const setTheme = k => { try { localStorage.setItem('theme', k); } catch {} applyTheme(); render(); };
// admins: add the results of a day that was played earlier (tap a past date in the calendar)
let bf = null;
const backfill = iso => { if (!isAdmin() || iso >= tzParts().date) return; bf = { date: iso, ids: [], res: [] }; go('backfill'); };
const bfWho = id => { const i = bf.ids.indexOf(id); if (i >= 0) bf.ids.splice(i, 1); else if (bf.ids.length < 5) bf.ids.push(id); bf.res = []; bf.extra = 0; render(); };
const bfEdit = id => { const d = db.days.find(x => x.id === id); bf = { date: d.date, ids: d.order.slice(0, d.mode), res: d.matches.map(m => m.win), editId: id }; render(); };
// the rotation repeats after one round, so an old day can have as many matches as were played
const bfRows = () => Math.max(bf.extra || 0, (bf.ids.length === 4 ? C4 : C5).length, bf.res.length);
const bfMore = () => { bf.extra = bfRows() + 1; render(); };
const bfWin = (n, w) => { bf.res[n] = bf.res[n] === w ? 0 : w; render(); };
const bfSave = () => {
  const ids = bf.ids, w = bf.res.slice(0, bfRows()), n = w.findIndex(x => !x), res = n < 0 ? w : w.slice(0, n), date = bf.date;
  if (ids.length < 4 || !res.length) return;
  act(async () => {
    const old = bf.editId && db.days.find(x => x.id === bf.editId);   // editing = save the corrected day, then delete the old one (its photo moves over)
    const d = ok(await sb.from('days').insert({ date, player_order: ids, mode: ids.length, started: true, ...(old && old.photo && { photo_path: old.photo }) }).select().single());
    ok(await sb.from('matches').insert(res.map((win, i) => { const [t1, t2, rest] = cycAt(ids.length, res, i); return { day_id: d.id, n: i + 1, t1: slots(ids, t1), t2: slots(ids, t2), rest: rest ? ids[rest - 1] : null, win }; })));
    await patchDay(d.id, { closed: true })();
    if (old) ok(await sb.from('days').delete().eq('id', old.id));
    bf = null; go('calendar');
  });
};
// members: tap a free future date to add an extra game (the others get an invite on the Play tab); tap your own extra game to remove it
// ---- WhatsApp: open WhatsApp with a ready message; you pick the group
const appLink = q => location.origin + location.pathname + (q ? '?' + q : '');
const plain = ids => ids.map(id => player(id).name).join(' & ');
const waShare = text => track('act:whatsapp') || window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
// swiping the day cards: move the dots at once, redraw the list for the new day when the swipe settles
let slideT, shownSlide = 0;
function onSlides(el) {
  slideIdx = Math.round(el.scrollLeft / el.clientWidth);
  document.querySelectorAll('.dots i').forEach((x, k) => x.classList.toggle('on', k === slideIdx));
  clearTimeout(slideT); slideT = setTimeout(() => { if (slideIdx !== shownSlide) render(); }, 160);
}
// calling off an extra game keeps the booking (it stays in the calendar, marked cancelled); whoever added it may do so
// while fewer than 4 are in, admins at any time. Either can bring it back.
const insOn = d => rsvps.filter(r => r.day_date === d && r.status === 'in').length;
const canCallOff = d => { const p = extraOf(d); return !!p && (isAdmin() || (p.created_by === session.user.id && (p.called_off || insOn(d) < 4))); };
const callOff = (day, off) => {
  if (off && !confirm(t('Cancel the extra game on {date}? The booking stays in the calendar, marked as cancelled.', { date: niceDate(day) }))) return;
  act(async () => ok(await sb.from('play_dates').update({ called_off: off }).eq('day', day)), () => { const p = extraOf(day); if (p) p.called_off = off; });
  if (off && confirm(t('Tell the WhatsApp group?'))) waShare(t('🚫 The extra game on {date} at {time} is cancelled.', { date: niceDate(day), time: hhmm(playMinsOn(day)) }) + ' ' + appLink());
};
const shareSignup = (date = nextPlayDate()) => {
  const ins = db.players.filter(p => !p.removed && answerOf(p.id, date) === 'in').map(p => p.name);
  waShare(t('🏸 {day} {time}: {n} in so far{names}. Please answer by {deadline}:', { day: niceDate(date), time: sched ? hhmm(playMinsOn(date)) : '',
    n: ins.length, names: ins.length ? ` (${ins.join(', ')})` : '', deadline: deadlineText(date) }) + ' ' + appLink('answer=' + date));
};
const shareExtra = day => waShare(t('🏸 {name} added an extra game on {date} at {time}. Who is in? Answer by {deadline}:', { name: (members.find(m => m.id === (extraOf(day) || {}).created_by) || me || {}).username || '', date: niceDate(day), time: sched ? hhmm(playMinsOn(day)) : '', deadline: deadlineText(day) }) + ' ' + appLink('answer=' + day));
const shareLineup = () => {
  const d = cur(), o = d.order, cyc = d.mode === 4 ? C4 : C5;
  if (d.mode === 3) { const m = nextTeams(d); return waShare('🏸 ' + t('Today\'s matches') + '\n1. ' + `${plain(m.t1)} ${t('vs')} ${plain(m.t2)} (${t('{name} rests', { name: player(m.rest).name })})` + '\n' + t('Winner stays on, at most 3 games in a row.') + '\n' + appLink()); }
  waShare('🏸 ' + t('Today\'s matches') + '\n' + cyc.map(([a, b, r], i) => `${i + 1}. ${plain(slots(o, a))} ${t('vs')} ${plain(slots(o, b))}${r ? ` (${t('{name} rests', { name: player(o[r - 1]).name })})` : ''}`).join('\n') + (d.mode === 4 ? '\n' + t('Best of 3, then change teams.') : '') + '\n' + appLink());
};
const memberExtra = iso => {
  const p = playDates.find(x => x.day === iso), me_ = session.user.id;
  if (p) {
    if (p.kind === 'extra' && p.created_by === me_) extraForm(iso, p);
    return;
  }
  if (dowOf(iso) !== sched.dow) extraForm(iso);
};
// hour and minute dropdowns (5-minute steps); read back with formTime(formData, name) as "HH:MM"
const pad2 = n => String(n).padStart(2, '0');
const timeSel = (name, mins) => `<span class="tsel"><select name="${name}h" aria-label="${t('Hour')}">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === Math.floor(mins / 60) ? 'selected' : ''}>${pad2(h)}</option>`).join('')}</select>
    <b>:</b><select name="${name}m" aria-label="${t('Minutes')}">${Array.from({ length: 12 }, (_, k) => k * 5).map(m => `<option value="${m}" ${m === mins % 60 - mins % 5 ? 'selected' : ''}>${pad2(m)}</option>`).join('')}</select></span>`;
const formTime = (f, name) => `${pad2(+f.get(name + 'h'))}:${pad2(+f.get(name + 'm'))}`;
// the form for an extra game: its date, start time and the deadline for answers; also used to change or remove one you added
// (shortcut: times are read in the phone's time zone, which is the group's)
function extraForm(iso, old) {
  const pm = old && old.play_time ? +old.play_time.slice(0, 2) * 60 + +old.play_time.slice(3, 5) : playMins();
  const by = old && old.answer_by ? new Date(old.answer_by) : null, pad = n => String(n).padStart(2, '0');
  const byDay = by ? `${by.getFullYear()}-${pad(by.getMonth() + 1)}-${pad(by.getDate())}` : iso, byTime = by ? `${pad(by.getHours())}:${pad(by.getMinutes())}` : hhmm(Math.max(0, pm - sched.rsvp_until_minutes));
  const el = document.createElement('div'); el.id = 'xform'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  // plain dropdowns instead of the browser's date/time pickers, which some phones (Brave) never open
  const today = tzParts().date, days = Array.from({ length: 120 }, (_, k) => addDays(today, k));
  const daySel = (name, v, ok_ = () => true) => `<select name="${name}">${days.filter(d => d === v || ok_(d)).map(d => `<option value="${d}" ${d === v ? 'selected' : ''}>${esc(niceDate(d))}</option>`).join('')}</select>`;
  const [bh, bm] = byTime.split(':').map(Number);
  el.innerHTML = `<form class="card"><h2 style="margin:0 0 12px">🏸 ${t('Extra game')}</h2>
    <label class="field">${t('Date')}${daySel('day', iso, d => isAdmin() || !sched || dowOf(d) !== sched.dow)}</label>
    <div class="field">${t('Start time')}${timeSel('t', pm)}</div>
    <label class="field">${t('Answers needed by')}${daySel('bd', byDay)}</label>
    <div class="field">${timeSel('b', bh * 60 + bm)}</div>
    <p class="msg" role="alert"></p><button class="primary" type="submit">${old ? t('Save') : t('Add extra game')}</button>
    ${old && canCallOff(iso) ? `<button class="link" type="button" id="xoff">${old.called_off ? '↺ ' + t('Bring the game back') : '🚫 ' + t('Cancel the game (keep the booking)')}</button>` : ''}
    ${old ? `<button class="link danger" type="button" id="xdel">${t('Remove extra game')}</button>` : ''}<button class="link" type="button" id="xcancel">${t('Cancel')}</button></form>`;
  document.body.append(el); minimalize(el);
  // the deadline follows the game (its usual time before play) until someone sets the deadline by hand
  const fm = el.querySelector('form'), sel = n => fm.querySelector(`[name=${n}]`);
  let byHand = !!old;
  fm.addEventListener('change', e => {
    if (['bd', 'bh', 'bm'].includes(e.target.name)) return void (byHand = true);
    if (byHand) return;
    const at = new Date(Date.parse(sel('day').value + 'T00:00:00Z') + ((+sel('th').value * 60 + +sel('tm').value) - sched.rsvp_until_minutes) * 6e4), d = at.toISOString().slice(0, 10);
    sel('bd').value = d < today ? today : d; sel('bh').value = at.getUTCHours(); sel('bm').value = at.getUTCMinutes() - at.getUTCMinutes() % 5;
  });
  el.querySelector('#xcancel').onclick = () => el.remove();
  if (old && el.querySelector('#xoff')) el.querySelector('#xoff').onclick = () => { el.remove(); callOff(iso, !old.called_off); };
  if (old) el.querySelector('#xdel').onclick = () => { el.remove(); act(async () => ok(await sb.from('play_dates').delete().eq('day', iso)), () => { playDates = playDates.filter(x => x.day !== iso); }); };
  el.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target), day = f.get('day'), time = formTime(f, 't'), when = new Date(`${f.get('bd')}T${formTime(f, 'b')}`), msg = el.querySelector('.msg');
    if (day !== iso && playDates.some(x => x.day === day)) return msg.textContent = t('That date is already marked in the calendar.');
    if (!isAdmin() && dowOf(day) === sched.dow) return msg.textContent = t('That is already a normal play day.');
    if (when >= new Date(`${day}T${time}`)) return msg.textContent = t('The answer deadline must be before the game.');
    if (when <= new Date()) return msg.textContent = t('The answer deadline is already over.');
    const row = { day, kind: 'extra', play_time: time, answer_by: when.toISOString(), created_by: (old && old.created_by) || session.user.id };
    el.remove();
    // same date: change the row, keeping the old start time when it moves (the database then notifies the players who are in)
    const was = old && old.play_time ? old.play_time.slice(0, 5) : '', moved = old && day === iso && was && was !== time.slice(0, 5);
    if (old && day === iso) {
      const ch = { play_time: time, answer_by: row.answer_by, time_was: moved ? was : old.time_was || null };
      act(async () => ok(await sb.from('play_dates').update(ch).eq('day', iso)), () => Object.assign(old, ch));
    } else act(async () => {   // a new date: remove the old one, add the new one
      if (old) ok(await sb.from('play_dates').delete().eq('day', iso));
      ok(await (isAdmin() ? sb.from('play_dates').upsert(row) : sb.from('play_dates').insert(row)));
    }, () => { playDates = playDates.filter(x => x.day !== iso && x.day !== day).concat(row); });
    if (moved) { if (confirm(t('Tell the WhatsApp group about the new time?'))) waShare(t('⏰ The extra game on {date} now starts at {time} (instead of {was}).', { date: niceDate(day), time: time.slice(0, 5), was }) + ' ' + appLink()); }
    else if (!old || day !== iso) { if (confirm(t('Tell the WhatsApp group?'))) shareExtra(day); }
  };
}
// extra games someone else added that I have not answered yet (the next play day already has its own sign-up card)
function invites() {
  const mine = session && db.players.find(p => p.user === session.user.id), today = tzParts().date, next = nextPlayDate();
  if (!mine) return [];
  return playDates.filter(p => p.kind === 'extra' && !p.called_off && p.day >= today && p.day !== next && p.created_by !== session.user.id && !answerOf(mine.id, p.day) && rsvpPhase(p.day) === 'open')
    .sort((x, y) => x.day < y.day ? -1 : 1);
}
const calShift = n => { const [y, m] = (calMonth || tzParts().date.slice(0, 7)).split('-').map(Number); calMonth = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); render(); };
const rsvpIsOpen = date => rsvpOpen && rsvpOpen.date === date ? rsvpOpen.open : date === tzParts().date;   // compact until the play day, unless toggled by hand for this date
const toggleRsvp = (date = nextPlayDate()) => { rsvpOpen = { date, open: !rsvpIsOpen(date) }; render(); };
// sign-up window on the play day: 'open' until the answers close, 'locked' (visible, read-only) until it is hidden. Later play days stay open.
// an extra game can have its own start time and answer deadline; other play days use the weekly schedule
const extraOf = d => playDates.find(p => p.day === d && p.kind === 'extra');
// the start time of an extra game was changed: say so on its cards ("new time, was 19:00")
const movedNote = d => { const p = extraOf(d); return p && p.time_was && p.play_time && p.time_was.slice(0, 5) !== p.play_time.slice(0, 5) ? ` <span class="moved">⏰ ${t('new time, was {was}', { was: p.time_was.slice(0, 5) })}</span>` : ''; };
const playMinsOn = d => { const p = extraOf(d); return p && p.play_time ? +p.play_time.slice(0, 2) * 60 + +p.play_time.slice(3, 5) : playMins(); };
const minsUntilPlay = date => { const n = tzParts(); return (Date.parse(date) - Date.parse(n.date)) / 6e4 + playMinsOn(date) - n.mins; };
function deadlineText(date) {
  if (!sched) return '';
  const p = extraOf(date);
  if (!p || !p.answer_by) return hhmm(playMinsOn(date) - sched.rsvp_until_minutes);
  const d = new Date(p.answer_by), day = d.toLocaleDateString('en-CA', { timeZone: sched.tz }), time = d.toLocaleTimeString(LOCALE[lang], { timeZone: sched.tz, hour: '2-digit', minute: '2-digit' });
  return day === date ? time : niceDate(day) + ' ' + time;
}
function rsvpPhase(date) {
  if (!sched) return 'open';
  const left = minsUntilPlay(date), p = extraOf(date);
  if (p && p.answer_by) return Date.now() < Date.parse(p.answer_by) ? 'open' : left <= sched.rsvp_hide_minutes ? 'hidden' : 'locked';
  return left <= sched.rsvp_hide_minutes ? 'hidden' : left <= sched.rsvp_until_minutes ? 'locked' : 'open';
}
const answerOf = (id, date) => (rsvps.find(r => r.day_date === date && r.player_id === id) || {}).status;
const setRsvp = (id, status, date = nextPlayDate()) => {
  return act(async () => {
    if (status) ok(await sb.from('rsvps').upsert({ day_date: date, player_id: id, status, updated_at: new Date().toISOString() }));
    else ok(await sb.from('rsvps').delete().eq('day_date', date).eq('player_id', id));
  }, () => { rsvps = rsvps.filter(r => !(r.day_date === date && r.player_id === id)); if (status) rsvps.push({ day_date: date, player_id: id, status }); });
};
const resetRsvps = (date = nextPlayDate()) => {
  if (confirm(t('Clear everyone\'s answers for {date}? Everybody will show as "no answer" again.', { date: niceDate(date) }))) act(async () => ok(await sb.from('rsvps').delete().eq('day_date', date))); };
const cycleRsvp = (id, date = nextPlayDate()) => setRsvp(id, { in: 'out', out: null }[answerOf(id, date)] ?? 'in', date); // admins: in -> out -> no answer
// ---- play-day notifications (Web Push; the server side is supabase/functions/remind). iPhones need the app on the Home Screen first.
let pushOn = null;   // null: this browser cannot, false: off, true: on
const pushReady = async () => {
  if (!('PushManager' in window) || !navigator.serviceWorker) return;
  pushOn = !!(await (await navigator.serviceWorker.ready).pushManager.getSubscription()); render();
};
const b64 = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const pushToggle = () => act(async () => {
  const reg = await navigator.serviceWorker.ready, old = await reg.pushManager.getSubscription();
  if (pushOn) { if (old) { ok(await sb.rpc('drop_push', { endpoint: old.endpoint })); await old.unsubscribe(); } pushOn = false; return; }
  if (await Notification.requestPermission() !== 'granted') return alert(t('Notifications are blocked for this app. Allow them in the phone settings, then try again.'));
  const key = ok(await sb.rpc('push_public_key'));
  if (!key) return alert(t('Notifications are not set up on the server yet. Ask an admin.'));
  const j = (old || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) })).toJSON();
  ok(await sb.rpc('save_push', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth_key: j.keys.auth })); pushOn = true;
});
const pushTest = () => act(async () => { const r = await sb.functions.invoke('remind', { body: { test: true } }); if (r.error || !r.data.sent) alert(t('The test notification could not be sent.')); });
// ---- group chat (newest 200 messages); "seen" is remembered per phone
let topMenu = false;   // the ⋯ menu at the top (admin tools, view as member, log out)
let chatOn = false;   // the chat is switched off for now (messages are kept); true brings it back in the Group tab
let chat = [], chatRx = [], chatOpen = null, chatJump = false, chatMark = 0, groupTab = 'tips';   // groupTab: the Group tab remembers Chat or Members   // chatMark: the last message read before opening the chat
const chatSeen = () => { try { return +localStorage.getItem('chatSeen') || 0; } catch { return 0; } };
const chatUnread = () => chat.filter(m => m.body && m.id > chatSeen() && m.user_id !== session.user.id).length;
const markChatSeen = () => { const last = chat.length ? chat[chat.length - 1].id : 0; if (last > chatSeen()) try { localStorage.setItem('chatSeen', last); } catch {} };
const sendChat = e => {   // the message box lives outside the redrawn screen (see render), so live updates never touch what is being typed
  e.preventDefault(); const box = document.querySelector('.cform input'), body = box.value.trim(); if (!body) return;
  box.value = ''; chatJump = true;
  act(async () => ok(await sb.from('chat').insert({ body })), () => chat.push({ id: Infinity, user_id: session.user.id, body, created_at: new Date().toISOString() }));
};
const delChat = id => confirm(t('Delete this message?')) && act(async () => ok(await sb.from('chat').delete().eq('id', id)), () => { chat = chat.filter(m => m.id !== id); chatOpen = null; });
const reactChat = (id, emoji) => {
  const mine = chatRx.find(x => x.msg_id === id && x.user_id === session.user.id && x.emoji === emoji);
  act(async () => ok(mine ? await sb.from('chat_reactions').delete().eq('msg_id', id).eq('user_id', session.user.id).eq('emoji', emoji) : await sb.from('chat_reactions').insert({ msg_id: id, emoji })),
    () => { chatRx = mine ? chatRx.filter(x => x !== mine) : [...chatRx, { msg_id: id, user_id: session.user.id, emoji }]; chatOpen = null; });
};
const chatPush = on => act(async () => ok(await sb.from('profiles').update({ chat_push: on }).eq('id', me.id)), () => { me.chat_push = on; });
// the app's own notes in the chat, in each reader's language
const evText = e => e.type === 'extra' ? t('{who} added an extra game on {date} at {time}', { who: e.who, date: niceDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' }), time: e.time })
  : e.type === 'rsvp' ? (e.status === 'in' ? t('{who} is in for {date}', { who: e.who, date: niceDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' }) }) : t('{who} is out for {date}', { who: e.who, date: niceDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' }) }))
  : e.type === 'closed' ? (e.top ? t('Day closed: {n} matches, most wins: {top}', { n: e.n, top: e.top }) : t('Day closed: {n} matches', { n: e.n })) : '';
// early bird: how often a player was the first to answer "I'm in" for a play day
const earlyBird = pid => { const first = new Map(); rsvps.filter(r => r.status === 'in' && r.updated_at).forEach(r => { const f = first.get(r.day_date); if (!f || r.updated_at < f.updated_at) first.set(r.day_date, r); });
  return [...first.values()].filter(r => r.player_id === pid).length; };

// ---- monthly recap: swipeable cards for a month, for the group and for you (numbers from recap() in analytics.js)
const monthLabel = ym => new Date(ym + '-15T12:00:00Z').toLocaleDateString(LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' });
const recapMonths = () => [...new Set(db.days.filter(d => d.matches.length).map(d => d.date.slice(0, 7)))].sort();
const recapDefault = () => { const ms = recapMonths(), now = tzParts().date.slice(0, 7); return ms.filter(m => m < now).pop() || ms.pop(); };   // the last finished month
function recapCards(ym) {
  const mine = db.players.find(p => p.user === session.user.id), r = recap(db.days, db.players, ym, mine && mine.id, ids => ids.every(canSee));
  if (!r) return [];
  const nm = id => player(id).name, day = d => niceDate(d, { weekday: 'short', day: 'numeric', month: 'short' }), m = r.me;
  return [
    ['🎁', t('{month} in review', { month: monthLabel(ym) }), t('{nights} nights, {matches} matches for the group.', { nights: r.nights, matches: r.matches })],
    m && ['🏸', t('Your month'), t('You played {p} matches on {nights} nights and won {w}.', m)],
    m && m.partner && ['🤝', t('Your partner in crime'), t('Mostly with {name}: {g} matches together, {w} won.', { name: nm(m.partner.id), g: m.partner.g, w: m.partner.w })],
    m && m.best && m.best.w && ['⭐', t('Your best night'), t('{date}: {w} of {p} won.', { date: day(m.best.date), w: m.best.w, p: m.best.p })],
    m && !ratingHidden(mine.id) && Math.round(m.delta) !== 0 && (m.delta > 0 ? ['📈', t('Rating'), t('Your rating went up by {n}.', { n: Math.round(m.delta) })] : ['📉', t('Rating'), t('Your rating went down by {n}. Next month!', { n: Math.round(-m.delta) })]),
    ['🔋', t('Ever-present'), t('{name} played the most: {n} matches.', { name: nm(r.most.id), n: r.most.n })],
    r.streak && ['🔥', t('Longest run'), t('{name} won {n} in a row.', { name: nm(r.streak.id), n: r.streak.n })],
    r.duo && ['💞', t('Duo of the month'), t('{names}: {w} wins in {g} matches together.', { names: plain(r.duo.ids), w: r.duo.w, g: r.duo.g })],
    r.upset && ['😱', t('Upset of the month'), t('{won} beat {lost} with only a {pct}% chance.', { won: plain(r.upset.won), lost: plain(r.upset.lost), pct: Math.round(100 * r.upset.chance) })],
    ['🎉', t('Biggest night'), t('{date}: {players} players, {n} matches.', { date: day(r.bigNight.date), players: r.bigNight.players, n: r.bigNight.n })],
  ].filter(Boolean);
}
let recapYm = null;
const openRecap = (ym = recapDefault()) => {
  recapYm = ym; document.getElementById('recap')?.remove();
  const ms = recapMonths(), i = ms.indexOf(ym), cards = recapCards(ym), el = document.createElement('div');
  el.id = 'recap'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', t('{month} recap', { month: monthLabel(ym) }));
  el.innerHTML = `<div class="rtop"><button class="link" ${i > 0 ? '' : 'disabled'} data-ym="${ms[i - 1] || ''}" aria-label="${t('Previous month')}">‹</button><b>${esc(monthLabel(ym))}</b>
      <button class="link" ${i < ms.length - 1 ? '' : 'disabled'} data-ym="${ms[i + 1] || ''}" aria-label="${t('Next month')}">›</button><button class="link" id="rclose" aria-label="${t('Close')}">✕</button></div>
    <div class="rcards">${cards.map(([e, h, line], k) => `<div class="rcard"><div class="re">${e}</div><h2>${esc(h)}</h2><p>${esc(line)}</p><small class="mut">${k + 1} / ${cards.length + 1}</small></div>`).join('')}
      <div class="rcard"><div class="re">📤</div><h2>${t('Share it')}</h2><button class="primary" id="rshare">💬 ${t('Share on WhatsApp')}</button><small class="mut">${cards.length + 1} / ${cards.length + 1}</small></div></div>
    <p class="mut rhint">${t('Swipe for more')} →</p>`;
  document.body.append(el); minimalize(el);
  el.querySelectorAll('[data-ym]').forEach(b => b.onclick = () => b.dataset.ym && openRecap(b.dataset.ym));
  el.querySelector('#rclose').onclick = () => el.remove();
  el.querySelector('#rshare').onclick = () => waShare(cards.map(([e, h, line]) => `${e} ${h}: ${line}`).join('\n') + '\n' + appLink());
};
// ---- video tips (Photos → Tips): links shared by admins; YouTube plays in the app, other sites open in their own app
let tips = [], tipTopic = 'all';
const TOPICS = () => ({ serve: '🎯 ' + t('Serve'), smash: '💥 ' + t('Smash and clear'), net: '🕸 ' + t('Net play'), footwork: '👟 ' + t('Footwork'), defence: '🛡 ' + t('Defence'), doubles: '👥 ' + t('Doubles tactics'), singles: '👤 ' + t('Singles'), other: '💡 ' + t('Other') });
const ytId = url => { const m = String(url).match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; };
// the form is a layer above the app (like the extra-game form), so live updates never wipe what is being typed
const tipForm = () => {
  document.getElementById('xform')?.remove(); const T = TOPICS();
  const el = document.createElement('div'); el.id = 'xform'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<form class="card"><h2 style="margin:0 0 12px">🎬 ${t('Add a video tip')}</h2>
      <input type="url" name="url" placeholder="${t('Link to the video (YouTube, Instagram, TikTok…)')}" inputmode="url" autocapitalize="none">
      <label class="field clip">📱 ${t('…or a short video from your phone (up to 50 MB)')}<input type="file" name="clip" accept="video/*"></label>
      <input type="text" name="title" required maxlength="120" placeholder="${t('Title, e.g. How to hold the racket')}">
      <label class="field">${t('Topic')}<select name="topic">${Object.entries(T).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <textarea name="note" maxlength="500" rows="2" placeholder="${t('What to look at (optional)')}"></textarea>
      <p class="msg" role="alert"></p><button class="primary" type="submit">${t('Share with everyone')}</button><button class="link" type="button" id="tcancel">${t('Cancel')}</button></form>`;
  document.body.append(el); minimalize(el);
  el.querySelector('#tcancel').onclick = () => el.remove();
  el.querySelector('form').onsubmit = addTip;
};
const MAX_CLIP = 50 * 1024 * 1024;   // Supabase free plan: at most 50 MB per file
const addTip = async e => {
  e.preventDefault(); const form = e.target, f = new FormData(form), url = f.get('url').trim(), title = f.get('title').trim(), file = f.get('clip'), showMsg = m => { form.querySelector('.msg').textContent = m; };
  const clip = file && file.size ? file : null;
  if (!clip && !/^https:\/\/\S+$/.test(url)) return showMsg(t('Paste the link of the video (it starts with https://), or pick a video from your phone.'));
  if (clip && clip.size > MAX_CLIP) return showMsg(t('That video is {mb} MB; the limit is 50 MB (about 30 to 60 seconds). Shorten it, or upload it to YouTube as Unlisted and paste the link.', { mb: Math.round(clip.size / 1048576) }));
  const row = { url: clip ? null : url, title, topic: f.get('topic'), note: f.get('note').trim() || null };
  if (clip) {   // uploads can take a while on mobile data: keep the form until it is stored
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; showMsg(t('Uploading the video… keep the app open.'));
    const path = `tips/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${(clip.name.split('.').pop() || 'mp4').toLowerCase()}`;
    const up = await sb.storage.from('photos').upload(path, clip, { contentType: clip.type || 'video/mp4' });
    btn.disabled = false; if (up.error) return showMsg(friendly(up.error));
    row.video_path = path; showMsg('');
  }
  document.getElementById('xform')?.remove(); act(async () => ok(await sb.from('tips').insert(row)), () => { tips = [{ ...row, id: Infinity, created_by: session.user.id, created_at: new Date().toISOString() }, ...tips]; });
};
const delTip = id => { const x = tips.find(v => v.id === id); if (!confirm(t('Remove this video tip?'))) return;
  act(async () => { ok(await sb.from('tips').delete().eq('id', id)); if (x && x.video_path) await dropPhotos([x.video_path]); }, () => { tips = tips.filter(v => v.id !== id); }); };
// YouTube plays in a layer above the app, so live updates (which redraw the screen) never stop the video
const playTip = async id => {
  const x = tips.find(v => v.id === id), y = x && x.url && ytId(x.url); if (!x || (!y && !x.video_path)) return;
  const src = x.video_path && ok(await sb.storage.from('photos').createSignedUrls([x.video_path], 3600))[0].signedUrl;
  document.getElementById('player')?.remove();
  const el = document.createElement('div'); el.id = 'player'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="pbox"><div class="ptop"><b>${esc(x.title)}</b><button class="link" aria-label="${t('Close')}">✕</button></div>
    <div class="pvid">${y ? `<iframe src="https://www.youtube-nocookie.com/embed/${y}?autoplay=1&rel=0&playsinline=1" title="${esc(x.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : `<video src="${esc(src)}" controls autoplay playsinline></video>`}</div>
    ${x.note ? `<p>${esc(x.note)}</p>` : ''}${y ? `<a class="link" href="${esc(x.url)}" target="_blank" rel="noopener">↗ ${t('Open in YouTube')}</a>` : '<div style="height:12px"></div>'}</div>`;
  el.querySelector('.ptop button').onclick = () => el.remove(); el.onclick = ev => { if (ev.target === el) el.remove(); };
  document.body.append(el);
};
const remindMe = () => { const s = sched || { tz: 'Europe/Berlin', dow: 4, play_time: '18:30', rsvp_until_minutes: 120 };
  saveFile(calendarFile(s, nextPlayDate(), location.href, t('Badminton: answer if you are coming'),
    t('Open the app and tap I\'m in or I\'m out before {time}.', { time: hhmm(+s.play_time.slice(0, 2) * 60 + +s.play_time.slice(3, 5) - s.rsvp_until_minutes) })), 'badminton.ics'); };

// ---- photo reactions
const KINDS = [['clap', '👏'], ['fire', '🔥'], ['laugh', '😂'], ['love', '❤️'], ['trophy', '🏆']];
const mineOn = (day, kind) => reactions.some(r => r.day_id === day && r.kind === kind && r.user_id === session.user.id);
const react = (day, kind) => { const had = mineOn(day, kind), uid = session.user.id;
  return act(async () => had ? ok(await sb.from('reactions').delete().eq('day_id', day).eq('kind', kind).eq('user_id', uid)) : ok(await sb.from('reactions').insert({ day_id: day, kind })),
    () => { reactions = reactions.filter(r => !(r.day_id === day && r.kind === kind && r.user_id === uid)); if (!had) reactions.push({ day_id: day, kind, user_id: uid }); }); };
const reactionBar = day => KINDS.map(([k, e]) => { const n = reactions.filter(r => r.day_id === day && r.kind === k).length;
  return `<button class="rx ${mineOn(day, k) ? 'on' : ''}" onclick="react(${day},'${k}')" aria-pressed="${mineOn(day, k)}" aria-label="${k}">${e}${n ? ' ' + n : ''}</button>`; }).join('');

// ---- shareable player card (a picture for WhatsApp)
const bigAvatar = {};   // signed links to the sharp profile photos, per player (missing = only the small one exists)
const cardArt = async id => { const p = player(id); let img = null;
  if (!(id in bigAvatar)) { const r = await sb.storage.from('photos').createSignedUrls([`avatars/p${id}.jpg`], 3600); bigAvatar[id] = !r.error && r.data[0] && !r.data[0].error ? r.data[0].signedUrl : null; }
  for (const src of [bigAvatar[id], p.avatar]) if (src && !img) try { const res = await fetch(src); if (res.ok) img = await createImageBitmap(await res.blob()); } catch {}
  return { hue: id * 67 % 360, initial: p.name[0].toUpperCase(), img }; };
async function sharePlayerCard(id) {
  const p = player(id), an = analyse(db.days, db.players), b = an.badges.get(id), crowns = monthChamps().filter(c => c.id === id).length, me_ = stats(db.days.flatMap(d => d.matches)).find(r => r.id === id) || { p: 0 };
  const em = [crowns && '👑', b.potn && '⭐', b.perfect && '💯', b.fire && '🔥', b.comeback && '🔄', b.improved && '📈', b.nightsRun >= 5 && '🗓', me_.p >= 50 && '🎖', b.everyone && '🤝', b.everyMonth && '📆', earlyBird(id) && '🐦', loyal(id) && '🏅', challengeWins(db.days, db.players).get(id) && '🎯'].filter(Boolean);
  const blob = await drawPlayerCard({ ...cardSpec(id, an, em), ...(await cardArt(id)) });
  const file = new File([blob], `badminton-${p.name}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: p.name }).catch(() => {});
  else saveFile(blob, file.name);
}
// ---- the points rules as a picture for WhatsApp (drawRulesCard in fx.js)
async function shareRules() {
  const blob = await drawRulesCard({ title: t('How the rating works'), season: seasonLabel(seasonKey(tzParts().date)),
    rules: [['±', t('Win and lose matches'), t('beat stronger players and you gain more'), 'chart'], [`+${LOYALTY.night}`, t('Play a night'), t('loyalty bonus, just by showing up'), 'shuttle'],
      [`+${LOYALTY.match}`, t('Each match'), t('at most {n} a night', { n: LOYALTY.maxMatches }), 'shuttles'], [`+${LOYALTY.challenge}`, t('Weekly challenge'), t('complete it, any week'), 'target']],
    sum: { title: t('Your rating'), parts: [['1094', t('match rating')], ['+34', t('loyalty bonus')], ['1128', t('Rating')]] },
    notes: [t('The loyalty bonus starts again each season.'), t('The top 3 bonuses of a season get the Loyal player badge.')], footer: t('Badminton Thursdays') });
  const file = new File([blob], 'badminton-rating.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: t('How the rating works') }).catch(() => {});
  else saveFile(blob, file.name);
}
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
    potn: top && await person(top.id, canSee(top.id) && !ratingHidden(top.id) ? `${player(top.id).name}  ·  +${Math.round(top.delta)} ${t('rating')}` : player(top.id).name) });
  const file = new File([blob], `badminton-${d.date}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: t('Badminton night') }).catch(() => {});
  else saveFile(blob, file.name);
}
const undo = () => { const d = cur(), last = d.matches[d.matches.length - 1], n = d.matches.length - 1;   // by day and number: the last match may not have reached the server yet
  const back = d.rotFrom > n; // undoing the match before a line-up change: the new rotation starts one match earlier
  return act(async () => { ok(await sb.from('matches').delete().eq('day_id', d.id).eq('n', last.n)); if (back) await patchDay(d.id, { rot_from: n })(); },
    () => { d.matches.pop(); if (back) d.rotFrom = n; }); };
const closeDay = () => { const d = cur(); return confirm(t('Close the day? No more matches can be added.')) && act(patchDay(d.id, { closed: true }), () => { d.closed = true; celebrate(); }); };
const reopenDay = () => { const d = cur(); return act(patchDay(d.id, { closed: false }), () => { d.closed = false; }); };
const dropPhotos = async paths => { paths = paths.filter(Boolean); if (paths.length) ok(await sb.storage.from('photos').remove(paths)); };
const resetDay = () => confirm(t('Reset today? This deletes all matches of this day and goes back to player order.')) && act(async () => {
  const d = cur();
  ok(await sb.from('matches').delete().eq('day_id', d.id));
  await patchDay(d.id, { started: false, closed: false, photo_path: null, rot_from: 0 })();
  await dropPhotos([d.photo]);
});
const newDayBtn = () => act(async () => {
  if (cur().matches.length) ok(await sb.from('days').insert(dayRow(cur())));
  else await patchDay(cur().id, { started: false, rot_from: 0 })();
});
const eraseAll = () => confirm(t('Reset ALL scores? This deletes every day, match and group photo for everyone. Players and accounts are kept. This cannot be undone.')) && act(async () => {
  await dropPhotos(db.days.map(d => d.photo));
  ok(await sb.from('days').delete().gt('id', 0));
  selId = null;
});
const removeAccount = (id, uname) => confirm(t('Remove the account of {name}? They can no longer log in. Their player and results stay and show as "no account".', { name: uname }))
  && act(async () => ok(await sb.rpc('delete_account', { uid: id })));
// delete one day's leaderboard = delete the day with its matches and group photo (admins only)
const deleteDay = id => { dayMore = false;
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
// admins: two players who are the same person become one (the database moves everything; see merge_players)
const mergePlayers = e => {
  e.preventDefault(); const f = new FormData(e.target), keep = +f.get('keep'), dup = +f.get('dup');
  if (keep === dup) return showMsg(t('Pick two different players.'));
  const v = { keep: player(keep).name, dup: player(dup).name };
  if (!confirm(t('Merge {dup} into {keep}? All matches, answers and the account of {dup} move to {keep}, and {dup} disappears. This cannot be undone.', v))) return;
  const moveCardPhoto = !!player(dup).user;   // the account's own photo wins, like the small avatar in the database
  act(async () => { ok(await sb.rpc('merge_players', { keep, dup }));
    // the sharp card photo moves along: only once the new account's photo is known to exist is the old one replaced
    const from = `avatars/p${dup}.jpg`, to = `avatars/p${keep}.jpg`, has = await sb.storage.from('photos').createSignedUrls([from], 60);
    if (!has.error && has.data[0] && !has.data[0].error && (await fetch(has.data[0].signedUrl, { method: 'HEAD' }).catch(() => ({}))).ok) {
      if (moveCardPhoto) { await sb.storage.from('photos').remove([to]); await sb.storage.from('photos').copy(from, to); delete bigAvatar[keep]; }
      await sb.storage.from('photos').remove([from]);
    }
    toast(t('{dup} is now part of {keep}.', v)); });
};
const toggleAdmin = (id, v) => act(async () => ok(await sb.from('profiles').update({ is_admin: v }).eq('id', id)));
function saveSchedule(e) { // admins only; the database also refuses unknown time zones
  e.preventDefault();
  const f = new FormData(e.target), row = {};   // the schedule and the times are two small forms: save what this one has
  if (f.has('tz')) {
    const tz = f.get('tz').trim();
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return showMsg(t('Unknown time zone.')); }
    Object.assign(row, { tz, dow: +f.get('dow'), play_time: formTime(f, 'time') });
  }
  if (f.has('mins')) {
    if (+f.get('hide') > +f.get('until')) return showMsg(t('The sign-up section cannot be hidden before the answers close.'));
    Object.assign(row, { opens_minutes: +f.get('mins'), rsvp_until_minutes: +f.get('until'), rsvp_hide_minutes: +f.get('hide'), remind_minutes: +f.get('remind') });
  }
  act(async () => {
    ok(await sb.from('schedule').update(row).eq('id', true));
    toast(t('Schedule saved.'));
  });
}

// ---- stats
const pct = r => (r.p ? r.w / r.p : 0);
const byWins = (a, b) => b.w - a.w || pct(b) - pct(a) || a.name.localeCompare(b.name);
// Month and All time rank by win rate (ties: more wins, then more games); players need 3 games to be ranked
function stats(matches) {
  const s = new Map(db.players.map(p => [p.id, { id: p.id, name: p.name, w: 0, p: 0 }]));
  for (const m of matches) {
    [...m.t1, ...m.t2].forEach(id => s.get(id).p++);
    (m.win === 1 ? m.t1 : m.t2).forEach(id => s.get(id).w++);
  }
  return [...s.values()].filter(r => r.p).sort(byWins);
}
// the month leaderboard: matches of the days in month `ym` (YYYY-MM); champions are the winners of finished months
const monthMatches = ym => db.days.filter(d => d.date.slice(0, 7) === ym).flatMap(d => d.matches);
const doublesOnly = ms => ms.filter(m => m.t1.length > 1);
// rating points won or lost in a month (the sum of the nightly Elo changes), with the games played: the Month board and its champion
// rating points won over some nights: the match rating change (one kind, or 'all') plus each night's loyalty bonus; most first
function ratingGains(ds, kind = 'all', an = analyse(db.days, db.players)) {
  const ids = new Set(ds.map(d => d.id)), out = new Map(), Hs = kind === 'singles' ? [an.histS] : kind === 'doubles' ? [an.hist] : [an.hist, an.histS];
  for (const p of db.players) for (const H of Hs) H.get(p.id).forEach((x, i, h) => { if (!ids.has(x.day)) return;
    const prev = i ? h[i - 1].r : START_RATING, r = out.get(p.id) || { id: p.id, name: p.name, gain: 0, w: 0, p: 0, nights: new Set() };
    r.gain += x.r - prev; r.p++; if (x.r > prev) r.w++; r.nights.add(x.day); out.set(p.id, r); });
  for (const r of out.values()) for (const d of r.nights) r.gain += nightBonus(an.night.get(d).get(r.id));
  return [...out.values()].sort((a, b) => b.gain - a.gain || b.w - a.w);
}
const monthDays = ym => db.days.filter(d => d.matches.length && d.date.slice(0, 7) === ym);
const monthChamps = () => { const an = analyse(db.days, db.players);   // the champion of a month: most doubles rating points won, at least 3 games
  return [...new Set(db.days.filter(d => d.matches.length).map(d => d.date.slice(0, 7)))].filter(ym => ym < tzParts().date.slice(0, 7))
    .map(ym => { const g = ratingGains(monthDays(ym), 'doubles', an), r = g.find(x => x.p >= 3) || g[0]; return r && { ym, id: r.id }; }).filter(Boolean); };
const monthName = ym => new Date(ym + '-15T12:00:00Z').toLocaleDateString(LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' });
let lbMonth = null;
const dayShift = n => { const days = db.days.filter(d => d.matches.length), i = Math.max(0, days.findIndex(d => d.id === selId)), cur_ = selId && i >= 0 && days[i].id === selId ? i : days.length - 1, k = Math.min(days.length - 1, Math.max(0, cur_ + n)); selId = days[k] && days[k].id; render(); };
const monthShift = n => { const [y, m] = (lbMonth || tzParts().date.slice(0, 7)).split('-').map(Number); lbMonth = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); render(); };
// all-time standings: counted by the database (standings()); while taps are still on their way the local count is used
const allTime = () => std && pending === 0 ? std.filter(r => player(r.player_id)).map(r => ({ id: r.player_id, name: player(r.player_id).name, w: r.wins, p: r.played })).sort(byWins)
  : stats(db.days.flatMap(d => d.matches));

// regular members may start a day on the play day from `opens_minutes` before play time (server enforces the same rule)
function startOpen() {
  if (!sched) return true;
  const n = tzParts();
  // the opening may fall on the evening before (e.g. a 00:30 game); it stays open until the end of the play day
  return [n.date, addDays(n.date, 1)].some(d => isPlayDate(d) && minsUntilPlay(d) <= sched.opens_minutes && minsUntilPlay(d) > playMinsOn(d) - 1440);
}
const hhmm = mins => { mins = ((mins % 1440) + 1440) % 1440; return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'); };
const playMins = () => +sched.play_time.split(':')[0] * 60 + +sched.play_time.split(':')[1];
const startNote = () => { const d = nextPlayDate(); return t('We play on {day} at {time}. You can press Start playing from {open}.',
  { day: dayName(dowOf(d)), time: hhmm(playMinsOn(d)), open: hhmm(playMinsOn(d) - sched.opens_minutes) }); };
