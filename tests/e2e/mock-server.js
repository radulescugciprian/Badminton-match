// Fake Supabase server (in memory) mirroring the rules in supabase/migrations that the screens depend on.
const st = { players: ['Vali','Dani','Costi','Zjepko','Ciprian'].map((name,i)=>({id:i+1,name,avatar:null,active:true,user_id:null})), days: [], matches: [], profiles: [], receipts: [], rsvps: [], reactions: [], play_dates: [], log: [], attempts: {}, schedule: [{ id: true, tz: 'Europe/Berlin', dow: 4, play_time: '18:30:00', opens_minutes: 60, rsvp_until_minutes: 120, rsvp_hide_minutes: 90 }], now: null, users: {}, files: {}, seq: { p: 5, d: 0, m: 0 } };
const pages = [];
const emit = () => pages.forEach(p => p.evaluate(() => window.__emit && window.__emit()).catch(() => {}));
const isAdmin = u => (st.profiles.find(p => p.id === u) || {}).is_admin;
const err = (message, code) => ({ error: { message, code } });
const logAct = (u, action, detail) => st.log.push({ id: st.log.length + 1, at: new Date().toISOString(), actor: u, actor_name: (st.profiles.find(p => p.id === u) || {}).username || null, action, detail });
function rsvpOpen(date) { // like the database: later days are open, on the play day until play time minus rsvp_until_minutes
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(st.now || Date.now())), g = x => f.find(p => p.type === x).value;
  const today = `${g('year')}-${g('month')}-${g('day')}`, s = st.schedule[0], pm = +s.play_time.slice(0, 2) * 60 + +s.play_time.slice(3, 5);
  const x = st.play_dates.find(p => p.day === date && p.kind === 'extra');
  if (x && x.answer_by) return (st.now || Date.now()) < Date.parse(x.answer_by);
  return date > today || (date === today && +g('hour') * 60 + +g('minute') < pm - s.rsvp_until_minutes);
}
function canStart() {
  const when = new Date(st.now || Date.now()), pf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(when);
  const iso = `${pf.find(p => p.type === 'year').value}-${pf.find(p => p.type === 'month').value}-${pf.find(p => p.type === 'day').value}`, mark = (st.play_dates.find(p => p.day === iso) || {}).kind;
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(st.now || Date.now()));
  const g = x => f.find(p => p.type === x).value;
  return +g('hour') * 60 + +g('minute') >= 17 * 60 + 30 && (mark === 'extra' || (g('weekday') === 'Thu' && mark !== 'cancelled'));
}
function rpc(u, r) {
  if (!u && r.op !== 'rpc') return err('not logged in'); // the username lookup is public (anon)
  const T = { players: st.players, days: st.days, matches: st.matches, profiles: st.profiles, schedule: st.schedule, receipts: st.receipts, rsvps: st.rsvps, reactions: st.reactions, admin_log: st.log, play_dates: st.play_dates }[r.table];
  const match = row => r.f.every(([op, c, v]) => op === 'eq' ? row[c] === v : row[c] > v);
  switch (r.op) {
    case 'rpc': {
      if (r.name === 'db_version') return { data: st.dbVersion ?? 20261031 };
      if (r.name === 'delete_account') {
        if (!isAdmin(u)) return err('Admins only'); if (r.args.uid === u) return err('You cannot remove your own account');
        const pr = st.profiles.find(p => p.id === r.args.uid); if (!pr) return err('No such account');
        logAct(u, 'remove_account', { username: pr.username });
        st.profiles.splice(st.profiles.indexOf(pr), 1); delete st.users[Object.keys(st.users).find(e => st.users[e].id === r.args.uid)];
        st.players.forEach(p => { if (p.user_id === r.args.uid) p.user_id = null; }); emit(); return { data: null };
      }
      if (r.name === 'unclaimed_players') return { data: st.players.filter(p => !p.user_id && p.active).map(p => ({ id: p.id, name: p.name })) };
      if (st.legacyDb && ['login_email', 'username_taken'].includes(r.name)) return err('Could not find the function public.' + r.name + ' in the schema cache');   // a database that has not had the privacy migration yet
      if (r.name === 'email_for_username') { if (!st.legacyDb) return err('Could not find the function public.email_for_username in the schema cache'); const pr = st.profiles.find(p => p.username.toLowerCase() === r.args.u.toLowerCase()); return { data: pr ? Object.keys(st.users).find(e => st.users[e].id === pr.id) : null }; }
      if (r.name === 'username_taken') return { data: st.profiles.some(p => p.username.toLowerCase() === r.args.u.trim().toLowerCase()) };
      if (r.name === 'login_email') {           // same rule as the database: the email only comes back for the right password, 5 wrong guesses lock the name
        const k = r.args.u.trim().toLowerCase(), pr = st.profiles.find(p => p.username.toLowerCase() === k);
        if ((st.attempts[k] || 0) >= 5) return err('Too many attempts for this username');
        const email = pr && Object.keys(st.users).find(e => st.users[e].id === pr.id);
        if (email && st.users[email].password === r.args.pw) { delete st.attempts[k]; return { data: email }; }
        st.attempts[k] = (st.attempts[k] || 0) + 1; return { data: null };
      }
      if (r.name === 'standings') {
        const sm = new Map(); for (const mt of st.matches) for (const [ids, won] of [[mt.t1, mt.win === 1], [mt.t2, mt.win === 2]]) for (const id of ids) { const x = sm.get(id) || { player_id: id, played: 0, wins: 0 }; x.played++; x.wins += won ? 1 : 0; sm.set(id, x); }
        return { data: [...sm.values()] };
      }
      return err('Could not find the function ' + r.name + ' in the schema cache');
    }
    case 'upload': st.files[r.path] = r.data; return { data: {} };
    case 'remove': { if (!isAdmin(u)) return err('Admins only'); r.paths.forEach(p => delete st.files[p]); emit(); return { data: [] }; }
    case 'sign': return { data: r.paths.map(p => ({ path: p, signedUrl: 'http://localhost:8766/' + p })) };
    case 'select': {
      let rows = T.map(x => ({ ...x })).filter(match);
      if (r.table === 'days') rows.forEach(d => { d.matches = st.matches.filter(m => m.day_id === d.id).map(m => ({ ...m })); });
      if (r.table === 'admin_log' && !isAdmin(u)) rows = [];
      if (r.table === 'profiles' && st.emptyProfiles) rows = [];   // simulates a hiccup: the list of members comes back empty
      if (r.order) rows.sort((a, b) => (a[r.order] > b[r.order] ? 1 : -1) * (r.desc ? -1 : 1));
      if (r.limit) rows = rows.slice(0, r.limit);
      return { data: rows };
    }
    case 'upsert': {
      if (r.table === 'play_dates') {
        if (!isAdmin(u)) return err('new row violates row-level security policy for table "play_dates"');
        const old = st.play_dates.find(x => x.day === r.payload.day); old ? Object.assign(old, r.payload) : st.play_dates.push({ ...r.payload });
        logAct(u, 'mark_play_date', { date: r.payload.day, kind: r.payload.kind }); emit(); return { data: [] };
      }
      const pl = st.players.find(p => p.id === r.payload.player_id);
      if (!pl || (pl.user_id !== u && !isAdmin(u))) return err('new row violates row-level security policy for table "rsvps"');
      if (!isAdmin(u) && !rsvpOpen(r.payload.day_date)) return err('Answers are closed');
      const old = st.rsvps.find(x => x.day_date === r.payload.day_date && x.player_id === r.payload.player_id);
      old ? Object.assign(old, r.payload) : st.rsvps.push({ ...r.payload }); emit(); return { data: [] };
    }
    case 'insert': {
      if (Array.isArray(r.payload)) { let out = { data: [] }; for (const x of r.payload) { out = rpc(u, { ...r, payload: x }); if (out.error) return out; } return out; } // bulk insert
      if (st.failInsert && r.table === 'matches') return err('simulated server failure');
      const row = { ...r.payload };
      if (r.table === 'reactions') { row.user_id = u; if (st.reactions.some(x => x.day_id === row.day_id && x.user_id === u && x.kind === row.kind)) return err('duplicate key', '23505'); st.reactions.push(row); emit(); return { data: [row] }; }
      if (r.table === 'play_dates') { if (!isAdmin(u) && (r.payload.kind !== 'extra' || r.payload.created_by !== u || !r.payload.play_time || !r.payload.answer_by || new Date(r.payload.day + 'T12:00:00Z').getUTCDay() === st.schedule[0].dow)) return err('new row violates row-level security policy for table "play_dates"'); if (st.play_dates.some(x => x.day === r.payload.day)) return err('duplicate key', '23505'); logAct(u, 'mark_play_date', { date: r.payload.day, kind: r.payload.kind }); }
      if (r.table === 'receipts') { if (r.payload.created_by !== u) return err('new row violates row-level security policy for table "receipts"'); row.id = (st.receipts.length ? Math.max(...st.receipts.map(x => x.id)) : 0) + 1; row.created_at = new Date(st.now || Date.now()).toISOString(); }
      if (r.table === 'players') { if (!isAdmin(u) && r.payload.user_id) return err('new row violates row-level security policy'); row.id = ++st.seq.p; row.active = true; row.avatar = null; row.user_id = null; row.created_by = u; row.created_at = new Date(st.now || Date.now()).toISOString(); }
      if (r.table === 'days') { row.id = ++st.seq.d; Object.assign(row, { started: isAdmin(u) && !!r.payload.started, closed: false, photo_path: (isAdmin(u) && r.payload.photo_path) || null }); }
      if (r.table === 'matches') {
        const d = st.days.find(d => d.id === row.day_id);
        if (!d || !d.started || d.closed) return err('new row violates row-level security policy');
        if (st.matches.some(m => m.day_id === row.day_id && m.n === row.n)) return err('duplicate key', '23505');
        row.id = ++st.seq.m; row.created_at = new Date().toISOString();
      }
      T.push(row); emit(); return { data: r.single ? row : [row] };
    }
    case 'update': {
      for (const row of T.filter(match)) {
        if (r.table === 'days' && ((r.payload.closed !== undefined && r.payload.closed !== row.closed) || (row.started && r.payload.started === false) || (row.photo_path && r.payload.photo_path === null)) && !isAdmin(u)) return err('Admins only');
        if (r.table === 'days' && !row.started && r.payload.started === true && !isAdmin(u) && !canStart()) return err('A day can only be started during the play window. Ask an admin.');
        if (r.table === 'players' && r.payload.active === false && !isAdmin(u) && !(row.created_by === u && !row.user_id)) return err('Admins only'); // shortcut: the same-day limit is only checked by the database
        if (r.table === 'players' && r.payload.avatar !== undefined && row.user_id !== u) return err('Only the player can change their own avatar');
        if (r.table === 'profiles' && !isAdmin(u)) { // members may change only their own language / sharing choice
          if (row.id !== u) continue;
          if (!Object.keys(r.payload).every(k => ['lang', 'share_stats'].includes(k))) return err('Admins only');
        }
        if (r.table === 'schedule') {
          if (!isAdmin(u)) continue;
          try { new Intl.DateTimeFormat('en', { timeZone: r.payload.tz }); } catch { return err('Unknown time zone: ' + r.payload.tz); }
        }
        if (r.table === 'days') {
          if (r.payload.closed !== undefined && r.payload.closed !== row.closed) logAct(u, r.payload.closed ? 'close_day' : 'reopen_day', { date: row.date });
          if (row.started && r.payload.started === false) logAct(u, 'reset_day', { date: row.date });
          if (row.photo_path && r.payload.photo_path === null) logAct(u, 'delete_photo', { date: row.date });
        }
        if (r.table === 'profiles' && r.payload.is_admin !== undefined && r.payload.is_admin !== row.is_admin) logAct(u, r.payload.is_admin ? 'make_admin' : 'remove_admin', { username: row.username });
        if (r.table === 'players' && r.payload.active === false && row.active) logAct(u, 'remove_player', { name: row.name });
        if (r.table === 'schedule') logAct(u, 'edit_schedule', r.payload);
        Object.assign(row, r.payload);
      }
      emit(); return { data: [] };
    }
    case 'delete': {
      const hit = T.filter(match);
      for (const row of hit) {
        if (r.table === 'days' && !isAdmin(u)) continue;
        if (r.table === 'receipts' && !isAdmin(u) && row.created_by !== u) continue;
        if (r.table === 'matches' && !isAdmin(u)) {
          const last = Math.max(...st.matches.filter(m => m.day_id === row.day_id).map(m => m.n));
          if (row.n !== last || st.days.find(d => d.id === row.day_id).closed) continue;
        }
        if (r.table === 'rsvps' && !isAdmin(u) && st.players.find(p => p.id === row.player_id).user_id !== u) continue; // members only clear their own
        if (r.table === 'play_dates') { if (!isAdmin(u) && !(row.kind === 'extra' && row.created_by === u)) continue; logAct(u, 'clear_play_date', { date: row.day }); }
        if (r.table === 'days') logAct(u, 'delete_day', { date: row.date, matches: st.matches.filter(x => x.day_id === row.id).length });
        if (r.table === 'matches' && st.days.some(d => d.id === row.day_id)) logAct(u, 'delete_match', { date: st.days.find(d => d.id === row.day_id).date, n: row.n });
        T.splice(T.indexOf(row), 1);
        if (r.table === 'days') st.matches = st.matches.filter(m => m.day_id !== row.id);
      }
      emit(); return { data: [] };
    }
  }
}
function auth(op, a) {
  if (op === 'up') {
    if (st.users[a.email]) return err('User already registered');
    const id = 'u' + (Object.keys(st.users).length + 1);
    st.users[a.email] = { id, password: a.password };
    st.profiles.push({ id, username: a.options.data.username, is_admin: st.profiles.length === 0, lang: a.options.data.lang || 'en', share_stats: true });
    const claim = st.players.find(p => String(p.id) === a.options.data.player_id && !p.user_id);
    if (claim) claim.user_id = id; else st.players.push({ id: ++st.seq.p, name: a.options.data.username, avatar: null, active: true, user_id: id });
    emit(); return { data: { session: { user: { id } } } };
  }
  if (op === 'reset' && st.rateLimit) return err('email rate limit exceeded', 'over_email_send_rate_limit');
  if (op === 'reset') { st.resets = (st.resets || []).concat(a.email); return { data: {} }; }
  if (op === 'update') { const e = Object.keys(st.users).find(k => st.users[k].id === a.uid); st.users[e].password = a.password; return { data: {} }; }
  const u = st.users[a.email];
  return !u || u.password !== a.password ? err('Invalid login credentials') : { data: { session: { user: { id: u.id } } } };
}

module.exports = { st, pages, rpc, auth, emit };
