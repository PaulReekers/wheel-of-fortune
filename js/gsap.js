'use strict';

/* ── GSAP INITIALISATION ──────────────────────────────────────────────────────
   Registers GSAP plugins and wires up the drag-to-spin interaction.

   Load order in index.html:
     gsap.min.js → Draggable.min.js → InertiaPlugin.min.js → gsap.js → app.js

   app.js dispatches the 'wheelapp:ready' custom event from its bootstrap IIFE
   once the WheelApp instance is fully initialised. This file listens for that
   event and then calls _setupDragToSpin(app) to bind the Draggable.
────────────────────────────────────────────────────────────────────────────── */

// ── Plugin registration ────────────────────────────────────────────────────
// Must run synchronously so plugins are registered before any Draggable
// instances are created in _setupDragToSpin below.

(function registerPlugins() {
  if (typeof gsap === 'undefined') return;
  const plugins = [
    typeof Draggable     !== 'undefined' ? Draggable     : null,
    typeof InertiaPlugin !== 'undefined' ? InertiaPlugin : null,
  ].filter(Boolean);
  if (plugins.length) gsap.registerPlugin(...plugins);
}());

// ── Drag-to-spin config ────────────────────────────────────────────────────

const DRAG_CONFIG = {
  minVelocity: 100, // deg/s — minimum release speed that triggers a spin
  historyMs:    80, // ms of drag history kept for velocity calculation
};

// ── Initialisation hook ────────────────────────────────────────────────────
// app.js dispatches 'wheelapp:ready' synchronously at the end of its bootstrap
// IIFE. By the time scripts at the bottom of <body> run, the DOM is already
// parsed — but we guard defensively with a readyState check.

document.addEventListener('wheelapp:ready', function ({ detail }) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      _setupDragToSpin(detail.app);
    });
  } else {
    _setupDragToSpin(detail.app);
  }
});

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Returns true when the pointer falls inside the circular wheel area.
 * The proxy div covers the full square bounding box, so corner presses
 * would fire without this check.
 * @param {WheelApp} app
 * @param {number}   clientX
 * @param {number}   clientY
 */
function _isOnWheel(app, clientX, clientY) {
  const rect = app._dom.canvas.getBoundingClientRect();
  const cx   = rect.left + rect.width  / 2;
  const cy   = rect.top  + rect.height / 2;
  const r    = rect.width / 2 - app._cfg.canvas.margin;
  return (clientX - cx) ** 2 + (clientY - cy) ** 2 <= r * r;
}

/**
 * Wires drag-to-spin via GSAP Draggable.
 *
 * An invisible proxy div is positioned over the canvas. GSAP rotates the
 * proxy; onDrag converts the rotation delta to radians and applies it to
 * app._angle, then redraws. The canvas itself is never CSS-rotated, so the
 * pointer arrow stays fixed.
 *
 * On release, if the trailing-window velocity exceeds DRAG_CONFIG.minVelocity,
 * app._spin() is called — the same path as the spin button — so winner
 * selection, animation, and the winner popup work identically.
 *
 * Falls back to a plain canvas click listener when Draggable is unavailable.
 *
 * @param {WheelApp} app  The fully-initialised WheelApp instance from app.js
 */
function _setupDragToSpin(app) {
  const { minVelocity, historyMs } = DRAG_CONFIG;

  // Attach drag state used by WheelApp._updateWheelState
  app._drag          = { active: false, hasMoved: false };
  app._suppressClick = false;

  if (typeof Draggable === 'undefined') {
    // Graceful fallback: plain click-to-spin when Draggable did not load
    app._dom.canvas.addEventListener('click', function () { app._spin(); });
    return;
  }

  // Invisible proxy div overlaid on the canvas. GSAP rotates this element;
  // we sync its rotation delta to _angle and redraw the canvas each frame.
  const proxy = document.createElement('div');
  proxy.className = 'wheel-drag-proxy';
  app._dom.wheelWrapper.appendChild(proxy);

  // The proxy sits on top of the canvas and intercepts all pointer events,
  // so click-to-spin is registered here rather than on the canvas element.
  proxy.addEventListener('click', function (e) {
    if (app._suppressClick) { app._suppressClick = false; return; }
    if (!_isOnWheel(app, e.clientX, e.clientY)) return; // ignore corner taps
    app._spin();
  });

  let prevRot   = 0;      // degrees — proxy rotation at the last onDrag frame
  let blockDrag = false;  // true when spinning or press landed outside the wheel
  const history = [];     // [{ rot: deg, t: ms }] trailing window for velocity calc

  Draggable.create(proxy, {
    type: 'rotation',
    allowNativeTouchScrolling: false,

    // Regular functions (not arrow) so 'this' = Draggable instance in onDrag/onDragEnd

    onPress: function (e) {
      if (app._spinning || !_isOnWheel(app, e.clientX, e.clientY)) {
        blockDrag = true;
        return;
      }
      blockDrag = false;

      if (app._idleRaf) { cancelAnimationFrame(app._idleRaf); app._idleRaf = null; }

      // Reset proxy each gesture so rotation always starts at 0
      gsap.set(proxy, { rotation: 0 });
      prevRot        = 0;
      history.length = 0;
      history.push({ rot: 0, t: performance.now() });

      app._drag.active   = true;
      app._drag.hasMoved = false;
      app._hasSpun       = true;
      app._updateWheelState();
    },

    onDrag: function () {
      if (blockDrag) return;

      // 'this' is the Draggable instance here
      const rot   = this.rotation;                       // degrees
      const delta = (rot - prevRot) * (Math.PI / 180);  // → radians
      prevRot     = rot;

      const now    = performance.now();
      history.push({ rot, t: now });
      // Keep only samples within the trailing velocity window
      const cutoff = now - historyMs;
      while (history.length > 1 && history[0].t < cutoff) history.shift();

      app._drag.hasMoved = true;
      app._angle        += delta;
      app._renderer.draw(app._names, app._angle);
      app._syncSpinHint();
    },

    onDragEnd: function () {
      if (blockDrag) { blockDrag = false; return; }

      app._drag.active = false;
      app._updateWheelState();

      // Compute release velocity (deg/s) from the trailing history window
      let velDeg = 0;
      if (history.length >= 2) {
        const first = history[0];
        const last  = history[history.length - 1];
        const dt    = last.t - first.t;
        if (dt > 0) velDeg = (last.rot - first.rot) / dt * 1000;
      }

      gsap.set(proxy, { rotation: 0 }); // reset for the next gesture

      if (!app._drag.hasMoved) {
        app._startIdleRotation();
        return;
      }

      // Suppress the browser click that fires after pointer-up so a drag
      // gesture never double-triggers spin
      app._suppressClick = true;
      setTimeout(function () { app._suppressClick = false; }, 400);

      if (Math.abs(velDeg) < minVelocity || app._names.length < 2) {
        app._startIdleRotation();
        return;
      }

      // Hand off to the same _spin() used by the button — picks winner,
      // runs the ease-out animation, and shows the winner modal
      app._spin();
    },
  });
}
