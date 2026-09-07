/**
 * Which surface the grid is drawn on.
 *
 * The world is always a rectangle of cells; the topology is purely a statement
 * about how its four edges are glued together, and so it is entirely a
 * property of how the halo border is filled before each step. Nothing else in
 * the simulation changes.
 *
 * Names, gluing conventions and the halo contents follow Golly's bounded-grid
 * rule suffixes (`:T`, `:K`, `:C`, `:S`, `:P`), so patterns and expectations
 * carry over from the reference implementation. See
 * https://golly.sourceforge.io/Help/bounded.html
 */
export type TopologyId = 'torus' | 'klein' | 'klein-h' | 'cross-surface' | 'sphere' | 'plane'

export interface Topology {
  id: TopologyId
  name: string
  /** Golly's rule suffix for this surface, shown as the formal name. */
  suffix: string
  /** One line for the control panel. */
  blurb: string
  /**
   * A sphere joins adjacent edges rather than opposite ones, so the two edges
   * being glued have to be the same length.
   */
  requiresSquare: boolean
}

export const TOPOLOGIES: Topology[] = [
  {
    id: 'torus',
    name: 'Torus',
    suffix: ':T',
    blurb: 'Opposite edges joined directly. A glider leaving the right edge returns on the left.',
    requiresSquare: false,
  },
  {
    id: 'klein',
    name: 'Klein bottle',
    suffix: ':K',
    blurb: 'Left and right edges joined with a half turn, so crossing them flips the pattern vertically.',
    requiresSquare: false,
  },
  {
    id: 'klein-h',
    name: 'Klein bottle (flipped)',
    suffix: ':K*',
    blurb: 'The same surface turned a quarter turn: the top and bottom edges are the reversed pair.',
    requiresSquare: false,
  },
  {
    id: 'cross-surface',
    name: 'Cross-surface',
    suffix: ':C',
    blurb: 'Both pairs of edges reversed. Every corner cell is its own diagonal neighbour.',
    requiresSquare: false,
  },
  {
    id: 'sphere',
    name: 'Sphere',
    suffix: ':S',
    blurb: 'Adjacent edges joined - top to left, right to bottom. Needs a square world.',
    requiresSquare: true,
  },
  {
    id: 'plane',
    name: 'Plane',
    suffix: ':P',
    blurb: 'No wrapping at all. The border is permanently dead and patterns die against it.',
    requiresSquare: false,
  },
]

export function topologyById(id: string): Topology {
  return TOPOLOGIES.find((t) => t.id === id) ?? TOPOLOGIES[0]
}

/**
 * The topology actually usable at this world size. Only the sphere is
 * constrained, and rather than reject the selection we fall back to the torus
 * so that resizing a world can never leave the simulation in an unrunnable
 * state. The UI disables the option instead of relying on this.
 */
export function effectiveTopology(id: string, width: number, height: number): TopologyId {
  const topology = topologyById(id)
  if (topology.requiresSquare && width !== height) return 'torus'
  return topology.id
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/**
 * Where a coordinate outside the world lands once the edges are glued, or
 * null on a plane, where outside is simply dead.
 *
 * This is the specification of the halo: `World.wrapEdges` fills the border
 * ring with flat-index copies for speed, and `world.test.ts` checks that fast
 * path against this function at every halo cell. Defined for the one-cell ring
 * the halo needs; the sphere case in particular does not generalise further
 * out, because adjacent-edge gluing is not a translation.
 */
export function wrapPoint(
  topology: TopologyId,
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const w = width
  const h = height
  const inside = x >= 0 && y >= 0 && x < w && y < h
  if (inside) return { x, y }

  switch (topology) {
    case 'plane':
      return null

    case 'torus':
      return { x: mod(x, w), y: mod(y, h) }

    case 'klein': {
      // Crossing the left or right edge an odd number of times flips y.
      if (Math.floor(x / w) % 2 !== 0) y = h - 1 - y
      return { x: mod(x, w), y: mod(y, h) }
    }

    case 'klein-h': {
      if (Math.floor(y / h) % 2 !== 0) x = w - 1 - x
      return { x: mod(x, w), y: mod(y, h) }
    }

    case 'cross-surface': {
      // Both pairs twist, so resolve one axis and then the other. The order
      // does not matter: the two flips commute on the diagonal, which is why
      // a corner ends up mapping to itself.
      if (Math.floor(x / w) % 2 !== 0) y = h - 1 - y
      x = mod(x, w)
      if (Math.floor(y / h) % 2 !== 0) x = w - 1 - x
      return { x: mod(x, w), y: mod(y, h) }
    }

    case 'sphere': {
      // Top glues to left and right glues to bottom, which is a reflection in
      // the leading diagonal. The four corners read their own corner cell.
      if (x < 0 && y < 0) return { x: 0, y: 0 }
      if (x >= w && y < 0) return { x: w - 1, y: 0 }
      if (x < 0 && y >= h) return { x: 0, y: h - 1 }
      if (x >= w && y >= h) return { x: w - 1, y: h - 1 }
      if (x < 0) return { x: y, y: 0 }
      if (y < 0) return { x: 0, y: x }
      if (x >= w) return { x: y, y: h - 1 }
      return { x: w - 1, y: x }
    }
  }
}
