import type { World } from '../sim/world'
import type { Pattern } from '../sim/rle'
import { accentColor, buildLuts, type Palette } from './palettes'
import { buildSeamBands, seamMarks, SEAM_BAND, type SeamBand, type SeamMark } from './seams'
import type { View } from './view'

/** A scratch canvas one seam band is assembled in before being blitted. */
interface BandBuffer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  image: ImageData
  pixels: Uint32Array
}

function makeBandBuffer(width: number, height: number): BandBuffer {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('2D canvas context unavailable')
  const image = ctx.createImageData(width, height)
  return { canvas, ctx, image, pixels: new Uint32Array(image.data.buffer) }
}

/** A pattern ghosted at a grid position, before it is committed. */
export interface Preview {
  pattern: Pattern
  x: number
  y: number
}

/** The hottest stop, used to ghost a pattern before it is placed. */
function brightest(palette: Palette): string {
  const [r, g, b] = palette.stops[palette.stops.length - 1]
  return `rgb(${r}, ${g}, ${b})`
}

function packColor(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (255 << 24) | (((n & 0xff) << 16) | (((n >> 8) & 0xff) << 8) | ((n >> 16) & 0xff))
}

/**
 * Draws one pixel per *visible* cell into an ImageData, then blits that scaled
 * up with smoothing off. Cost tracks the size of the viewport rather than the
 * size of the world, so zooming into a large grid stays cheap.
 *
 * Deliberately behind a narrow surface (resize / setPalette / draw) so a WebGL
 * backend can replace it later without the UI noticing.
 */
export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D
  private buffer: HTMLCanvasElement
  private bufferCtx: CanvasRenderingContext2D
  private image: ImageData | null = null
  private pixels: Uint32Array | null = null
  private aliveLut: Uint32Array
  private trailLut: Uint32Array
  private background = 0xff000000
  private backgroundCss = '#000000'
  private previewCss = '#ffffff'
  private seamCss = '#ffffff'
  private dpr = 1

  // Seam annotations. The index maps depend only on the topology and the
  // world's size, so they are rebuilt on a change and reused every frame.
  private showSeams = true
  private seamKey = ''
  private bands: SeamBand[] = []
  private marks: SeamMark[] = []
  private hBand: BandBuffer | null = null
  private vBand: BandBuffer | null = null

  constructor(private canvas: HTMLCanvasElement, palette: Palette) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx

    this.buffer = document.createElement('canvas')
    const bufferCtx = this.buffer.getContext('2d', { alpha: false })
    if (!bufferCtx) throw new Error('2D canvas context unavailable')
    this.bufferCtx = bufferCtx

    const luts = buildLuts(palette)
    this.aliveLut = luts.alive
    this.trailLut = luts.trail
    this.background = packColor(palette.background)
    this.backgroundCss = palette.background
    this.previewCss = brightest(palette)
    this.seamCss = accentColor(palette)
  }

  setPalette(palette: Palette): void {
    const luts = buildLuts(palette)
    this.aliveLut = luts.alive
    this.trailLut = luts.trail
    this.background = packColor(palette.background)
    this.backgroundCss = palette.background
    this.previewCss = brightest(palette)
    this.seamCss = accentColor(palette)
  }

  /** Whether to annotate the edges with what lies across them. */
  setShowSeams(show: boolean): void {
    this.showSeams = show
  }

  /** The canvas fills its container; the view decides what's shown inside it. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr))
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr))
  }

  /**
   * Size the scratch buffer to the widest span the viewport can show. It
   * depends only on zoom and canvas size, so panning never reallocates.
   */
  private ensureBuffer(width: number, height: number): void {
    if (this.image && this.buffer.width === width && this.buffer.height === height) return
    this.buffer.width = width
    this.buffer.height = height
    this.image = this.bufferCtx.createImageData(width, height)
    this.pixels = new Uint32Array(this.image.data.buffer)
  }

  draw(world: World, view: View, preview?: Preview | null): void {
    const canvasW = this.canvas.width
    const canvasH = this.canvas.height
    const scale = view.zoom * this.dpr

    this.ctx.fillStyle = this.backgroundCss
    this.ctx.fillRect(0, 0, canvasW, canvasH)

    const x0 = Math.max(0, Math.floor(view.x))
    const y0 = Math.max(0, Math.floor(view.y))
    const x1 = Math.min(world.width, Math.ceil(view.x + canvasW / scale))
    const y1 = Math.min(world.height, Math.ceil(view.y + canvasH / scale))
    const visibleW = x1 - x0
    const visibleH = y1 - y0
    if (visibleW <= 0 || visibleH <= 0) return

    this.ensureBuffer(
      Math.min(world.width, Math.ceil(canvasW / scale) + 1),
      Math.min(world.height, Math.ceil(canvasH / scale) + 1),
    )
    const { image, pixels } = this
    if (!image || !pixels) return

    const { cells, heat, stride } = world
    const { aliveLut, trailLut, background } = this
    const bufferW = this.buffer.width

    for (let y = 0; y < visibleH; y++) {
      const src = (y0 + y + 1) * stride + (x0 + 1)
      const dst = y * bufferW
      for (let x = 0; x < visibleW; x++) {
        const i = src + x
        const value = heat[i]
        pixels[dst + x] = cells[i]
          ? aliveLut[value]
          : value === 0
            ? background
            : trailLut[value]
      }
    }

    this.bufferCtx.putImageData(image, 0, 0)
    // Below one pixel per cell we are downsampling, so let the browser average
    // rather than drop cells and make a sparse board look empty.
    this.ctx.imageSmoothingEnabled = view.zoom < 1
    this.ctx.drawImage(
      this.buffer,
      0,
      0,
      visibleW,
      visibleH,
      (x0 - view.x) * scale,
      (y0 - view.y) * scale,
      visibleW * scale,
      visibleH * scale,
    )

    if (this.showSeams) this.drawSeams(world, view, scale)
    if (preview) this.drawPreview(preview, view, scale)
  }

  /**
   * Rebuild the seam data when the surface or the world's size changes. Two
   * scratch canvases are enough for all four bands: the top and bottom share
   * one laid out along the world's width, the left and right share the other.
   */
  private ensureSeams(world: World): void {
    const key = `${world.topology}:${world.width}x${world.height}`
    if (key === this.seamKey) return
    this.seamKey = key
    this.bands = buildSeamBands(world.topology, world.width, world.height, world.stride)
    this.marks = seamMarks(world.topology, world.width, world.height)
    this.hBand = makeBandBuffer(world.width, SEAM_BAND)
    this.vBand = makeBandBuffer(SEAM_BAND, world.height)
  }

  /**
   * A dimmed strip of whatever lies across each edge, plus the arrows of the
   * fundamental polygon. Without these a Klein bottle and a torus are the same
   * picture until something crosses a seam.
   */
  private drawSeams(world: World, view: View, scale: number): void {
    this.ensureSeams(world)
    const { cells, heat } = world
    const { aliveLut, trailLut, background } = this

    this.ctx.save()
    this.ctx.imageSmoothingEnabled = false
    this.ctx.globalAlpha = 0.32
    for (const band of this.bands) {
      // Keyed on the edge, not the buffer's width: a world only SEAM_BAND
      // cells wide would otherwise route a horizontal band to the vertical
      // scratch canvas.
      const vertical = band.edge === 'left' || band.edge === 'right'
      const target = vertical ? this.vBand : this.hBand
      if (!target) continue
      const { indices } = band
      const { pixels } = target
      for (let i = 0; i < indices.length; i++) {
        const source = indices[i]
        if (source < 0) {
          pixels[i] = background
          continue
        }
        const value = heat[source]
        pixels[i] = cells[source]
          ? aliveLut[value]
          : value === 0
            ? background
            : trailLut[value]
      }
      target.ctx.putImageData(target.image, 0, 0)
      this.ctx.drawImage(
        target.canvas,
        0,
        0,
        band.bufferW,
        band.bufferH,
        (band.originX - view.x) * scale,
        (band.originY - view.y) * scale,
        band.bufferW * scale,
        band.bufferH * scale,
      )
    }
    this.ctx.restore()

    this.drawSeamOutline(world, view, scale)
    for (const mark of this.marks) this.drawSeamArrows(mark, world, view, scale)
  }

  /** The world's own boundary, so the band reads as outside rather than part of it. */
  private drawSeamOutline(world: World, view: View, scale: number): void {
    this.ctx.save()
    this.ctx.globalAlpha = 0.5
    this.ctx.strokeStyle = this.seamCss
    this.ctx.lineWidth = Math.max(1, this.dpr)
    this.ctx.strokeRect(
      (0 - view.x) * scale,
      (0 - view.y) * scale,
      world.width * scale,
      world.height * scale,
    )
    this.ctx.restore()
  }

  /**
   * Chevrons along one edge, in the notation used to draw a surface as a
   * polygon with its edges identified: edges glued to each other carry the
   * same number of arrowheads, and arrows that oppose mark a twisted seam.
   */
  private drawSeamArrows(mark: SeamMark, world: World, view: View, scale: number): void {
    const horizontal = mark.edge === 'top' || mark.edge === 'bottom'
    const length = horizontal ? world.width : world.height
    const offset = SEAM_BAND / 2
    // Down the middle of the band, on the outside of the edge it belongs to.
    const across =
      mark.edge === 'top' ? -offset
      : mark.edge === 'bottom' ? world.height + offset
      : mark.edge === 'left' ? -offset
      : world.width + offset

    const spanPx = length * scale
    if (spanPx < 24) return
    const count = Math.max(2, Math.min(20, Math.round(spanPx / (96 * this.dpr))))
    const size = 5 * this.dpr

    this.ctx.save()
    this.ctx.globalAlpha = 0.9
    this.ctx.strokeStyle = this.seamCss
    this.ctx.lineWidth = 1.6 * this.dpr
    this.ctx.lineCap = 'round'
    this.ctx.lineJoin = 'round'

    for (let i = 0; i < count; i++) {
      const t = (length * (i + 0.5)) / count
      const alongPx = horizontal ? (t - view.x) * scale : (t - view.y) * scale
      const acrossPx = horizontal ? (across - view.y) * scale : (across - view.x) * scale
      // A second arrowhead marks the other pair, the way a fundamental polygon
      // labels its two edge classes.
      for (let head = 0; head <= mark.pair; head++) {
        const shift = head * size * 1.1 * mark.direction
        this.ctx.beginPath()
        for (const side of [-1, 1]) {
          const tipAlong = alongPx + shift
          const tailAlong = tipAlong - size * mark.direction
          if (horizontal) {
            this.ctx.moveTo(tailAlong, acrossPx + side * size)
            this.ctx.lineTo(tipAlong, acrossPx)
          } else {
            this.ctx.moveTo(acrossPx + side * size, tailAlong)
            this.ctx.lineTo(acrossPx, tipAlong)
          }
        }
        this.ctx.stroke()
      }
    }
    this.ctx.restore()
  }

  /**
   * Ghost the pending stamp on top. Patterns are small — tens of cells — so a
   * fillRect each is cheaper than another buffer.
   */
  private drawPreview(preview: Preview, view: View, scale: number): void {
    const { pattern, x: originX, y: originY } = preview
    this.ctx.save()
    this.ctx.globalAlpha = 0.7
    this.ctx.fillStyle = this.previewCss
    for (let py = 0; py < pattern.height; py++) {
      for (let px = 0; px < pattern.width; px++) {
        if (!pattern.cells[py * pattern.width + px]) continue
        this.ctx.fillRect(
          (originX + px - view.x) * scale,
          (originY + py - view.y) * scale,
          Math.max(1, scale),
          Math.max(1, scale),
        )
      }
    }
    this.ctx.restore()
  }
}
