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
