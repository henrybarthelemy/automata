import { describe, expect, it } from 'vitest'
import {
  clampOrbit,
  eyePosition,
  fitDistance,
  MAX_ELEVATION,
  orbitDolly,
  orbitDrag,
  type Orbit,
} from './orbit'

const AT: Orbit = { azimuth: 0, elevation: 0, distance: 6 }
const ORIGIN: [number, number, number] = [0, 0, 0]
const RADIUS = 2.5

describe('eyePosition', () => {
  it('starts on the +z axis looking back at the target', () => {
    const [x, y, z] = eyePosition(AT, ORIGIN)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(6)
  })

  it('swings a quarter turn onto the +x axis', () => {
    const [x, y, z] = eyePosition({ ...AT, azimuth: Math.PI / 2 }, ORIGIN)
    expect(x).toBeCloseTo(6)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(0)
  })

  it('rises toward the pole as elevation increases', () => {
    const [, y] = eyePosition({ ...AT, elevation: MAX_ELEVATION }, ORIGIN)
    expect(y).toBeGreaterThan(5.9)
    expect(y).toBeLessThan(6)
  })

  it('stays exactly the orbit distance from the target, wherever it is', () => {
    const center: [number, number, number] = [1, -2, 0.5]
    for (const azimuth of [0, 1, 2.5, 4, 6]) {
      for (const elevation of [-1.2, -0.3, 0, 0.7, 1.4]) {
        const eye = eyePosition({ azimuth, elevation, distance: 6 }, center)
        const d = Math.hypot(eye[0] - center[0], eye[1] - center[1], eye[2] - center[2])
        expect(d).toBeCloseTo(6)
      }
    }
  })
})

describe('clampOrbit', () => {
  it('keeps the camera off the poles, where the up vector degenerates', () => {
    expect(clampOrbit({ ...AT, elevation: 9 }, RADIUS).elevation).toBe(MAX_ELEVATION)
    expect(clampOrbit({ ...AT, elevation: -9 }, RADIUS).elevation).toBe(-MAX_ELEVATION)
    expect(MAX_ELEVATION).toBeLessThan(Math.PI / 2)
  })

  it('holds the camera outside the shape and within sight of it', () => {
    // The limits scale with the surface, so every shape behaves the same.
    expect(clampOrbit({ ...AT, distance: 0.01 }, RADIUS).distance).toBeGreaterThan(RADIUS)
    expect(clampOrbit({ ...AT, distance: 1e6 }, RADIUS).distance).toBeLessThan(RADIUS * 20)
  })

  it('normalises azimuth into one turn', () => {
    expect(clampOrbit({ ...AT, azimuth: 7 * Math.PI }, RADIUS).azimuth).toBeCloseTo(Math.PI)
    expect(clampOrbit({ ...AT, azimuth: -Math.PI / 2 }, RADIUS).azimuth).toBeCloseTo(
      (3 * Math.PI) / 2,
    )
  })
})

describe('orbitDrag', () => {
  it('spins the shape the way the pointer moves', () => {
    // Dragging right should carry the near face right, which means the camera
    // travels the other way.
    expect(orbitDrag(AT, 40, 0).azimuth).toBeCloseTo(2 * Math.PI - orbitDrag(AT, -40, 0).azimuth)
    expect(orbitDrag({ ...AT, azimuth: Math.PI }, 40, 0).azimuth).toBeLessThan(Math.PI)
  })

  it('tips the shape toward you when dragging down', () => {
    expect(orbitDrag(AT, 0, 40).elevation).toBeGreaterThan(0)
    expect(orbitDrag(AT, 0, -40).elevation).toBeLessThan(0)
  })

  it('cannot be dragged over the pole', () => {
    expect(orbitDrag(AT, 0, 100000).elevation).toBe(MAX_ELEVATION)
  })

  it('leaves distance alone', () => {
    expect(orbitDrag(AT, 30, 30).distance).toBe(AT.distance)
  })
})

describe('orbitDolly', () => {
  it('reads a zoom factor the same way the 2D view does', () => {
    // A factor above one means "closer", which for an orbit is less distance.
    expect(orbitDolly(AT, 2, RADIUS).distance).toBeLessThan(AT.distance)
    expect(orbitDolly(AT, 0.5, RADIUS).distance).toBeGreaterThan(AT.distance)
  })

  it('stops before it reaches the surface', () => {
    let orbit = AT
    for (let i = 0; i < 200; i++) orbit = orbitDolly(orbit, 1.5, RADIUS)
    expect(orbit.distance).toBeGreaterThan(RADIUS)
  })
})

describe('fitDistance', () => {
  it('backs off further for a bigger shape, in proportion', () => {
    const small = fitDistance(1, 45, 1.5)
    const big = fitDistance(3, 45, 1.5)
    expect(big / small).toBeCloseTo(3)
  })

  it('backs off further through a narrower lens', () => {
    expect(fitDistance(2, 20, 1.5)).toBeGreaterThan(fitDistance(2, 60, 1.5))
  })

  it('backs off further in a tall thin viewport, where width is the tight fit', () => {
    // Vertical field of view is fixed, so a narrow viewport is the constraint.
    expect(fitDistance(2, 45, 0.4)).toBeGreaterThan(fitDistance(2, 45, 1))
    expect(fitDistance(2, 45, 3)).toBeCloseTo(fitDistance(2, 45, 1))
  })

  it('actually fits the sphere it was asked to fit', () => {
    // At the returned distance the shape's silhouette should just touch the
    // edge of a 45-degree frame.
    const radius = 2.5
    const d = fitDistance(radius, 45, 2)
    expect(Math.asin(radius / d)).toBeCloseTo((45 * Math.PI) / 180 / 2)
  })
})
