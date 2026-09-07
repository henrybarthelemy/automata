import type { Vec3 } from './surfaces'

/**
 * Where the camera is when the world is a shape rather than a sheet.
 *
 * The 3D counterpart of `view.ts`: pure camera arithmetic with nothing in it
 * from Three.js or the DOM, so it is unit tested alongside the simulation.
 * Deliberately stops at a position — the renderer hands that to whatever
 * graphics library it uses and lets it build the matrices, since every one of
 * them already has a `lookAt`.
 */
export interface Orbit {
  /** Radians round the vertical axis. Zero looks along -z. */
  azimuth: number
  /** Radians above the horizontal. Clamped short of the poles. */
  elevation: number
  /** How far the camera sits from the target. */
  distance: number
}

/**
 * Straight up the pole the camera's up vector becomes parallel to its
 * direction and the orientation is undefined, so stop just short.
 */
export const MAX_ELEVATION = Math.PI / 2 - 0.015

/**
 * Distance limits, as multiples of the shape's radius rather than absolutes,
 * so every surface behaves the same however big it happens to be.
 */
const MIN_DISTANCE_SCALE = 1.15
const MAX_DISTANCE_SCALE = 12

/** Radians per pixel dragged. */
const DRAG_SPEED = 0.007

const TAU = Math.PI * 2

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

export function clampOrbit(orbit: Orbit, radius: number): Orbit {
  return {
    azimuth: ((orbit.azimuth % TAU) + TAU) % TAU,
    elevation: clamp(orbit.elevation, -MAX_ELEVATION, MAX_ELEVATION),
    distance: clamp(orbit.distance, radius * MIN_DISTANCE_SCALE, radius * MAX_DISTANCE_SCALE),
  }
}

/**
 * Turn a drag into a rotation. The shape follows the pointer: dragging right
 * carries the face toward you off to the right, which means the camera itself
 * travels the other way, and dragging down tips the top of the shape forward.
 */
export function orbitDrag(orbit: Orbit, dxCss: number, dyCss: number): Orbit {
  return {
    azimuth: ((orbit.azimuth - dxCss * DRAG_SPEED) % TAU + TAU) % TAU,
    elevation: clamp(orbit.elevation + dyCss * DRAG_SPEED, -MAX_ELEVATION, MAX_ELEVATION),
    distance: orbit.distance,
  }
}

/**
 * Zoom, taking the same factor the 2D view's `zoomAbout` takes: above one
 * means closer, which here is a shorter arm rather than a bigger scale.
 */
export function orbitDolly(orbit: Orbit, factor: number, radius: number): Orbit {
  return clampOrbit({ ...orbit, distance: orbit.distance / factor }, radius)
}

export function eyePosition(orbit: Orbit, center: Vec3): Vec3 {
  const flat = orbit.distance * Math.cos(orbit.elevation)
  return [
    center[0] + flat * Math.sin(orbit.azimuth),
    center[1] + orbit.distance * Math.sin(orbit.elevation),
    center[2] + flat * Math.cos(orbit.azimuth),
  ]
}

/**
 * How far back a sphere of `radius` has to sit to fill the frame.
 *
 * The vertical field of view is fixed, so a viewport narrower than it is tall
 * is the tighter constraint and the camera has to retreat further; once it is
 * wider than tall, height is the limit and the aspect stops mattering.
 */
export function fitDistance(radius: number, fovYDegrees: number, aspect: number): number {
  const fovY = (fovYDegrees * Math.PI) / 180
  const halfY = fovY / 2
  const halfX = Math.atan(Math.tan(halfY) * aspect)
  return radius / Math.sin(Math.min(halfY, halfX))
}
