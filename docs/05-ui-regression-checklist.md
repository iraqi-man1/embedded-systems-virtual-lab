# 05 — UI regression checklist

Floating UI (menus, submenus, popovers, tooltips, context menus) renders in portals on `<body>`
via Radix primitives (`src/ui/common/{Menu,Popover,Tooltip}.tsx`) and is positioned with
collision detection, so nothing can be clipped by a panel or the canvas. Stacking uses only the
z-index tokens in `src/styles/theme.css`:

| Layer | Token |
|---|---|
| Canvas | `--z-canvas` (0) |
| Canvas overlays (hints, banners) | `--z-canvas-overlay` (10) |
| Simulation controls on parts | `--z-sim-controls` (20) |
| Floating canvas toolbars (zoom bar, wire toolbar, minimap) | `--z-canvas-toolbar` (30) |
| Panels / splitters | `--z-panel` (40) |
| The floating code editor | `--z-float` (300) |
| Full pages (start screen, parts guide) | `--z-page` (500) |
| Dropdowns, popovers | `--z-dropdown` (1000) |
| Context menus | `--z-context` (1100) |
| Tooltips | `--z-tooltip` (1200) |
| Modals | `--z-modal` (2000) |
| Toasts | `--z-toast` (3000) |

## Automated check

```bash
npm run dev
node tools/ui-floating-check.mjs
```

Leaves the start screen, then opens every toolbar menu, every menu-bar menu and submenu, the
canvas context menu at the four window edges, the wire context menu and its submenu, the
floating wire toolbar, a library info card near the bottom of the window, the hover card of a
part, the command palette / quick-add / Find, the export dialog, and the toolbar overflow menu
and palette in a narrow window — in a light and a dark theme, and again in Arabic
(right-to-left) — and fails if any of them is outside the window or covered by something else.

## Interface sweep

```bash
npm run dev
node tools/ui-sweep.mjs
```

Opens every example from the Examples dialog and runs it (compiling is answered with a test
firmware), alternating English and Arabic and going through the themes; while it runs, opens
each instrument tab, switches the language and the theme, floats the code editor and docks it
back, hovers, double-clicks and right-clicks a part, then pauses, resumes and stops. Then the
Settings tabs, the dialogs (shortcuts, about, report, history, export, toolchain), the palette,
quick add and Find, Save for Wokwi, the Parts Guide and the start screen. Fails on any page
error, any problem the lab records and any window without the editor. The Windows build runs it
against the built pages (`vite preview`, Edge) on every pull request.

## Desktop application test

```bash
node tools/e2e-desktop.mjs --exe src-tauri/target/release/evlab.exe
```

Starts the built application with WebView2's debugging port and drives it: the Parts Guide and
every way back (its Back button, Esc, Alt+←, the mouse's Back button), New project, the
first-run tour, the floating code editor, a dropped Wokwi zip, Add to canvas, interface size
125 %, Arabic. Fails on an empty window (checked on a screenshot), a covered page, a recorded
problem or a page error. With `--url` it drives the dev server instead.

## Manual checks (keyboard and focus)

- Start screen: shown at launch (unless turned off); Recent shows live previews and relative
  times, a missing file says so; New creates a project from a template with the typed name;
  Examples and Learn open projects; Esc or *Go to the editor* returns to the editor.
- Language: EN | ع switches instantly; Arabic mirrors panels, menus, tooltips and the inspector
  (right-to-left) while the canvas, code, serial output and numbers stay left-to-right.
- Themes: every theme in Settings › Theme and View › Theme repaints the app, the code editor and
  the instruments; the sun/moon button toggles between the last light and dark theme.
- Canvas: right-drag pans without opening the menu, a right-click without moving opens it;
  arrow keys pan when nothing is selected; dragging near an edge scrolls; the minimap (`M`)
  moves the view on click/drag; Settings › Canvas switches the wheel between zoom and scroll.
- Help on hover: toolbar buttons show name, one-line explanation and shortcut; resting on a part
  shows its card (value, simulation state, what it is for) unless dragging or wiring; F1 opens
  the Parts Guide on the selected part; Back returns to where it was opened.
- Notes: `T` text, `A` arrow, `B` frame; double-click edits text (Arabic text flows right to
  left); handles reshape arrows and frames; undo, copy/paste, duplicate and the context menu
  work on notes; notes are saved with the project.
- Find (Ctrl+F): part labels, part names, net names and note text; Enter selects and zooms.
- Export (Ctrl+Shift+E): PNG at 1×–8× shows the pixel size, SVG keeps vectors; white /
  theme / transparent backgrounds; *Selection only*; Copy as Image (Ctrl+Shift+C) pastes into a
  document.
- Raspberry Pi Pico (MicroPython): open *Pico Blink*, Run — the LEDs blink without a compile
  step; the code tab is `main.py` (Python highlighting, completions and hover help for
  `machine`/`time`); the Serial Monitor shows `print()` output, **Ctrl+C** gives `>>>` and
  `print(6*7)` answers `42`; editing while running shows *Modified* and **Upload & restart**;
  a misspelt method stops the program with a traceback, a Problems entry and a red marker on
  its line; the MCU tab shows ARM registers (R0–R12, SP, LR, PC, APSR) and pin modes as
  `Pin.OUT` / `Pin.IN, PULL_UP`.

- Menu bar: click **File**, then move the mouse across the other menus — they switch without
  clicking. ←/→ move between menus, ↑/↓ between items, Enter runs, Esc closes and returns focus.
- Typeahead: with a menu open, typing a letter jumps to the matching item.
- Canvas context menu: Shift+F10 / the context-menu key opens it; Esc closes it without clearing
  the selection; right-clicking elsewhere while it is open moves it.
- Wire colours: select a wire → the floating toolbar appears above it; `1`–`9` pick a colour, `C`
  cycles; a box-selection of several wires recolours all of them; *Colour whole net* recolours
  every wire on the net (through breadboard strips); Ctrl+Z restores the previous colours.
- While drawing a wire, `1`–`9` / `C` change the colour of the wire being drawn.
- Tooltips: hovering a toolbar button shows its name and shortcut; they never stay open over an
  open menu.
- Command palette: Ctrl+Shift+P lists every command (disabled ones greyed), typing filters
  (synonyms such as "zoom to fit" work), Enter runs, Esc closes and the next opening starts empty.
- Quick add: Ctrl+K adds the chosen part at the centre of the view; double-clicking empty canvas
  adds it at that point. With no query it lists recently used and favourite parts.
- Build state (status bar): *Not built* → *Compiling…* → *Built*; editing code shows
  *Modified* and a dot on the changed tab; undoing the edit returns to *Built*; a failed build
  shows *Build failed* and opens Problems on click.
- Code tabs: + opens an inline name field (Enter adds, Esc cancels, invalid names are outlined
  red; `.py` names for a Pico, `.h/.c/.cpp` otherwise); double-clicking a tab renames it (not
  `sketch.ino` or `main.py`); files the target board doesn't use are shown in italics.
- Recent projects: File › Open Recent and the empty canvas list opened/saved projects; a missing
  file is removed from the list with a message.
- Floating code editor: dragging the empty part of its tab bar floats it under the mouse; it
  moves and resizes, never leaves the window (shrink the window), stays above the canvas and
  below menus, dialogs and pages. Dragging it to its side shows the docking preview and docks
  it; the dock button, a double-click on the bar and View › *Floating Code Editor* do too. The
  code, the cursor and undo survive; it reopens where it was left. In Arabic it docks on the
  left.
- Errors: a failing panel shows a message with *Back* / *Try again* and the rest keeps working;
  Help › Report a Problem lists what happened and copies it.
- New project (start screen): creates the project at once (template used last, named under the
  button); with unsaved changes the question appears above the start screen.
- Parts: double-click a resistor, LED or potentiometer — a small editor (E12 values and colour
  bands for resistors), Enter applies (one undo step). Ctrl+L locks: a lock badge, no moving,
  rotating or deleting until unlocked.
- Version History (File): a copy appears after Run and after Save; Restore asks, then brings the
  version back (the current one is kept too).
- Wokwi (File › Wokwi): *Open Wokwi Project…* with a Wokwi zip or `diagram.json` + `sketch.ino`
  opens the circuit with its wires and code; *Save for Wokwi…* writes `diagram.json` and the
  code; *Copy diagram.json* puts it on the clipboard.
- Tour: shown once on the first editor view; Esc, a click elsewhere or Skip ends it; Help ›
  *Take the Tour* shows it again.
- Desktop only: double-clicking an `.evlab` file opens it (in the running window if the app is
  already open); dropping an `.evlab` file onto the window opens it; dragging parts from the
  library onto the canvas works (HTML5 drag and drop needs `dragDropEnabled: false`).
- Debugging: while running, Ctrl+B (or *Rebuild & restart board* after an edit) flashes the new
  build — the serial monitor shows "firmware updated", other parts keep their state. The MCU tab
  lists wired pins (mode, level, voltage, PWM duty), PC/SP/SREG, R0–R31 (changes highlighted)
  and flash/RAM bars. `V` toggles voltage badges on wires.
- Serial monitor: *Time* prefixes lines with the simulation time, *0x* shows a hex dump,
  *Clear on run* keeps or clears the output between runs, the save button writes the log.
- Polish: controls show styled tooltips (with shortcuts) instead of native ones; Tab shows a
  focus ring, mouse clicks don't; numbers use en-US digits; while running the canvas has a slim
  green frame (amber when paused) and the status bar shows how to interact; parts show a grab
  cursor, pins a crosshair, hovered wires a halo; the zoom % on the canvas opens zoom presets;
  the Examples dialog filters by text and tag; library category collapse and "Simulated only"
  persist across sessions; toasts slide in.
