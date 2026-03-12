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
  const n = name => parseFloat(v(name)); // shorthand for numeric vars

  // Segment colour palette (--wof-c-0 … --wof-c-14)
  COLORS = Array.from({ length: 15 }, (_, i) => v(`--wof-c-${i}`));

  // All canvas styles — edit values in style.css :root, not here
  THEME = {
    // Brand
    gold:            v('--wof-gold'),
    dark:            v('--wof-dark'),
    font:            v('--wof-font') || 'Segoe UI, sans-serif',

    // Segment labels
    segStroke:       v('--wof-seg-stroke'),
    segLineWidth:    n('--wof-seg-line-width'),
    ringStroke:      v('--wof-ring-stroke'),
    ringLineWidth:   n('--wof-ring-line-width'),
    textColor:       v('--wof-text-color'),
    textWeight:      v('--wof-text-weight'),
    textShadow:      v('--wof-text-shadow'),
    textShadowBlur:  n('--wof-text-shadow-blur'),
    textAlign:       v('--wof-text-align'),
    textAlignCenter: v('--wof-text-align-center'),
    textBaseline:    v('--wof-text-baseline'),
    textOffset:      n('--wof-text-offset'),
    textMaxWidth:    n('--wof-text-max-width'),
    nameSize:        n('--wof-name-size') || 1,

    // Single segment label
    singleSize:      n('--wof-single-size'),

    // Hub
    hubOuter:        v('--wof-hub-outer'),
    hubMid:          v('--wof-hub-mid'),
    hubInner:        v('--wof-hub-inner'),
    hubR1:           n('--wof-hub-r1'),
    hubR2:           n('--wof-hub-r2'),
    hubR3:           n('--wof-hub-r3'),

    // Pointer
    ptrStroke:       v('--wof-pointer-stroke'),
    ptrShadow:       v('--wof-pointer-shadow'),
    ptrShadowBlur:   n('--wof-pointer-shadow-blur'),
    ptrShadowX:      n('--wof-pointer-shadow-x'),
    ptrLineWidth:    n('--wof-pointer-line-width'),
    ptrOverlap:      n('--wof-pointer-overlap'),
    ptrReach:        n('--wof-pointer-reach'),
    ptrHeight:       n('--wof-pointer-height'),

    // Empty state
    emptyFill:       v('--wof-empty-fill'),
    emptyStroke:     v('--wof-empty-stroke'),
    emptyLineWidth:  n('--wof-empty-line-width'),
    emptyText:       v('--wof-empty-text'),
    emptySize:       n('--wof-empty-size'),
  };
}

/* ── CONSTANTS ────────────────────────────────────────────────────────────────
   Magic numbers live here — not scattered through the code.
────────────────────────────────────────────────────────────────────────────── */
const STORAGE_KEY         = 'wof_names_v1';
const STORAGE_KEY_REMOVED = 'wof_removed_v1';

// Canvas layout
const CANVAS_MARGIN       = 30;    // px between wheel rim and canvas edge (room for pointer)
const CANVAS_MIN_SIZE     = 240;   // minimum canvas size in px
const CANVAS_MAX_SIZE     = 900;   // maximum canvas size in px
const CANVAS_PANEL_WIDTH  = 340;   // desktop panel width + its margins
const CANVAS_BREAKPOINT   = 680;   // px — below this the panel stacks vertically

// Spin animation
const SPIN_MIN_ROTATIONS  = 3;     // minimum full rotations before stopping
const SPIN_ROTATION_RANGE = 3;     // random extra rotations added on top (0 … range-1)
const SPIN_MIN_DURATION   = 4000;  // ms — minimum spin duration
const SPIN_EXTRA_DURATION = 1500;  // ms — random extra duration
const SPIN_WINNER_DELAY   = 300;   // ms — pause before showing the winner modal

// Tick sound
const TICK_DURATION       = 0.045; // seconds — length of each click sound
const TICK_FILTER_FREQ    = 1200;  // Hz — high-pass filter cutoff
const TICK_GAIN_FACTOR    = 0.5;   // master gain multiplier per tick
const TICK_VOLUME_MIN     = 0.1;   // minimum tick volume at end of spin
const TICK_VOLUME_FADE    = 0.88;  // how fast volume fades as the wheel slows
const TICK_MAX_CROSSINGS  = 4;     // max ticks fired per animation frame
const TICK_STAGGER_MS     = 12;    // ms between staggered ticks in one frame

// Idle rotation
const IDLE_SPEED          = 0.00018; // rad/ms ≈ one full rotation every ~35 seconds

// UI
const RESIZE_DEBOUNCE     = 150;   // ms — debounce delay for the window resize handler

/* ── STATE ── */
const state = {
  names:      [],    // participant names currently on the wheel
  removed:    [],    // past participants (removed after being picked)
  angle:      0,     // current wheel rotation in radians
  spinning:   false,
  lastWinner: -1,    // index of the last winner (used for removal)
  idleRaf:    null,  // requestAnimationFrame handle for idle rotation
  hasSpun:    false, // true after the first spin — hides the "Click to spin" hint
};

/* ── DOM ── */
const DOM = {
  canvas:       document.getElementById('wheel'),
  nameInput:    document.getElementById('nameInput'),
  namesList:    document.getElementById('namesList'),
  statusMsg:    document.getElementById('statusMsg'),
  bulkToggle:   document.getElementById('bulkToggle'),
  bulkArea:     document.getElementById('bulkArea'),
  bulkInput:    document.getElementById('bulkInput'),
  spinHint:     document.getElementById('spinHint'),
  overlay:      document.getElementById('overlay'),
  modalName:    document.getElementById('modalName'),
  pastSection:  document.getElementById('pastSection'),
  pastList:     document.getElementById('pastList'),
  header:       document.querySelector('header'),
  btnAdd:       document.querySelector('.btn-add'),
  btnBulkAdd:   document.querySelector('.btn-bulk-add'),
  btnBulkClear: document.querySelector('.btn-bulk-clear'),
  btnClearPast: document.querySelector('.btn-clear-past'),
  btnClose:     document.querySelector('.btn-close'),
  btnRemove:    document.querySelector('.btn-remove'),
  tmplNameItem: document.getElementById('tmpl-name-item').content,
  tmplPastItem: document.getElementById('tmpl-past-item').content,
};

const ctx = DOM.canvas.getContext('2d');

/* ── INIT ── */
(function init() {
  loadTheme();

  // Restore saved data
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    state.names = Array.isArray(stored)
      ? stored.filter(n => typeof n === 'string' && n.trim().length > 0)
      : [];
  } catch (err) {
    console.warn('Failed to load names from localStorage', err);
    state.names = [];
  }

  try {
    const storedRemoved = JSON.parse(localStorage.getItem(STORAGE_KEY_REMOVED) || '[]');
    state.removed = Array.isArray(storedRemoved)
      ? storedRemoved.filter(n => typeof n === 'string' && n.trim().length > 0)
      : [];
  } catch (err) {
    console.warn('Failed to load removed names from localStorage', err);
    state.removed = [];
  }

  // Event listeners — all wired here, no onclick in HTML
  DOM.nameInput   .addEventListener('keydown', e => { if (e.key === 'Enter') addName(); });
  DOM.btnAdd      .addEventListener('click', addName);
  DOM.bulkToggle  .addEventListener('click', toggleBulk);
  DOM.btnBulkAdd  .addEventListener('click', addBulk);
  DOM.btnBulkClear.addEventListener('click', clearBulk);
  DOM.btnClearPast.addEventListener('click', clearPast);
  DOM.overlay     .addEventListener('click', overlayClick);
  DOM.btnClose    .addEventListener('click', closeModal);
  DOM.btnRemove   .addEventListener('click', removeWinner);
  DOM.canvas      .addEventListener('click', () => spin());
  window          .addEventListener('resize', debounce(resize, RESIZE_DEBOUNCE));

  resize();
  renderList();
  renderRemoved();
  startIdleRotation();
})();

/* ── PERSISTENCE ── */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.names));
}

function saveRemoved() {
  localStorage.setItem(STORAGE_KEY_REMOVED, JSON.stringify(state.removed));
}

/* ── DATA ── */
function addName() {
  const value = DOM.nameInput.value.trim();
  if (!value) { DOM.nameInput.focus(); return; }
  state.names.push(value);
  DOM.nameInput.value = '';
  DOM.nameInput.focus();
  save();
  renderList();
  drawWheel();
}

function removeName(i) {
  state.names.splice(i, 1);
  save();
  renderList();
  drawWheel();
}

/* ── BULK ADD ── */
function toggleBulk() {
  const isOpen = DOM.bulkArea.classList.toggle('open');
  DOM.bulkToggle.textContent = isOpen ? '▲ Paste total list' : '▼ Paste total list';
  if (isOpen) DOM.bulkInput.focus();
}

function addBulk() {
  const added = DOM.bulkInput.value
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length <= 25);

  if (added.length === 0) return;

  state.names.push(...added);
  save();
  renderList();
  drawWheel();

  DOM.bulkInput.value = '';
  DOM.bulkArea.classList.remove('open');
  DOM.bulkToggle.textContent = '▼ Paste total list';
}

function clearBulk() {
  DOM.bulkInput.value = '';
  DOM.bulkInput.focus();
}

/* ── LIST UI ── */
function renderList() {
  DOM.namesList.innerHTML = '';

  state.names.forEach((name, i) => {
    const color  = COLORS[i % COLORS.length];
    const frag   = DOM.tmplNameItem.cloneNode(true);
    const li     = frag.querySelector('li');
    const dot    = frag.querySelector('.color-dot');
    const label  = frag.querySelector('.name-label');
    const btnDel = frag.querySelector('.btn-del');

    li.style.borderLeftColor = color;
    dot.style.background     = color;
    label.textContent        = name;  // textContent auto-escapes — no manual escaping needed
    label.title              = name;
    btnDel.addEventListener('click', () => removeName(i));

    DOM.namesList.appendChild(frag);
  });

  const count = state.names.length;
  if (count === 0) {
    DOM.statusMsg.textContent = 'Add at least 2 names.';
    DOM.statusMsg.className   = 'status-msg warn';
  } else if (count === 1) {
    DOM.statusMsg.textContent = '1 participant — add at least 1 more.';
    DOM.statusMsg.className   = 'status-msg warn';
  } else {
    DOM.statusMsg.textContent = `${count} participants`;
    DOM.statusMsg.className   = 'status-msg';
  }

  updateCursor();
}

/* ── CANVAS LAYOUT ── */
function resize() {
  const isMobile = window.innerWidth <= CANVAS_BREAKPOINT;
  const headerH  = DOM.header?.offsetHeight ?? 80;
  const vPad     = 60;
  const hPad     = isMobile ? 40 : 60;
  const panelW   = isMobile ? 0 : CANVAS_PANEL_WIDTH;

  const maxH = window.innerHeight - headerH - vPad;
  const maxW = window.innerWidth  - panelW  - hPad;
  const size = Math.max(CANVAS_MIN_SIZE, Math.min(maxH, maxW, CANVAS_MAX_SIZE));

  DOM.canvas.width  = size;
  DOM.canvas.height = size;
  drawWheel();
}

/* ── CANVAS DRAW ── */
function drawWheel() {
  const W  = DOM.canvas.width;
  const H  = DOM.canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const r  = Math.min(cx, cy) - CANVAS_MARGIN;

  ctx.clearRect(0, 0, W, H);

  if (state.names.length === 0) { drawEmpty(cx, cy, r); return; }
  if (state.names.length === 1) { drawSingleSegment(cx, cy, r); return; }

  const segmentAngle = (2 * Math.PI) / state.names.length;

  drawSegments(cx, cy, r, segmentAngle);
  drawOuterRing(cx, cy, r);
  drawHub(cx, cy);
  drawPointer(cx, cy, r);
}

function drawSegments(cx, cy, r, segmentAngle) {
  for (let i = 0; i < state.names.length; i++) {
    const startAngle = state.angle + i * segmentAngle;
    const endAngle   = startAngle + segmentAngle;
    const color      = COLORS[i % COLORS.length];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = THEME.segStroke;
    ctx.lineWidth   = THEME.segLineWidth;
    ctx.stroke();

    drawSegmentLabel(cx, cy, r, startAngle, segmentAngle, i);
  }
}

function drawSegmentLabel(cx, cy, r, startAngle, segmentAngle, i) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(startAngle + segmentAngle / 2);
  ctx.textAlign    = THEME.textAlign;
  ctx.textBaseline = THEME.textBaseline;
  ctx.shadowColor  = THEME.textShadow;
  ctx.shadowBlur   = THEME.textShadowBlur;

  const fontSize = Math.max(10, Math.round(Math.min(r * segmentAngle / 7, r * 0.07) * THEME.nameSize));
  ctx.font      = `${THEME.textWeight} ${fontSize}px ${THEME.font}`;
  ctx.fillStyle = THEME.textColor;

  let label    = state.names[i];
  const maxWidth = r * THEME.textMaxWidth;
  while (ctx.measureText(label).width > maxWidth && label.length > 2) {
    label = label.slice(0, -1);
  }
  if (label.length < state.names[i].length) label += '…';

  ctx.fillText(label, r - THEME.textOffset, 0);
  ctx.restore();
}

function drawOuterRing(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = THEME.ringStroke;
  ctx.lineWidth   = THEME.ringLineWidth;
  ctx.stroke();
}

function drawPointer(cx, cy, r) {
  // Pointer sits on the right side (angle = 0), tip overlaps into the wheel

  // Match pointer colour to the segment currently under it
  let color = THEME.gold;
  if (state.names.length >= 1) {
    const segmentAngle    = (2 * Math.PI) / state.names.length;
    const normalizedAngle = ((-state.angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const segmentIndex    = Math.floor(normalizedAngle / segmentAngle) % state.names.length;
    color = COLORS[segmentIndex % COLORS.length];
  }

  ctx.save();
  ctx.translate(cx, cy);

  ctx.shadowColor   = THEME.ptrShadow;
  ctx.shadowBlur    = THEME.ptrShadowBlur;
  ctx.shadowOffsetX = THEME.ptrShadowX;

  ctx.beginPath();
  ctx.moveTo(r - THEME.ptrOverlap,  0);               // tip — inside the wheel
  ctx.lineTo(r + THEME.ptrReach,   -THEME.ptrHeight);  // top-right
  ctx.lineTo(r + THEME.ptrReach,    THEME.ptrHeight);  // bottom-right
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.strokeStyle   = THEME.ptrStroke;
  ctx.lineWidth     = THEME.ptrLineWidth;
  ctx.stroke();

  ctx.restore();
}

function drawEmpty(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle   = THEME.emptyFill;
  ctx.fill();
  ctx.strokeStyle = THEME.emptyStroke;
  ctx.lineWidth   = THEME.emptyLineWidth;
  ctx.stroke();

  ctx.fillStyle    = THEME.emptyText;
  ctx.font         = `${THEME.emptySize}px ${THEME.font}`;
  ctx.textAlign    = THEME.textAlignCenter;
  ctx.textBaseline = THEME.textBaseline;
  ctx.fillText('Add names to get started', cx, cy);

  drawPointer(cx, cy, r);
}

function drawSingleSegment(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle   = COLORS[0];
  ctx.fill();
  ctx.strokeStyle = THEME.ringStroke;
  ctx.lineWidth   = THEME.ringLineWidth;
  ctx.stroke();

  ctx.save();
  ctx.shadowColor  = THEME.textShadow;
  ctx.shadowBlur   = THEME.textShadowBlur;
  ctx.fillStyle    = THEME.textColor;
  ctx.font         = `${THEME.textWeight} ${THEME.singleSize}px ${THEME.font}`;
  ctx.textAlign    = THEME.textAlignCenter;
  ctx.textBaseline = THEME.textBaseline;
  ctx.fillText(state.names[0], cx, cy);
  ctx.restore();

  drawHub(cx, cy);
  drawPointer(cx, cy, r);
}

function drawHub(cx, cy) {
  const layers = [
    [THEME.hubR1, THEME.hubOuter],
    [THEME.hubR2, THEME.hubMid],
    [THEME.hubR3, THEME.hubInner],
  ];
  layers.forEach(([radius, fill]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
  });
}

/* ── CURSOR + HINT ── */
function updateCursor() {
  DOM.canvas.classList.remove('spinning', 'not-allowed');
  if (state.spinning)              DOM.canvas.classList.add('spinning');
  else if (state.names.length < 2) DOM.canvas.classList.add('not-allowed');

  DOM.spinHint.classList.toggle('hidden', state.hasSpun || state.spinning || state.names.length < 2);
}

/* ── IDLE ROTATION ── */
function startIdleRotation() {
  if (state.idleRaf) return; // already running
  let lastTime = null;

  function idleFrame(t) {
    if (state.spinning) { state.idleRaf = null; return; } // spin animation takes over
    if (lastTime !== null) {
      state.angle = (state.angle + IDLE_SPEED * (t - lastTime)) % (2 * Math.PI);
      drawWheel();
    }
    lastTime      = t;
    state.idleRaf = requestAnimationFrame(idleFrame);
  }

  state.idleRaf = requestAnimationFrame(idleFrame);
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
    const ac      = getAudioCtx();
    const now     = ac.currentTime;
    const samples = Math.floor(ac.sampleRate * TICK_DURATION);
    const buffer  = ac.createBuffer(1, samples, ac.sampleRate);
    const data    = buffer.getChannelData(0);

    // White noise that decays sharply → click sound
    for (let i = 0; i < samples; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, 6);
    }

    const source = ac.createBufferSource();
    source.buffer = buffer;

    // High-pass filter: remove low rumble, keep crisp click
    const filter           = ac.createBiquadFilter();
    filter.type            = 'highpass';
    filter.frequency.value = TICK_FILTER_FREQ;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume * TICK_GAIN_FACTOR, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + TICK_DURATION);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start(now);
  } catch (_) { /* audio unavailable */ }
}

/* ── SPIN ── */
function spin() {
  if (state.spinning || state.names.length < 2) return;

  state.spinning = true;
  state.hasSpun  = true;
  if (state.idleRaf) { cancelAnimationFrame(state.idleRaf); state.idleRaf = null; }
  updateCursor();

  const nameCount    = state.names.length;
  const segmentAngle = (2 * Math.PI) / nameCount;
  const winnerIdx    = Math.floor(Math.random() * nameCount);

  // Center of winner's segment should land at angle 0 (right = pointer)
  const winnerCenter = winnerIdx * segmentAngle + segmentAngle / 2;
  let targetAngle    = -winnerCenter;

  // Forward delta from current angle
  let delta = (targetAngle - state.angle) % (2 * Math.PI);
  if (delta < 0) delta += 2 * Math.PI;

  // Add full rotations
  delta += (SPIN_MIN_ROTATIONS + Math.floor(Math.random() * SPIN_ROTATION_RANGE)) * 2 * Math.PI;

  const startAngle   = state.angle;
  const duration     = SPIN_MIN_DURATION + Math.random() * SPIN_EXTRA_DURATION;
  const startTime    = performance.now();
  let   prevBoundary = Math.floor(startAngle / segmentAngle);

  function frame(t) {
    const progress = Math.min((t - startTime) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic

    state.angle = startAngle + delta * eased;
    drawWheel();

    // Play a tick for every segment boundary crossed this frame
    const currBoundary = Math.floor(state.angle / segmentAngle);
    const crossings    = Math.min(currBoundary - prevBoundary, TICK_MAX_CROSSINGS);
    if (crossings > 0) {
      const volume = Math.max(TICK_VOLUME_MIN, 1 - progress * TICK_VOLUME_FADE);
      for (let c = 0; c < crossings; c++) {
        setTimeout(() => playTick(volume), c * TICK_STAGGER_MS);
      }
    }
    prevBoundary = currBoundary;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      // Normalise angle to [0, 2π) to prevent float accumulation
      state.angle      = ((startAngle + delta) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      state.spinning   = false;
      state.lastWinner = winnerIdx;
      updateCursor();
      setTimeout(() => showWinner(state.names[winnerIdx]), SPIN_WINNER_DELAY);
      // idle rotation resumes only after the modal is dismissed (see closeModal)
    }
  }

  requestAnimationFrame(frame);
}

/* ── MODAL ── */
function showWinner(name) {
  DOM.modalName.textContent = name;
  DOM.overlay.classList.add('open');
}

function closeModal() {
  DOM.overlay.classList.remove('open');
  startIdleRotation(); // wheel resumes slow rotation once popup is dismissed
}

function removeWinner() {
  if (state.lastWinner < 0 || state.lastWinner >= state.names.length) { closeModal(); return; }
  const [name] = state.names.splice(state.lastWinner, 1);
  state.lastWinner = -1;
  state.removed.push(name);
  save();
  saveRemoved();
  renderList();
  renderRemoved();
  drawWheel();
  closeModal();
}

/* ── PAST PARTICIPANTS ── */
function renderRemoved() {
  if (state.removed.length === 0) {
    DOM.pastSection.classList.remove('visible');
    return;
  }

  DOM.pastSection.classList.add('visible');
  DOM.pastList.innerHTML = '';

  state.removed.forEach(name => {
    const frag = DOM.tmplPastItem.cloneNode(true);
    const span = frag.querySelector('.past-name');
    span.textContent = name;  // textContent auto-escapes — no manual escaping needed
    span.title       = name;
    DOM.pastList.appendChild(frag);
  });
}

function clearPast() {
  state.removed = [];
  saveRemoved();
  renderRemoved();
}

function overlayClick(e) {
  if (e.target === DOM.overlay) closeModal();
}

/* ── UTILS ── */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
