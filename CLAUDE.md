# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A React + TypeScript + Vite web app for exploring cellular automata (Conway's
Life and relatives) on a canvas: draw, pan/zoom, and retune rules while it
runs. See `ARCHITECTURE.md` for the full design rationale and `ROADMAP.md` for
what's shipped, next, and deliberately declined.

## Commands

```
npm run dev          # start the Vite dev server
npm run build         # tsc -b type-check, then vite build
npm run preview       # preview a production build
npm test              # run the full vitest suite once
npm run test:watch    # vitest in watch mode
```

Run a single test file: `npx vitest run src/sim/world.test.ts`
Run tests matching a name: `npx vitest run -t "toroidal"`

There is no separate lint script; type-checking happens via `tsc -b` as part
of `npm run build`.

## Architecture

Read `ARCHITECTURE.md` before making non-trivial changes. It documents the
reasoning behind the halo-padded grid, the neighbourhood-mask rule table,
Hensel notation compilation, the heat buffer, coordinate systems, and the
React/simulation boundary in detail. The essentials:

**Four layers, each depending only on the ones above it.** This dependency
direction is the main invariant to preserve:

| Layer | Directory | Knows about |
| --- | --- | --- |
| Simulation | `src/sim/` | nothing (no React/DOM imports) |
| Rendering | `src/render/` | `sim` (reads only, never mutates) |
| Orchestration | `src/state/` | `sim`, `render` |
| Interface | `src/ui/` | `state` (via props) |

- `src/sim/world.ts`: halo-padded `Uint8Array` grid (ping-ponged each step),
  toroidal wrapping, the step function, and the heat buffer.
- `src/sim/lifelike.ts`: compiles every rulestring (totalistic B/S,
  Hensel-notation isotropic non-totalistic, and Generations `Bx/Sy/n`) into a
  single 512-entry neighbourhood-mask lookup table. There is one execution
  path; Conway is just `B3/S23`.
- `src/sim/topology.ts`: the six surfaces the grid's edges can glue into
  (torus, two Klein bottles, cross-surface, sphere, plane), following Golly's
  bounded-grid conventions. `wrapPoint()` states each gluing as coordinate
  arithmetic; `World.wrapEdges()` implements the same thing in flat indices and
  is tested against it.
- `src/sim/hensel.ts`: the 51 isotropic non-totalistic orbit letters,
  transcribed from the symmetry group and cross-checked by `hensel.test.ts`.
- `src/render/canvas2d.ts`, `palettes.ts`, `view.ts`: Canvas2D backend,
  palettes compiled to lookup tables, and pure camera maths.
- `src/state/useSimulation.ts`: owns the `World`, renderer, and `View` in
  refs, and runs the rAF loop. **React state is never touched per tick**;
  simulation results go into `statsRef` and are flushed to React state on a
  ~100ms timer. Only genuinely UI-shaped state (`running`, `zoom`,
  `ruleValid`) lives in `useState`.
- `src/ui/`: `ControlPanel` (presentational, collapsible sections with
  `InfoTip` popovers), `Viewport` (pointer/wheel input), `Tour`/`coachmark.ts`
  (guided tour, with placement maths factored out and unit-tested).
- `App.tsx` owns `SimParams` and keyboard shortcuts.

**Testing.** Tests are colocated as `*.test.ts` and run in plain Node (no
jsdom, no canvas) because `src/sim/`, `src/render/view.ts`, and
`src/render/palettes.ts` import nothing from the DOM or React. `Canvas2DRenderer`
and the React layer are deliberately not unit tested; verify those by running
the app. Assert simulation tests against known Life results (e.g. glider
translation), not against the code's own output.

**Extension seams** (see ARCHITECTURE.md for detail): a new automaton is a
module in `src/sim/` exposing state plus a `step` returning `StepStats`; a new
renderer implements `resize`/`setPalette`/`draw`; a new palette is appended to
`PALETTES`; a new tour step is appended to `TOUR_STEPS` in `src/ui/tourSteps.tsx`.
