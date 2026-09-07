import { describe, expect, it } from 'vitest'
import {
  clampView,
  clampZoom,
  fitView,
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomAbout,
  type View,
} from './view'

/** The world coordinate sitting under a point in canvas CSS pixels. */
const worldUnder = (view: View, px: number, py: number) => ({
  x: view.x + px / view.zoom,
  y: view.y + py / view.zoom,
})

describe('clampZoom', () => {
  it('holds the zoom within its limits', () => {
    expect(clampZoom(1000)).toBe(MAX_ZOOM)
    expect(clampZoom(0.001)).toBe(MIN_ZOOM)
    expect(clampZoom(4)).toBe(4)
  })
})

describe('fitZoom', () => {
  it('picks the tighter of the two axes', () => {
    // 1000/400 = 2.5 across, 800/300 = 2.67 down; the width binds.
    expect(fitZoom(400, 300, 1000, 800)).toBeCloseTo(2.5)
    expect(fitZoom(400, 300, 2000, 600)).toBeCloseTo(2)
  })

  it('stays within the zoom limits for extreme worlds', () => {
    expect(fitZoom(100000, 100000, 800, 600)).toBe(MIN_ZOOM)
    expect(fitZoom(1, 1, 4000, 4000)).toBe(MAX_ZOOM)
  })

  it('falls back to 1 for degenerate inputs rather than dividing by zero', () => {
    expect(fitZoom(0, 300, 800, 600)).toBe(1)
    expect(fitZoom(400, 300, 0, 0)).toBe(1)
  })
})

describe('zoomAbout', () => {
  // The property that makes wheel zoom feel right: whatever is under the
  // cursor stays under the cursor.
  it('pins the world point beneath the cursor', () => {
    const view: View = { zoom: 4, x: 12.5, y: 7.25 }
    for (const [px, py] of [[0, 0], [300, 620], [999, 1], [17, 400]]) {
      const before = worldUnder(view, px, py)
      for (const factor of [0.5, 0.9, 1.1, 2, 7]) {
        const after = zoomAbout(view, view.zoom * factor, px, py)
        const moved = worldUnder(after, px, py)
        expect(moved.x).toBeCloseTo(before.x, 9)
        expect(moved.y).toBeCloseTo(before.y, 9)
      }
    }
  })

  it('still pins the point when the zoom clamps at a limit', () => {
    const view: View = { zoom: 40, x: 3, y: 4 }
    const before = worldUnder(view, 250, 125)
    const after = zoomAbout(view, 10_000, 250, 125)
    expect(after.zoom).toBe(MAX_ZOOM)
    expect(worldUnder(after, 250, 125).x).toBeCloseTo(before.x, 9)
    expect(worldUnder(after, 250, 125).y).toBeCloseTo(before.y, 9)
  })

  it('is reversible', () => {
    const view: View = { zoom: 6, x: 20, y: 30 }
    const there = zoomAbout(view, 18, 400, 250)
    const back = zoomAbout(there, 6, 400, 250)
    expect(back.x).toBeCloseTo(view.x, 9)
    expect(back.y).toBeCloseTo(view.y, 9)
    expect(back.zoom).toBeCloseTo(view.zoom, 9)
  })
})

describe('clampView', () => {
  const WORLD = { w: 400, h: 300 }

  it('centres an axis whose world is smaller than the viewport', () => {
    // At zoom 1 the viewport shows 1000x800 cells, so a 400x300 world has
    // slack on both axes and gets centred — putting its top-left corner at a
    // negative coordinate.
    const clamped = clampView({ zoom: 1, x: 0, y: 0 }, WORLD.w, WORLD.h, 1000, 800)
    expect(clamped.x).toBeCloseTo((400 - 1000) / 2)
    expect(clamped.y).toBeCloseTo((300 - 800) / 2)
  })

  it('clamps to the edges when the world overflows', () => {
    const view: View = { zoom: 10, x: -50, y: -50 }
    const clamped = clampView(view, WORLD.w, WORLD.h, 1000, 800)
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(0)
  })

  it('stops at the far edge rather than scrolling past it', () => {
    const view: View = { zoom: 10, x: 9999, y: 9999 }
    const clamped = clampView(view, WORLD.w, WORLD.h, 1000, 800)
    expect(clamped.x).toBeCloseTo(400 - 1000 / 10)
    expect(clamped.y).toBeCloseTo(300 - 800 / 10)
  })

  it('leaves an already-valid view untouched', () => {
    const view: View = { zoom: 10, x: 20, y: 15 }
    expect(clampView(view, WORLD.w, WORLD.h, 1000, 800)).toEqual(view)
  })

  it('never changes the zoom', () => {
    for (const zoom of [0.5, 1, 3.7, 48]) {
      expect(clampView({ zoom, x: 5, y: 5 }, WORLD.w, WORLD.h, 1000, 800).zoom).toBe(zoom)
    }
  })

  it('is idempotent', () => {
    const once = clampView({ zoom: 3, x: -900, y: 700 }, WORLD.w, WORLD.h, 1000, 800)
    expect(clampView(once, WORLD.w, WORLD.h, 1000, 800)).toEqual(once)
  })
})

describe('fitView', () => {
  it('frames the whole world', () => {
    const view = fitView(400, 300, 1000, 800)
    expect(view.zoom).toBeCloseTo(2.5)
    // Everything from (0,0) to (400,300) must be on screen.
    expect(view.x).toBeLessThanOrEqual(0)
    expect(view.y).toBeLessThanOrEqual(0)
    expect(view.x + 1000 / view.zoom).toBeGreaterThanOrEqual(400)
    expect(view.y + 800 / view.zoom).toBeGreaterThanOrEqual(300)
  })

  it('centres the world on the axis with slack', () => {
    const view = fitView(400, 300, 1000, 800)
    const visibleH = 800 / view.zoom
    expect(view.y).toBeCloseTo((300 - visibleH) / 2)
  })

  it('is stable when applied twice', () => {
    const once = fitView(400, 300, 1000, 800)
    expect(clampView(once, 400, 300, 1000, 800)).toEqual(once)
  })

  it('handles a world larger than any zoom can fit', () => {
    const view = fitView(100000, 100000, 800, 600)
    expect(view.zoom).toBe(MIN_ZOOM)
    expect(view.x).toBeGreaterThanOrEqual(0)
  })
})

describe('view margins', () => {
  // The seam annotations are drawn outside the world's edges, so the camera
  // has to be allowed to sit slightly beyond them.

  it('lets the camera pan past the edges by the margin', () => {
    // Zoomed in far enough that the world overflows the viewport.
    const clamped = clampView({ zoom: 10, x: -50, y: -50 }, 400, 300, 1000, 800, 6)
    expect(clamped.x).toBe(-6)
    expect(clamped.y).toBe(-6)
  })

  it('stops at the far edge plus the margin', () => {
    const clamped = clampView({ zoom: 10, x: 9999, y: 9999 }, 400, 300, 1000, 800, 6)
    expect(clamped.x).toBe(400 + 6 - 1000 / 10)
    expect(clamped.y).toBe(300 + 6 - 800 / 10)
  })

  it('still centres on the world, not the margins, once everything fits', () => {
    const clamped = clampView({ zoom: 1, x: 0, y: 0 }, 400, 300, 1000, 800, 6)
    expect(clamped.x).toBe((400 - 1000) / 2)
    expect(clamped.y).toBe((300 - 800) / 2)
  })

  it('zooms out far enough to show the margin around a fitted world', () => {
    const bare = fitView(400, 300, 1000, 800)
    const margined = fitView(400, 300, 1000, 800, 6)
    expect(margined.zoom).toBeLessThan(bare.zoom)
    // 412 cells across has to fit in 1000px.
    expect(margined.zoom).toBeCloseTo(1000 / 412)
  })

  it('behaves exactly as before when no margin is asked for', () => {
    expect(clampView({ zoom: 3, x: 20, y: 20 }, 400, 300, 1000, 800, 0)).toEqual(
      clampView({ zoom: 3, x: 20, y: 20 }, 400, 300, 1000, 800),
    )
    expect(fitView(400, 300, 1000, 800, 0)).toEqual(fitView(400, 300, 1000, 800))
  })
})
