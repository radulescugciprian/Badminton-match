// In-page stand-in for supabase-js: forwards every call to the shared fake server living in the Node test process.
(() => {
  let cb = null, sess = null, emitCb = null;
  const load = () => { try { return JSON.parse(localStorage.getItem('mock-session')); } catch { return null; } };
  window.__recover = () => cb('PASSWORD_RECOVERY', sess);
  window.__emit = () => emitCb && emitCb();
  class Q {
    constructor(table) { this.r = { table, op: 'select', f: [], order: null, sel: '*', payload: null, single: false }; }
    select(s = '*') { this.r.sel = s; return this; }
    upsert(p) { this.r.op = 'upsert'; this.r.payload = p; return this; }
    insert(p) { this.r.op = 'insert'; this.r.payload = p; return this; }
    update(p) { this.r.op = 'update'; this.r.payload = p; return this; }
    delete() { this.r.op = 'delete'; return this; }
    eq(c, v) { this.r.f.push(['eq', c, v]); return this; }
    gt(c, v) { this.r.f.push(['gt', c, v]); return this; }
    gte(c, v) { this.r.f.push(['gte', c, v]); return this; }
    order(c, o) { this.r.order = c; this.r.desc = !!o && o.ascending === false; return this; }
    limit(n) { this.r.limit = n; return this; }
    single() { this.r.single = true; return this; }
    then(ok, bad) { return window.__rpc(sess && sess.user.id, this.r).then(ok, bad); }
  }
  window.supabase = { createClient: () => ({
    from: t => new Q(t),
    rpc: (name, args) => window.__rpc(sess && sess.user.id, { op: 'rpc', name, args }),
    storage: { from: () => ({
      upload: (path, blob, o) => blob.arrayBuffer().then(b => window.__rpc(sess && sess.user.id, { op: 'upload', path, data: Array.from(new Uint8Array(b)) })),
      createSignedUrl: async (path) => ({ data: { signedUrl: 'http://localhost:8766/' + path } }),
      remove: paths => window.__rpc(sess && sess.user.id, { op: 'remove', paths }),
      createSignedUrls: paths => window.__rpc(sess && sess.user.id, { op: 'sign', paths }),
    }) },
    channel: () => { const c = { on: (_a, _b, f) => { emitCb = f; return c; }, subscribe: () => c }; return c; },
    removeChannel: () => { emitCb = null; },
    auth: {
      onAuthStateChange: f => { cb = f; sess = load(); setTimeout(() => cb('INITIAL_SESSION', sess), 0); },
      signInWithPassword: async a => { const r = await window.__auth('in', a); if (r.error) return r; sess = r.data.session; localStorage.setItem('mock-session', JSON.stringify(sess)); cb('SIGNED_IN', sess); return r; },
      signUp: async a => { const r = await window.__auth('up', a); if (r.error) return r; sess = r.data.session; localStorage.setItem('mock-session', JSON.stringify(sess)); cb('SIGNED_IN', sess); return r; },
      resetPasswordForEmail: (email, o) => window.__auth('reset', { email, o }),
      updateUser: a => window.__auth('update', { ...a, uid: sess && sess.user.id }),
      signOut: async () => { sess = null; localStorage.removeItem('mock-session'); cb('SIGNED_OUT', null); },
    },
  }) };
})();
