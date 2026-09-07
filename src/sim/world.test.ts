import { describe, expect, it } from 'vitest'
import { BIRTH_HEAT, GENERATIONS_LIVE_FLOOR, World } from './world'
import { parseRule } from './lifelike'
import type { Pattern } from './rle'
import { TOPOLOGIES, wrapPoint, type TopologyId } from './topology'

const CONWAY = parseRule('B3/S23')!
const HEAT = { ageRate: 28, decayRate: 18 }
/** Trails off, so `render` shows only living cells. */
const NO_TRAILS = { ageRate: 255, decayRate: 255 }

/** Build a world from an ASCII picture; `O` is alive. */
function world(rows: string[]): World {
  const w = new World(rows[0].length, rows.length)
  rows.forEach((row, y) => [...row].forEach((char, x) => char === 'O' && w.set(x, y, true)))
  return w
}

function render(w: World): string[] {
  const out: string[] = []
  for (let y = 0; y < w.height; y++) {
    let row = ''
    for (let x = 0; x < w.width; x++) row += w.get(x, y) ? 'O' : '.'
    out.push(row)
  }
  return out
}

const step = (w: World, times = 1, heat = HEAT) => {
  let stats
  for (let i = 0; i < times; i++) stats = w.step(CONWAY, heat)
  return stats!
}

describe('Conway rules', () => {
  it('oscillates a blinker with period 2', () => {
    const w = world(['.....', '.....', '.OOO.', '.....', '.....'])
    const start = render(w)
    step(w)
    expect(render(w)).toEqual(['.....', '..O..', '..O..', '..O..', '.....'])
    step(w)
    expect(render(w)).toEqual(start)
  })

  it('leaves a block untouched', () => {
    const w = world(['....', '.OO.', '.OO.', '....'])
    const start = render(w)
    step(w, 10)
    expect(render(w)).toEqual(start)
  })

  it('translates a glider one cell diagonally every four generations', () => {
    const w = world([
      '.O......',
      '..O.....',
      'OOO.....',
      '........',
      '........',
      '........',
    ])
    step(w, 4)
    expect(render(w)).toEqual([
      '........',
      '..O.....',
      '...O....',
      '.OOO....',
      '........',
      '........',
    ])
  })

  it('kills a lone cell and a pair', () => {
    const w = world(['.....', '.O...', '...OO', '.....'])
    step(w)
    expect(w.population).toBe(0)
  })

  it('honours a non-Conway rulestring', () => {
    // Seeds: every live cell dies, dead cells with two neighbours are born.
    const seeds = parseRule('B2/S')!
    const w = world(['...', '.OO', '...'])
    w.step(seeds, HEAT)
    expect(w.get(1, 1)).toBe(0)
    expect(w.get(2, 1)).toBe(0)
  })
})

// Isotropic non-totalistic rules read the arrangement of the neighbours, not
// just how many there are. These two are published rules with documented
// behaviour, so they check the letter table end to end rather than checking
// the engine against itself.
describe('isotropic non-totalistic rules', () => {
  // tlife: like Conway, except a live cell does not survive two diametrically
  // opposite orthogonal neighbours - which is exactly what a blinker's centre
  // cell sees, so blinkers cannot oscillate.
  const TLIFE = parseRule('B3/S2-i34q')!

  it('kills a blinker that would oscillate under Conway', () => {
    const w = world([
      '.......',
      '.......',
      '.......',
      '.OOO...',
      '.......',
      '.......',
      '.......',
    ])
    // The ends have one neighbour and die; the centre sees 2i and dies too.
    // Only the two cells that see three in a row are born, and they are not
    // adjacent, so the pattern is gone a generation later.
    w.step(TLIFE, NO_TRAILS)
    expect(render(w)).toEqual([
      '.......',
      '.......',
      '..O....',
      '.......',
      '..O....',
      '.......',
      '.......',
    ])
    w.step(TLIFE, NO_TRAILS)
    expect(w.population).toBe(0)
  })

  it('still oscillates a blinker under the same rule without the exclusion', () => {
    const w = world(['.......', '.......', '.......', '.OOO...', '.......', '.......', '.......'])
    w.step(parseRule('B3/S234q')!, NO_TRAILS)
    expect(render(w)).toEqual([
      '.......',
      '.......',
      '..O....',
      '..O....',
      '..O....',
      '.......',
      '.......',
    ])
  })

  // Just Friends: B2-a excludes birth on a "domino surface", the corner-and-
  // edge pair a cell sees alongside a domino. That is the whole reason the
  // rule is not explosive the way plain B2/S12 is.
  const JUST_FRIENDS = parseRule('B2-a/S12')!

  it('leaves a domino still under Just Friends', () => {
    const w = world(['.....', '.....', '.OO..', '.....', '.....'])
    for (let i = 0; i < 8; i++) w.step(JUST_FRIENDS, NO_TRAILS)
    expect(render(w)).toEqual(['.....', '.....', '.OO..', '.....', '.....'])
  })

  it('explodes the same domino once the exclusion is dropped', () => {
    const w = world(['.....', '.....', '.OO..', '.....', '.....'])
    w.step(parseRule('B2/S12')!, NO_TRAILS)
    expect(w.population).toBe(6)
  })

  // A totalistic rule is the special case where every class of a count is
  // selected, so it must come out bit-identical to the old counting engine.
  it('runs plain B/S rules through the same table', () => {
    const listed = parseRule('B3cekainyqjr/S2cekain3cekainyqjr')!
    const glider = () => world([
      '.......',
      '..O....',
      '...O...',
      '.OOO...',
      '.......',
      '.......',
      '.......',
    ])
    const a = glider()
    const b = glider()
    for (let i = 0; i < 4; i++) {
      a.step(CONWAY, NO_TRAILS)
      b.step(listed, NO_TRAILS)
    }
    expect(render(b)).toEqual(render(a))
  })

  it('composes with Generations', () => {
    // Brian's Brain restricted to births from two opposite orthogonal
    // neighbours: a horizontal domino has no such cell, so nothing is born.
    const w = world(['.....', '.....', '.OO..', '.....', '.....'])
    w.step(parseRule('B2i/S/3')!, NO_TRAILS)
    expect(w.population).toBe(0)
  })
})

// In Generations (`Bx/Sy/n`) a cell that fails to survive does not die
// outright: it walks down states 2..n-1 first. Those dying cells are not
// alive, so they neither count as neighbours nor can be born into.
describe('Generations rules', () => {
  const GEN_LIFE = parseRule('B3/S23/3')!      // Conway, but with one dying state
  const GEN_LIFE_4 = parseRule('B3/S23/4')!    // two dying states
  const BRIANS_BRAIN = parseRule('B2/S/3')!

  /** A horizontal blinker, well clear of the edges. */
  const blinker = () => {
    const w = new World(9, 9)
    w.set(3, 4, true)
    w.set(4, 4, true)
    w.set(5, 4, true)
    return w
  }

  it('sends a cell that fails to survive into the first dying state', () => {
    const w = blinker()
    w.step(GEN_LIFE, HEAT)
    expect(w.state(3, 4)).toBe(2)
    expect(w.state(5, 4)).toBe(2)
  })

  it('keeps survivors and births alive as usual', () => {
    const w = blinker()
    w.step(GEN_LIFE, HEAT)
    expect(w.state(4, 4)).toBe(1)   // survived on 2 neighbours
    expect(w.state(4, 3)).toBe(1)   // born on 3
    expect(w.state(4, 5)).toBe(1)
    expect(w.population).toBe(3)
  })

  // The discriminating case: ordinary Life would flip the blinker back to
  // horizontal here. Under Generations the two cells it needs are still
  // counting down, so they cannot be reborn and the blinker decays instead.
  it('will not revive a cell that is still counting down', () => {
    const w = blinker()
    w.step(GEN_LIFE, HEAT)
    w.step(GEN_LIFE, HEAT)
    expect(w.state(3, 4)).toBe(0)   // finished dying, not reborn
    expect(w.state(5, 4)).toBe(0)
    expect(w.state(4, 4)).toBe(1)
    expect(w.population).toBe(1)
  })

  it('does not count dying cells as neighbours', () => {
    const w = new World(9, 9)
    w.set(4, 4, true)
    w.step(GEN_LIFE, HEAT)          // lone cell starts dying
    expect(w.state(4, 4)).toBe(2)
    // Three live cells around a dying one would be a birth if it were empty.
    const probe = new World(9, 9)
    probe.set(4, 4, true)
    probe.step(GEN_LIFE, HEAT)
    probe.set(3, 3, true)
    probe.set(4, 3, true)
    probe.set(5, 3, true)
    probe.step(GEN_LIFE, HEAT)
    expect(probe.state(4, 4)).toBe(0)   // countdown finished, never reborn
  })

  it('walks the whole countdown before the cell empties', () => {
    const w = blinker()
    w.step(GEN_LIFE_4, HEAT)
    expect(w.state(3, 4)).toBe(2)
    w.step(GEN_LIFE_4, HEAT)
    expect(w.state(3, 4)).toBe(3)
    w.step(GEN_LIFE_4, HEAT)
    expect(w.state(3, 4)).toBe(0)
  })

  it('advances the countdown regardless of the neighbourhood', () => {
    const crowded = new World(9, 9)
    crowded.set(4, 4, true)
    crowded.step(GEN_LIFE_4, HEAT)
    expect(crowded.state(4, 4)).toBe(2)
    // Surround it; the countdown must be indifferent to that.
    for (const [x, y] of [[3, 3], [4, 3], [5, 3], [3, 4], [5, 4]]) {
      crowded.set(x, y, true)
    }
    crowded.step(GEN_LIFE_4, HEAT)
    expect(crowded.state(4, 4)).toBe(3)
  })

  it('counts only living cells in the population', () => {
    const w = blinker()
    w.step(GEN_LIFE, HEAT)
    // Three alive, two dying: dying cells are not population.
    expect(w.population).toBe(3)
  })

  it("reproduces Brian's Brain on a two-cell seed", () => {
    // B2/S/3: nothing survives, and a dead cell with exactly two live
    // neighbours is born. Two adjacent cells therefore spawn four.
    const w = new World(11, 11)
    w.set(4, 4, true)
    w.set(5, 4, true)
    w.step(BRIANS_BRAIN, HEAT)
    expect(w.state(4, 4)).toBe(2)
    expect(w.state(5, 4)).toBe(2)
    for (const [x, y] of [[4, 3], [5, 3], [4, 5], [5, 5]]) {
      expect(w.state(x, y), `${x},${y}`).toBe(1)
    }
    expect(w.population).toBe(4)
  })

  it('behaves exactly like Life when the rule has two states', () => {
    const generations = blinker()
    const life = blinker()
    for (let i = 0; i < 6; i++) {
      generations.step(parseRule('B3/S23/2')!, HEAT)
      life.step(CONWAY, HEAT)
    }
    expect(render(generations)).toEqual(render(life))
    expect(generations.population).toBe(life.population)
  })

  // Living and dying cells must land in separate bands of the colour ramp, or
  // a rule where nothing survives renders as one flat colour.
  it('keeps living cells brighter than any dying cell', () => {
    const w = new World(11, 11)
    w.set(4, 4, true)
    w.set(5, 4, true)
    w.step(BRIANS_BRAIN, HEAT)

    const live = w.heat[w.index(4, 3)]
    const dyingCell = w.heat[w.index(4, 4)]
    expect(w.state(4, 3)).toBe(1)
    expect(w.state(4, 4)).toBe(2)
    expect(live).toBeGreaterThanOrEqual(GENERATIONS_LIVE_FLOOR)
    expect(live).toBeGreaterThan(dyingCell)
  })

  it('fades successive dying states downwards', () => {
    const w = blinker()
    const seen: number[] = []
    for (let i = 0; i < 3; i++) {
      w.step(GEN_LIFE_4, HEAT)
      if (w.state(3, 4) >= 2) seen.push(w.heat[w.index(3, 4)])
    }
    expect(seen.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeLessThan(seen[i - 1])
    }
  })

  it('clears a dying state when the cell is drawn over', () => {
    const w = blinker()
    w.step(GEN_LIFE, HEAT)
    expect(w.state(3, 4)).toBe(2)
    w.set(3, 4, true)
    expect(w.state(3, 4)).toBe(1)
  })

  it('clears dying states on clear and randomize', () => {
    const w = blinker()
    w.step(GEN_LIFE, HEAT)
    w.clear()
    expect(w.state(3, 4)).toBe(0)
    w.set(3, 4, true)
    w.step(GEN_LIFE, HEAT)
    w.randomize(5, 0.2)
    expect(w.state(3, 4)).toBeLessThanOrEqual(1)
  })
})

describe('toroidal wrapping', () => {
  // These use a 7x7 world deliberately: on a 3x3 torus every cell neighbours
  // every other one, so the geometry degenerates and a blinker explodes.
  it('counts neighbours across the left and right edges', () => {
    // A horizontal blinker straddling the vertical seam, centred on x = 0.
    const w = new World(7, 7)
    w.set(6, 3, true)
    w.set(0, 3, true)
    w.set(1, 3, true)
    step(w)
    expect(render(w)).toEqual([
      '.......',
      '.......',
      'O......',
      'O......',
      'O......',
      '.......',
      '.......',
    ])
  })

  it('counts neighbours across the top and bottom edges', () => {
    // A vertical blinker straddling the horizontal seam, centred on y = 0.
    const w = new World(7, 7)
    w.set(3, 6, true)
    w.set(3, 0, true)
    w.set(3, 1, true)
    step(w)
    expect(render(w)).toEqual([
      '..OOO..',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
    ])
  })

  it('counts neighbours diagonally across a corner', () => {
    // Three cells meeting at the (0,0) corner: the block that forms must
    // straddle all four corners of the torus.
    const w = new World(7, 7)
    w.set(6, 6, true)
    w.set(0, 6, true)
    w.set(6, 0, true)
    step(w)
    expect(w.get(0, 0)).toBe(1)
  })

  it('carries a glider all the way around and back to its start', () => {
    const w = world([
      '.O......',
      '..O.....',
      'OOO.....',
      '........',
      '........',
      '........',
      '........',
      '........',
    ])
    const start = render(w)
    // 4 generations per cell of travel, 8 cells to return on each axis.
    step(w, 4 * 8)
    expect(render(w)).toEqual(start)
  })
})

describe('step statistics', () => {
  it('reports births, deaths and population', () => {
    const w = world(['.....', '.....', '.OOO.', '.....', '.....'])
    const stats = step(w)
    expect(stats).toEqual({ generation: 1, population: 3, births: 2, deaths: 2 })
  })

  it('advances the generation counter', () => {
    const w = world(['..', '..'])
    expect(step(w, 5).generation).toBe(5)
    expect(w.generation).toBe(5)
  })

  it('keeps population in step with the board', () => {
    const w = world(['.O......', '..O.....', 'OOO.....', '........'])
    for (let i = 0; i < 20; i++) {
      step(w)
      const counted = render(w).join('').split('O').length - 1
      expect(w.population).toBe(counted)
    }
  })
})

describe('heat', () => {
  it('floors living cells so newborns are never invisible', () => {
    const w = world(['....', '.OO.', '.OO.', '....'])
    step(w)
    expect(w.heat[w.index(1, 1)]).toBeGreaterThanOrEqual(BIRTH_HEAT)
  })

  it('ramps a long-lived cell to full brightness', () => {
    const w = world(['....', '.OO.', '.OO.', '....'])
    step(w, 10)
    expect(w.heat[w.index(1, 1)]).toBe(255)
  })

  it('leaves untouched cells cold', () => {
    const w = world(['....', '.OO.', '.OO.', '....'])
    step(w, 5)
    expect(w.heat[w.index(3, 3)]).toBe(0)
  })

  it('decays a trail after a cell dies, reaching zero', () => {
    const w = world(['.....', '.OOO.', '.....'])
    step(w)                                    // the ends die
    const justDied = w.heat[w.index(1, 1)]
    expect(justDied).toBeGreaterThan(0)
    step(w, 20)
    expect(w.heat[w.index(1, 1)]).toBe(0)
  })

  it('does not decay when decayRate is maxed', () => {
    const w = world(['.....', '.OOO.', '.....'])
    w.step(CONWAY, NO_TRAILS)
    expect(w.heat[w.index(1, 1)]).toBe(0)
  })

  it('seeds heat on cells drawn by hand', () => {
    const w = new World(4, 4)
    w.set(1, 1, true)
    expect(w.heat[w.index(1, 1)]).toBe(BIRTH_HEAT)
  })
})

describe('set and paint', () => {
  it('ignores coordinates outside the world', () => {
    const w = new World(4, 4)
    w.set(-1, 0, true)
    w.set(0, -1, true)
    w.set(4, 0, true)
    w.set(0, 4, true)
    expect(w.population).toBe(0)
  })

  it('does not double-count setting the same cell twice', () => {
    const w = new World(4, 4)
    w.set(1, 1, true)
    w.set(1, 1, true)
    expect(w.population).toBe(1)
  })

  it('paints a disc for a brush wider than one cell', () => {
    const w = new World(7, 7)
    w.paint(3, 3, 2, true)
    expect(render(w)).toEqual([
      '.......',
      '.......',
      '...O...',
      '..OOO..',
      '...O...',
      '.......',
      '.......',
    ])
  })

  it('erases with the same brush', () => {
    const w = new World(7, 7)
    w.paint(3, 3, 3, true)
    const painted = w.population
    expect(painted).toBeGreaterThan(0)
    w.paint(3, 3, 3, false)
    expect(w.population).toBe(0)
  })

  it('leaves no gaps along a dragged line', () => {
    const w = new World(20, 20)
    w.paintLine(2, 2, 17, 9, 1, true)
    // Every painted cell must touch the next, or the drag had a hole in it.
    const live: [number, number][] = []
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (w.get(x, y)) live.push([x, y])
    live.sort((a, b) => a[0] - b[0])
    for (let i = 1; i < live.length; i++) {
      const dx = Math.abs(live[i][0] - live[i - 1][0])
      const dy = Math.abs(live[i][1] - live[i - 1][1])
      expect(Math.max(dx, dy)).toBeLessThanOrEqual(1)
    }
    expect(w.get(2, 2)).toBe(1)
    expect(w.get(17, 9)).toBe(1)
  })
})

describe('randomize', () => {
  it('is deterministic for a given seed', () => {
    const a = new World(40, 30)
    const b = new World(40, 30)
    a.randomize(1234, 0.3)
    b.randomize(1234, 0.3)
    expect(render(a)).toEqual(render(b))
  })

  it('differs between seeds', () => {
    const a = new World(40, 30)
    const b = new World(40, 30)
    a.randomize(1, 0.3)
    b.randomize(2, 0.3)
    expect(render(a)).not.toEqual(render(b))
  })

  it('lands near the requested density', () => {
    const w = new World(200, 200)
    w.randomize(99, 0.3)
    expect(w.population / (200 * 200)).toBeCloseTo(0.3, 2)
  })

  it('resets the generation counter', () => {
    const w = new World(10, 10)
    step(w, 3)
    w.randomize(7, 0.5)
    expect(w.generation).toBe(0)
  })
})

describe('resize', () => {
  it('keeps cells that fall inside the new bounds', () => {
    const w = new World(10, 10)
    w.set(2, 2, true)
    w.set(9, 9, true)
    w.resize(6, 6)
    expect(w.get(2, 2)).toBe(1)
    expect(w.population).toBe(1)
  })

  it('keeps everything when growing', () => {
    const w = new World(5, 5)
    w.set(4, 4, true)
    w.resize(20, 20)
    expect(w.get(4, 4)).toBe(1)
    expect(w.population).toBe(1)
  })

  it('is a no-op at the same size', () => {
    const w = world(['.O.', '..O', 'OOO'])
    const before = render(w)
    w.resize(3, 3)
    expect(render(w)).toEqual(before)
  })

  it('still simulates correctly after resizing', () => {
    const w = new World(4, 4)
    w.resize(9, 9)
    w.set(1, 0, true)
    w.set(2, 1, true)
    w.set(0, 2, true)
    w.set(1, 2, true)
    w.set(2, 2, true)
    step(w, 4)
    expect(w.population).toBe(5)
    expect(w.get(2, 1)).toBe(1)
    expect(w.get(3, 3)).toBe(1)
  })
})

describe('stamp', () => {
  const glider: Pattern = {
    width: 3,
    height: 3,
    cells: new Uint8Array([0, 1, 0, 0, 0, 1, 1, 1, 1]),
  }

  it('places a pattern at the given origin', () => {
    const w = new World(10, 10)
    w.stamp(glider, 4, 5)
    expect(w.population).toBe(5)
    expect(w.get(5, 5)).toBe(1)
    expect(w.get(6, 6)).toBe(1)
  })

  it('clips at the edge instead of wrapping', () => {
    const w = new World(20, 20)
    w.stamp(glider, 18, 18)          // only (19,18) is in bounds
    expect(w.population).toBe(1)
    expect(w.get(19, 18)).toBe(1)
    expect(w.get(0, 0)).toBe(0)
    expect(w.get(0, 19)).toBe(0)
  })

  it('drops a pattern that falls entirely outside', () => {
    const w = new World(20, 20)
    w.stamp(glider, 19, 19)
    expect(w.population).toBe(0)
  })

  it('handles a negative origin', () => {
    const w = new World(20, 20)
    w.stamp(glider, -1, -1)
    expect(w.population).toBe(3)
  })

  it('adds to what is already there', () => {
    const w = new World(20, 20)
    w.stamp(glider, 0, 0)
    w.stamp(glider, 10, 10)
    expect(w.population).toBe(10)
  })
})

describe('toPattern', () => {
  it('returns null for an empty board', () => {
    expect(new World(10, 10).toPattern()).toBeNull()
  })

  it('extracts the bounding box of the live cells', () => {
    const w = world(['.....', '..OO.', '..OO.', '.....'])
    const pattern = w.toPattern()!
    expect([pattern.width, pattern.height]).toEqual([2, 2])
    expect([...pattern.cells]).toEqual([1, 1, 1, 1])
  })

  it('spans separated groups', () => {
    const w = new World(50, 50)
    w.set(5, 5, true)
    w.set(20, 15, true)
    const pattern = w.toPattern()!
    expect([pattern.width, pattern.height]).toEqual([16, 11])
    expect(pattern.cells.reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('survives a stamp round-trip', () => {
    const w = new World(30, 30)
    w.stamp(glider(), 7, 11)
    const extracted = w.toPattern()!
    const w2 = new World(30, 30)
    w2.stamp(extracted, 7, 11)
    expect(render(w2)).toEqual(render(w))
  })

  function glider(): Pattern {
    return { width: 3, height: 3, cells: new Uint8Array([0, 1, 0, 0, 0, 1, 1, 1, 1]) }
  }
})

describe('grid topologies', () => {
  const GLIDER: Pattern = {
    width: 3,
    height: 3,
    // Travels down and to the right, one cell diagonally every 4 generations.
    cells: new Uint8Array([0, 1, 0, 0, 0, 1, 1, 1, 1]),
  }

  /**
   * `wrapEdges` fills the halo with flat-index copies for speed; `wrapPoint`
   * states the same gluing as coordinate arithmetic. Checking the fast path
   * against the specification at every halo cell is what makes the index
   * juggling in each fill trustworthy.
   */
  function expectHaloMatchesSpec(topology: TopologyId, width: number, height: number) {
    for (const seed of [1, 7, 99]) {
      const w = new World(width, height, topology)
      w.randomize(seed, 0.4)
      w.wrapEdges()
      for (let y = -1; y <= height; y++) {
        for (let x = -1; x <= width; x++) {
          if (x >= 0 && x < width && y >= 0 && y < height) continue
          const source = wrapPoint(topology, x, y, width, height)
          const expected = source ? w.get(source.x, source.y) : 0
          expect(w.cells[w.index(x, y)], `${topology} seed ${seed} halo (${x}, ${y})`).toBe(expected)
        }
      }
    }
  }

  it('fills the halo exactly as the topology specifies', () => {
    for (const topology of TOPOLOGIES) {
      const [width, height] = topology.requiresSquare ? [11, 11] : [13, 9]
      expectHaloMatchesSpec(topology.id, width, height)
    }
  })

  function centroidY(w: World): number {
    let sum = 0
    let n = 0
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        if (w.get(x, y)) {
          sum += y
          n++
        }
      }
    }
    expect(n, 'a glider should stay five cells').toBe(5)
    return sum / n
  }

  /** How far the glider moves vertically over exactly one of its periods. */
  function driftOverPeriod(w: World, until: number): number {
    while (w.generation < until) step(w)
    const before = centroidY(w)
    step(w, 4)
    return centroidY(w) - before
  }

  it('reverses a glider vertically when it crosses a Klein bottle seam', () => {
    // The left and right edges are joined with a half turn, so a glider that
    // leaves heading down-right comes back heading up-right. Placed 10 cells
    // from the right edge, it reaches the seam around generation 40.
    const w = new World(40, 40, 'klein')
    w.stamp(GLIDER, 30, 4)

    expect(driftOverPeriod(w, 8), 'heading down before the seam').toBeCloseTo(1)
    expect(driftOverPeriod(w, 60), 'heading up after the seam').toBeCloseTo(-1)
  })

  it('leaves a glider heading the same way on a torus', () => {
    // The control for the test above: same glider, same generations, no twist.
    const w = new World(40, 40, 'torus')
    w.stamp(GLIDER, 30, 4)

    expect(driftOverPeriod(w, 8)).toBeCloseTo(1)
    expect(driftOverPeriod(w, 60)).toBeCloseTo(1)
  })

  it('stops a glider dead against the walls of a plane', () => {
    // Nothing can translate forever inside a bounded box with dead edges, so
    // whatever is left has to be still or oscillating, not moving.
    const w = new World(20, 20, 'plane')
    w.stamp(GLIDER, 2, 2)
    step(w, 300)
    const settled = render(w)
    step(w, 2)
    expect(render(w)).toEqual(settled)
  })

  it('keeps the halo dead on a plane', () => {
    const w = new World(6, 6, 'plane')
    for (let i = 0; i < 6; i++) {
      w.set(i, 0, true)
      w.set(i, 5, true)
      w.set(0, i, true)
      w.set(5, i, true)
    }
    w.wrapEdges()
    for (let y = -1; y <= 6; y++) {
      for (let x = -1; x <= 6; x++) {
        if (x >= 0 && x < 6 && y >= 0 && y < 6) continue
        expect(w.cells[w.index(x, y)], `halo (${x}, ${y})`).toBe(0)
      }
    }
  })

  it('refuses a sphere on a world that is not square', () => {
    expect(new World(11, 11, 'sphere').topology).toBe('sphere')
    expect(new World(13, 9, 'sphere').topology).toBe('torus')
  })

  it('drops back to a torus when a resize breaks a sphere', () => {
    const w = new World(11, 11, 'sphere')
    w.resize(13, 9)
    expect(w.topology).toBe('torus')
  })
})
