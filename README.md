# 🎡 Wheel of Fortune

An interactive, browser-based Wheel of Fortune built with plain HTML, CSS, and JavaScript — no frameworks, no build tools, no dependencies.

---

## 📸 Preview

> Open `index.html` via a local server (see [Getting Started](#getting-started)) and spin the wheel!

---

## ✨ Features

- 🎯 Spin the wheel and land on a random participant
- ➕ Add names one by one or paste an entire list at once
- 🗑️ Remove individual names from the list
- ✅ Track past participants — see who has already been picked
- 💾 All data is saved in **localStorage** (persists after refresh)
- 📱 Fully **responsive** — works on desktop and mobile

---

## 📁 File Structure

```
wheel-of-fortune/
│
├── index.html              ← Page structure (HTML only)
│
├── css/
│   └── style.css           ← All styling
│
├── js/
│   └── app.js              ← All logic and interactivity
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

> **Why split into separate files?**
> Keeping HTML, CSS, and JavaScript in separate files makes the code easier to read, maintain, and debug. Each file has one clear responsibility.

---

## 🚀 Getting Started

Because the app uses **external files** (CSS and JS linked via `<link>` and `<script src="">`), it must be served through a local web server. Opening `index.html` directly as a file (`file://`) won't work correctly.

### Option 1 — Python (built into macOS/Linux)

```bash
cd wheel-of-fortune
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

### Option 2 — VS Code Live Server

1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → **Open with Live Server**

### Option 3 — Node.js

```bash
npx serve .
```

---

## 🧠 How It Works

### HTML (`index.html`)
The HTML file only contains **structure** — no styling or logic. It defines:
- The page header
- The canvas element where the wheel is drawn
- The names panel with input fields
- The winner modal (hidden by default)

### CSS (`css/style.css`)
The stylesheet handles all **visual design**:
- Layout using **Flexbox**
- Animations with `@keyframes`
- Responsive design using `@media` queries
- CSS custom states like `.overlay.open` and `.past-section.visible`

### JavaScript (`js/app.js`)
The JavaScript handles all **interactivity and logic**, split into clear sections:

| Section | What it does |
|---|---|
| `CONSTANTS` | Colour palette for wheel segments |
| `STATE` | Variables that track the current app state |
| `INIT` | Runs once on page load to set everything up |
| `DATA` | Add, remove and save names to localStorage |
| `BULK ADD` | Paste and process a list of names at once |
| `LIST UI` | Render the names list in the sidebar |
| `CANVAS DRAW` | Draw the wheel using the HTML `<canvas>` API |
| `SPIN` | Animate the wheel and determine the winner |
| `MODAL` | Show and hide the winner popup |
| `PAST PARTICIPANTS` | Track and display who has already been picked |

---

## 🎨 The Canvas Wheel

The wheel is drawn using the **HTML Canvas API** — a built-in browser feature for drawing shapes and graphics with JavaScript.

```
canvas.getContext('2d')  →  gives access to drawing tools
ctx.arc()                →  draws a curved line (used for segments)
ctx.fillStyle            →  sets the fill colour
ctx.rotate()             →  rotates the drawing context for text
```

Each segment is calculated based on the number of names:

```js
const segmentAngle = (2 * Math.PI) / names.length;
```

`2 * Math.PI` = one full circle in **radians** (≈ 6.28). Dividing by the number of names gives the angle for each segment.

---

## 🌀 The Spin Animation

The spin uses `requestAnimationFrame` — the browser's built-in animation loop — combined with an **easing function** to make the wheel slow down gradually.

```js
// Ease-out cubic: starts fast, ends slow
const eased = 1 - Math.pow(1 - progress, 3);
```

The winner is chosen **before** the animation starts. The wheel then rotates to land exactly on that person's segment.

---

## 💾 localStorage

`localStorage` is a simple browser-based key/value store. Data saved here survives page refreshes.

```js
// Save
localStorage.setItem('key', JSON.stringify(data));

// Load
const data = JSON.parse(localStorage.getItem('key') || '[]');
```

This app uses two keys:
- `wof_names_v1` — the current list of participants
- `wof_removed_v1` — the list of past participants

---

## 🛠️ Possible Improvements

Looking to extend this project? Here are some ideas:

- [ ] Add a **confetti animation** when the winner is shown
- [ ] Let users **customise colours** per segment
- [ ] Add a **sound effect** when spinning
- [ ] Allow **importing** a `.txt` or `.csv` file with names
- [ ] Add a **dark/light mode** toggle
- [ ] Make the app **installable** as a PWA (the `site.webmanifest` is already in place!)

---

## 🧰 Built With

| Technology | Purpose |
|---|---|
| HTML5 | Page structure |
| CSS3 | Styling and animations |
| JavaScript (ES6+) | Logic and interactivity |
| Canvas API | Drawing the wheel |
| localStorage | Persisting data |
| RealFaviconGenerator | Favicon across all platforms |

---

## 📄 License

Free to use for educational purposes.
