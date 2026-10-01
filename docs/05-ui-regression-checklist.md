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
| Floating canvas toolbars (zoom bar, wire toolbar) | `--z-canvas-toolbar` (30) |
| Panels / splitters | `--z-panel` (40) |
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

Opens every toolbar menu, every menu-bar menu and submenu, the canvas context menu at the four
window edges, the wire context menu and its submenu, the floating wire toolbar, a library info
card near the bottom of the window, the command palette / quick-add, and the toolbar overflow
menu and palette in a narrow window — in both themes — and fails if any of them is outside the window or covered by something else.

## Manual checks (keyboard and focus)

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
  red); double-clicking a tab renames it (not `sketch.ino`).
- Recent projects: File › Open Recent and the empty canvas list opened/saved projects; a missing
  file is removed from the list with a message.
- Desktop only: double-clicking an `.evlab` file opens it (in the running window if the app is
  already open); dropping an `.evlab` file onto the window opens it; dragging parts from the
  library onto the canvas works (HTML5 drag and drop needs `dragDropEnabled: false`).
