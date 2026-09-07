import type { TopologyId } from '../sim/topology'

/**
 * The shapes a grid can be drawn on in 3D.
 *
 * A topology says how the edges are glued; a *surface* is one particular way
 * of sitting that gluing in space. The two must agree, and they are written
 * independently — `wrapPoint()` in cells, the parametrisations below in
 * (u, v) — so `surfaces.test.ts` walks each seam asking the simulation where
 * an edge cell continues and checks the geometry puts it in the same place.
 *
 * Deliberately free of Three.js and the DOM: this is the part worth testing,
 * and it runs in plain Node with the rest of the suite. Only the renderer that
 * consumes a mesh needs a graphics library.
 *
 * A Klein bottle cannot be embedded in three dimensions, only immersed, so
 * every shape here for one passes through itself. That crossing is an artefact
 * of the drawing: cells that appear to touch there are nowhere near each other
 * on the grid and do not interact.
 */

export type Vec3 = [number, number, number]

export interface Surface {
  /** Stable across topologies, so a chosen shape survives switching. */
  id: string
  name: string
  /**
   * A point on the surface. Both parameters run over [0, 1], and the square's
   * edges are identified according to the topology this surface realises, so
   * `point(1, v)` is the same place as `point(0, ...)` for whichever `...` the
   * gluing says.
   */
  point(u: number, v: number): Vec3
}

const TAU = Math.PI * 2

/**
 * The parameter of a cell, taken at its *centre*.
 *
 * This is what keeps the discrete and continuous pictures aligned: with
 * centres, the wrap `y -> h - 1 - y` is exactly the reflection `v -> 1 - v`,
 * because (h - 1 - y + 0.5) / h is (h - y - 0.5) / h is 1 - (y + 0.5) / h.
 * Indexing by a cell's leading edge instead would put every seam half a cell
 * out.
 */
export function uOfCell(x: number, width: number): number {
  return (x + 0.5) / width
}

export function vOfCell(y: number, height: number): number {
  return (y + 0.5) / height
}

const TORUS_MAJOR = 1.7
const TORUS_MINOR = 0.72

/** The one surface here that is a genuine embedding: nothing passes through. */
const TORUS: Surface = {
  id: 'torus',
  name: 'Torus',
  point(u, v) {
    const a = TAU * u
    const b = TAU * v
    const ring = TORUS_MAJOR + TORUS_MINOR * Math.cos(b)
    return [ring * Math.cos(a), TORUS_MINOR * Math.sin(b), ring * Math.sin(a)]
  },
}

const FIGURE8_RADIUS = 2

/**
 * The figure-8 immersion: a tube whose cross-section is a figure eight,
 * rotated once around while the eight turns through half a turn.
 *
 * That half turn is the twist. Going once round in u swaps the two lobes,
 * which is exactly `point(u + 1, v) = point(u, -v)` — the reflection our Klein
 * bottle glues its left and right edges by.
 */
const KLEIN_FIGURE8: Surface = {
  id: 'figure-8',
  name: 'Figure-8',
  point(u, v) {
    const a = TAU * u
    const b = TAU * v
    const half = a / 2
    const ring =
      FIGURE8_RADIUS + Math.cos(half) * Math.sin(b) - Math.sin(half) * Math.sin(2 * b)
    return [
      ring * Math.cos(a),
      Math.sin(half) * Math.sin(b) + Math.cos(half) * Math.sin(2 * b),
      ring * Math.sin(a),
    ]
  },
}

const CLASSIC_SCALE = 1 / 7
/**
 * The familiar bottle is written on a square whose seam falls at v -> 1/2 - v
 * rather than v -> -v. A quarter turn in v moves it onto ours, which is what
 * lets this shape share a grid with the figure-8 one.
 */
const CLASSIC_PHASE = -0.25

/** The bottle shape: a neck that doubles back and passes through the body. */
const KLEIN_CLASSIC: Surface = {
  id: 'classic',
  name: 'Bottle',
  point(u, v) {
    const a = TAU * u
    const b = TAU * (v + CLASSIC_PHASE)
    const cosA = Math.cos(a)
    const sinA = Math.sin(a)
    // Half the width of the tube at this point along the neck.
    const tube = 4 * (1 - cosA / 2)

    let x: number
    let y: number
    if (a < Math.PI) {
      x = 6 * cosA * (1 + sinA) + tube * cosA * Math.cos(b)
      y = 16 * sinA + tube * sinA * Math.cos(b)
    } else {
      // Past the halfway point the tube has turned inside out, so the
      // cross-section is taken half a turn round and no longer leans with the
      // neck. This is where the surface passes through itself.
      x = 6 * cosA * (1 + sinA) + tube * Math.cos(b + Math.PI)
      y = 16 * sinA
    }
    return [
      (x - 1.6) * CLASSIC_SCALE,
      y * CLASSIC_SCALE,
      tube * Math.sin(b) * CLASSIC_SCALE,
    ]
  },
}

/** A flat sheet, for the topology where nothing is glued to anything. */
const PLANE: Surface = {
  id: 'plane',
  name: 'Flat',
  point(u, v) {
    return [(u - 0.5) * 3, 0, (v - 0.5) * 3]
  },
}

/**
 * The same shape a quarter turn round, for the Klein bottle whose *horizontal*
 * edges are the twisted pair. Swapping the parameters moves the twist from one
 * axis to the other, so one immersion serves both.
 */
function swapAxes(surface: Surface): Surface {
  return {
    id: surface.id,
    name: surface.name,
    point: (u, v) => surface.point(v, u),
  }
}

/**
 * The shapes that realise a topology, best first. Empty where we have no
 * immersion yet: a cross-surface would need Boy's or Roman surface, and the
 * sphere's adjacent-edge gluing gives a pillow with cone points at its
 * corners.
 */
export function surfacesFor(topology: TopologyId): Surface[] {
  switch (topology) {
    case 'torus':
      return [TORUS]
    case 'klein':
      return [KLEIN_FIGURE8, KLEIN_CLASSIC]
    case 'klein-h':
      return [swapAxes(KLEIN_FIGURE8), swapAxes(KLEIN_CLASSIC)]
    case 'plane':
      return [PLANE]
    default:
      return []
  }
}

export function surfaceFor(topology: TopologyId, id: string): Surface | null {
  const shapes = surfacesFor(topology)
  return shapes.find((s) => s.id === id) ?? shapes[0] ?? null
}

export interface SurfaceMesh {
  /** Three floats per vertex, in a (cols + 1) x (rows + 1) grid. */
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  /** Six indices per quad, two triangles. */
  indices: Uint32Array
  /** Bounding sphere, for framing the camera on any shape. */
  center: Vec3
  radius: number
}

/**
 * Tessellate a surface into a triangle mesh.
 *
 * The vertex grid is one larger than the quad grid in each direction, which
 * means the seam is built twice: the vertices at u = 0 and u = 1 sit at the
 * same point in space but carry different texture coordinates, so the cell
 * data can be sampled without wrapping. That duplication is the reason this is
 * written out rather than left to a library's parametric geometry.
 *
 * The mesh resolution is independent of the world's: cells are sampled from a
 * texture in the shader, so this only has to be fine enough for the shape to
 * look smooth.
 */
export function buildSurfaceMesh(surface: Surface, cols: number, rows: number): SurfaceMesh {
  const across = cols + 1
  const down = rows + 1
  const count = across * down
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)

  // Small enough to be a good derivative, large enough not to be swamped by
  // rounding in the trig.
  const step = 1e-4

  for (let j = 0; j < down; j++) {
    const v = j / rows
    for (let i = 0; i < across; i++) {
      const u = i / cols
      const at = j * across + i
      const p = surface.point(u, v)
      positions[at * 3] = p[0]
      positions[at * 3 + 1] = p[1]
      positions[at * 3 + 2] = p[2]
      uvs[at * 2] = u
      uvs[at * 2 + 1] = v

      // Central differences where there is room, one-sided at the edges. The
      // parametrisation continues past the seam, but only the closed square is
      // guaranteed, so we stay inside it.
      const u0 = Math.max(0, u - step)
      const u1 = Math.min(1, u + step)
      const v0 = Math.max(0, v - step)
      const v1 = Math.min(1, v + step)
      const du = subtract(surface.point(u1, v), surface.point(u0, v))
      const dv = subtract(surface.point(u, v1), surface.point(u, v0))
      const n = normalize(cross(du, dv))
      normals[at * 3] = n[0]
      normals[at * 3 + 1] = n[1]
      normals[at * 3 + 2] = n[2]
    }
  }

  const indices = new Uint32Array(cols * rows * 6)
  let out = 0
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * across + i
      const b = a + 1
      const c = a + across
      const d = c + 1
      // Winding is consistent across the sheet but means nothing globally: a
      // Klein bottle has no inside, so the renderer draws both faces.
      indices[out++] = a
      indices[out++] = c
      indices[out++] = d
      indices[out++] = a
      indices[out++] = d
      indices[out++] = b
    }
  }

  return { positions, normals, uvs, indices, ...boundingSphere(positions) }
}

function boundingSphere(positions: Float32Array): { center: Vec3; radius: number } {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i])
    maxX = Math.max(maxX, positions[i])
    minY = Math.min(minY, positions[i + 1])
    maxY = Math.max(maxY, positions[i + 1])
    minZ = Math.min(minZ, positions[i + 2])
    maxZ = Math.max(maxZ, positions[i + 2])
  }
  const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  let radius = 0
  for (let i = 0; i < positions.length; i += 3) {
    radius = Math.max(
      radius,
      Math.hypot(positions[i] - center[0], positions[i + 1] - center[1], positions[i + 2] - center[2]),
    )
  }
  return { center, radius }
}

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2])
  // Degenerate where the parametrisation pinches; any unit vector will do, and
  // the shading there is a single point.
  if (length < 1e-12) return [0, 1, 0]
  return [v[0] / length, v[1] / length, v[2] / length]
}
