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
// confetti is left out when the phone asks for less motion; the sound stays (it has its own switch)
function celebrate() { if (fxOn()) { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) confetti(); fanfare(); } }

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

// a player card as a 1080×1512 picture, in a clean "champions series" style: a light card with a navy frame, the edition on a
// pill, the title big, a round badge, the photo in front of a light stadium drawing, a stats box, the rating on a shield and the
// name on a pill; gold, silver or bronze (loyalty) only colours the accents
async function drawPlayerCard({ tier, edition, rating, ratingLabel, name, titleEmoji, titleWord, titleLine, stats, partner, season, group, hue, initial, img }) {
  await loadCardFont();
  const W = 1080, H = 1512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), sans = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif', disp = `"Bebas Neue", "Arial Narrow", ${sans}`;
  const NAVY = '#1e2a46', PAPER = '#f6f5f1', GREY = '#c9cdd4', TEAL = '#1f5a55', ACC = { gold: '#c9a227', silver: '#9aa3ae', bronze: '#b8743a' }[tier];
  const fit = (t, max, size, f = disp, w = 400) => { g.font = `${w} ${size}px ${f}`; while (size > 14 && g.measureText(t).width > max) { size -= 2; g.font = `${w} ${size}px ${f}`; } return size; };
  const say = (t, x, y, size, fill, { f = disp, w = 400, align = 'center', sp = '0px' } = {}) => { g.font = `${w} ${size}px ${f}`; g.textAlign = align; g.letterSpacing = sp; g.fillStyle = fill; g.fillText(t, x, y); g.letterSpacing = '0px'; };
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  // card, a thin holographic edge, the navy frame with an accent line inside
  g.fillStyle = PAPER; rr(0, 0, W, H, 64); g.fill();
  const holo = g.createLinearGradient(0, 0, W, H); ['#f5c2dc', '#bfe8f7', '#d4f5c9', '#f7ecb8', '#dccdf7'].forEach((col, i, a) => holo.addColorStop(i / (a.length - 1), col));
  g.lineWidth = 12; g.strokeStyle = holo; rr(6, 6, W - 12, H - 12, 60); g.stroke();
  g.lineWidth = 8; g.strokeStyle = NAVY; rr(48, 52, W - 96, H - 104, 42); g.stroke();
  g.lineWidth = 3; g.strokeStyle = ACC; rr(62, 66, W - 124, H - 132, 32); g.stroke();
  // the light stadium and court behind the photo
  g.save(); rr(66, 400, W - 132, 800, 0); g.clip();
  g.fillStyle = '#e7e9ec'; g.fillRect(66, 430, W - 132, 230);
  g.strokeStyle = '#d5d8dd'; g.lineWidth = 4; for (let y = 460; y < 660; y += 30) { g.beginPath(); g.moveTo(66, y); g.lineTo(W - 66, y); g.stroke(); }
  g.fillStyle = '#d9dce1'; [[70, 300], [W - 370, 300]].forEach(([x, w]) => { g.beginPath(); g.moveTo(x, 430); g.lineTo(x + w, 430); g.lineTo(x + w - 40, 400); g.lineTo(x + 40, 400); g.fill(); });
  g.fillStyle = '#e1e4e8'; g.beginPath(); g.moveTo(120, 1200); g.lineTo(W - 120, 1200); g.lineTo(W - 260, 660); g.lineTo(260, 660); g.closePath(); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.beginPath(); g.moveTo(170, 1200); g.lineTo(300, 660); g.moveTo(W - 170, 1200); g.lineTo(W - 300, 660); g.moveTo(205, 1050); g.lineTo(W - 205, 1050); g.moveTo(260, 820); g.lineTo(W - 260, 820); g.moveTo(540, 660); g.lineTo(540, 1200); g.stroke();
  g.strokeStyle = '#9aa1ab'; g.lineWidth = 5; g.setLineDash([16, 10]); g.beginPath(); g.moveTo(232, 930); g.lineTo(W - 232, 930); g.stroke(); g.setLineDash([]);
  g.restore();
  // the photo: a white-rimmed circle with a soft shadow on the court
  const cx = 540, cy = 690, R = 255;
  g.fillStyle = 'rgba(30,42,70,.16)'; g.beginPath(); g.ellipse(cx, 978, 210, 24, 0, 0, 6.3); g.fill();
  g.save(); g.shadowColor = 'rgba(30,42,70,.35)'; g.shadowBlur = 40; g.shadowOffsetY = 14; g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, R + 14, 0, 6.3); g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.clip();
  if (img) { const k = Math.max(2 * R / img.width, 2 * R / img.height); g.imageSmoothingQuality = 'high'; g.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); }
  else { g.fillStyle = `hsl(${hue} 35% 86%)`; g.fillRect(cx - R, cy - R, 2 * R, 2 * R); say(initial, cx, cy + R * .4, R * 1.15, NAVY); }
  g.restore(); g.lineWidth = 6; g.strokeStyle = ACC; g.beginPath(); g.arc(cx, cy, R + 14, 0, 6.3); g.stroke();
  // top: the edition pill, the title, the round badge
  g.fillStyle = NAVY; rr(W / 2 - 300, 30, 600, 74, 37); g.fill(); g.lineWidth = 4; g.strokeStyle = ACC; g.stroke();
  say(edition.toUpperCase(), W / 2, 86, fit(edition.toUpperCase(), 520, 54), '#ffffff', { sp: '4px' });
  say(titleWord.toUpperCase(), 112, 268, fit(titleWord.toUpperCase(), 640, 150), NAVY, { align: 'left' });
  say(titleLine, 114, 318, fit(titleLine, 640, 36, sans, 600), '#5b6475', { f: sans, w: 600, align: 'left' });
  if (partner) say(partner, 114, 366, fit(partner, 640, 32, sans, 600), NAVY, { f: sans, w: 600, align: 'left' });
  g.fillStyle = PAPER; g.beginPath(); g.arc(900, 226, 96, 0, 6.3); g.fill(); g.lineWidth = 6; g.strokeStyle = NAVY; g.stroke();
  g.lineWidth = 3; g.strokeStyle = ACC; g.beginPath(); g.arc(900, 226, 82, 0, 6.3); g.stroke();
  say(titleEmoji, 900, 228, 60, '#000', { f: sans }); say(group, 900, 284, fit(group, 110, 34), NAVY, { sp: '2px' });
  // bottom: the stats box (left), the rating shield (right)
  g.fillStyle = '#ffffff'; rr(92, 1000, 340, 300, 28); g.fill(); g.lineWidth = 3; g.strokeStyle = GREY; g.stroke();
  stats.slice(0, 5).forEach(([v, l], i) => { const y = 1056 + i * 55; say(l.toUpperCase(), 122, y, fit(l.toUpperCase(), 190, 40), '#6b7383', { align: 'left', sp: '1px' }); say(v, 404, y, fit(v, 120, 46), NAVY, { align: 'right' }); });
  const sx = 752, sy = 1000, sw = 236, sh = 300;
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + sw, sy); g.lineTo(sx + sw, sy + sh * .66); g.quadraticCurveTo(sx + sw, sy + sh * .9, sx + sw / 2, sy + sh); g.quadraticCurveTo(sx, sy + sh * .9, sx, sy + sh * .66); g.closePath();
  g.fillStyle = TEAL; g.fill(); g.lineWidth = 8; g.strokeStyle = ACC; g.stroke();
  say(rating, sx + sw / 2, sy + 168, rating === '🙈' ? 110 : fit(rating, sw - 30, rating.length > 3 ? 120 : 150), '#ffffff', { f: rating === '🙈' ? sans : disp });
  say(ratingLabel.toUpperCase(), sx + sw / 2, sy + 222, fit(ratingLabel.toUpperCase(), sw - 50, 32), '#d7efe9', { sp: '2px' });
  // the name pill, the season, a small shuttle mark
  g.fillStyle = NAVY; rr(W / 2 - 290, 1338, 580, 100, 50); g.fill(); g.lineWidth = 6; g.strokeStyle = ACC; g.stroke();
  say(name.toUpperCase(), W / 2, 1414, fit(name.toUpperCase(), 500, 84), ACC === '#9aa3ae' ? '#e5e9ee' : ACC, { sp: '3px' });
  say(season[0].toUpperCase(), 100, 1388, fit(season[0].toUpperCase(), 130, 28, sans, 800), NAVY, { f: sans, w: 800, align: 'left' });
  say(season[1], 100, 1420, fit(season[1], 130, 28, sans, 800), NAVY, { f: sans, w: 800, align: 'left' });
  g.lineWidth = 3; g.strokeStyle = GREY; g.beginPath(); g.arc(W - 128, 1388, 36, 0, 6.3); g.stroke(); say('🏸', W - 128, 1402, 38, '#000', { f: sans });
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
