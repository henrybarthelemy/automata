import { describe, expect, it } from 'vitest'
import { buildSeamBands, seamMarks, SEAM_BAND, type EdgeName } from './seams'
import { wrapPoint } from '../sim/topology'

/** The pairing and arrow direction of each edge, as a readable table. */
function marks(topology: Parameters<typeof seamMarks>[0], w = 24, h = 18) {
  const out: Record<string, string> = {}
  for (const mark of seamMarks(topology, w, h)) {
    out[mark.edge] = `${mark.pair}${mark.direction > 0 ? '+' : '-'}`
  }
  return out
}

describe('seamMarks', () => {
  it('points both edges of a pair the same way on a torus', () => {
    // The fundamental polygon for a torus: top and bottom both run one way,
    // left and right both run the other. No reversal anywhere.
    expect(marks('torus')).toEqual({ top: '0+', bottom: '0+', right: '1+', left: '1+' })
  })

  it('reverses exactly one pair on a Klein bottle', () => {
    // Left and right are the twisted pair, so their arrows oppose while the
    // top and bottom still agree. This is the whole visible difference
    // between a Klein bottle and a torus.
    expect(marks('klein')).toEqual({ top: '0+', bottom: '0+', right: '1+', left: '1-' })
  })

  it('reverses the other pair on a flipped Klein bottle', () => {
    expect(marks('klein-h')).toEqual({ top: '0+', bottom: '0-', right: '1+', left: '1+' })
  })

  it('reverses both pairs on a cross-surface', () => {
    expect(marks('cross-surface')).toEqual({ top: '0+', bottom: '0-', right: '1+', left: '1-' })
  })

  it('pairs adjacent edges on a sphere', () => {
    // Not opposite edges: top is glued to left, and right to bottom.
    expect(marks('sphere', 20, 20)).toEqual({ top: '0+', left: '0+', right: '1+', bottom: '1+' })
  })

  it('marks nothing on a plane, where no edges are identified', () => {
    expect(seamMarks('plane', 24, 18)).toEqual([])
  })

  it('always pairs the four edges into two couples', () => {
    for (const topology of ['torus', 'klein', 'klein-h', 'cross-surface', 'sphere'] as const) {
      const found = seamMarks(topology, 20, 20)
      expect(found).toHaveLength(4)
      const pairs = found.map((m) => m.pair).sort()
      expect(pairs).toEqual([0, 0, 1, 1])
    }
  })

  it('agrees with where the wrapping actually sends each edge', () => {
    // The arrows are derived from wrapPoint rather than tabulated, so this
    // guards the derivation: two edges marked as a pair really do map onto
    // one another, and a reversed arrow really is an order reversal.
    const [w, h] = [24, 18]
    const along = (edge: EdgeName, t: number) =>
      edge === 'top' ? { x: t, y: -1 }
      : edge === 'bottom' ? { x: t, y: h }
      : edge === 'left' ? { x: -1, y: t }
      : { x: w, y: t }

    for (const topology of ['torus', 'klein', 'klein-h', 'cross-surface'] as const) {
      const found = seamMarks(topology, w, h)
      for (const mark of found) {
        const partner = found.find((m) => m.pair === mark.pair && m.edge !== mark.edge)!
        const horizontal = mark.edge === 'top' || mark.edge === 'bottom'
        const len = horizontal ? w : h
        const a = along(mark.edge, 4)
        const b = along(mark.edge, len - 5)
        const pa = wrapPoint(topology, a.x, a.y, w, h)!
        const pb = wrapPoint(topology, b.x, b.y, w, h)!
        const partnerHorizontal = partner.edge === 'top' || partner.edge === 'bottom'
        const ta = partnerHorizontal ? pa.x : pa.y
        const tb = partnerHorizontal ? pb.x : pb.y
        // Walking one edge forwards walks the partner forwards exactly when
        // the two arrows point the same way.
        const sameWay = mark.direction === partner.direction
        expect(tb > ta, `${topology} ${mark.edge} -> ${partner.edge}`).toBe(sameWay)
      }
    }
  })
})

describe('buildSeamBands', () => {
  const W = 12
  const H = 9
  const STRIDE = W + 2
  const index = (x: number, y: number) => (y + 1) * STRIDE + (x + 1)

  it('covers each edge with a band of the requested depth', () => {
    const bands = buildSeamBands('torus', W, H, STRIDE, 3)
    expect(bands.map((b) => b.edge)).toEqual(['top', 'right', 'bottom', 'left'])
    const top = bands.find((b) => b.edge === 'top')!
    expect([top.bufferW, top.bufferH]).toEqual([W, 3])
    expect([top.originX, top.originY]).toEqual([0, -3])
    const left = bands.find((b) => b.edge === 'left')!
    expect([left.bufferW, left.bufferH]).toEqual([3, H])
    expect([left.originX, left.originY]).toEqual([-3, 0])
  })

  it('fills every band cell with the world index the wrapping points at', () => {
    for (const topology of ['torus', 'klein', 'klein-h', 'cross-surface'] as const) {
      for (const band of buildSeamBands(topology, W, H, STRIDE, 3)) {
        for (let by = 0; by < band.bufferH; by++) {
          for (let bx = 0; bx < band.bufferW; bx++) {
            const source = wrapPoint(topology, band.originX + bx, band.originY + by, W, H)!
            expect(band.indices[by * band.bufferW + bx], `${topology} ${band.edge}`).toBe(
              index(source.x, source.y),
            )
          }
        }
      }
    }
  })

  it('marks cells with nothing across them as -1', () => {
    for (const band of buildSeamBands('plane', W, H, STRIDE, 3)) {
      expect([...band.indices].every((i) => i === -1)).toBe(true)
    }
  })

  it('reads the band immediately outside the edge, not the edge itself', () => {
    // The row nearest a torus's top edge is the world's *bottom* row.
    const top = buildSeamBands('torus', W, H, STRIDE, 3).find((b) => b.edge === 'top')!
    const nearest = top.indices.slice((top.bufferH - 1) * top.bufferW, top.bufferH * top.bufferW)
    for (let x = 0; x < W; x++) expect(nearest[x]).toBe(index(x, H - 1))
  })

  it('defaults to the shared band depth', () => {
    const top = buildSeamBands('torus', W, H, STRIDE).find((b) => b.edge === 'top')!
    expect(top.bufferH).toBe(SEAM_BAND)
  })
})
