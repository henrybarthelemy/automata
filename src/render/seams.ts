import { wrapPoint, type TopologyId } from '../sim/topology'

/**
 * Annotations that make the grid's topology visible.
 *
 * With the wrapping alone a Klein bottle and a torus render identically — the
 * surface only shows itself when something happens to cross a seam. These two
 * pieces say it up front: which edges are glued to which (`seamMarks`, drawn as
 * the arrows of a fundamental polygon) and what actually lies across each edge
 * (`buildSeamBands`, drawn as a dimmed band outside the world).
 *
 * Both are derived from `wrapPoint` rather than tabulated per topology, so the
 * picture cannot drift away from what the simulation does.
 */

export type EdgeName = 'top' | 'right' | 'bottom' | 'left'

/** Clockwise from the top, which is also the order the arrows are assigned in. */
export const EDGES: EdgeName[] = ['top', 'right', 'bottom', 'left']

/** How many cells of the neighbouring surface the ghost band shows. */
export const SEAM_BAND = 6

export interface SeamMark {
  edge: EdgeName
  /** Edges carrying the same label are glued to each other. */
  pair: number
  /**
   * +1 if the arrow runs the natural way along the edge — left to right on a
   * horizontal edge, top to bottom on a vertical one — and -1 if it is
   * reversed. Two glued edges with opposing arrows are a twisted seam; that
   * opposition is the whole content of the notation.
   */
  direction: 1 | -1
}

/** The cell just outside `edge`, `t` of the way along it. */
function outside(edge: EdgeName, t: number, w: number, h: number) {
  switch (edge) {
    case 'top':
      return { x: t, y: -1 }
    case 'bottom':
      return { x: t, y: h }
    case 'left':
      return { x: -1, y: t }
    case 'right':
      return { x: w, y: t }
  }
}

/**
 * Which edge an interior cell sits on, and how far along it. Only ever called
 * with points well away from the corners, where the answer would be ambiguous.
 */
function edgeAt(x: number, y: number, w: number, h: number): { edge: EdgeName; t: number } | null {
  if (y === 0) return { edge: 'top', t: x }
  if (y === h - 1) return { edge: 'bottom', t: x }
  if (x === 0) return { edge: 'left', t: y }
  if (x === w - 1) return { edge: 'right', t: y }
  return null
}

/**
 * Pair up the four edges and orient an arrow along each, by asking the
 * wrapping where two points along an edge come out. Returns nothing for a
 * plane, where no edges are identified at all.
 */
export function seamMarks(topology: TopologyId, width: number, height: number): SeamMark[] {
  // Sampled a third and two thirds along, so neither point is near a corner.
  const sample = (edge: EdgeName) => {
    const length = edge === 'top' || edge === 'bottom' ? width : height
    const [t1, t2] = [Math.floor(length / 3), Math.floor((2 * length) / 3)]
    if (t1 === t2) return null
    const a = outside(edge, t1, width, height)
    const b = outside(edge, t2, width, height)
    const pa = wrapPoint(topology, a.x, a.y, width, height)
    const pb = wrapPoint(topology, b.x, b.y, width, height)
    if (!pa || !pb) return null
    const ea = edgeAt(pa.x, pa.y, width, height)
    const eb = edgeAt(pb.x, pb.y, width, height)
    if (!ea || !eb || ea.edge !== eb.edge) return null
    return { partner: ea.edge, reversed: eb.t < ea.t }
  }

  const marks: SeamMark[] = []
  let pair = 0
  for (const edge of EDGES) {
    if (marks.some((m) => m.edge === edge)) continue
    const found = sample(edge)
    if (!found || found.partner === edge) continue
    // The first edge of a pair to come up sets the reference direction; its
    // partner agrees or opposes depending on whether the gluing reverses.
    marks.push({ edge, pair, direction: 1 })
    marks.push({ edge: found.partner, pair, direction: found.reversed ? -1 : 1 })
    pair++
  }
  return marks
}

export interface SeamBand {
  edge: EdgeName
  /** World coordinate of the band's top-left cell; may be negative. */
  originX: number
  originY: number
  bufferW: number
  bufferH: number
  /**
   * One flat `World.cells` index per band cell in row-major buffer order, or
   * -1 where nothing lies across. Depends only on the topology and the world's
   * size, never on the cells, so it is built once and reused every frame.
   */
  indices: Int32Array
}

function bandRect(edge: EdgeName, w: number, h: number, depth: number) {
  switch (edge) {
    case 'top':
      return { originX: 0, originY: -depth, bufferW: w, bufferH: depth }
    case 'bottom':
      return { originX: 0, originY: h, bufferW: w, bufferH: depth }
    case 'left':
      return { originX: -depth, originY: 0, bufferW: depth, bufferH: h }
    case 'right':
      return { originX: w, originY: 0, bufferW: depth, bufferH: h }
  }
}

/**
 * A strip of the neighbouring surface just outside each of the four edges,
 * as world indices ready to be looked up in `World.cells` and `World.heat`.
 *
 * Laid out in screen orientation - buffer cell (bx, by) is world coordinate
 * (originX + bx, originY + by) - so drawing a band is a straight blit with no
 * per-edge rotation.
 */
export function buildSeamBands(
  topology: TopologyId,
  width: number,
  height: number,
  stride: number,
  depth: number = SEAM_BAND,
): SeamBand[] {
  return EDGES.map((edge) => {
    const rect = bandRect(edge, width, height, depth)
    const indices = new Int32Array(rect.bufferW * rect.bufferH)
    for (let by = 0; by < rect.bufferH; by++) {
      for (let bx = 0; bx < rect.bufferW; bx++) {
        const source = wrapPoint(topology, rect.originX + bx, rect.originY + by, width, height)
        indices[by * rect.bufferW + bx] = source ? (source.y + 1) * stride + (source.x + 1) : -1
      }
    }
    return { edge, ...rect, indices }
  })
}
