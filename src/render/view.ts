/** Where the camera is looking, independent of how big the world is. */
export interface View {
  /** CSS pixels per cell. */
  zoom: number
  /** World coordinate at the canvas's top-left corner, in cells. */
  x: number
  y: number
}

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 48

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/**
 * The zoom at which the whole world just fits in the viewport.
 *
 * `margin` reserves that many cells outside every edge, which is what gives
 * the seam annotations somewhere to live. It is charged against the fit rather
 * than added to it, so "fit world" still shows the whole world.
 */
export function fitZoom(
  worldW: number,
  worldH: number,
  cssW: number,
  cssH: number,
  margin = 0,
): number {
  if (worldW <= 0 || worldH <= 0 || cssW <= 0 || cssH <= 0) return 1
  return clampZoom(Math.min(cssW / (worldW + 2 * margin), cssH / (worldH + 2 * margin)))
}

/**
 * Keep the world in frame: clamp to its edges while it overflows the
 * viewport, and centre it once it no longer does. A margin widens the region
 * the camera may sit in by that many cells on each side, so the band outside
 * an edge can be panned to rather than being permanently just off-screen.
 */
export function clampView(
  view: View,
  worldW: number,
  worldH: number,
  cssW: number,
  cssH: number,
  margin = 0,
): View {
  const visW = cssW / view.zoom
  const visH = cssH / view.zoom
  const axis = (pos: number, world: number, visible: number) => {
    // Guarded rather than written `-margin`, which would be -0 at no margin
    // and is distinguishable from 0.
    const min = margin > 0 ? -margin : 0
    const max = world + margin - visible
    // Once the world and both margins fit, centre on the world itself; the
    // margins are slack, not something to centre between.
    return max <= min ? (world - visible) / 2 : Math.min(Math.max(pos, min), max)
  }
  return {
    zoom: view.zoom,
    x: axis(view.x, worldW, visW),
    y: axis(view.y, worldH, visH),
  }
}

/** Change zoom while pinning the world point under (px, py) in canvas CSS pixels. */
export function zoomAbout(view: View, zoom: number, px: number, py: number): View {
  const next = clampZoom(zoom)
  return {
    zoom: next,
    x: view.x + px / view.zoom - px / next,
    y: view.y + py / view.zoom - py / next,
  }
}

/** Fit the view to the world, centred, leaving `margin` cells of slack around it. */
export function fitView(
  worldW: number,
  worldH: number,
  cssW: number,
  cssH: number,
  margin = 0,
): View {
  const zoom = fitZoom(worldW, worldH, cssW, cssH, margin)
  return clampView({ zoom, x: 0, y: 0 }, worldW, worldH, cssW, cssH, margin)
}
