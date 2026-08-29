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

/** The zoom at which the whole world just fits in the viewport. */
export function fitZoom(worldW: number, worldH: number, cssW: number, cssH: number): number {
  if (worldW <= 0 || worldH <= 0 || cssW <= 0 || cssH <= 0) return 1
  return clampZoom(Math.min(cssW / worldW, cssH / worldH))
}

/**
 * Keep the world in frame: clamp to its edges while it overflows the
 * viewport, and centre it once it no longer does.
 */
export function clampView(view: View, worldW: number, worldH: number, cssW: number, cssH: number): View {
  const visW = cssW / view.zoom
  const visH = cssH / view.zoom
  const axis = (pos: number, world: number, visible: number) =>
    world <= visible ? (world - visible) / 2 : Math.min(Math.max(pos, 0), world - visible)
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

/** Fit the view to the world, centred. */
export function fitView(worldW: number, worldH: number, cssW: number, cssH: number): View {
  const zoom = fitZoom(worldW, worldH, cssW, cssH)
  return clampView({ zoom, x: 0, y: 0 }, worldW, worldH, cssW, cssH)
}
