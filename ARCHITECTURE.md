# Architecture

A web app for exploring cellular automata: a canvas you can draw on, navigate,
and retune while it runs. Today it ships Conway's Life; the structure exists so
that adding Langton's ant or a WebGL backend is additive rather than surgical.

## Layers

Four layers, each depending only on the ones above it. The dependency direction
is the main invariant worth preserving.

| Layer | Directory | Knows about | Purpose |
| --- | --- | --- | --- |
| Simulation | `src/sim/` | nothing | Cell state and the rules that advance it |
| Rendering | `src/render/` | `sim` (reads only) | Turning cell state into pixels |
| Orchestration | `src/state/` | `sim`, `render` | The run loop and the bridge to React |
| Interface | `src/ui/` | `state` (via props) | Controls and pointer handling |

`src/sim/` imports nothing from React, the DOM, or the renderer. That is what
makes it testable in plain Node — the correctness checks for Conway ran headless
before any UI existed. `src/render/` imports `World` as a *read* source and never
mutates it.

```
src/
  sim/
    world.ts       Grid state, neighbour counting, the step function, heat
    lifelike.ts    B/S rulestring parsing
    rng.ts         mulberry32, so a seed reproduces a board exactly
  render/
    canvas2d.ts    Canvas2D backend: cells -> ImageData -> scaled blit
    palettes.ts    Colour stops compiled to lookup tables
    view.ts        Pure camera maths: zoom, pan, clamping, fit
  state/
    useSimulation.ts  Owns the world, renderer, view, and the rAF loop
  ui/
    Viewport.tsx      Canvas host; pointer, wheel, drag
    ControlPanel.tsx  Sliders, selects, transport, stats
  App.tsx        Parameter state and keyboard shortcuts
  main.tsx       Entry point
```

## The simulation core

### Halo-padded grid

`World` (`src/sim/world.ts`) holds two `Uint8Array`s that are ping-ponged each
step. They are allocated at `(width + 2) * (height + 2)`: a one-cell border
around the real grid.

Before each step `wrapEdges()` copies the outer rows and columns into that
border from the opposite side. The neighbour loop then reads eight fixed
flat-index offsets with no modulo and no bounds checks:

```
n = cells[up - 1] + cells[up] + cells[up + 1]
  + cells[i - 1]              + cells[i + 1]
  + cells[down - 1] + cells[down] + cells[down + 1]
```

This is the single most important performance decision in the codebase. It is
also why the grid can wrap at all — wrapping is a property of how the halo is
filled, not a branch in the inner loop.

### Grid topologies

That last point is what `src/sim/topology.ts` cashes in. The world is always a
rectangle; which *surface* it lives on is only a statement about how the four
edges are glued, and so it is entirely a statement about which cell each halo
position copies. A Klein bottle differs from a torus in `wrapEdges()` and
nowhere else — the step loop, the renderer and the view are untouched.

Six surfaces ship, following Golly's bounded-grid conventions (`:T`, `:K`,
`:K*`, `:C`, `:S`, `:P`) so patterns and expectations carry over from the
reference implementation:

| Surface | Edges |
| --- | --- |
| Torus | Opposite edges joined directly |
| Klein bottle | Left and right joined with a half turn |
| Klein bottle (flipped) | The same surface with top and bottom as the reversed pair |
| Cross-surface | Both pairs reversed; every corner is its own diagonal neighbour |
| Sphere | Adjacent edges joined, top to left and right to bottom. Square worlds only |
| Plane | No wrapping; the border stays dead |

`wrapEdges()` dispatches once per step to a fill written in flat indices, which
is fast but easy to get subtly wrong. So the same gluing is stated a second
time as coordinate arithmetic in `wrapPoint()`, and the tests check the fast
fill against that specification at every cell of the halo ring. `wrapPoint()`
is the readable definition; the fills are the optimisation.

A sphere joins edges of the same length, so it needs `width === height`.
`effectiveTopology()` drops it back to a torus rather than let a resize leave
the simulation unrunnable, and the panel disables the option so the fallback is
never what the user actually sees.

### Drawing the topology

Wrapping alone is invisible: a Klein bottle and a torus are the same picture
until something crosses a seam. `src/render/seams.ts` says it up front, in two
parts.

**Arrows.** Each edge is drawn with the notation for a polygon whose edges are
identified — edges glued to each other carry the same number of arrowheads, and
arrows that oppose mark a twisted seam. `seamMarks()` does not tabulate this
per topology; it asks `wrapPoint()` where two points along an edge come out,
reads off which edge they landed on and whether their order reversed, and pairs
the four edges from that. The picture therefore cannot drift from the
simulation: it is derived from the same function the halo is checked against.

**Bands.** `buildSeamBands()` returns a strip of the neighbouring surface just
outside each edge, as flat `World.cells` indices laid out in screen
orientation, so drawing one is a blit with no per-edge rotation. The mapping
depends only on the topology and the world's size, never on the cells, so it is
built once per change and reused every frame — the per-frame cost is an array
lookup per band pixel, the same shape as the main draw.

This is why `wrapPoint()` answers beyond the single halo ring. The four
twisting surfaces are quotients of the plane by a group, so their formulas
already hold at any distance; a sphere is not, and its diagonal regions return
null past the first ring.

The camera reserves `SEAM_BAND` cells outside every edge, via the `margin`
argument to `clampView()` and `fitView()`. It is reserved whether or not the
annotation is being drawn, so toggling it never moves the view.

### Drawing the topology in three dimensions

The flat view can only annotate the gluing; the shape itself needs geometry.
`src/render/surfaces.ts` and `src/render/orbit.ts` are the maths for that, and
they are deliberately free of Three.js and the DOM so they stay in the Node
test suite. Only the renderer that consumes a mesh needs a graphics library.

A topology says how the edges are glued; a **surface** is one way of sitting
that gluing in space. The two are written independently — `wrapPoint()` in
cells, the parametrisations in (u, v) — so the tests walk each seam asking the
simulation where an edge cell continues and check the geometry puts it in the
same place. That is what pins down the cell-parameter convention:

> A cell's parameter is its **centre**, `(i + 0.5) / n`. With centres, the
> discrete flip `y -> h-1-y` *is* the continuous flip `v -> 1-v`, exactly.
> Indexing cells by their leading edge instead would put every seam half a cell
> out — a misalignment that would read as a smear rather than an obvious break.

Four surfaces exist so far: the torus (the only genuine embedding here), the
classic-bottle and figure-8 immersions of the Klein bottle, and a flat sheet.
`surfacesFor()` returns them best first, so a Klein bottle opens on the bottle
shape people recognise rather than the figure-8.
`klein-h` reuses the Klein shapes with the parameters swapped, which moves the
twist from one axis to the other. A cross-surface would need Boy's or Roman
surface and the sphere's adjacent-edge gluing gives a pillow with cone points,
so both are still 2D-only — choosing one from the 3D view drops back to the
flat one rather than leaving an empty canvas.

Two details worth knowing. The classic bottle is written on a square whose seam
falls at `v -> 1/2 - v`; a quarter-turn phase shift in `v` moves it onto ours,
which is what lets both Klein shapes share one grid. And `buildSurfaceMesh()`
builds the seam twice — the vertices at `u = 0` and `u = 1` are the same point
in space but carry different texture coordinates, so cell data can be sampled
without wrapping. Mesh resolution is independent of the world's, since cells
are sampled from a texture rather than being geometry.

A Klein bottle cannot be embedded in three dimensions, only immersed, so every
shape for one passes through itself. That crossing is an artefact of the
drawing: cells that appear to touch there are nowhere near each other on the
grid and do not interact.

### The 3D renderer

`src/render/surface3d.ts` is the only file that knows about Three.js, and it is
reached through a dynamic `import()`. Three is a third of a megabyte gzipped —
more than twice the rest of the app — so it is built as its own chunk and
fetched the first time the 3D view is opened. Opening the app costs about 5KB
more than before, not 190KB.

**Cells are not geometry.** They are sampled from a texture in the fragment
shader, which is what keeps mesh resolution independent of world size: a 64x48
board and a 1600x1200 board both draw the same 256x128 quads, and a step costs
one texture upload rather than a rebuilt mesh. Three details make that cheap:

- The cell and heat arrays are uploaded **without a copy**. They are already
  halo-padded, so they go to the GPU exactly as they are, as `stride` by
  `height + 2` single-channel textures, and the shader steps over the border
  when it converts a UV to a texel. `unpackAlignment` has to be 1, because rows
  of a one-byte-per-texel image are not four-byte aligned unless the stride
  happens to be a multiple of four, and it usually is not.
- The texture is re-pointed at `world.cells` every frame rather than holding a
  reference. The world ping-pongs its two cell buffers each step, so a
  reference taken when the texture was built goes stale immediately.
- `buildLuts()` is reused as-is: both 256-entry ramps become one 256x2 RGBA
  texture, trails on the lower row and living cells on the upper one, and the
  colour logic from the 2D inner loop becomes three lines of GLSL.

The wireframe comes from the UVs rather than from geometry, and fades out once
a cell is down to about a pixel, so a large world does not turn into a solid
sheet of grid lines. Shading uses the *magnitude* of the facing dot product:
the surface is non-orientable, so a normal has no consistent outward sense, and
taking the magnitude shades both faces alike while still darkening the
silhouette.

Transparency is approximated by drawing back faces and then front faces, both
with depth writes off. A per-triangle sort would be correct and would not fit
in a frame at this vertex count.

Two canvases stay mounted side by side, the idle one hidden. A canvas can only
ever have one kind of context, so the 2D and WebGL renderers cannot share one.

The 3D view is read-only: drawing, stamping and the brush all assume a flat
neighbourhood, and near a self-intersection "nearby in space" is not "nearby on
the grid".

The cost is that **every index must be translated**: cell `(x, y)` lives at
`(y + 1) * stride + (x + 1)`, via `World.index()`. Code that walks the arrays
directly must account for the offset.

### Rules as a lookup table

The inner loop does not count neighbours. It assembles them into an 8-bit
**neighbourhood mask** laid out around the centre cell as

```
7 6 5
4 . 3
2 1 0
```

and the step is one array read:

```ts
next[i] = table[(alive << 8) | n]
```

`parseRule()` (`src/sim/lifelike.ts`) compiles every supported rulestring into
that 512-entry table, so there is exactly one execution path. Conway is not
special-cased anywhere — it is the string `B3/S23`, which is why HighLife and
Seeds already work by typing them into the rule field.

**Totalistic rules** (`B3/S23`) are the case where every arrangement of a given
count agrees, so their compilation just fills all the masks of that count with
the same bit.

**Isotropic non-totalistic rules** narrow a count to particular *arrangements*
using Hensel notation: `B3/S2-i34q` is tlife, where a live cell does not
survive the two opposite orthogonal neighbours (`2i`) that a blinker's centre
sees, so blinkers cannot oscillate. Under the eight symmetries of the square
the 256 masks collapse into 51 orbits; `src/sim/hensel.ts` holds them, one
letter each. A leading `-` after a digit inverts the selection within that
count.

That table is the one piece of the codebase that is transcribed rather than
derived, and a single wrong hex digit would produce a rule that looks plausible
but is not the published one. So `hensel.test.ts` recomputes the orbits from
the symmetry group and asserts the table is exactly them, and two world-level
tests check published rules by their documented behaviour — a blinker must die
under tlife, and a domino must sit still under Just Friends (`B2-a/S12`) while
exploding under plain `B2/S12`.

A third component makes it a **Generations** rule (`Bx/Sy/n`): a cell that
fails to survive walks down states `2..n-1` before emptying, and while it does
so it is neither alive nor birthable. The countdown lives in a `dying` array
kept *separate* from `cells`, so `cells` stays strictly 0/1 and the mask is
built from raw values with no comparisons. Generations composes with everything
above, because dying cells never consult the table at all.

`step()` dispatches to one of two loops rather than branching inside a single
one. Sharing the loop measured ~14% slower on the binary path, and ordinary
Life is the common case, so the duplication buys back the hot path.

### The heat buffer

One `Uint8Array` parallel to the cells, carrying a per-cell brightness. On each
step a live cell ramps up by `ageRate` and a dead one decays by `decayRate`.

This single mechanism produces both visual effects. Age-colouring and trail
ghosting are the same lookup — `colour = LUT[heat]` — differing only in which
ramp is used. Turning `decayRate` to its maximum makes trails vanish and gives
crisp black-and-white. Live cells are floored at `BIRTH_HEAT` so a newborn or
freshly seeded cell never renders as near-background.

Heat only advances on a simulation step, so pausing freezes trails instead of
draining them.

Under a Generations rule the dying states drive the ramp directly — a fresh
countdown is bright and fades as it advances — so the feature needed no
renderer change at all. Living cells are floored at `GENERATIONS_LIVE_FLOOR`,
well above the band the dying states occupy; without that separation a rule
like Brian's Brain, where nothing survives long enough for the age ramp to
climb, renders as a single flat colour. The trail-decay slider does not apply
in this mode, since the rule governs the fade.

## Rendering

### Cost tracks the viewport, not the world

`Canvas2DRenderer.draw()` computes the visible cell span from the view, writes
one pixel per *visible* cell into an `ImageData`, and blits it scaled with
`drawImage`. A 1600x1200 world costs the same to draw zoomed-in as a small one,
because only what is on screen is touched.

The scratch buffer is sized to the widest span the viewport can show, which
depends only on zoom and canvas size — not on pan position. Panning therefore
never reallocates. When the visible region is clipped at a world edge the buffer
is simply source-cropped in `drawImage`.

Below one pixel per cell the blit switches `imageSmoothingEnabled` on. Nearest-
neighbour downsampling *drops* cells, which makes a sparse board look empty;
averaging keeps it legible.

### Palettes as lookup tables

A palette is a list of RGB stops. `buildLuts()` expands it once into two
256-entry `Uint32Array`s of packed little-endian RGBA — one ramp for live cells,
a dimmed one for trails, so a young live cell never reads as a fading ghost.

The render loop writes through a `Uint32Array` view of the `ImageData` buffer,
making the inner body a single store per cell. Rebuilding happens only when the
palette changes.

### Coordinate systems

Five of them, and most bugs in this area come from confusing two:

| Space | Units | Where |
| --- | --- | --- |
| Cell | cells, `[0, width)` | `World` API |
| Storage index | flat array offset | `World.index()`, `(y+1) * stride + (x+1)` |
| World (fractional) | cells | `View.x`, `View.y` |
| Canvas CSS | CSS px | `View.zoom` is CSS px per cell |
| Device | physical px | canvas backing store, CSS x `devicePixelRatio` |

`View.zoom` is CSS pixels per cell. The renderer multiplies by `dpr` to get
device pixels per cell. Pointer events arrive in client space and are converted
by `cellAt()`.

### The view is pure

`src/render/view.ts` holds the camera maths as free functions on a plain `View`
value — no refs, no DOM. `zoomAbout()` pins the world point under a screen
position across a zoom change; `clampView()` keeps the world in frame, clamping
to its edges while it overflows and centring it once it doesn't.

Keeping this pure is what made the anchoring behaviour testable and is the
reason zoom-about-cursor is exact rather than approximately right.

## Orchestration

`useSimulation()` (`src/state/useSimulation.ts`) owns the mutable objects — the
`World`, the renderer, and the current `View` — all in refs, and exposes an
imperative API to the UI.

### The React boundary

The central rule: **React state is never touched per tick.** A 60fps render loop
that calls `setState` every frame would re-render the tree 60 times a second for
numbers that a human reads a few times a second.

So:

- Simulation results go into `statsRef` on every step.
- The loop flushes them to React state on a ~100ms timer, for the counters.
- The canvas is drawn imperatively; it is never React-rendered.
- Only genuinely UI-shaped state (`running`, `zoom`, `ruleValid`) lives in
  `useState`.

The mirror of this: `paramsRef.current = params` on every render, so the loop
always reads current parameters without needing them as effect dependencies.

A practical consequence when testing from a console: React batches, so reading a
stats value in the same synchronous block that triggered a change returns the
*previous* committed value. Read across a task boundary.

### Two draw paths

`drawNow()` paints synchronously; the rAF loop paints when `needsDrawRef` is set.

Discrete actions — step, clear, randomize, draw, palette change, any view change
— call `drawNow()` rather than waiting for the next animation frame. This keeps
input immediate, and means the first frame reaches the screen before any
animation frame has run. That matters more than it sounds: an initial paint that
depends on rAF shows nothing at all in an environment that throttles it.

The loop itself is a fixed-timestep accumulator. Speed is generations per second
independent of frame rate, with catch-up steps capped per frame so a slow frame
cannot spiral.

### Rule parsing is deliberately forgiving

A half-typed rulestring like `B3/` must not break a running simulation. Parsing
keeps the last valid rule and surfaces invalidity as UI state, so typing is
never destructive.

It is also expected to say *why*. `parse()` returns either a rule or a sentence;
`parseRule()` throws the sentence away and `ruleError()` throws the rule away, so
the two can never disagree about whether a string is valid — a property the tests
assert directly. With 51 Hensel classes, "unparsed" alone would leave the letter
space unguessable, so the message names the offending character and what is
allowed in its place.

### The panel explains itself on demand

Every section heading carries an `InfoTip` — a popover holding the prose that
used to sit permanently under the controls. The panel is a single 268px column,
and always-on explanation crowded out the thing being explained.

Sections are collapsible, and stay mounted when collapsed so their state
survives. `hidden` means a collapsed control cannot be measured, so a tour step
that points into a section names it and the tour opens it first.

### The tour

`Tour` renders a scrim, a spotlight, and a card, positioned by `placeCoachMark`
in `src/ui/coachmark.ts`. That function is pure — rectangles in, coordinates out
— so the awkward part, deciding which side a card goes on and keeping it inside
the window, is unit-tested in Node like the simulation core. The component is
left with measuring and rendering.

Two deliberate choices:

- **Started from a button, not on first load.** An unrequested tour in front of
  an empty canvas is worse than no tour.
- **Measured in a layout effect, not on `requestAnimationFrame`.** The headless
  browser used for verification never fires rAF, and a tour that cannot be
  driven cannot be checked.

While the tour is up it owns the keyboard. It stops propagation on `keydown`,
*and* `App` skips its shortcut handler when a tour is open — the capture-phase
ordering that makes the first mechanism work is real but subtle, and clearing
the board out from under a tour step is not worth the subtlety.

## Interface

`App.tsx` owns `SimParams` — the plain-data description of a configuration —
and the keyboard shortcuts. `ControlPanel` is presentational. `Viewport` handles
pointer and wheel input and translates it into calls on the hook's API.

Two details that are easy to regress:

- **Wheel listening is non-passive**, attached manually rather than via
  `onWheel`, because React cannot guarantee a non-passive listener and the page
  would scroll underneath the zoom.
- **Pointer capture is guarded.** It keeps a drag alive outside the canvas, but
  can reject a pointer that was already released. Since it is the first
  statement in the handler, letting it throw abandoned the entire interaction.

Drawing interpolates with Bresenham between successive pointer samples, so fast
drags do not leave gaps.

## Testing

`npm test` runs the suite; `npm run test:watch` keeps it live.

Tests are colocated as `*.test.ts` next to what they cover and run in **plain
Node** — no jsdom, no canvas. That is possible because `src/sim/`,
`src/render/view.ts`, and `src/render/palettes.ts` import nothing from the DOM
or React, and it is the main practical payoff of the layering above. It also
means the whole suite runs in a fraction of a second, so it is cheap to run on
every change.

What is covered:

| Area | Focus |
| --- | --- |
| `sim/world` | Conway correctness against known patterns, toroidal wrapping including corners, every topology's halo against `wrapPoint`, step statistics, heat ramp and decay, brush and drag painting, seeded randomisation, resize, stamp clipping, bounding-box extraction |
| `sim/lifelike` | Rulestring parsing, normalisation, rejection of half-typed input, and the wording of the rejection |
| `sim/hensel` | The 51 isotropic classes, recomputed from the symmetry group and compared against the table |
| `ui/coachmark` | Tour-card placement: preferred side, flipping, centring, and staying inside the window |
| `render/surfaces` | Each immersion closing up exactly where `wrapPoint` says it should, the cell-centre convention, mesh integrity and bounding spheres |
| `render/orbit` | Eye position round a target, elevation and distance clamping, drag and dolly directions, framing a sphere to the viewport |
| `render/seams` | Edge pairing and arrow direction against the fundamental polygon for each surface, cross-checked against where `wrapPoint` actually sends each edge; band index maps |
| `sim/rle` | Parsing real-world variations, rejecting non-RLE input, serialisation round-trips, line wrapping, rotation and flipping |
| `render/view` | Zoom clamping, fit, edge clamping and centring, and the cursor-anchoring property |
| `render/palettes` | Lookup table construction, ramp monotonicity, trail dimming |

**Deliberately not unit tested:** `Canvas2DRenderer` and the React layer. The
renderer needs a real canvas and is verified by driving the running app and
inspecting pixels; the hook is mostly wiring over the pieces above. The same
goes for `InfoTip`, `Section`, and `Tour` — but the maths each of them depends
on was pulled out into `coachmark.ts`, which *is* tested, leaving the components
with little more than measuring and rendering.

Two conventions worth keeping:

- **Assert against known Life results, not against our own output.** A glider
  translating one cell diagonally every four generations is a fact about
  Conway's Life; a snapshot of whatever our code produced is not.
- **Use a world big enough not to degenerate.** On a 3x3 torus every cell
  neighbours every other one, so a blinker explodes instead of oscillating.
  Wrapping tests use 7x7.

## Extension seams

**A new automaton.** Add a module to `src/sim/` exposing its own state and a
`step` returning `StepStats`. Langton's ant needs an ant position and direction
alongside the grid; the rendering, view, loop, and controls are unchanged
because they only consume cells plus heat. The rule field becomes automaton-
specific (a turn string rather than B/S).

**A new renderer.** `Canvas2DRenderer` is used through a narrow surface —
`resize`, `setPalette`, `draw(world, view)`. A WebGL backend implements the same
three methods. The signal to build one: sustained frame drops at a world size
you care about.

**A new palette.** Append to `PALETTES` in `src/render/palettes.ts`. Stops are
interpolated, so three to five are plenty.

**A new tour step.** Append to `TOUR_STEPS` in `src/ui/tourSteps.tsx` with a
`data-tour` selector, a preferred side, and the section it lives in. Nothing
else changes; the count in the card updates itself.

**A new rule family.** Anything that maps a cell state plus its eight
neighbours to a next state is already expressible: build the 512-entry table
and hand it to `World.step()`. Families with a different neighbourhood — larger
than Moore, or weighted — are the ones that would need a new loop.

## Performance

Measured as step plus full redraw, in a headless Chromium at dpr 2:

| World | Cells | Per step + redraw | Ceiling |
| --- | --- | --- | --- |
| 400x300 (default) | 120k | 2.5ms | ~400 gen/s |
| 800x600 | 480k | 9.5ms | ~105 gen/s |
| 1600x1200 | 1.92M | 39ms | ~26 gen/s |

The speed control caps at 120 gen/s, so the default world has substantial
headroom and the largest one is the case that would motivate a GPU backend.

Replacing the neighbour sum with a neighbourhood mask cost the Conway hot path
a consistent ~6% (0.62 → 0.66ms per step alone at 400x300, measured over 300
steps). That buys the entire isotropic rule space on the same code path, and it
is invisible next to the redraw, so it was taken deliberately rather than
worked around.

## Current limits and loose ends

- **The run loop is the least-verified part.** The headless browser used for
  automated checks never fires `requestAnimationFrame`, so behaviour is
  verified by stepping. Continuous playback needs a human eye.
- `formatRule()` in `src/sim/lifelike.ts` has no callers — it exists for a
  future rule-preset UI. Remove it if that never arrives.
- No persistence. Reloading loses the board; URL-encoded state is planned.
- The grid is finite. Six topologies are selectable, but there is no infinite
  or growing grid, and no hexagonal or triangular tiling.
- Stamps, the brush and RLE import clip at the edges rather than wrapping
  through the topology.
- Drawing while running races the simulation — edits land between steps, which
  is usually what you want but is not transactional.
