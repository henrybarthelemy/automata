/**
 * Population sparkline drawing. The value -> coordinate maths is kept
 * separate from the canvas calls so it's unit tested even though the actual
 * `stroke()` isn't (see vitest.config.ts — no DOM; canvas work is verified by
 * driving the app, same as `Canvas2DRenderer`).
 */

/** Map to [0, 1], min -> 0, max -> 1. Flat data (including a single point)
 * has no trend to show, so it renders as a flat mid-line rather than
 * collapsing to 0. */
export function normalize(values: number[]): number[] {
  if (values.length === 0) return []
  let min = values[0]
  let max = values[0]
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === max) return values.map(() => 0.5)
  const span = max - min
  return values.map((v) => (v - min) / span)
}

export interface DrawSparklineOptions {
  width: number
  height: number
  color: string
}

/** Clears and strokes a polyline through the normalised values. Needs at
 * least two points to draw a line at all. */
export function drawSparkline(
  ctx: CanvasRenderingContext2D,
  values: number[],
  { width, height, color }: DrawSparklineOptions,
): void {
  ctx.clearRect(0, 0, width, height)
  if (values.length < 2) return
  const norm = normalize(values)
  const stepX = width / (norm.length - 1)
  ctx.beginPath()
  norm.forEach((n, i) => {
    const x = i * stepX
    const y = height - n * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
}
