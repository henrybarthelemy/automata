# Roadmap

What's done, what's next, and what we've deliberately decided against. Ordering
reflects payoff against the current architecture, not ambition — see
[ARCHITECTURE.md](ARCHITECTURE.md) for why some of these are cheap and others
are rewrites.

Status: **shipped** · **in progress** · **next** · **backlog** · **declined**

---

## Shipped

Deliberately no commit hashes here — they go stale on every rebase, and
`git log` already records when each of these landed.

- Conway core: halo-padded grid, B/S rulestring engine, seeded RNG
- Canvas2D renderer, palettes compiled to lookup tables
- Age-colouring and trail ghosting via the heat buffer
- Draw and erase with Bresenham infill, transport controls, live stats
- Zoom about the cursor, pan, fit, selectable world sizes
- RLE import/export, built-in pattern library, stamp placement
- Vitest suite over the simulation, RLE, view, and palette modules
- Generations rules (`Bx/Sy/n`) with rule-driven state colouring
- Isotropic non-totalistic rules in Hensel notation, on a shared 512-entry table
- Collapsible panel sections with per-section info popovers
- Six-step guided tour, launched from a button rather than on first load
- Rulestring errors that name the offending character
- Architecture and roadmap documentation
- Population sparkline: last 200 generations, sampled per-step so fast
  playback doesn't under-sample, coloured from the current palette's accent,
  with a labelled population axis and a hover crosshair reading out the
  generation and population under the pointer
- Grid topologies: torus, Klein bottle (either axis), cross-surface, sphere and
  plane, following Golly's bounded-grid conventions, selectable while running
- Seam annotations: fundamental-polygon arrows and a dimmed band of what lies
  across each edge, so a Klein bottle no longer looks exactly like a torus

## In progress

**3D surface rendering** — drawing the grid on the shape itself rather than
annotating a flat one. Phased, since only the last phase needs a graphics
library:

- **Phase A (done).** `src/render/surfaces.ts` and `orbit.ts`: parametrisations
  of the torus, both Klein immersions and a plane, a mesh builder, and an orbit
  camera. All pure maths, all in the Node suite. Each surface is tested to
  close up exactly where `wrapPoint()` says it should, which also settled the
  cell-parameter convention — centres, so the discrete flip and the continuous
  one coincide with no half-cell offset.
- **Phase B (next).** A Three.js renderer behind a dynamic `import()`, so the
  2D bundle stays where it is. Cell and heat arrays upload as textures with no
  per-step copy — the halo padding means they go as they are, with the UVs
  offset past it. `buildLuts()` becomes a 256x1 palette texture and the colour
  logic moves into the fragment shader; the wireframe comes from the UVs rather
  than geometry.
- **Phase C.** A 2D/3D toggle, orbit input, and a shape picker. Read-only at
  first: draw in 2D, watch in 3D.
- **Later.** Raycast picking to draw on the surface, camera follow, Boy's
  surface for the cross-surface, and the sphere's pillow.

---

## Next up

Pick the next item from the backlog below.

---

## Backlog

### Cheap wins

| Item | Size | Depends on | Note |
| --- | --- | --- | --- |
| Rule presets | small | — | Named chips (Conway, HighLife, Seeds, Day & Night, Brian's Brain, tlife, Just Friends) filling the rule field; `formatRule()` normalises for match-highlighting, which would finally give it a caller |
| Warm cold start | small | — | The app opens on an empty paused board; seeding a Gosper gun and playing would change the first impression more than anything else its size |
| Permalinks | small | — | Seeded RNG already makes boards reproducible from an integer; embed drawn boards as RLE under a size budget |
| Fast-forward (steps per draw) | small | — | We cap at 120 gen/s only because we redraw every step; decoupling lets you skip 1000 generations to see where a pattern settles |
| More palettes / themes | small | — | Stops are interpolated; appending to `PALETTES` is the whole job |

### Structural but contained

| Item | Size | Depends on | Note |
| --- | --- | --- | --- |
| Step back / rewind | medium | — | Snapshot every Nth generation and replay forward to scrub |
| Selection: copy/paste/rotate/flip | medium | — | Rotate/flip already exist for stamps; this extends them to a selected region |
| Pattern identification | medium | — | Hash the board to detect still lifes, oscillator periods, spaceship displacement. Cheap relative to how delightful it is — "that's a period-15 oscillator" |
| Camera tracking | small | — | Auto-follow a spaceship so it stays centred; pairs naturally with the view transform |
| Langton's ant / turmites | medium | — | The original motivation. New module in `src/sim/`; renderer, view, and loop are unchanged since they only consume cells plus heat |
| Hensel letter picker | small | — | The rule field parses all 51 classes but nothing shows them; a grid of 3x3 shapes per count, toggled on and off, writes the rulestring |
| Larger than Life / HROT | medium | — | Needs prefix-sum accumulation to stay fast at radius > 1 |
| More pattern formats (Life 1.05/1.06, plaintext `.cells`) | small | — | RLE already exists; these are variations on the same parser |

### Big swings

| Item | Size | Depends on | Note |
| --- | --- | --- | --- |
| WebGL/WebGPU backend | large | — | The `Renderer` seam already exists. Reference: 1080p at 60fps is ~120M cell updates/sec even on old integrated GPUs; packing 4×4 cells per RGBA texel cuts VRAM 16× |
| Lenia / SmoothLife | large | WebGL backend | Continuous states, space and time — organic creatures rather than pixels. Visually the most striking thing on this list |
| Elementary 1D (Rule 30/110) | small | — | Scrolling space-time diagram. Cheap, but visually a different app; may not belong in the same viewport |

**Trigger for the WebGL backend:** sustained frame drops at a world size we care
about. Today the 1600×1200 preset runs ~26 gen/s (39ms per step + redraw), which
is the case that would motivate it. The 400×300 default sits at 2.5ms with
plenty of headroom.

---

## Declined

**Hashlife / infinite grid.** Both Golly and copy.sh/life use it, and it's the
only way to run the 29-million-cell Turing machines and breeders. But it's a
quadtree with memoisation — a fundamentally different data structure from our
flat array, so it's a rewrite of `src/sim/`, not an extension. The capability it
buys is off-axis from "visualise automata in a cool way." Revisit only if
running megapatterns becomes an actual goal.

**Soup search / census (apgsearch-style).** Catagolue has searched 450 trillion
soups since 2015. This is research infrastructure, not a visualiser feature.

---

## Working agreement

Test first. The core modules are DOM-free and the suite runs in well under a
second, so there is no excuse for skipping it:

1. Write a failing test that states the behaviour in terms of a known result.
2. Implement until it passes.
3. Run `npm test` before committing.

If a change can't be expressed as a test — a renderer or layout change —
verify it by driving the running app and say so explicitly in the commit.

---

## Loose ends

- **The run loop is the least-verified part of the codebase.** The headless
  browser used for automated checks never fires `requestAnimationFrame`, so
  continuous playback is verified by stepping. Needs a human eye, or a test
  harness that can drive real frames.
- `formatRule()` in `src/sim/lifelike.ts` still has no callers outside its tests.
  It now does real work — normalising Hensel letter order and choosing between
  the listed and excluded forms — so it is worth more than it was, but it is
  still waiting on a rule-preset UI or permalinks to use it.
- The rule field accepts Hensel notation but nothing advertises which letters
  exist for which count. The rule popover explains the syntax and a bad letter
  now names the legal ones, but a picker showing the 51 shapes is still the
  obvious follow-up, and is listed in the backlog.
- The tour leaves the sections it opened open, and the panel scrolled where it
  left it. Harmless, and arguably right, but it is not a considered decision.
- `InfoTip`, `Section`, and `Tour` have no component tests - the suite runs in
  plain Node with no jsdom. Their placement maths is tested via `coachmark.ts`;
  the rest was verified by driving the app.
- No persistence — reloading loses the board. Addressed by permalinks.
- The seam band is only a few cells wide, so at a fitted zoom it is a thin
  strip. It reads well zoomed in; whether it should scale with the viewport
  rather than the grid is unresolved.
- Stamps, the brush and RLE import still clip at the edges rather than wrapping
  through the topology. Consistent with how they behaved on a torus, but on a
  Klein bottle "clipped" is a stranger thing to mean.
- Drawing while running races the simulation. Edits land between steps, which is
  usually what you want, but it isn't transactional.

---

## Reference

Prior art surveyed when building this list:

- [Golly](https://en.wikipedia.org/wiki/Golly_(program)) — the reference desktop tool: hashlife, Lua/Python scripting, pluggable rule tables
- [LifeViewer](https://github.com/rowett/lifeviewer) — closest analogue to this project; its "colour themes with cell history and longevity" are the same idea as our heat buffer
- [copy.sh/life](https://github.com/copy/life) — infinite field and hashlife in the browser; good control scheme to borrow from
- [LifeWiki: Generations](https://conwaylife.com/wiki/Generations), [HROT](https://conwaylife.com/wiki/Higher-range_outer-totalistic_cellular_automaton), [RLE format](https://conwaylife.com/wiki/Run_Length_Encoded)
- [Lenia](https://en.wikipedia.org/wiki/Lenia)
