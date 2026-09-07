import { describe, expect, it } from 'vitest'
import { buildSurfaceMesh, surfacesFor, uOfCell, vOfCell, type Surface } from './surfaces'
import { wrapPoint, type TopologyId } from '../sim/topology'

const W = 24
const H = 16
const CLOSE = 1e-9

const dist = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/**
 * The surface has to close up the same way the simulation wraps, and the two
 * are stated independently: `wrapPoint` in cells, the parametrisation in
 * (u, v). These walk the two vertical and horizontal seams asking the
 * simulation where each edge cell continues, and check the geometry puts the
 * two places at the same point in space.
 *
 * This is also what pins the cell-centre convention down. A cell's parameter
 * is its *centre*, (i + 0.5) / n — with that, the discrete flip y -> h-1-y is
 * exactly the continuous flip v -> 1-v, with no half-cell offset. Indexing
 * cells by their leading edge instead would shift every seam by half a cell
 * and this test would fail.
 */
function expectSeamsAgreeWithWrapping(topology: TopologyId, surface: Surface) {
  for (let y = 0; y < H; y++) {
    // One cell past the right edge: where does the simulation send it?
    const across = wrapPoint(topology, W, y, W, H)!
    expect(across.x, 'the right edge should continue at the left one').toBe(0)
    const here = surface.point(1, vOfCell(y, H))
    const there = surface.point(0, vOfCell(across.y, H))
    expect(dist(here, there), `${surface.id} vertical seam at row ${y}`).toBeLessThan(CLOSE)
  }

  for (let x = 0; x < W; x++) {
    const across = wrapPoint(topology, x, H, W, H)!
    expect(across.y, 'the bottom edge should continue at the top one').toBe(0)
    const here = surface.point(uOfCell(x, W), 1)
    const there = surface.point(uOfCell(across.x, W), 0)
    expect(dist(here, there), `${surface.id} horizontal seam at column ${x}`).toBeLessThan(CLOSE)
  }
}

describe('surfaces', () => {
  it('offers an immersion for the surfaces we can draw, and none for the rest', () => {
    expect(surfacesFor('torus').map((s) => s.id)).toEqual(['torus'])
    expect(surfacesFor('klein').map((s) => s.id)).toEqual(['figure-8', 'classic'])
    // The same two shapes; klein-h is the same surface a quarter turn round.
    expect(surfacesFor('klein-h').map((s) => s.id)).toEqual(['figure-8', 'classic'])
    expect(surfacesFor('plane').map((s) => s.id)).toEqual(['plane'])
    // Boy's surface and the glued-square pillow are not built yet.
    expect(surfacesFor('cross-surface')).toEqual([])
    expect(surfacesFor('sphere')).toEqual([])
  })

  it('closes up exactly as the simulation wraps', () => {
    for (const topology of ['torus', 'klein', 'klein-h', 'plane'] as const) {
      if (topology === 'plane') continue // nothing is identified on a plane
      for (const surface of surfacesFor(topology)) {
        expectSeamsAgreeWithWrapping(topology, surface)
      }
    }
  })

  it('twists the other axis on a flipped Klein bottle', () => {
    // Concretely: on 'klein' the vertical seam reverses and the horizontal one
    // does not; on 'klein-h' it is the other way round.
    const klein = surfacesFor('klein')[0]
    const flipped = surfacesFor('klein-h')[0]
    const v = vOfCell(3, H)
    const u = uOfCell(3, W)
    expect(dist(klein.point(1, v), klein.point(0, 1 - v))).toBeLessThan(CLOSE)
    expect(dist(klein.point(u, 1), klein.point(u, 0))).toBeLessThan(CLOSE)
    expect(dist(flipped.point(u, 1), flipped.point(1 - u, 0))).toBeLessThan(CLOSE)
    expect(dist(flipped.point(1, v), flipped.point(0, v))).toBeLessThan(CLOSE)
  })

  it('leaves a plane open on every side', () => {
    const plane = surfacesFor('plane')[0]
    expect(dist(plane.point(0, 0.5), plane.point(1, 0.5))).toBeGreaterThan(0.5)
    expect(dist(plane.point(0.5, 0), plane.point(0.5, 1))).toBeGreaterThan(0.5)
  })

  it('stays finite everywhere on the parameter square', () => {
    for (const topology of ['torus', 'klein', 'klein-h', 'plane'] as const) {
      for (const surface of surfacesFor(topology)) {
        for (let j = 0; j <= 10; j++) {
          for (let i = 0; i <= 10; i++) {
            const p = surface.point(i / 10, j / 10)
            expect(p.every(Number.isFinite), `${surface.id} at ${i / 10}, ${j / 10}`).toBe(true)
          }
        }
      }
    }
  })
})

describe('cell parameters', () => {
  it('places a cell at its own centre', () => {
    expect(uOfCell(0, 4)).toBeCloseTo(0.125)
    expect(uOfCell(3, 4)).toBeCloseTo(0.875)
  })

  it('turns the discrete flip into the continuous one exactly', () => {
    // y -> h-1-y in cells is v -> 1-v in parameters. The half-cell question,
    // settled: with centres these are the same map.
    for (let y = 0; y < H; y++) {
      expect(vOfCell(H - 1 - y, H)).toBeCloseTo(1 - vOfCell(y, H), 12)
    }
  })
})

describe('buildSurfaceMesh', () => {
  const surface = surfacesFor('torus')[0]

  it('builds a vertex grid one larger than the cell grid in each direction', () => {
    // The seam needs vertices at both u = 0 and u = 1: they are the same point
    // in space but carry different texture coordinates.
    const mesh = buildSurfaceMesh(surface, 8, 6)
    expect(mesh.positions.length).toBe(9 * 7 * 3)
    expect(mesh.uvs.length).toBe(9 * 7 * 2)
    expect(mesh.normals.length).toBe(9 * 7 * 3)
    expect(mesh.indices.length).toBe(8 * 6 * 6)
  })

  it('spans the whole unit square in texture coordinates', () => {
    const mesh = buildSurfaceMesh(surface, 8, 6)
    let minU = Infinity
    let maxU = -Infinity
    for (let i = 0; i < mesh.uvs.length; i += 2) {
      minU = Math.min(minU, mesh.uvs[i])
      maxU = Math.max(maxU, mesh.uvs[i])
    }
    expect(minU).toBe(0)
    expect(maxU).toBe(1)
  })

  it('indexes only vertices it built', () => {
    const mesh = buildSurfaceMesh(surface, 8, 6)
    const vertices = mesh.positions.length / 3
    for (const index of mesh.indices) expect(index).toBeLessThan(vertices)
  })

  it('gives every vertex a unit normal', () => {
    for (const topology of ['torus', 'klein', 'klein-h'] as const) {
      for (const s of surfacesFor(topology)) {
        const mesh = buildSurfaceMesh(s, 24, 16)
        for (let i = 0; i < mesh.normals.length; i += 3) {
          const length = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2])
          expect(length, `${s.id} normal ${i / 3}`).toBeCloseTo(1, 6)
        }
      }
    }
  })

  it('reports a bounding sphere that actually contains the surface', () => {
    // The camera frames any surface from this, so a too-small radius would
    // clip the shape and a wild one would push it into the distance.
    for (const topology of ['torus', 'klein', 'klein-h', 'plane'] as const) {
      for (const s of surfacesFor(topology)) {
        const mesh = buildSurfaceMesh(s, 32, 24)
        expect(mesh.radius).toBeGreaterThan(0)
        for (let i = 0; i < mesh.positions.length; i += 3) {
          const d = Math.hypot(
            mesh.positions[i] - mesh.center[0],
            mesh.positions[i + 1] - mesh.center[1],
            mesh.positions[i + 2] - mesh.center[2],
          )
          expect(d, `${s.id} vertex ${i / 3}`).toBeLessThanOrEqual(mesh.radius + 1e-6)
        }
      }
    }
  })

  it('keeps every shape at a comparable size, so switching does not lurch', () => {
    for (const topology of ['torus', 'klein', 'klein-h', 'plane'] as const) {
      for (const s of surfacesFor(topology)) {
        const mesh = buildSurfaceMesh(s, 32, 24)
        expect(mesh.radius, `${s.id} is ${mesh.radius}`).toBeGreaterThan(1)
        expect(mesh.radius, `${s.id} is ${mesh.radius}`).toBeLessThan(4)
      }
    }
  })
})
