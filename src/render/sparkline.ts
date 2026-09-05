/**
 * Population sparkline drawing. The value -> coordinate maths is kept
 * separate from the canvas calls so it's unit tested even though the actual
 * `stroke()` isn't (see vitest.config.ts — no DOM; canvas work is verified by
 * driving the app, same as `Canvas2DRenderer`).
 */

/** Width reserved at the left for the y-axis labels and rule. */
export const AXIS_GUTTER = 38
/** Keeps the peak and trough off the canvas edge, where a 1.5px stroke would
 * be half clipped. */
export const PAD_Y = 3

/** Map to [0, 1], min -> 0, max -> 1. Flat data (including a single point)
 * has no trend to show, so it renders as a flat mid-line rather than
 * collapsing to 0. */
export function normalize(values: number[]): number[] {
  if (values.length === 0) return []
  const { min, max } = extent(values)
  if (min === max) return values.map(() => 0.5)
  const span = max - min
  return values.map((v) => (v - min) / span)
}

/** The plotted range, which the y-axis labels annotate. Empty data has no
 * range; `{ min: 0, max: 0 }` keeps callers from having to null-check for a
 * chart that draws nothing anyway. */
export function extent(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 }
  let min = values[0]
  let max = values[0]
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}

/**
 * Axis labels have about 32px to live in, so a large world's population
 * ("1,918,404") has to be abbreviated or it overruns the gutter. One decimal
 * below 100 units, none above, so the label never exceeds five characters.
 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs < 1000) return String(value)
  const [unit, suffix] = abs < 1e6 ? ([1e3, 'k'] as const) : ([1e6, 'M'] as const)
  const scaled = value / unit
  const text = Math.abs(scaled) < 100 ? scaled.toFixed(1) : scaled.toFixed(0)
  return `${text.replace(/\.0$/, '')}${suffix}`
}

/** Horizontal centre of sample `index`. A lone sample sits at the axis rather
 * than dividing by a zero-width span. */
export function plotX(index: number, count: number, width: number): number {
  if (count <= 1) return AXIS_GUTTER
  return AXIS_GUTTER + (index * (width - AXIS_GUTTER)) / (count - 1)
}

/** Vertical position of an already-normalised value. Canvas y grows downward,
 * so 1 (the maximum) maps to the top. */
export function plotY(normalized: number, height: number): number {
  return height - PAD_Y - normalized * (height - 2 * PAD_Y)
}

/**
 * The sample nearest a pointer's x, for hover readouts — the inverse of
 * `plotX`, clamped so dragging off either end sticks to the end sample rather
 * than reading nothing. Returns -1 only when there is no data to hit.
 */
export function indexAtX(x: number, count: number, width: number): number {
  if (count <= 0) return -1
  if (count === 1) return 0
  const step = (width - AXIS_GUTTER) / (count - 1)
  const index = Math.round((x - AXIS_GUTTER) / step)
  return Math.min(count - 1, Math.max(0, index))
}

export interface DrawSparklineOptions {
  width: number
  height: number
  color: string
  /** The axis rule and its labels — dimmer than the trend line, which is the
   * thing actually being read. */
  axisColor: string
  labelColor: string
  /** Sample to mark with a crosshair, or null when the pointer is away. */
  highlight?: number | null
}

/** Clears and strokes a polyline through the normalised values, with the
 * plotted range labelled down the left. Needs at least two points to draw a
 * line at all. */
export function drawSparkline(
  ctx: CanvasRenderingContext2D,
  values: number[],
  { width, height, color, axisColor, labelColor, highlight = null }: DrawSparklineOptions,
): void {
  ctx.clearRect(0, 0, width, height)
  if (values.length < 2) return
  const norm = normalize(values)
  const { min, max } = extent(values)

  // Axis rule. The half-pixel offset keeps a 1px line on the pixel grid
  // instead of straddling two and rendering as a 2px blur.
  ctx.strokeStyle = axisColor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(AXIS_GUTTER - 0.5, PAD_Y)
  ctx.lineTo(AXIS_GUTTER - 0.5, height - PAD_Y)
  ctx.stroke()

  // Bounds, right-aligned against the rule. Flat data has a single value
  // rather than a range, so labelling it twice would just be noise.
  ctx.fillStyle = labelColor
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textAlign = 'right'
  const labelX = AXIS_GUTTER - 5
  if (min === max) {
    ctx.textBaseline = 'middle'
    ctx.fillText(formatCompact(max), labelX, height / 2)
  } else {
    ctx.textBaseline = 'top'
    ctx.fillText(formatCompact(max), labelX, PAD_Y - 1)
    ctx.textBaseline = 'bottom'
    ctx.fillText(formatCompact(min), labelX, height - PAD_Y + 1)
  }

  // Trend line.
  ctx.beginPath()
  norm.forEach((n, i) => {
    const x = plotX(i, norm.length, width)
    const y = plotY(n, height)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Hover crosshair, drawn over the line so the marked point stays readable
  // against it.
  if (highlight !== null && highlight >= 0 && highlight < norm.length) {
    const x = plotX(highlight, norm.length, width)
    const y = plotY(norm[highlight], height)
    ctx.strokeStyle = axisColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(x) - 0.5, PAD_Y)
    ctx.lineTo(Math.round(x) - 0.5, height - PAD_Y)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
}
