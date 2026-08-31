import { describe, expect, it } from 'vitest'
import { ALL, LETTERS, NEIGHBOURHOODS } from './hensel'

// The table in hensel.ts is 51 groups of hand-transcribed hex, and a single
// wrong digit would produce a rule that looks plausible but is not the
// published one. So it is not trusted: the orbits are recomputed here from the
// symmetry group and the table is asserted to be exactly them.

/** Neighbour offsets in bit order, bit 7 first: 7 6 5 / 4 . 3 / 2 1 0. */
const OFFSETS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]
const BIT = new Map(OFFSETS.map(([x, y], i) => [`${x},${y}`, 7 - i]))

/** The dihedral group of the square: four rotations, each with a reflection. */
const SYMMETRIES: ((p: [number, number]) => [number, number])[] = [
  ([x, y]) => [x, y],
  ([x, y]) => [-y, x],
  ([x, y]) => [-x, -y],
  ([x, y]) => [y, -x],
  ([x, y]) => [-x, y],
  ([x, y]) => [x, -y],
  ([x, y]) => [y, x],
  ([x, y]) => [-y, -x],
]

const transform = (mask: number, f: (p: [number, number]) => [number, number]) => {
  let out = 0
  for (const offset of OFFSETS) {
    const bit = BIT.get(offset.join(','))!
    if ((mask >> bit) & 1) out |= 1 << BIT.get(f(offset).join(','))!
  }
  return out
}

const orbit = (mask: number) => new Set(SYMMETRIES.map((f) => transform(mask, f)))

const popcount = (mask: number) => {
  let n = 0
  for (let m = mask; m; m >>= 1) n += m & 1
  return n
}

describe('the isotropic neighbourhood table', () => {
  it('has 51 classes', () => {
    expect(NEIGHBOURHOODS.flat()).toHaveLength(51)
  })

  it('names every class exactly once per count', () => {
    LETTERS.forEach((letters, count) => {
      expect(letters).toHaveLength(NEIGHBOURHOODS[count].length)
      expect(new Set(letters).size).toBe(letters.length)
    })
  })

  it('partitions all 256 neighbourhoods', () => {
    const seen = NEIGHBOURHOODS.flat(2)
    expect(seen).toHaveLength(256)
    expect(new Set(seen).size).toBe(256)
  })

  it('files every neighbourhood under its own live-neighbour count', () => {
    NEIGHBOURHOODS.forEach((classes, count) => {
      for (const masks of classes) for (const mask of masks) expect(popcount(mask)).toBe(count)
    })
  })

  it('lists exactly the orbit of each class under the square symmetries', () => {
    for (const classes of NEIGHBOURHOODS) {
      for (const masks of classes) {
        expect(new Set(masks)).toEqual(orbit(masks[0]))
      }
    }
  })

  // Anchors from published rules. tlife is B3/S2-i34q, described as a rule
  // where a live cell does not survive two diametrically opposite orthogonal
  // neighbours - the centre of a blinker. Just Friends is B2-a/S12, where the
  // excluded class is the "domino surface": a cell touching a domino edge-on
  // and corner-on.
  const shapeOf = (count: number, letter: string) => {
    const masks = NEIGHBOURHOODS[count][LETTERS[count].indexOf(letter)]
    const rows = []
    for (let y = -1; y <= 1; y++) {
      let row = ''
      for (let x = -1; x <= 1; x++) {
        row += x === 0 && y === 0 ? '@' : (masks[0] >> BIT.get(`${x},${y}`)!) & 1 ? 'O' : '.'
      }
      rows.push(row)
    }
    return rows.join('/')
  }

  it('gives 1c a corner and 1e an edge', () => {
    expect(orbit(0b10000000)).toEqual(new Set(NEIGHBOURHOODS[1][LETTERS[1].indexOf('c')]))
    expect(shapeOf(1, 'c')).toBe('.../.@./..O')
    expect(shapeOf(1, 'e')).toBe('.../.@./.O.')
  })

  it('gives 2i the two opposite edges a blinker centre sees', () => {
    expect(shapeOf(2, 'i')).toBe('.../O@O/...')
  })

  it('gives 2a the corner-and-edge pair a domino presents', () => {
    expect(shapeOf(2, 'a')).toBe('.../.@./.OO')
  })

  it('gives 3i three neighbours in a row', () => {
    expect(shapeOf(3, 'i')).toBe('.../.@./OOO')
  })

  it('marks every class of a count selected in ALL', () => {
    LETTERS.forEach((letters, count) => {
      expect(ALL[count]).toBe((1 << letters.length) - 1)
    })
  })
})
