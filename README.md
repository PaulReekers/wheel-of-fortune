# Wheel of Terror

An interactive, browser-based name-picker wheel built with plain HTML, CSS, and JavaScript — no frameworks, no build tools. Just open and spin.

---

## Preview

> Open `index.html` via a local server (see [Getting Started](#getting-started)) and spin the wheel!

---

## Features

- **Spin the wheel** — lands on a randomly chosen participant with a satisfying ease-out animation
- **Tick sounds** — synthesised click audio fires on every segment crossing, fading as the wheel slows
- **Confetti burst** — canvas-based confetti rains down when the winner is revealed
- **Add names** one by one or paste an entire list at once (bulk add)
- **Remove names** individually from the list
- **Winner history** — past picks are tracked with their segment colour
- **Persisted in localStorage** — names, past candidates and winner history survive a page refresh
- **Y2K / dopamine colour palette** — all visual tokens live in CSS custom properties
- **Responsive** — full-screen slide-up panel on mobile, fixed side panel on desktop
- **Hamburger toggle** — GSAP-animated panel open/close with a backdrop, adapts per breakpoint via `gsap.matchMedia()`

---

## File Structure

```
wheel-of-fortune/
│
├── index.html              ← Page structure + inline GSAP animation IIFEs
│
├── css/
│   └── style.css           ← All styling (design tokens, layout, responsive)
│
├── js/
│   └── app.js              ← All wheel logic (class-based, no framework)
│
├── favicon.ico             ← Browser tab icon
├── favicon.svg
├── favicon-96x96.png
├── apple-touch-icon.png
├── web-app-manifest-192x192.png
├── web-app-manifest-512x512.png
├── site.webmanifest        ← PWA configuration
│
├── .gitignore
└── README.md               ← You are here
```

---

## Getting Started

The app links external CSS and JS files, so it must be served via a local web server — opening `index.html` directly as `file://` won't work.

### Option 1 — Python (built into macOS / Linux)

```bash
cd wheel-of-fortune
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

### Option 2 — VS Code Live Server

1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → **Open with Live Server**

### Option 3 — Node.js

```bash
npx serve .
```

---

## Architecture

### HTML (`index.html`)

Pure structure — no inline styles or logic. Contains:

- Page header with the animated title word
- Canvas element for the wheel
- Names panel (candidates list, bulk-add textarea)
- Hamburger button + backdrop overlay (panel toggle)
- Winner modal
- Confetti canvas
- Three inline `<script>` IIFEs loaded after GSAP:
  - **Hamburger / panel toggle** — `gsap.matchMedia()` contexts for desktop and mobile
  - **Word transition** — rotating GSAP entrance/exit animations on the header subtitle

### CSS (`css/style.css`)

All design lives here. Key sections:

| Section | What it controls |
|---|---|
| `:root` design tokens | Colour palette, canvas values, pointer geometry |
| Layout | Flexbox-based page structure |
| Wheel | Canvas sizing, pointer, spin-hint pill |
| Names panel | Fixed side panel (desktop) / full-screen drawer (mobile) |
| Hamburger | Fixed toggle button, bar styling |
| Panel backdrop | Dark overlay behind the open panel |
| Winner modal | Pop-in animation, buttons |
| Confetti canvas | Full-screen fixed overlay |
| `@media (max-width: 768px)` | Full-screen panel, stacked layout |

Visual values (colours, sizes, spacing) are defined as CSS custom properties on `:root` and read by JavaScript via `getComputedStyle` — the stylesheet is the single source of truth for all visual tokens.

### JavaScript (`js/app.js`)

Class-based, no framework. Four classes assembled in a bootstrap IIFE:

| Class | Responsibility |
|---|---|
| `Theme` | Reads all CSS custom properties into a plain object for use by the Canvas API |
| `AudioManager` | Lazy Web Audio context; synthesises a noise-burst click on each segment crossing |
| `WheelRenderer` | Stateless — draws segments, labels, hub, outer ring and pointer onto the canvas |
| `Confetti` | Canvas-based particle system triggered on winner reveal |
| `WheelApp` | Owns all mutable state; orchestrates persistence, events, resize and spin logic |

---

## Canvas Wheel

The wheel is drawn with the **HTML Canvas 2D API**.

```
canvas.getContext('2d')  →  drawing context
ctx.arc()                →  segment arcs
ctx.rotate()             →  rotated text labels
ctx.translate()          →  origin shifts for hub / pointer
```

Each segment angle:

```js
const segmentAngle = (2 * Math.PI) / names.length;
```

`2 * Math.PI` = one full circle in radians (~6.28). The wheel radius fills the canvas to the edge; only the ring stroke and pointer tip need a few pixels of clearance (`margin: 4` in `CONFIG`).

---

## Spin Animation

Uses `requestAnimationFrame` with an **ease-out cubic** curve so the wheel decelerates naturally:

```js
const eased = 1 - Math.pow(1 - progress, 3);
```

The winner is chosen **before** the animation starts. The target angle is calculated so the winner's segment centre lands exactly at the pointer position when the animation ends.

---

## Audio

The Web Audio API synthesises a short noise burst (no audio files needed):

- White noise shaped with an exponential decay → crisp click
- High-pass filter removes low-frequency rumble
- Volume fades from `1.0` → `volumeMin` as the wheel slows
- Up to `maxCrossings` ticks per frame, staggered by `staggerMs` to avoid clicks overlapping

---

## Hamburger Panel

Managed by `gsap.matchMedia()` with two separate contexts:

| Breakpoint | Panel behaviour | Easing |
|---|---|---|
| `≥ 769 px` (desktop) | Slides in from right (`xPercent 110 → 0`) | `back.out(1.4)` |
| `≤ 768 px` (mobile) | Rises full-screen from bottom (`yPercent 100 → 0`) | `power2.out` |

When the viewport crosses the breakpoint, GSAP automatically calls the cleanup function, which kills the old timeline, clears inline transforms and resets the hamburger icon.

The CSS uses the standalone `translate` property (separate from `transform`) for the desktop vertical-centring trick, so GSAP's `transform` management never conflicts with it.

---

## localStorage

Three keys are used:

| Key | Content |
|---|---|
| `wof_names_v1` | Current list of participants (`string[]`) |
| `wof_removed_v1` | Names removed after being picked (`string[]`) |
| `wof_winners_v1` | Winner history with segment colour (`{name, color}[]`) |

---

## Possible Improvements

- [ ] Let users **customise colours** per segment
- [ ] Allow **importing** a `.txt` or `.csv` file with names
- [ ] Add a **dark / light mode** toggle
- [ ] Make the app **installable** as a PWA (the `site.webmanifest` is already in place)
- [ ] Add a **spin count** or statistics view

---

## Built With

| Technology | Purpose |
|---|---|
| HTML5 | Page structure |
| CSS3 | Styling, design tokens, responsive layout |
| JavaScript ES2020+ | Logic, interactivity, class-based architecture |
| Canvas API | Drawing the wheel and confetti |
| Web Audio API | Synthesised tick sounds |
| GSAP 3 | Panel animations, `matchMedia` breakpoint handling, header word transitions |
| localStorage | Persisting names, removed candidates and winner history |
| Google Fonts | Fredoka + Nunito typefaces |

---

## License

Free to use for educational purposes.
