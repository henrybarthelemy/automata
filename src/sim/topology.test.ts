import { describe, expect, it } from 'vitest'
import { TOPOLOGIES, effectiveTopology, topologyById, wrapPoint, type TopologyId } from './topology'

/**
 * Golly documents each bounded grid by printing the halo it fills around a
 * small lettered grid. Those diagrams are transcribed verbatim below from
 * `JoinTwistedEdges` and `JoinAdjacentEdges` in gollybase/lifealgo.cpp, so
 * these assertions are against a reference implementation's published output
 * rather than against our own.
 *
 * The interior is the capitals; the surrounding ring is the lowercase copy of
 * whichever interior cell that halo position must read.
 */
function checkDiagram(topology: TopologyId, w: number, h: number, diagram: string) {
  const rows = diagram
    .trim()
    .split('\n')
    .map((row) => row.trim().split(/\s+/))
  expect(rows.length).toBe(h + 2)

  // Letter -> interior coordinate: A is (0,0), reading across then down.
  const at = (letter: string) => {
    const n = letter.toUpperCase().charCodeAt(0) - 65
    return { x: n % w, y: Math.floor(n / w) }
  }

  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (x >= 0 && x < w && y >= 0 && y < h) continue
      const expected = at(rows[y + 1][x + 1])
      expect(wrapPoint(topology, x, y, w, h), `halo cell (${x}, ${y})`).toEqual(expected)
    }
  }
}

describe('wrapPoint', () => {
  it('joins opposite edges on a torus', () => {
    // :T4,3
    checkDiagram('torus', 4, 3, `
      l i j k l i
      d A B C D a
      h E F G H e
      l I J K L i
      d a b c d a
    `)
  })

  it('reverses the left and right edges on a Klein bottle', () => {
    // :K4,3 - Golly treats a bare :K as a vertical twist
    checkDiagram('klein', 4, 3, `
      d i j k l a
      l A B C D i
      h E F G H e
      d I J K L a
      l a b c d i
    `)
  })

  it('reverses the top and bottom edges on a flipped Klein bottle', () => {
    // :K4*,3
    checkDiagram('klein-h', 4, 3, `
      i l k j i l
      d A B C D a
      h E F G H e
      l I J K L i
      a d c b a d
    `)
  })

  it('reverses both pairs of edges on a cross-surface', () => {
    // :C4,3
    checkDiagram('cross-surface', 4, 3, `
      a l k j i d
      l A B C D i
      h E F G H e
      d I J K L a
      i d c b a l
    `)
  })

  it('joins adjacent edges on a sphere', () => {
    // :S3
    checkDiagram('sphere', 3, 3, `
      a a d g c
      a A B C g
      b D E F h
      c G H I i
      g c f i i
    `)
  })

  it('gives a cross-surface corner itself as a diagonal neighbour', () => {
    // Golly calls this out explicitly: corner cells are topologically
    // different from every other cell on this surface.
    expect(wrapPoint('cross-surface', -1, -1, 10, 6)).toEqual({ x: 0, y: 0 })
    expect(wrapPoint('cross-surface', 10, 6, 10, 6)).toEqual({ x: 9, y: 5 })
  })

  it('leaves the border dead on a plane', () => {
    expect(wrapPoint('plane', -1, 3, 10, 6)).toBeNull()
    expect(wrapPoint('plane', 10, 3, 10, 6)).toBeNull()
    expect(wrapPoint('plane', 4, 4, 10, 6)).toEqual({ x: 4, y: 4 })
  })

  it('is the identity inside the world for every topology', () => {
    for (const topology of TOPOLOGIES) {
      expect(wrapPoint(topology.id, 3, 2, 8, 8)).toEqual({ x: 3, y: 2 })
    }
  })

  it('lands every halo cell inside the world', () => {
    for (const topology of TOPOLOGIES) {
      if (topology.id === 'plane') continue
      const [w, h] = topology.requiresSquare ? [7, 7] : [9, 5]
      for (let y = -1; y <= h; y++) {
        for (let x = -1; x <= w; x++) {
          const p = wrapPoint(topology.id, x, y, w, h)!
          expect(p.x, `${topology.id} (${x}, ${y})`).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThan(w)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeLessThan(h)
        }
      }
    }
  })
})

describe('topology metadata', () => {
  it('falls back to a torus for an unknown id', () => {
    expect(topologyById('nonsense').id).toBe('torus')
  })

  it('only offers a sphere on a square world', () => {
    // Adjacent edges cannot be glued when they are different lengths.
    expect(effectiveTopology('sphere', 300, 300)).toBe('sphere')
    expect(effectiveTopology('sphere', 400, 300)).toBe('torus')
    expect(effectiveTopology('klein', 400, 300)).toBe('klein')
  })
})

describe('wrapPoint beyond the halo ring', () => {
  // The renderer draws a band of the neighbouring surface outside each edge,
  // which needs the same question answered several cells out.

  it('keeps translating on the surfaces that are plane quotients', () => {
    // Six cells left of the left edge is six cells in from the right edge.
    expect(wrapPoint('torus', -6, 10, 40, 30)).toEqual({ x: 34, y: 10 })
    // The same, but the twist flips which row it lands on.
    expect(wrapPoint('klein', -6, 10, 40, 30)).toEqual({ x: 34, y: 19 })
    expect(wrapPoint('cross-surface', 12, 36, 40, 30)).toEqual({ x: 27, y: 6 })
  })

  it('carries a sphere band round the corner into the partner edge', () => {
    // Top glues to left, so depth away from the top edge is distance along
    // the left edge: (x, -k) reads (k - 1, x).
    expect(wrapPoint('sphere', 7, -1, 20, 20)).toEqual({ x: 0, y: 7 })
    expect(wrapPoint('sphere', 7, -4, 20, 20)).toEqual({ x: 3, y: 7 })
    // Right glues to bottom: (w - 1 + k, y) reads (y, h - k).
    expect(wrapPoint('sphere', 23, 7, 20, 20)).toEqual({ x: 7, y: 16 })
  })

  it('gives up on a sphere outside the corners', () => {
    // Adjacent-edge gluing has no continuation diagonally out from a corner.
    expect(wrapPoint('sphere', -1, -1, 20, 20)).toEqual({ x: 0, y: 0 })
    expect(wrapPoint('sphere', -3, -3, 20, 20)).toBeNull()
  })

  it('still lands inside the world wherever it answers at all', () => {
    for (const topology of TOPOLOGIES) {
      if (topology.id === 'plane') continue
      const [w, h] = topology.requiresSquare ? [16, 16] : [18, 12]
      for (let y = -6; y < h + 6; y++) {
        for (let x = -6; x < w + 6; x++) {
          const p = wrapPoint(topology.id, x, y, w, h)
          if (!p) continue
          expect(p.x, `${topology.id} (${x}, ${y})`).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThan(w)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeLessThan(h)
        }
      }
    }
  })
})
