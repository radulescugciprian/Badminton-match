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

// a player card as a 1080×1512 picture in the style of football trading cards: foil in the loyalty colour (glitter),
// the photo on a striped panel, a tilted ribbon with the name and the title word, coloured stat boxes
async function drawPlayerCard({ id, tier, rating, ratingLabel, name, titleEmoji, titleWord, titleLine, stats, badges, footer, group, hue, initial, img }) {
  const W = 1080, H = 1512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), font = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  const text = (s, x, y, size, weight = 800, color = '#fff', align = 'center', stroke = 0, sc = '#3b0a0a') => {
    g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.lineJoin = 'round';
    if (stroke) { g.lineWidth = stroke; g.strokeStyle = sc; g.strokeText(s, x, y); } g.fillStyle = color; g.fillText(s, x, y); };
  const fit = (s, max, size, weight = 800) => { g.font = `${weight} ${size}px ${font}`; while (size > 18 && g.measureText(s).width > max) { size -= 2; g.font = `${weight} ${size}px ${font}`; } return size; };
  const box = (x, y, w, h, r, fill) => { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  // foil: a metallic gradient plus glitter that is the same every time for the same player
  const foil = { gold: ['#fff1a8', '#d4a83a', '#f7dc7c', '#b8861f'], silver: ['#ffffff', '#aab4c0', '#e8edf2', '#8792a0'], bronze: ['#ffd2a6', '#b86a2c', '#e8a066', '#8a4a1c'] }[tier];
  const fg = g.createLinearGradient(0, 0, W, H); foil.forEach((col, i) => fg.addColorStop(i / 3, col));
  g.fillStyle = fg; g.beginPath(); g.roundRect(0, 0, W, H, 60); g.fill();
  let seed = id * 9301 + 49297; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${(rnd() * .5).toFixed(2)})`; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 2 + rnd() * 3); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(80,50,0,${(rnd() * .18).toFixed(2)})`; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
  // the art panel: the player's colour with diagonal stripes, a white frame
  const P = { x: 150, y: 70, w: 860, h: 880 };
  g.save(); g.beginPath(); g.roundRect(P.x, P.y, P.w, P.h, 34); g.clip();
  const pg = g.createLinearGradient(P.x, P.y, P.x + P.w, P.y + P.h); pg.addColorStop(0, `hsl(${hue} 55% 42%)`); pg.addColorStop(1, `hsl(${hue} 60% 22%)`);
  g.fillStyle = pg; g.fillRect(P.x, P.y, P.w, P.h);
  g.fillStyle = 'rgba(255,255,255,.16)'; for (let k = -P.h; k < P.w; k += 90) { g.beginPath(); g.moveTo(P.x + k, P.y + P.h); g.lineTo(P.x + k + 40, P.y + P.h); g.lineTo(P.x + k + 40 + P.h * .7, P.y); g.lineTo(P.x + k + P.h * .7, P.y); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(P.x + P.w - 260, P.y); g.lineTo(P.x + P.w, P.y); g.lineTo(P.x + P.w, P.y + 330); g.fill();   // a light corner, like the flag corner
  // the photo, big
  const cx = P.x + P.w / 2, cy = P.y + 420, r = 300;
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  if (img) { const k = Math.max(2 * r / img.width, 2 * r / img.height); g.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); }
  else { g.fillStyle = `hsl(${hue} 45% 30%)`; g.fillRect(cx - r, cy - r, 2 * r, 2 * r); text(initial, cx, cy + r * .36, r * 1.05, 900); }
  g.restore(); g.lineWidth = 16; g.strokeStyle = '#fff'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.restore();
  g.lineWidth = 10; g.strokeStyle = '#fffbea'; g.beginPath(); g.roundRect(P.x, P.y, P.w, P.h, 34); g.stroke();
  // top left: the group badge, then the badges in a column
  box(46, 70, 86, 120, 16, '#fff'); text('🏸', 89, 128, 46, 400); text(group, 89, 172, fit(group, 76, 28), 900, '#1e293b');
  (badges || '').split(' ').filter(Boolean).slice(0, 7).forEach((e, i) => { box(54, 216 + i * 84, 70, 70, 14, 'rgba(255,255,255,.85)'); text(e, 89, 266 + i * 84, 40, 400); });
  // the ribbon: the name on a small band, the title word big
  g.save(); g.translate(W / 2 + 20, 960); g.rotate(-0.1);
  box(-430, -150, 640, 84, 10, '#7f1d1d'); text(name.toUpperCase(), -110, -92, fit(name.toUpperCase(), 600, 58), 900, '#fff');
  const rib = g.createLinearGradient(0, -70, 0, 110); rib.addColorStop(0, '#dc2626'); rib.addColorStop(1, '#7f1d1d');
  box(-480, -72, 960, 180, 14, rib); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-480, -72, 960, 22);
  text(titleWord.toUpperCase(), 0, 72, fit(titleWord.toUpperCase(), 880, 150, 900), 900, '#fff1d6', 'center', 14, '#3b0a0a');
  g.restore();
  text(`${titleEmoji} ${titleLine}`, W / 2, 1150, fit(`${titleEmoji} ${titleLine}`, W - 160, 40, 700), 700, '#3b2400');
  // the stat boxes: two rows, coloured like the cards, with the rating in a purple shield in the middle
  const tile = (x, y, w, h, fill, v, l, vc = '#fff', lc = 'rgba(255,255,255,.9)') => { box(x, y, w, h, 18, fill); g.lineWidth = 5; g.strokeStyle = '#fff'; g.beginPath(); g.roundRect(x, y, w, h, 18); g.stroke();
    text(v, x + w / 2, y + h * .58, fit(v, w - 24, h * .5), 900, vc); text(l.toUpperCase(), x + w / 2, y + h - 14, fit(l.toUpperCase(), w - 20, 24, 800), 800, lc); };
  const [m, wr, br, dc, fp, nt] = stats.map(([v]) => v), L = stats.map(([, l]) => l);
  tile(70, 1190, 290, 150, '#dc2626', wr, L[1]); tile(720, 1190, 290, 150, '#16a34a', br, L[2]);
  const sh = g.createLinearGradient(0, 1170, 0, 1370); sh.addColorStop(0, '#a855f7'); sh.addColorStop(1, '#6b21a8');
  g.fillStyle = sh; g.beginPath(); g.moveTo(400, 1170); g.lineTo(680, 1170); g.lineTo(680, 1310); g.lineTo(540, 1370); g.lineTo(400, 1310); g.closePath(); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
  text(rating, 540, 1262, fit(rating, 250, rating.length > 2 ? 84 : 76), 900, '#fde047'); text(ratingLabel.toUpperCase(), 540, 1305, fit(ratingLabel.toUpperCase(), 250, 26), 800);
  tile(70, 1352, 290, 120, '#2563eb', m, L[0]); tile(720, 1352, 290, 120, '#f8fafc', nt, L[5], '#0f172a', '#334155');
  text(`🧊 ${dc} ${L[3]}`, 540, 1405, fit(`🧊 ${dc} ${L[3]}`, 300, 30, 800), 800, '#3b2400');
  text(`🤝 ${fp}`, 540, 1445, fit(`🤝 ${fp}`, 300, 30, 800), 800, '#3b2400');
  text(footer.toUpperCase(), W / 2, 1497, fit(footer.toUpperCase(), W - 200, 22, 700), 700, 'rgba(59,36,0,.75)');
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
