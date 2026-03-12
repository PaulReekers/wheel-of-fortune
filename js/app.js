'use strict';

/* ── THEME ────────────────────────────────────────────────────────────────────
   All colours and the font are defined as CSS custom properties in style.css.
   loadTheme() reads them once at startup so the canvas can use them.
   To change the look of the wheel, edit the :root block in style.css only.
────────────────────────────────────────────────────────────────────────────── */
let COLORS = [];   // segment palette, populated by loadTheme()
let THEME  = {};   // canvas style values, populated by loadTheme()

function loadTheme() {
  const v = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Segment colour palette (--wof-c-0 … --wof-c-14)
  COLORS = Array.from({ length: 15 }, (_, i) => v(`--wof-c-${i}`));

  // All other canvas colours + font
  THEME = {
    gold:        v('--wof-gold'),
    dark:        v('--wof-dark'),
    font:        v('--wof-font') || 'Segoe UI, sans-serif',
    nameSize:    parseFloat(v('--wof-name-size')) || 1,
    segStroke:   v('--wof-seg-stroke'),
    ringStroke:  v('--wof-ring-stroke'),
    textColor:   v('--wof-text-color'),
    textShadow:  v('--wof-text-shadow'),
    hubOuter:    v('--wof-hub-outer'),
    hubMid:      v('--wof-hub-mid'),
    hubInner:    v('--wof-hub-inner'),
    ptrStroke:   v('--wof-pointer-stroke'),
    ptrShadow:   v('--wof-pointer-shadow'),
    hintBg:      v('--wof-hint-bg'),
    hintText:    v('--wof-hint-text'),
    emptyFill:   v('--wof-empty-fill'),
    emptyStroke: v('--wof-empty-stroke'),
    emptyText:   v('--wof-empty-text'),
  };
}

/* ── STORAGE KEYS ── */
const STORAGE_KEY         = 'wof_names_v1';
const STORAGE_KEY_REMOVED = 'wof_removed_v1';

/* ── STATE ── */
let names      = [];
let removed    = [];     // past participants (removed from wheel)
let angle      = 0;      // current wheel rotation in radians
let spinning   = false;
let lastWinner = -1;     // index of last winner (for removal)
let idleRaf    = null;   // requestAnimationFrame handle for idle rotation
let hasSpun    = false;  // hides the "Click to spin" hint after first spin

/* ── DOM ── */
const canvas    = document.getElementById('wheel');
const ctx       = canvas.getContext('2d');
const nameInput = document.getElementById('nameInput');
const namesList = document.getElementById('namesList');
const statusMsg = document.getElementById('statusMsg');
const overlay   = document.getElementById('overlay');
const modalName = document.getElementById('modalName');

/* ── INIT ── */
(function init() {
  loadTheme();

  // Restore saved data
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    names = Array.isArray(stored)
      ? stored.filter(n => typeof n === 'string' && n.trim().length > 0)
      : [];
  } catch { names = []; }

  try {
    const storedRemoved = JSON.parse(localStorage.getItem(STORAGE_KEY_REMOVED) || '[]');
    removed = Array.isArray(storedRemoved)
      ? storedRemoved.filter(n => typeof n === 'string' && n.trim().length > 0)
      : [];
  } catch { removed = []; }

  // Event listeners — all wired here, no onclick in HTML
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addName(); });
  document.querySelector('.btn-add')       .addEventListener('click', addName);
  document.getElementById('bulkToggle')    .addEventListener('click', toggleBulk);
  document.querySelector('.btn-bulk-add')  .addEventListener('click', addBulk);
  document.querySelector('.btn-bulk-clear').addEventListener('click', clearBulk);
  document.querySelector('.btn-clear-past').addEventListener('click', clearPast);
  overlay.addEventListener('click', overlayClick);
  document.querySelector('.btn-close')     .addEventListener('click', closeModal);
  document.querySelector('.btn-remove')    .addEventListener('click', removeWinner);
  canvas.addEventListener('click', () => spin());
  window.addEventListener('resize', debounce(resize, 150));

  resize();
  renderList();
  renderRemoved();
  startIdleRotation();
})();

/* ── DATA ── */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

function saveRemoved() {
  localStorage.setItem(STORAGE_KEY_REMOVED, JSON.stringify(removed));
}

function addName() {
  const v = nameInput.value.trim();
  if (!v) { nameInput.focus(); return; }
  names.push(v);
  nameInput.value = '';
  nameInput.focus();
  save();
  renderList();
  drawWheel();
}

/* ── BULK ADD ── */
function toggleBulk() {
  const area   = document.getElementById('bulkArea');
  const toggle = document.getElementById('bulkToggle');
  const open   = area.classList.toggle('open');
  toggle.textContent = open ? '▲ Paste total list' : '▼ Paste total list';
  if (open) document.getElementById('bulkInput').focus();
}

function addBulk() {
  const raw   = document.getElementById('bulkInput').value;
  const added = raw
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 25);

  if (added.length === 0) return;

  names.push(...added);
  save();
  renderList();
  drawWheel();

  // Close bulk area and reset textarea
  document.getElementById('bulkInput').value = '';
  document.getElementById('bulkArea').classList.remove('open');
  document.getElementById('bulkToggle').textContent = '▼ Paste total list';
}

function clearBulk() {
  document.getElementById('bulkInput').value = '';
  document.getElementById('bulkInput').focus();
}

function removeName(i) {
  names.splice(i, 1);
  save();
  renderList();
  drawWheel();
}

/* ── LIST UI ── */
function renderList() {
  namesList.innerHTML = '';
  const tmpl = document.getElementById('tmpl-name-item').content;

  names.forEach((name, i) => {
    const color  = COLORS[i % COLORS.length];
    const frag   = tmpl.cloneNode(true);
    const li     = frag.querySelector('li');
    const dot    = frag.querySelector('.color-dot');
    const label  = frag.querySelector('.name-label');
    const btnDel = frag.querySelector('.btn-del');

    li.style.borderLeftColor = color;
    dot.style.background     = color;
    label.textContent        = name;   // textContent auto-escapes — no manual escaping needed
    label.title              = name;
    btnDel.addEventListener('click', () => removeName(i));

    namesList.appendChild(frag);
  });

  const n = names.length;
  if (n === 0) {
    statusMsg.textContent = 'Add at least 2 names.';
    statusMsg.className   = 'status-msg warn';
  } else if (n === 1) {
    statusMsg.textContent = '1 participant — add at least 1 more.';
    statusMsg.className   = 'status-msg warn';
  } else {
    statusMsg.textContent = `${n} participants`;
    statusMsg.className   = 'status-msg';
  }

  updateCursor();
}

/* ── CANVAS DRAW ── */
function resize() {
  const isMobile = window.innerWidth <= 680;
  const headerH  = (document.querySelector('header')?.offsetHeight ?? 80);
  const vPad     = 60;              // top + bottom breathing room
  const hPad     = isMobile ? 40 : 60; // left + right breathing room
  const panelW   = isMobile ? 0 : 340; // panel width (300) + its right margin (20) + gap (20)

  const maxH = window.innerHeight - headerH - vPad;
  const maxW = window.innerWidth  - panelW  - hPad;
  const size = Math.max(240, Math.min(maxH, maxW, 900));

  canvas.width  = size;
  canvas.height = size;
  drawWheel();
}

function drawWheel() {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const r  = Math.min(cx, cy) - 30; // leaves room for the right-side pointer

  ctx.clearRect(0, 0, W, H);

  if (names.length === 0) { drawEmpty(cx, cy, r); return; }
  if (names.length === 1) { drawSingleSegment(cx, cy, r); return; }

  const seg = (2 * Math.PI) / names.length;

  for (let i = 0; i < names.length; i++) {
    const a0    = angle + i * seg;
    const a1    = a0 + seg;
    const color = COLORS[i % COLORS.length];

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1);
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = THEME.segStroke;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Radial text
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a0 + seg / 2);
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = THEME.textShadow;
    ctx.shadowBlur   = 4;

    const fs = Math.max(10, Math.round(Math.min(r * seg / 7, r * 0.07) * THEME.nameSize));
    ctx.font      = `bold ${fs}px ${THEME.font}`;
    ctx.fillStyle = THEME.textColor;

    let txt = names[i];
    const maxW = r * 0.72;
    while (ctx.measureText(txt).width > maxW && txt.length > 2) {
      txt = txt.slice(0, -1);
    }
    if (txt.length < names[i].length) txt += '…';

    ctx.fillText(txt, r - 12, 0);
    ctx.restore();
  }

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = THEME.ringStroke;
  ctx.lineWidth   = 4;
  ctx.stroke();

  drawHub(cx, cy);
  drawPointer(cx, cy, r);
  drawHint(cx, cy);
}

function drawHint(cx, cy) {
  if (hasSpun || spinning || names.length < 2) return;

  const text  = 'Click to spin';
  const fSize = 20;
  ctx.save();
  ctx.font = `bold ${fSize}px ${THEME.font}`;

  const tw   = ctx.measureText(text).width;
  const padX = 16, padY = 9;
  const bw   = tw + padX * 2;
  const bh   = fSize + padY * 2;
  const bx   = cx - bw / 2;
  const by   = cy - bh / 2;
  const br   = 10; // border radius

  // Rounded rectangle background
  ctx.fillStyle = THEME.hintBg;
  ctx.beginPath();
  ctx.moveTo(bx + br, by);
  ctx.lineTo(bx + bw - br, by);
  ctx.quadraticCurveTo(bx + bw, by,      bx + bw, by + br);
  ctx.lineTo(bx + bw, by + bh - br);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
  ctx.lineTo(bx + br, by + bh);
  ctx.quadraticCurveTo(bx, by + bh,      bx, by + bh - br);
  ctx.lineTo(bx, by + br);
  ctx.quadraticCurveTo(bx, by,           bx + br, by);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = THEME.hintText;
  ctx.fillText(text, cx, cy);

  ctx.restore();
}

function drawPointer(cx, cy, r) {
  // Pointer on the right side (angle = 0), pointing left toward the wheel

  // Determine the colour of the segment currently at the pointer
  let color = THEME.gold;
  if (names.length >= 1) {
    const seg  = (2 * Math.PI) / names.length;
    const norm = ((-angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const idx  = Math.floor(norm / seg) % names.length;
    color = COLORS[idx % COLORS.length];
  }

  ctx.save();
  ctx.translate(cx, cy);

  // Shadow for depth
  ctx.shadowColor   = THEME.ptrShadow;
  ctx.shadowBlur    = 6;
  ctx.shadowOffsetX = 1;

  // Left-pointing triangle: tip overlaps into the wheel, base sticks out to the right
  ctx.beginPath();
  ctx.moveTo(r - 18,  0);   // tip — 18px inside the rim
  ctx.lineTo(r + 18, -13);  // top-right
  ctx.lineTo(r + 18,  13);  // bottom-right
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.strokeStyle   = THEME.ptrStroke;
  ctx.lineWidth     = 2;
  ctx.stroke();

  ctx.restore();
}

function drawEmpty(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle   = THEME.emptyFill;
  ctx.fill();
  ctx.strokeStyle = THEME.emptyStroke;
  ctx.lineWidth   = 3;
  ctx.stroke();

  ctx.fillStyle    = THEME.emptyText;
  ctx.font         = `15px ${THEME.font}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Add names to get started', cx, cy);

  drawPointer(cx, cy, r);
}

function drawSingleSegment(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle   = COLORS[0];
  ctx.fill();
  ctx.strokeStyle = THEME.ringStroke;
  ctx.lineWidth   = 4;
  ctx.stroke();

  ctx.save();
  ctx.shadowColor  = THEME.textShadow;
  ctx.shadowBlur   = 4;
  ctx.fillStyle    = THEME.textColor;
  ctx.font         = `bold 18px ${THEME.font}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(names[0], cx, cy);
  ctx.restore();

  drawHub(cx, cy);
  drawPointer(cx, cy, r);
}

function drawHub(cx, cy) {
  const layers = [
    [24, THEME.hubOuter],
    [17, THEME.hubMid],
    [8,  THEME.hubInner],
  ];
  layers.forEach(([rad, fill]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
  });
}

/* ── CURSOR ── */
function updateCursor() {
  canvas.classList.remove('spinning', 'not-allowed');
  if (spinning)              canvas.classList.add('spinning');
  else if (names.length < 2) canvas.classList.add('not-allowed');
}

/* ── IDLE ROTATION ── */
const IDLE_SPEED = 0.00018; // radians per ms ≈ one full rotation every ~35 seconds

function startIdleRotation() {
  if (idleRaf) return; // already running
  let lastTime = null;

  function idleFrame(t) {
    if (spinning) { idleRaf = null; return; } // hand off to spin animation
    if (lastTime !== null) {
      angle = (angle + IDLE_SPEED * (t - lastTime)) % (2 * Math.PI);
      drawWheel();
    }
    lastTime = t;
    idleRaf  = requestAnimationFrame(idleFrame);
  }

  idleRaf = requestAnimationFrame(idleFrame);
}

/* ── AUDIO ── */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTick(volume) {
  try {
    const ac       = getAudioCtx();
    const now      = ac.currentTime;
    const duration = 0.045;

    // Short noise burst shaped into a click
    const samples = Math.floor(ac.sampleRate * duration);
    const buffer  = ac.createBuffer(1, samples, ac.sampleRate);
    const data    = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      // White noise that decays sharply → click sound
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, 6);
    }

    const source = ac.createBufferSource();
    source.buffer = buffer;

    // High-pass filter: remove low rumble, keep crisp click
    const filter           = ac.createBiquadFilter();
    filter.type            = 'highpass';
    filter.frequency.value = 1200;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start(now);
  } catch (_) { /* audio unavailable */ }
}

/* ── SPIN ── */
function spin() {
  if (spinning || names.length < 2) return;

  spinning = true;
  hasSpun  = true;
  if (idleRaf) { cancelAnimationFrame(idleRaf); idleRaf = null; }
  updateCursor();

  const n         = names.length;
  const seg       = (2 * Math.PI) / n;
  const winnerIdx = Math.floor(Math.random() * n);

  // Center of winner's segment should land at angle 0 (right = pointer)
  const winnerCenter = winnerIdx * seg + seg / 2;
  let targetAngle    = -winnerCenter;

  // Forward delta from current angle
  let delta = (targetAngle - angle) % (2 * Math.PI);
  if (delta < 0) delta += 2 * Math.PI;

  // Add full rotations (3–5 spins)
  delta += (3 + Math.floor(Math.random() * 3)) * 2 * Math.PI;

  const startAngle = angle;
  const duration   = 4000 + Math.random() * 1500; // 4–5.5 seconds
  const t0         = performance.now();
  let   prevBoundary = Math.floor(startAngle / seg);

  function frame(t) {
    const p     = Math.min((t - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic

    angle = startAngle + delta * eased;
    drawWheel();

    // Play a tick for every segment boundary crossed this frame
    const currBoundary = Math.floor(angle / seg);
    const crossings    = Math.min(currBoundary - prevBoundary, 4); // cap to avoid audio burst
    if (crossings > 0) {
      const volume = Math.max(0.1, 1 - p * 0.88); // quieter as wheel slows
      for (let c = 0; c < crossings; c++) {
        // Stagger multiple ticks slightly so they don't overlap
        setTimeout(() => playTick(volume), c * 12);
      }
    }
    prevBoundary = currBoundary;

    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      // Normalise angle to [0, 2π) to prevent float accumulation
      angle      = ((startAngle + delta) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      spinning   = false;
      lastWinner = winnerIdx;
      updateCursor();
      setTimeout(() => showWinner(names[winnerIdx]), 300);
      // idle rotation resumes only after the modal is dismissed (see closeModal)
    }
  }

  requestAnimationFrame(frame);
}

/* ── MODAL ── */
function showWinner(name) {
  modalName.textContent = name;
  overlay.classList.add('open');
}

function closeModal() {
  overlay.classList.remove('open');
  startIdleRotation(); // wheel resumes slow rotation once popup is dismissed
}

function removeWinner() {
  if (lastWinner < 0 || lastWinner >= names.length) { closeModal(); return; }
  const [name] = names.splice(lastWinner, 1);
  lastWinner = -1;
  removed.push(name);
  save();
  saveRemoved();
  renderList();
  renderRemoved();
  drawWheel();
  closeModal();
}

/* ── PAST PARTICIPANTS ── */
function renderRemoved() {
  const section  = document.getElementById('pastSection');
  const pastList = document.getElementById('pastList');
  const tmpl     = document.getElementById('tmpl-past-item').content;

  if (removed.length === 0) {
    section.classList.remove('visible');
    return;
  }

  section.classList.add('visible');
  pastList.innerHTML = '';

  removed.forEach(name => {
    const frag = tmpl.cloneNode(true);
    const span = frag.querySelector('.past-name');
    span.textContent = name;  // textContent auto-escapes — no manual escaping needed
    span.title       = name;
    pastList.appendChild(frag);
  });
}

function clearPast() {
  removed = [];
  saveRemoved();
  renderRemoved();
}

function overlayClick(e) {
  if (e.target === overlay) closeModal();
}

/* ── UTILS ── */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
