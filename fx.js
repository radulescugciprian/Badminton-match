// Browser-only fun stuff: confetti + sound, the shareable result card, and the weekly calendar reminder.

// ---- confetti and a short fanfare (WebAudio, no sound files). Can be switched off in Profile.
const fxOn = () => { try { return localStorage.getItem('fx') !== 'off'; } catch { return true; } };
const setFx = on => { try { localStorage.setItem('fx', on ? 'on' : 'off'); } catch {} };
let audioCtx;
function primeAudio() { // must run inside the tap handler, browsers refuse to start audio otherwise
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch {}
}
function fanfare() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [[660, 0], [880, .11], [1320, .22]].forEach(([f, d]) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(.14, t + d); g.gain.exponentialRampToValueAtTime(.001, t + d + .2);
    o.connect(g).connect(audioCtx.destination); o.start(t + d); o.stop(t + d + .22);
  });
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'), g = c.getContext('2d'), W = c.width = innerWidth, H = c.height = innerHeight;
  c.className = 'confetti'; c.setAttribute('aria-hidden', 'true'); document.body.append(c);
  const colors = ['#bef264', '#facc15', '#3b82f6', '#f97316', '#f472b6', '#fff'];
  const bits = Array.from({ length: 90 }, () => ({ x: W / 2, y: H * .62, vx: (Math.random() - .5) * 16, vy: -Math.random() * 16 - 6,
    s: 6 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[Math.random() * colors.length | 0] }));
  const t0 = performance.now();
  (function frame(t) {
    g.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += .45; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vx *= .99;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.s / 2, -b.s / 3, b.s, b.s * .6); g.restore();
    }
    t - t0 < 1700 ? requestAnimationFrame(frame) : c.remove();
  })(t0);
}
function celebrate() { if (fxOn()) { confetti(); fanfare(); } }

// ---- result card: group photo (or a plain background) with the night's podium on top, as a PNG
// texts are prepared (and translated) by the caller; rows: top 3 [{name, line, img: ImageBitmap|null, hue, initial}], potn: same, with `line` = text under the name
async function drawCard({ title, subtitle, rows, potn, potnTitle, footer, bg }) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), font = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  const text = (s, x, y, size, weight = 700, color = '#fff', align = 'center') => { g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); };
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#13213d'); grad.addColorStop(1, '#0b1220');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  if (bg) { const k = Math.max(W / bg.width, H / bg.height); g.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k); }
  const shade = g.createLinearGradient(0, 0, 0, H); shade.addColorStop(0, 'rgba(7,12,24,.6)'); shade.addColorStop(.45, 'rgba(7,12,24,.45)'); shade.addColorStop(1, 'rgba(7,12,24,.88)');
  g.fillStyle = shade; g.fillRect(0, 0, W, H);

  text('🏸 ' + title, W / 2, 140, 76);
  text(subtitle, W / 2, 205, 38, 500, 'rgba(255,255,255,.8)');

  const avatar = (p, cx, cy, r) => {
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    if (p.img) { const k = Math.max(2 * r / p.img.width, 2 * r / p.img.height); g.drawImage(p.img, cx - p.img.width * k / 2, cy - p.img.height * k / 2, p.img.width * k, p.img.height * k); }
    else { g.fillStyle = `hsl(${p.hue} 50% 36%)`; g.fillRect(cx - r, cy - r, 2 * r, 2 * r); text(p.initial, cx, cy + r * .35, r * 1.1, 800); }
    g.restore(); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  };
  const base = 1010, spec = [{ x: W / 2, h: 300, col: '#facc15', medal: '🥇' }, { x: W / 2 - 320, h: 220, col: '#cbd5e1', medal: '🥈' }, { x: W / 2 + 320, h: 160, col: '#d97706', medal: '🥉' }];
  rows.slice(0, 3).forEach((p, i) => {
    const s = spec[i], top = base - s.h;
    g.fillStyle = s.col; g.beginPath(); g.roundRect(s.x - 140, top, 280, s.h, [20, 20, 0, 0]); g.fill();
    text(String(i + 1), s.x, top + s.h / 2 + 30, 90, 800, '#0b1220');
    text(p.line, s.x, top - 18, 34, 500, 'rgba(255,255,255,.85)');
    text(p.name, s.x, top - 62, 46);
    avatar(p, s.x, top - 62 - 52 - 80, 80);
    text(s.medal, s.x, top - 62 - 52 - 80 - 100, 64);
  });
  if (potn) {
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.roundRect(120, 1080, W - 240, 150, 30); g.fill();
    avatar(potn, 210, 1155, 52);
    text('⭐ ' + potnTitle, 290, 1135, 34, 500, 'rgba(255,255,255,.8)', 'left');
    text(potn.line, 290, 1190, 48, 800, '#fff', 'left');
  }
  text(footer, W / 2, 1300, 32, 500, 'rgba(255,255,255,.6)');
  return new Promise(res => c.toBlob(res, 'image/png'));
}

// the bold sports lettering for the cards (Bebas Neue, OFL licence, in fonts/); falls back to the system font if it cannot load
let cardFont = null;
const loadCardFont = () => cardFont || (cardFont = Promise.all([
  new FontFace('Bebas Neue', 'url(fonts/bebas-neue-latin.woff2)', { unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212' }),
  new FontFace('Bebas Neue', 'url(fonts/bebas-neue-latin-ext.woff2)', { unicodeRange: 'U+0100-02AF,U+1E00-1E9F,U+1EF2-1EFF,U+2C60-2C7F,U+A720-A7FF' }),
].map(f => f.load().then(x => document.fonts.add(x)))).catch(() => {}));

// a player card as a 1080×1512 picture, "edition" style: holographic border, black and metal, a burst of light behind the
// photo, the title on a plaque, the stats on a shield, a big metallic rating and the name in the bottom bar
async function drawPlayerCard({ id, tier, edition, rating, ratingLabel, name, titleEmoji, titleWord, titleLine, stats, partner, badges, footer, season, group, hue, initial, img }) {
  await loadCardFont();
  const W = 1080, H = 1512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), sans = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif', disp = `"Bebas Neue", "Arial Narrow", ${sans}`;
  const M = { gold: ['#fff7cc', '#f3cf63', '#b07a12', '#ffe9a3', '#8a5a10'], silver: ['#ffffff', '#dfe5ec', '#8b96a5', '#f1f5f9', '#5b6573'], bronze: ['#ffe2c4', '#e39a5a', '#8a4a1c', '#f7c79b', '#5e300f'] }[tier];
  const metal = (y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); M.forEach((col, i) => gr.addColorStop(i / (M.length - 1), col)); return gr; };
  const fit = (t, max, size, f = disp, w = 400) => { g.font = `${w} ${size}px ${f}`; while (size > 14 && g.measureText(t).width > max) { size -= 2; g.font = `${w} ${size}px ${f}`; } return size; };
  const say = (t, x, y, size, fill, { f = disp, w = 400, align = 'center', stroke = 0, sc = '#000', glow = 0 } = {}) => {
    g.font = `${w} ${size}px ${f}`; g.textAlign = align; g.lineJoin = 'round';
    if (glow) { g.shadowColor = M[1]; g.shadowBlur = glow; } if (stroke) { g.lineWidth = stroke; g.strokeStyle = sc; g.strokeText(t, x, y); }
    g.fillStyle = fill; g.fillText(t, x, y); g.shadowBlur = 0; };
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  let seed = id * 7919 + 13; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // 1) holographic border and the black card inside it
  const holo = g.createLinearGradient(0, 0, W, H); ['#ffd1e8', '#c7f0ff', '#d9ffd1', '#fff5c2', '#e3d4ff', '#c7f0ff', '#ffd1e8'].forEach((col, i, a) => holo.addColorStop(i / (a.length - 1), col));
  g.fillStyle = holo; rr(0, 0, W, H, 56); g.fill();
  const sheen = g.createLinearGradient(0, 0, W, 0); sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(.5, 'rgba(255,255,255,.55)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; rr(0, 0, W, H, 56); g.fill();
  const IN = { x: 34, y: 34, w: W - 68, h: H - 68 };
  g.save(); rr(IN.x, IN.y, IN.w, IN.h, 30); g.clip();
  g.fillStyle = '#0b0b0e'; g.fillRect(IN.x, IN.y, IN.w, IN.h);
  // 2) a burst of light: rays, shards and sparkles behind the photo, two stadium lights
  const cx = W / 2, cy = 640;
  for (let k = 0; k < 28; k++) { const a0 = k / 28 * Math.PI * 2, a1 = a0 + Math.PI / 28; g.fillStyle = k % 2 ? 'rgba(255,255,255,.035)' : `rgba(${tier === 'silver' ? '200,210,225' : '240,190,80'},.10)`;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * 1400, cy + Math.sin(a0) * 1400); g.lineTo(cx + Math.cos(a1) * 1400, cy + Math.sin(a1) * 1400); g.fill(); }
  for (let k = 0; k < 26; k++) { const x = IN.x + rnd() * IN.w, y = 200 + rnd() * 820, s = 40 + rnd() * 130, a = rnd() * 6.28;
    g.fillStyle = [M[1], M[3], '#3a3a44', '#d9d9e0', M[2]][k % 5] + (k % 5 === 2 ? '' : '');
    g.globalAlpha = .25 + rnd() * .5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); g.lineTo(x + Math.cos(a + 2.2) * s * .7, y + Math.sin(a + 2.2) * s * .7); g.fill(); }
  g.globalAlpha = 1;
  const light = x => { g.fillStyle = '#18181d'; rr(x, 300, 120, 80, 8); g.fill(); g.fillStyle = '#fff8d6'; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(x + 25 + i * 35, 322 + j * 36, 11, 0, 6.3); g.fill(); }
    g.fillStyle = '#18181d'; g.fillRect(x + 54, 380, 12, 90); };
  light(80); light(W - 200);
  for (let k = 0; k < 420; k++) { const x = IN.x + rnd() * IN.w, y = 180 + rnd() * 900, r = rnd() * 3.2; g.fillStyle = `rgba(255,${200 + rnd() * 55 | 0},${90 + rnd() * 120 | 0},${(.3 + rnd() * .7).toFixed(2)})`; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
  // 3) the photo with a glowing metal ring
  const halo = g.createRadialGradient(cx, cy, 200, cx, cy, 420); halo.addColorStop(0, M[1] + 'aa'); halo.addColorStop(1, M[1] + '00');
  g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, 420, 0, 6.3); g.fill();
  const R = 270; g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.clip();
  if (img) { const k = Math.max(2 * R / img.width, 2 * R / img.height); g.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); }
  else { g.fillStyle = `hsl(${hue} 40% 26%)`; g.fillRect(cx - R, cy - R, 2 * R, 2 * R); say(initial, cx, cy + R * .42, R * 1.25, metal(cy - R, cy + R)); }
  g.restore(); g.lineWidth = 18; g.strokeStyle = metal(cy - R, cy + R); g.beginPath(); g.arc(cx, cy, R + 4, 0, 6.3); g.stroke();
  // 4) header: the edition in metal letters, the title on a plaque, the title shield in the corner
  g.fillStyle = '#050506'; g.fillRect(IN.x, IN.y, IN.w, 150); g.fillStyle = metal(150, 184); g.fillRect(IN.x, IN.y + 150, IN.w, 4);
  say(edition.toUpperCase(), cx, 150, fit(edition.toUpperCase(), 820, 132), metal(50, 150), { stroke: 8, sc: '#2a1a00', glow: 18 });
  const plq = g.createLinearGradient(0, 196, 0, 276); plq.addColorStop(0, '#f2f4f7'); plq.addColorStop(.5, '#aeb6c2'); plq.addColorStop(1, '#e5e9ef');
  g.fillStyle = '#050506'; rr(170, 190, 740, 92, 10); g.fill(); g.fillStyle = plq; rr(178, 198, 724, 76, 8); g.fill();
  say(titleWord.toUpperCase(), cx, 262, fit(titleWord.toUpperCase(), 680, 80), '#15151a');
  const shield = (x, y, w, h, fill, line) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * .62); g.quadraticCurveTo(x + w, y + h * .86, x + w / 2, y + h); g.quadraticCurveTo(x, y + h * .86, x, y + h * .62); g.closePath();
    g.fillStyle = fill; g.fill(); g.lineWidth = line; g.strokeStyle = '#050506'; g.stroke(); };
  shield(880, 300, 150, 176, metal(300, 476), 6); say(titleEmoji, 955, 380, 58, '#000', { f: sans }); say(titleWord.toUpperCase(), 955, 440, fit(titleWord.toUpperCase(), 124, 40), '#2a1a00');
  // 5) the stats shield (left) and the big rating (right)
  const SY = 940; shield(60, SY, 390, 380, (() => { const gr = g.createLinearGradient(0, SY, 0, SY + 420); gr.addColorStop(0, '#f8fafc'); gr.addColorStop(.5, '#9aa4b2'); gr.addColorStop(1, '#dfe4ea'); return gr; })(), 8);
  g.fillStyle = 'rgba(5,5,6,.82)'; g.beginPath(); g.moveTo(80, SY + 20); g.lineTo(430, SY + 20); g.lineTo(430, SY + 236); g.quadraticCurveTo(430, SY + 318, 255, SY + 356); g.quadraticCurveTo(80, SY + 318, 80, SY + 236); g.closePath(); g.fill();
  stats.slice(0, 5).forEach(([v, l], i) => { const y = SY + 74 + i * 56; say(l.toUpperCase(), 104, y, fit(l.toUpperCase(), 190, 44), '#e6e9ee', { align: 'left' }); say(v, 412, y, fit(v, 150, 50), metal(y - 45, y), { align: 'right' }); });
  say(rating, 800, 1240, rating === '🙈' ? 150 : fit(rating, 400, rating.length > 3 ? 220 : 260), metal(1050, 1250), { f: rating === '🙈' ? sans : disp, stroke: rating === '🙈' ? 0 : 10, sc: '#2a1a00', glow: 30 });
  say(ratingLabel.toUpperCase(), 800, 1292, fit(ratingLabel.toUpperCase(), 360, 46), M[1]);
  if (partner) say(partner, 800, 975, fit(partner, 400, 38, sans, 700), '#f1f5f9', { f: sans, w: 700 });
  if (badges) say(badges, 800, 1030, fit(badges, 420, 46, sans), '#fff', { f: sans });
  // 6) bottom bar: the name in metal letters, a small shield with the group, the season in a star
  const BY = H - 34 - 140; g.fillStyle = '#050506'; g.fillRect(IN.x, BY, IN.w, 140); g.fillStyle = metal(BY - 4, BY); g.fillRect(IN.x, BY - 4, IN.w, 4);
  say(name.toUpperCase(), cx, BY + 108, fit(name.toUpperCase(), 640, 118), metal(BY + 20, BY + 110), { stroke: 6, sc: '#2a1a00', glow: 12 });
  shield(70, BY + 20, 86, 104, metal(BY + 20, BY + 124), 4); say(group, 113, BY + 82, fit(group, 70, 34), '#2a1a00');
  const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .48 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fillStyle = metal(y - r, y + r); g.fill(); g.lineWidth = 4; g.strokeStyle = '#2a1a00'; g.stroke(); };
  star(W - 120, BY + 70, 64); say(season[0], W - 120, BY + 70, fit(season[0], 60, 22), '#2a1a00'); say(season[1], W - 120, BY + 94, fit(season[1], 54, 22), '#2a1a00');
  g.restore();
  return new Promise(res => c.toBlob(res, 'image/png'));
}

function saveFile(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---- weekly calendar reminder (.ics): the phone's calendar notifies when starting opens, no server needed
// summary/description are translated by the caller
function calendarFile(s, firstDate, url, summary, description) {
  const [h, m] = s.play_time.split(':').map(Number), open = h * 60 + m - s.opens_minutes, pad = n => String(n).padStart(2, '0');
  const at = mins => `${firstDate.replace(/-/g, '')}T${pad(Math.floor(mins / 60) % 24)}${pad(mins % 60)}00`;
  const berlin = `BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin\r\nBEGIN:STANDARD\r\nDTSTART:19701025T030000\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\n`
    + `BEGIN:DAYLIGHT\r\nDTSTART:19700329T020000\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE\r\n`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Badminton//EN', 'CALSCALE:GREGORIAN'];
  const body = [
    'BEGIN:VEVENT', 'UID:badminton-weekly@badminton-match', `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`,
    `DTSTART;TZID=${s.tz}:${at(open)}`, `DTEND;TZID=${s.tz}:${at(h * 60 + m + 120)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][s.dow]}`,
    `SUMMARY:🏸 ${summary}`, `DESCRIPTION:${description}\\n${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${summary}`, 'END:VALARM', 'END:VEVENT'];
  return new Blob([lines.join('\r\n') + '\r\n' + (s.tz === 'Europe/Berlin' ? berlin : '') + body.join('\r\n') + '\r\nEND:VCALENDAR\r\n'], { type: 'text/calendar' });
}
