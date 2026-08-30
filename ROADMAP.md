# Roadmap

What's done, what's next, and what we've deliberately decided against. Ordering
reflects payoff against the current architecture, not ambition — see
[ARCHITECTURE.md](ARCHITECTURE.md) for why some of these are cheap and others
are rewrites.

Status: **shipped** · **in progress** · **next** · **backlog** · **declined**

---

## Shipped

| Item | Commit |
| --- | --- |
| Conway core: halo-padded grid, B/S rulestring engine, seeded RNG | `ace295a` |
| Canvas2D renderer, palettes as lookup tables | `ace295a` |
| Age-colouring and trail ghosting via the heat buffer | `ace295a` |
| Draw/erase with Bresenham infill, transport controls, live stats | `ace295a` |
| Zoom about the cursor, pan, fit, selectable world sizes | `4f5bb07` |
| Architecture documentation | `3e2fd90` |
| RLE import/export, pattern library, stamp mode | `29c3c5f` |
| Vitest suite over the simulation, RLE, view, and palette modules | pending |

## In progress

Nothing currently.

---

## Next up

### Generations rules (`B/S/n`)

**Size:** small · **Depends on:** nothing

A multistate generalisation where cells that would die instead decay through
`n` states. Our heat buffer *already is* a decay state, so the renderer barely
changes — this is a large visual payoff for a small diff.

- Extend `parseRule()` to accept the third component
- Cell state becomes the age rather than a flag; step decrements instead of clearing
- Map state onto the existing palette ramp

### Isotropic non-totalistic rules (Hensel notation)

**Size:** medium · **Depends on:** nothing

Rules that consider the *arrangement* of neighbours, not just the count — a cell
might be born from three neighbours in a row but not in an L.

Architecturally the most elegant item on this list: replace the neighbour *sum*
with a 9-bit neighbourhood *index* into a 512-entry lookup table. Same eight
reads the inner loop already does, vastly larger rule space. Totalistic rules
become a special case (fill the table from a B/S mask).

- Neighbourhood bitmask instead of a sum in `World.step()`
- Hensel notation parser
- Keep B/S input working by compiling it down to the same table

---

## Backlog

### Cheap wins

| Item | Size | Depends on | Note |
| --- | --- | --- | --- |
| Population graph | small | — | Stats already computed free in the step loop; needs a ring buffer and a sparkline canvas |
| Permalinks | small | — | Seeded RNG already makes boards reproducible from an integer; embed drawn boards as RLE under a size budget |
| Fast-forward (steps per draw) | small | — | We cap at 120 gen/s only because we redraw every step; decoupling lets you skip 1000 generations to see where a pattern settles |
| More palettes / themes | small | — | Stops are interpolated; appending to `PALETTES` is the whole job |

### Structural but contained

| Item | Size | Depends on | Note |
| --- | --- | --- | --- |
| Grid topologies (Klein bottle, cross-surface, sphere) | small | — | `wrapEdges()` is the single point of change — the halo design makes topology a property of how the border is filled |
| Step back / rewind | medium | — | Snapshot every Nth generation and replay forward to scrub |
| Selection: copy/paste/rotate/flip | medium | — | Rotate/flip already exist for stamps; this extends them to a selected region |
| Pattern identification | medium | — | Hash the board to detect still lifes, oscillator periods, spaceship displacement. Cheap relative to how delightful it is — "that's a period-15 oscillator" |
| Camera tracking | small | — | Auto-follow a spaceship so it stays centred; pairs naturally with the view transform |
| Langton's ant / turmites | medium | — | The original motivation. New module in `src/sim/`; renderer, view, and loop are unchanged since they only consume cells plus heat |
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
- `formatRule()` in `src/sim/lifelike.ts` has no callers. It exists for a future
  rule-preset UI; delete it if that never arrives.
- No persistence — reloading loses the board. Addressed by permalinks.
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
