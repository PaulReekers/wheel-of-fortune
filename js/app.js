'use strict';

/* ── CONFIG ──────────────────────────────────────────────────────────────────
   Single source of truth for all constants and behavioural values.
   Visual values belong in style.css (:root). Behaviour values live here.
────────────────────────────────────────────────────────────────────────────── */

const CONFIG = {
  storage: {
    names:   'wof_names_v1',
    removed: 'wof_removed_v1',
    winners: 'wof_winners_v1',
  },
  canvas: {
    margin:      48,   // px — gap between wheel rim and canvas edge (room for pointer)
    minSize:     240,  // px — smallest the canvas will shrink to
    maxSize:     900,  // px — largest the canvas will grow to
    panelWidth:  340,  // px — desktop panel width + its margins
    hPadDesktop: 60,   // px — horizontal breathing room on desktop
    hPadMobile:  40,   // px — horizontal breathing room on mobile
    vPad:        60,   // px — vertical breathing room
  },
  spin: {
    minRotations:  3,     // full rotations before the wheel may stop
    rotationRange: 3,     // random extra rotations added on top (0 … range-1)
    minDuration:   4000,  // ms
    extraDuration: 1500,  // ms random extra
    winnerDelay:   300,   // ms pause before the winner modal appears
  },
  tick: {
    duration:     0.045,  // s — length of each click sound
    filterFreq:   1200,   // Hz — high-pass filter cutoff
    gainFactor:   0.5,    // master gain multiplier
    volumeMin:    0.1,    // minimum volume at the end of the spin
    volumeFade:   0.88,   // how fast volume fades as the wheel slows
    maxCrossings: 4,      // max ticks fired per animation frame
    staggerMs:    12,     // ms between staggered ticks in one frame
  },
  idle: {
    speed: 0.00008, // rad/ms ≈ one full rotation every ~35 s
  },
};

/* ── THEME ───────────────────────────────────────────────────────────────────
   Reads all canvas-relevant values from CSS custom properties.
   All visual values are owned by style.css — this class is the bridge
   between the stylesheet and the Canvas 2D API.
────────────────────────────────────────────────────────────────────────────── */

class Theme {
  constructor() {
    /** @type {string[]} Segment colour palette */
    this.colors = [];
    /** @type {object} Canvas style values */
    this.values = {};
  }

  /**
   * (Re-)reads every CSS custom property from :root.
   * Call once at startup; call again after any live CSS change (e.g. resize
   * could change --wof-name-size via a media query).
   */
  load() {
    const cs = getComputedStyle(document.documentElement);
    const v  = name => cs.getPropertyValue(name).trim();
    const n  = name => parseFloat(v(name));

    // Segment colour palette (--wof-c-0 … --wof-c-14)
    this.colors = Array.from({ length: 15 }, (_, i) => v(`--wof-c-${i}`));

    // All canvas styles — edit values in style.css :root, not here
    this.values = {
      gold:            v('--wof-gold'),
      dark:            v('--wof-dark'),
      font:            v('--wof-font') || 'Segoe UI, sans-serif',

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

      singleSize:      n('--wof-single-size'),

      hubOuter:        v('--wof-hub-outer'),
      hubMid:          v('--wof-hub-mid'),
      hubInner:        v('--wof-hub-inner'),
      hubR1:           n('--wof-hub-r1'),
      hubR2:           n('--wof-hub-r2'),
      hubR3:           n('--wof-hub-r3'),

      ptrStroke:       v('--wof-pointer-stroke'),
      ptrShadow:       v('--wof-pointer-shadow'),
      ptrShadowBlur:   n('--wof-pointer-shadow-blur'),
      ptrShadowX:      n('--wof-pointer-shadow-x'),
      ptrShadowY:      n('--wof-pointer-shadow-y'),
      ptrLineWidth:    n('--wof-pointer-line-width'),
      ptrOverlap:      n('--wof-pointer-overlap'),
      ptrReach:        n('--wof-pointer-reach'),
      ptrHeight:       n('--wof-pointer-height'),

      emptyFill:       v('--wof-empty-fill'),
      emptyStroke:     v('--wof-empty-stroke'),
      emptyLineWidth:  n('--wof-empty-line-width'),
    };
  }
}

/* ── AUDIO MANAGER ───────────────────────────────────────────────────────────
   Lazy-initialised Web Audio context.
   Generates a short noise-based click for each segment boundary crossing.
────────────────────────────────────────────────────────────────────────────── */

class AudioManager {
  /** @param {object} config  Full CONFIG object */
  constructor(config) {
    this._cfg = config.tick;
    this._ctx = null;
  }

  /** @returns {AudioContext} */
  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  /**
   * Synthesises and plays a short click at the given volume.
   * White noise through an exponential decay envelope and a high-pass filter
   * keeps the sound crisp without low-frequency rumble.
   * @param {number} volume  0–1
   */
  playTick(volume) {
    try {
      const { duration, filterFreq, gainFactor } = this._cfg;
      const ac      = this._getCtx();
      const now     = ac.currentTime;
      const samples = Math.floor(ac.sampleRate * duration);
      const buffer  = ac.createBuffer(1, samples, ac.sampleRate);
      const data    = buffer.getChannelData(0);

      // White noise with sharp exponential decay → click sound
      for (let i = 0; i < samples; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, 6);
      }

      const source           = ac.createBufferSource();
      source.buffer          = buffer;

      const filter           = ac.createBiquadFilter();
      filter.type            = 'highpass';
      filter.frequency.value = filterFreq;

      const gain = ac.createGain();
      gain.gain.setValueAtTime(volume * gainFactor, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      source.start(now);
    } catch (_) { /* audio unavailable */ }
  }
}

/* ── WHEEL RENDERER ──────────────────────────────────────────────────────────
   Responsible solely for drawing to the canvas.
   Receives all data it needs as arguments — holds no mutable application state.
────────────────────────────────────────────────────────────────────────────── */

class WheelRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Theme}             theme
   * @param {object}            config  Full CONFIG object
   */
  constructor(canvas, theme, config) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._theme  = theme;
    this._cfg    = config.canvas;
  }

  /** Resize the backing canvas element to the given square size. */
  setSize(size) {
    this._canvas.width  = size;
    this._canvas.height = size;
  }

  /**
   * Full redraw of the wheel for the given state snapshot.
   * @param {string[]} names  Current participant list
   * @param {number}   angle  Current rotation in radians
   */
  draw(names, angle) {
    const { width: W, height: H } = this._canvas;
    const cx = W / 2;
    const cy = H / 2;
    const r  = Math.min(cx, cy) - this._cfg.margin;
    const t  = this._theme.values;

    this._ctx.clearRect(0, 0, W, H);

    if (names.length === 0) { this._drawEmpty(cx, cy, r, t);                   return; }
    if (names.length === 1) { this._drawSingleSegment(cx, cy, r, names[0], t); return; }

    const segmentAngle = (2 * Math.PI) / names.length;
    this._drawSegments(cx, cy, r, names, angle, segmentAngle, t);
    this._drawOuterRing(cx, cy, r, t);
    this._drawHub(cx, cy, t);
    this._drawPointer(cx, cy, r, names, angle, t);
  }

  // ── Private drawing primitives ────────────────────────────────────────────

  /** @private */
  _drawSegments(cx, cy, r, names, angle, segmentAngle, t) {
    for (let i = 0; i < names.length; i++) {
      const startAngle = angle + i * segmentAngle;
      const endAngle   = startAngle + segmentAngle;
      const color      = this._theme.colors[i % this._theme.colors.length];

      this._ctx.beginPath();
      this._ctx.moveTo(cx, cy);
      this._ctx.arc(cx, cy, r, startAngle, endAngle);
      this._ctx.closePath();
      this._ctx.fillStyle   = color;
      this._ctx.fill();
      this._ctx.strokeStyle = t.segStroke;
      this._ctx.lineWidth   = t.segLineWidth;
      this._ctx.stroke();

      this._drawSegmentLabel(cx, cy, r, startAngle, segmentAngle, names[i], t);
    }
  }

  /**
   * Draws a single label rotated to the centre of its segment.
   * Font size scales with both radius and segment angle so it always fits
   * regardless of how many names are on the wheel. Truncates with '…' if needed.
   * @private
   */
  _drawSegmentLabel(cx, cy, r, startAngle, segmentAngle, name, t) {
    this._ctx.save();
    this._ctx.translate(cx, cy);
    this._ctx.rotate(startAngle + segmentAngle / 2);
    this._ctx.textAlign    = t.textAlign;
    this._ctx.textBaseline = t.textBaseline;
    this._ctx.shadowColor  = t.textShadow;
    this._ctx.shadowBlur   = t.textShadowBlur;

    const fontSize = Math.max(10, Math.round(Math.min(r * segmentAngle / 7, r * 0.07) * t.nameSize));
    this._ctx.font      = `${t.textWeight} ${fontSize}px ${t.font}`;
    this._ctx.fillStyle = t.textColor;

    let label      = name;
    const maxWidth = r * t.textMaxWidth;
    while (this._ctx.measureText(label).width > maxWidth && label.length > 2) {
      label = label.slice(0, -1);
    }
    if (label.length < name.length) label += '…';

    this._ctx.fillText(label, r - t.textOffset, 0);
    this._ctx.restore();
  }

  /** @private */
  _drawOuterRing(cx, cy, r, t) {
    this._ctx.beginPath();
    this._ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    this._ctx.strokeStyle = t.ringStroke;
    this._ctx.lineWidth   = t.ringLineWidth;
    this._ctx.stroke();
  }

  /**
   * Draws the triangular pointer on the right side of the wheel.
   * The tip overlaps into the wheel; colour matches the segment currently
   * under the pointer for immediate visual feedback during the spin.
   * @private
   */
  _drawPointer(cx, cy, r, names, angle, t) {
    let color = t.gold;
    if (names.length >= 1) {
      const segmentAngle    = (2 * Math.PI) / names.length;
      const normalizedAngle = ((-angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const segmentIndex    = Math.floor(normalizedAngle / segmentAngle) % names.length;
      color = this._theme.colors[segmentIndex % this._theme.colors.length];
    }
    this.pointerColor = color;

    this._ctx.save();
    this._ctx.translate(cx, cy);
    this._ctx.shadowColor   = t.ptrShadow;
    this._ctx.shadowBlur    = t.ptrShadowBlur;
    this._ctx.shadowOffsetX = t.ptrShadowX;
    this._ctx.shadowOffsetY = t.ptrShadowY;

    this._ctx.beginPath();
    this._ctx.moveTo(r - t.ptrOverlap,  0);             // tip — inside the wheel
    this._ctx.lineTo(r + t.ptrReach,   -t.ptrHeight);   // top-right base
    this._ctx.lineTo(r + t.ptrReach,    t.ptrHeight);   // bottom-right base
    this._ctx.closePath();

    this._ctx.fillStyle = color;
    this._ctx.fill();

    this._ctx.shadowBlur    = 0;
    this._ctx.shadowOffsetX = 0;
    this._ctx.shadowOffsetY = 0;
    this._ctx.strokeStyle   = t.ptrStroke;
    this._ctx.lineWidth     = t.ptrLineWidth;
    this._ctx.stroke();

    this._ctx.restore();
  }

  /** @private */
  _drawEmpty(cx, cy, r, t) {
    this._ctx.beginPath();
    this._ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    this._ctx.fillStyle   = t.emptyFill;
    this._ctx.fill();
    this._ctx.strokeStyle = t.emptyStroke;
    this._ctx.lineWidth   = t.emptyLineWidth;
    this._ctx.stroke();

    // "Add names to get started" is an HTML overlay — see #emptyHint in index.html
    this._drawPointer(cx, cy, r, [], 0, t);
  }

  /** @private */
  _drawSingleSegment(cx, cy, r, name, t) {
    this._ctx.beginPath();
    this._ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    this._ctx.fillStyle   = this._theme.colors[0];
    this._ctx.fill();
    this._ctx.strokeStyle = t.ringStroke;
    this._ctx.lineWidth   = t.ringLineWidth;
    this._ctx.stroke();

    this._ctx.save();
    this._ctx.shadowColor  = t.textShadow;
    this._ctx.shadowBlur   = t.textShadowBlur;
    this._ctx.fillStyle    = t.textColor;
    this._ctx.font         = `${t.textWeight} ${t.singleSize}px ${t.font}`;
    this._ctx.textAlign    = t.textAlignCenter;
    this._ctx.textBaseline = t.textBaseline;
    this._ctx.fillText(name, cx, cy);
    this._ctx.restore();

    this._drawHub(cx, cy, t);
    this._drawPointer(cx, cy, r, [name], 0, t);
  }

  /** @private */
  _drawHub(cx, cy, t) {
    const layers = [
      [t.hubR1, t.hubOuter],
      [t.hubR2, t.hubMid],
      [t.hubR3, t.hubInner],
    ];
    layers.forEach(([radius, fill]) => {
      this._ctx.beginPath();
      this._ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      this._ctx.fillStyle = fill;
      this._ctx.fill();
    });
  }
}

/* ── CONFETTI ────────────────────────────────────────────────────────────────
   Canvas-based confetti burst triggered when a winner is revealed.
────────────────────────────────────────────────────────────────────────────── */

class Confetti {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._raf    = null;
    this._particles = [];
    this._colors = ['#FF3BA7','#00E5FF','#3DDE4C','#FF6B35','#BF5FFF','#FFE600','#FF0099','#00FF87','#FF4500','#7B2FFF'];
  }

  start() {
    this._canvas.width  = window.innerWidth;
    this._canvas.height = window.innerHeight;
    this._particles = Array.from({ length: 160 }, () => this._spawn());
    this._canvas.style.display = 'block';
    if (this._raf) cancelAnimationFrame(this._raf);
    const tick = () => {
      this._draw();
      if (this._particles.length > 0) {
        this._raf = requestAnimationFrame(tick);
      } else {
        this._canvas.style.display = 'none';
        this._raf = null;
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._canvas.style.display = 'none';
    this._particles = [];
  }

  _spawn() {
    const color = this._colors[Math.floor(Math.random() * this._colors.length)];
    return {
      x:    Math.random() * window.innerWidth,
      y:    -10 - Math.random() * 120,
      vx:   (Math.random() - 0.5) * 5,
      vy:   1.5 + Math.random() * 4,
      rot:  Math.random() * 360,
      rotV: (Math.random() - 0.5) * 12,
      w:    6 + Math.random() * 10,
      h:    4 + Math.random() * 6,
      color,
      round: Math.random() > 0.65,
      alpha: 1,
      life:  1,
      decay: 0.004 + Math.random() * 0.004,
    };
  }

  _draw() {
    const { width: W, height: H } = this._canvas;
    this._ctx.clearRect(0, 0, W, H);

    this._particles = this._particles.filter(p => p.alpha > 0.05 && p.y < H + 30);

    for (const p of this._particles) {
      p.x   += p.vx;
      p.y   += p.vy;
      p.vy  += 0.09;  // gravity
      p.vx  *= 0.992; // air resistance
      p.rot += p.rotV;
      p.life  -= p.decay;
      p.alpha  = Math.max(0, p.life);

      this._ctx.save();
      this._ctx.globalAlpha = p.alpha;
      this._ctx.translate(p.x, p.y);
      this._ctx.rotate((p.rot * Math.PI) / 180);
      this._ctx.fillStyle = p.color;

      if (p.round) {
        this._ctx.beginPath();
        this._ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        this._ctx.fill();
      } else {
        this._ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }

      this._ctx.restore();
    }
  }
}

/* ── WHEEL APP ───────────────────────────────────────────────────────────────
   Orchestrates state, persistence, events, and rendering.
   The only class that mutates application state.
────────────────────────────────────────────────────────────────────────────── */

class WheelApp {
  /**
   * @param {object}        deps
   * @param {object}        deps.dom       Pre-resolved DOM reference map
   * @param {WheelRenderer} deps.renderer
   * @param {AudioManager}  deps.audio
   * @param {Theme}         deps.theme
   * @param {object}        deps.config    Full CONFIG object
   */
  constructor({ dom, renderer, audio, theme, config, confetti }) {
    this._dom      = dom;
    this._renderer = renderer;
    this._audio    = audio;
    this._theme    = theme;
    this._cfg      = config;
    this._confetti = confetti;

    // ── Application state ──────────────────────────────────────────────────
    this._names      = [];
    this._removed    = [];
    this._winners    = [];
    this._angle      = 0;
    this._spinning   = false;
    this._lastWinner = -1;
    this._idleRaf    = null;
    this._hasSpun    = false;
  }

  /** Bootstrap: load persisted data, bind events, start resize observation. */
  init() {
    this._theme.load();
    this._loadFromStorage();
    this._bindEvents();
    this._setupResizeObserver();
    this._renderList();
    this._renderRemoved();
    this._startIdleRotation();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  _loadFromStorage() {
    const loadStrings = key => {
      try {
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(raw)
          ? raw.filter(item => typeof item === 'string' && item.trim().length > 0)
          : [];
      } catch (err) {
        console.warn(`Failed to load "${key}" from localStorage`, err);
        return [];
      }
    };

    const loadWinners = key => {
      try {
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(raw)
          ? raw.filter(item => item && typeof item === 'object' && typeof item.name === 'string')
          : [];
      } catch (err) {
        console.warn(`Failed to load "${key}" from localStorage`, err);
        return [];
      }
    };

    this._names    = loadStrings(this._cfg.storage.names);
    this._removed  = loadStrings(this._cfg.storage.removed);
    this._winners  = loadWinners(this._cfg.storage.winners);
  }

  _save()         { localStorage.setItem(this._cfg.storage.names,    JSON.stringify(this._names)); }
  _saveRemoved()  { localStorage.setItem(this._cfg.storage.removed,  JSON.stringify(this._removed)); }
  _saveWinners()  { localStorage.setItem(this._cfg.storage.winners,  JSON.stringify(this._winners)); }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    const d = this._dom;
    d.nameInput   .addEventListener('keydown', e => { if (e.key === 'Enter') this._addName(); });
    d.btnAdd      .addEventListener('click',   () => this._addName());
    d.bulkToggle  .addEventListener('click',   () => this._toggleBulk());
    d.btnBulkAdd  .addEventListener('click',   () => this._addBulk());
    d.btnBulkClear.addEventListener('click',   () => this._clearBulk());
    d.btnClearPast.addEventListener('click',   () => this._clearPast());
    d.overlay     .addEventListener('click',   e  => { if (e.target === d.overlay) this._closeModal(); });
    d.btnClose    .addEventListener('click',   () => this._removeWinner());
    d.btnRemove   .addEventListener('click',   () => this._closeModal());
    d.canvas      .addEventListener('click',   () => this._spin());
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  /**
   * Observes the `.main` container with ResizeObserver instead of listening
   * to `window.resize`. The observer fires whenever the content area changes,
   * including when CSS switches between desktop (panel fixed) and mobile
   * (panel stacked) layouts — no hardcoded breakpoint needed in JavaScript.
   */
  _setupResizeObserver() {
    const ro = new ResizeObserver(() => requestAnimationFrame(() => this._resize()));
    ro.observe(this._dom.main);
    this._resize(); // size synchronously before first paint
  }

  /**
   * Computes and applies the correct canvas size for the current viewport.
   *
   * Desktop vs mobile layout is determined by reading the computed `position`
   * of the names panel directly from CSS. The breakpoint lives in style.css;
   * JavaScript simply reacts to whatever CSS has decided.
   * - `position: fixed`  → panel floats outside the flow → subtract its width
   * - `position: static` → panel stacks in the flow     → no subtraction needed
   */
  _resize() {
    this._theme.load(); // reload CSS vars — media queries may have changed them
    const { canvas: c } = this._cfg;

    const panelIsFixed = getComputedStyle(this._dom.namesPanel).position === 'fixed';
    const headerH      = this._dom.header?.offsetHeight ?? 80;
    const hPad         = panelIsFixed ? c.hPadDesktop  : c.hPadMobile;

    const maxH = window.innerHeight - headerH - c.vPad;
    const maxW = window.innerWidth  - hPad;
    const size = Math.max(c.minSize, Math.min(maxH, maxW, c.maxSize));

    if (size === this._lastSize) return;
    this._lastSize = size;

    this._renderer.setSize(size);
    this._renderer.draw(this._names, this._angle);
  }

  // ── Data mutations ────────────────────────────────────────────────────────

  _addName() {
    const value = this._dom.nameInput.value.trim();
    if (!value) { this._dom.nameInput.focus(); return; }
    this._names.push(value);
    this._dom.nameInput.value = '';
    this._dom.nameInput.focus();
    this._save();
    this._renderList();
    this._renderer.draw(this._names, this._angle);
  }

  _removeName(i) {
    this._names.splice(i, 1);
    this._save();
    this._renderList();
    this._renderer.draw(this._names, this._angle);
  }

  // ── Bulk add ──────────────────────────────────────────────────────────────

  _toggleBulk() {
    const isOpen = this._dom.bulkArea.classList.toggle('open');
    this._dom.bulkToggle.classList.toggle('open', isOpen);
    if (isOpen) this._dom.bulkInput.focus();
  }

  _addBulk() {
    const added = this._dom.bulkInput.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length <= 25);

    if (added.length === 0) return;

    this._names.push(...added);
    this._save();
    this._renderList();
    this._renderer.draw(this._names, this._angle);

    this._dom.bulkInput.value = '';
    this._dom.bulkArea  .classList.remove('open');
    this._dom.bulkToggle.classList.remove('open');
  }

  _clearBulk() {
    this._dom.bulkInput.value = '';
    this._dom.bulkInput.focus();
  }

  // ── UI rendering ──────────────────────────────────────────────────────────

  _renderList() {
    const d = this._dom;
    d.namesList.innerHTML = '';

    this._names.forEach((name, i) => {
      const color  = this._theme.colors[i % this._theme.colors.length];
      const frag   = d.tmplNameItem.cloneNode(true);
      const li     = frag.querySelector('li');
      const label  = frag.querySelector('.name-label');
      const btnDel = frag.querySelector('.btn-del');

      li.style.setProperty('--item-color', color);
      label.textContent = name;  // textContent auto-escapes — no manual escaping needed
      label.title       = name;
      btnDel.addEventListener('click', () => this._removeName(i));

      d.namesList.appendChild(frag);
    });

    // Status message copy is sourced from data-attributes on the element —
    // the strings live in HTML, not hardcoded in JavaScript.
    const count = this._names.length;
    const el    = d.statusMsg;
    el.textContent = count === 0 ? el.dataset.msgEmpty
                   : count === 1 ? el.dataset.msgOne
                   : `${count} ${el.dataset.msgMany}`;
    el.classList.toggle('warn', count < 2);

    this._updateWheelState();
  }

  _renderRemoved() {
    const d = this._dom;

    if (this._winners.length === 0) {
      d.pastSection.classList.remove('visible');
      return;
    }

    d.pastSection.classList.add('visible');
    d.pastList.innerHTML = '';

    this._winners.forEach(winner => {
      const { name, color } = typeof winner === 'object' ? winner : { name: winner, color: null };
      const frag = d.tmplPastItem.cloneNode(true);
      const li   = frag.querySelector('li');
      const span = frag.querySelector('.past-name');
      if (color) li.style.setProperty('--item-color', color);
      span.textContent = name;  // textContent auto-escapes — safe
      span.title       = name;
      d.pastList.appendChild(frag);
    });
  }

  /**
   * Reflects the current interaction state onto `data-wheel-state` on the
   * wheel wrapper, letting CSS drive cursor styling via attribute selectors
   * with no manual cursor-class juggling in JavaScript.
   *
   * States:
   *   spinning → wheel is animating, clicks ignored
   *   empty    → fewer than 2 names, cannot spin
   *   ready    → can spin (default pointer cursor)
   *
   * Also shows/hides the two canvas overlay hints.
   */
  _syncSpinHint() {
    const color = this._renderer.pointerColor;
    if (color) {
      this._dom.spinHint.style.background = color;
      this._dom.headerH1.style.color = color;
    }
  }

  _updateWheelState() {
    this._dom.wheelWrapper.dataset.wheelState =
      this._spinning         ? 'spinning'
      : this._names.length < 2 ? 'empty'
      : 'ready';

    this._dom.spinHint .classList.toggle('hidden', this._hasSpun || this._spinning || this._names.length < 2);
    this._dom.emptyHint.classList.toggle('hidden', this._names.length !== 0);
  }

  // ── Idle rotation ─────────────────────────────────────────────────────────

  _startIdleRotation() {
    if (this._idleRaf) return; // already running
    let lastTime = null;

    const idleFrame = t => {
      if (this._spinning) { this._idleRaf = null; return; } // spin takes over
      if (lastTime !== null) {
        this._angle = (this._angle + this._cfg.idle.speed * (t - lastTime)) % (2 * Math.PI);
        this._renderer.draw(this._names, this._angle);
        this._syncSpinHint();
      }
      lastTime      = t;
      this._idleRaf = requestAnimationFrame(idleFrame);
    };

    this._idleRaf = requestAnimationFrame(idleFrame);
  }

  // ── Spin ──────────────────────────────────────────────────────────────────

  /**
   * Starts the spin animation towards a randomly chosen winner.
   *
   * Target angle is computed so the winner segment's centre lands exactly at
   * angle 0 (where the pointer sits on the right side of the wheel).
   * Animation uses an ease-out cubic curve; AudioManager tick sounds fire for
   * each segment boundary the pointer crosses during the animation.
   */
  _spin() {
    if (this._spinning || this._names.length < 2) return;

    this._spinning = true;
    this._hasSpun  = true;
    if (this._idleRaf) { cancelAnimationFrame(this._idleRaf); this._idleRaf = null; }
    this._updateWheelState();

    const { minRotations, rotationRange, minDuration, extraDuration, winnerDelay } = this._cfg.spin;
    const { maxCrossings, staggerMs, volumeMin, volumeFade } = this._cfg.tick;

    const nameCount    = this._names.length;
    const segmentAngle = (2 * Math.PI) / nameCount;
    const winnerIdx    = Math.floor(Math.random() * nameCount);

    // Forward delta: the shortest forward rotation that lands the winner at the pointer
    const winnerCenter = winnerIdx * segmentAngle + segmentAngle / 2;
    let   delta        = ((-winnerCenter - this._angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

    // Pad with minimum full rotations so the spin always feels substantial
    delta += (minRotations + Math.floor(Math.random() * rotationRange)) * 2 * Math.PI;

    const startAngle   = this._angle;
    const duration     = minDuration + Math.random() * extraDuration;
    const startTime    = performance.now();
    let   prevBoundary = Math.floor(startAngle / segmentAngle);

    const frame = t => {
      const progress = Math.min((t - startTime) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      this._angle = startAngle + delta * eased;
      this._renderer.draw(this._names, this._angle);
      this._syncSpinHint();

      // Fire a tick for every segment boundary crossed this frame
      const currBoundary = Math.floor(this._angle / segmentAngle);
      const crossings    = Math.min(currBoundary - prevBoundary, maxCrossings);
      if (crossings > 0) {
        const volume = Math.max(volumeMin, 1 - progress * volumeFade);
        for (let c = 0; c < crossings; c++) {
          setTimeout(() => this._audio.playTick(volume), c * staggerMs);
        }
      }
      prevBoundary = currBoundary;

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        // Normalise to [0, 2π) to prevent floating-point drift over many spins
        this._angle      = ((startAngle + delta) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        this._spinning   = false;
        this._lastWinner = winnerIdx;
        this._updateWheelState();
        const winnerColor = this._theme.colors[winnerIdx % this._theme.colors.length];
        setTimeout(() => this._showWinner(this._names[winnerIdx], winnerColor), winnerDelay);
        // Idle rotation resumes only after the modal is dismissed — see _closeModal()
      }
    };

    requestAnimationFrame(frame);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  _showWinner(name, color) {
    this._winners.push({ name, color });
    this._saveWinners();
    this._renderRemoved();
    this._dom.modalName.textContent        = name;
    this._dom.modalName.style.color        = color || '';
    this._dom.btnClose.style.background    = color || '';
    this._dom.overlay.classList.add('open');
    this._confetti.start();
  }

  _closeModal() {
    this._confetti.stop();
    this._dom.overlay.classList.remove('open');
    this._startIdleRotation(); // wheel resumes slow rotation once popup is dismissed
  }

  _removeWinner() {
    if (this._lastWinner < 0 || this._lastWinner >= this._names.length) {
      this._closeModal();
      return;
    }
    const [name]     = this._names.splice(this._lastWinner, 1);
    this._lastWinner = -1;
    this._removed.push(name);
    this._save();
    this._saveRemoved();
    this._renderList();
    this._renderRemoved();
    this._renderer.draw(this._names, this._angle);
    this._closeModal();
  }

  // ── Past candidates ─────────────────────────────────────────────────────

  _clearPast() {
    this._winners = [];
    this._saveWinners();
    this._renderRemoved();
  }
}

/* ── BOOTSTRAP ───────────────────────────────────────────────────────────────
   Resolve all DOM references once, assemble dependencies, start the app.
────────────────────────────────────────────────────────────────────────────── */

(function bootstrap() {
  const dom = {
    canvas:       document.getElementById('wheel'),
    nameInput:    document.getElementById('nameInput'),
    namesList:    document.getElementById('namesList'),
    statusMsg:    document.getElementById('statusMsg'),
    bulkToggle:   document.getElementById('bulkToggle'),
    bulkArea:     document.getElementById('bulkArea'),
    bulkInput:    document.getElementById('bulkInput'),
    spinHint:     document.getElementById('spinHint'),
    headerH1:     document.querySelector('header h1'),
    emptyHint:    document.getElementById('emptyHint'),
    overlay:      document.getElementById('overlay'),
    modalName:    document.getElementById('modalName'),
    pastSection:  document.getElementById('pastSection'),
    pastList:     document.getElementById('pastList'),
    main:         document.querySelector('.main'),
    header:       document.querySelector('header'),
    wheelWrapper: document.querySelector('.wheel-wrapper'),
    namesPanel:   document.querySelector('.names-panel'),
    btnAdd:       document.querySelector('.btn-add'),
    btnBulkAdd:   document.querySelector('.btn-bulk-add'),
    btnBulkClear: document.querySelector('.btn-bulk-clear'),
    btnClearPast: document.querySelector('.btn-clear-past'),
    btnClose:     document.querySelector('.btn-close'),
    btnRemove:    document.querySelector('.btn-remove'),
    tmplNameItem: document.getElementById('tmpl-name-item').content,
    tmplPastItem: document.getElementById('tmpl-past-item').content,
  };

  const theme    = new Theme();
  const renderer = new WheelRenderer(dom.canvas, theme, CONFIG);
  const audio    = new AudioManager(CONFIG);
  const confetti = new Confetti(document.getElementById('confetti-canvas'));
  const app      = new WheelApp({ dom, renderer, audio, theme, config: CONFIG, confetti });

  app.init();
})();
