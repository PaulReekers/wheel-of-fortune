'use strict';

/* ── CONSTANTS ── */
const COLORS = [
  '#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6',
  '#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a',
  '#ff5722','#607d8b','#673ab7','#4caf50','#ff9800'
];
const STORAGE_KEY         = 'wof_names_v1';
const STORAGE_KEY_REMOVED = 'wof_removed_v1';

/* ── STATE ── */
let names      = [];
let removed    = [];     // past participants (removed from wheel)
let angle      = 0;      // current wheel rotation in radians
let spinning   = false;
let lastWinner = -1;     // index of last winner (for removal)
let idleRaf    = null;   // requestAnimationFrame handle for idle rotation

/* ── DOM ── */
const canvas    = document.getElementById('wheel');
const ctx       = canvas.getContext('2d');
const spinBtn   = document.getElementById('spinBtn');
const nameInput = document.getElementById('nameInput');
const namesList = document.getElementById('namesList');
const statusMsg = document.getElementById('statusMsg');
const overlay   = document.getElementById('overlay');
const modalName = document.getElementById('modalName');

/* ── INIT ── */
(function init() {
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

  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addName(); });
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

  names.forEach((name, i) => {
    const color = COLORS[i % COLORS.length];
    const li = document.createElement('li');
    li.style.borderLeftColor = color;
    li.innerHTML = `
      <div class="name-inner">
        <span class="color-dot" style="background:${color}"></span>
        <span class="name-label" title="${esc(name)}">${esc(name)}</span>
      </div>
      <button class="btn-del" onclick="removeName(${i})" aria-label="Remove">✕</button>
    `;
    namesList.appendChild(li);
  });

  const n = names.length;
  if (n === 0) {
    statusMsg.textContent = 'Add at least 2 names.';
    statusMsg.className = 'status-msg warn';
  } else if (n === 1) {
    statusMsg.textContent = '1 participant — add at least 1 more.';
    statusMsg.className = 'status-msg warn';
  } else {
    statusMsg.textContent = `${n} participants`;
    statusMsg.className = 'status-msg';
  }

  spinBtn.disabled = n < 2 || spinning;
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── CANVAS DRAW ── */
function resize() {
  const size = Math.min(window.innerWidth - 48, 440);
  canvas.width  = size;
  canvas.height = size;
  drawWheel();
}

function drawWheel() {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const r  = Math.min(cx, cy) - 8;

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
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Radial text
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a0 + seg / 2);
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur   = 4;

    const fs = Math.max(10, Math.min(16, Math.floor(r * seg / 7)));
    ctx.font      = `bold ${fs}px Segoe UI, sans-serif`;
    ctx.fillStyle = '#fff';

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
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth   = 4;
  ctx.stroke();

  drawHub(cx, cy);
}

function drawEmpty(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle   = 'rgba(255,255,255,0.03)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth   = 3;
  ctx.stroke();

  ctx.fillStyle    = 'rgba(255,255,255,0.22)';
  ctx.font         = '15px Segoe UI, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Add names to get started', cx, cy);
}

function drawSingleSegment(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle   = COLORS[0];
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth   = 4;
  ctx.stroke();

  ctx.save();
  ctx.shadowColor  = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur   = 4;
  ctx.fillStyle    = '#fff';
  ctx.font         = 'bold 18px Segoe UI, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(names[0], cx, cy);
  ctx.restore();

  drawHub(cx, cy);
}

function drawHub(cx, cy) {
  const layers = [[24,'#fff'],[17,'#FFD700'],[8,'#1a1a2e']];
  layers.forEach(([rad, fill]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
  });
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
    const ctx      = getAudioCtx();
    const now      = ctx.currentTime;
    const duration = 0.045;

    // Short noise burst shaped into a click
    const samples = Math.floor(ctx.sampleRate * duration);
    const buffer  = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data    = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      // White noise that decays sharply → click sound
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, 6);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // High-pass filter: remove low rumble, keep crisp click
    const filter       = ctx.createBiquadFilter();
    filter.type        = 'highpass';
    filter.frequency.value = 1200;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
  } catch (_) { /* audio unavailable */ }
}

/* ── SPIN ── */
function spin() {
  if (spinning || names.length < 2) return;

  spinning = true;
  spinBtn.disabled = true;
  if (idleRaf) { cancelAnimationFrame(idleRaf); idleRaf = null; }

  const n         = names.length;
  const seg       = (2 * Math.PI) / n;
  const winnerIdx = Math.floor(Math.random() * n);

  // Center of winner's segment should land at -π/2 (top = pointer)
  const winnerCenter = winnerIdx * seg + seg / 2;
  let targetAngle    = -Math.PI / 2 - winnerCenter;

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
      // Normalize angle to [0, 2π) to prevent float accumulation
      angle      = ((startAngle + delta) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      spinning   = false;
      lastWinner = winnerIdx;
      spinBtn.disabled = (names.length < 2);
      setTimeout(() => showWinner(names[winnerIdx]), 300);
      startIdleRotation();
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

  if (removed.length === 0) {
    section.classList.remove('visible');
    return;
  }

  section.classList.add('visible');
  pastList.innerHTML = '';

  removed.forEach(name => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="past-name" title="${esc(name)}">${esc(name)}</span>`;
    pastList.appendChild(li);
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
