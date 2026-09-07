# Automata

An interactive cellular automata simulator. Draw on a canvas, pan and zoom
around it, and retune the rule while it is still running.

**[Live demo →](https://henrybarthelemy.com/automata/)**

## What it does

- **Rules.** Totalistic `B/S` (Conway is just `B3/S23`), Generations `Bx/Sy/n`,
  and isotropic non-totalistic rules in Hensel notation. Every rulestring
  compiles to the same 512-entry neighbourhood table, so there is one execution
  path rather than a special case per family.
- **Surfaces.** The grid's edges glue into a torus, either Klein bottle, a
  cross-surface, a sphere, or an unwrapped plane, following Golly's
  bounded-grid conventions.
- **Editing.** Draw and erase with Bresenham infill, stamp patterns from a
  built-in library (glider, Gosper gun, R-pentomino, …), rotate and flip the
  stamp, import and export RLE.
- **Reading it.** Age-colouring and trail ghosting off a heat buffer, five
  palettes, live stats with a population sparkline, and a guided tour.

## Architecture

**[ARCHITECTURE.md](ARCHITECTURE.md)** is the substantive document here — it
covers the halo-padded grid, the neighbourhood-mask rule table, Hensel
compilation, the coordinate systems, and where the React boundary sits.

The short version is four layers, each depending only on the ones above it:

| Layer | Directory | Knows about |
| --- | --- | --- |
| Simulation | `src/sim/` | nothing (no React, no DOM) |
| Rendering | `src/render/` | `sim` (reads only, never mutates) |
| Orchestration | `src/state/` | `sim`, `render` |
| Interface | `src/ui/` | `state`, via props |

Because `src/sim/` imports nothing from the DOM, the correctness checks run
headless in plain Node and assert against known Life results — a glider
translating one cell diagonally every four generations, not against the code's
own output. React state is never touched per tick: the rAF loop writes into
refs and flushes to React on a ~100ms timer.

[ROADMAP.md](ROADMAP.md) tracks what is shipped, what is next, and what has
been deliberately declined.

## Running it

```
npm install
npm run dev      # Vite dev server
npm run build    # tsc -b type-check, then a production build
npm test         # the vitest suite (currently 253 tests)
```

## Keyboard

`space` run/pause · `.` single step · `n` randomise · `c` clear ·
`+`/`-` zoom · `0` fit · `r`/`f` rotate/flip the stamp · `esc` drop it
