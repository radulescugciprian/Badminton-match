// Start-up: connect the pieces and draw the first screen (data.js and views.js are already loaded).
sb && sb.auth.onAuthStateChange((ev, s) => {
  if (ev === 'PASSWORD_RECOVERY') { view = 'profile'; render(); } // arrived from the reset-password email
  const was = !!session; session = s; authReady = true; authMode = 'in';
  if (!s && was && ev === 'SIGNED_OUT' && !manualLogout) lostSession = true;      // signed out by expiry, not by the person: say so on the login page
  if (s) { lostSession = false; manualLogout = false; if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } // ask the browser not to wipe our saved sign-in
  if (!!s === was && loaded) return;                 // token refresh etc.
  if (s) {
    refresh().catch(e => { if (session) app.innerHTML = `<h1>${t("Couldn't load")}</h1><p class="msg">${esc(friendly(e))}</p><button class="primary" onclick="location.reload()">${t('Try again')}</button><div class="actions"><button class="link" onclick="logout()">${t('Log out')}</button></div>`; });
    channel = sb.channel('all').on('postgres_changes', { event: '*', schema: 'public' }, later).subscribe();
  } else {
    if (channel) sb.removeChannel(channel);
    loaded = false; me = {}; db = { players: [], days: [] }; view = 'play'; asMember = false; render();
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && session) later(); }); // phones drop sockets in the background
setInterval(() => { if (session && loaded && view === 'play' && !cur().started) render(); }, 30000); // so the button unlocks by itself

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
