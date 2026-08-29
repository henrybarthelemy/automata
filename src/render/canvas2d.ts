import type { World } from '../sim/world'
import { buildLuts, type Palette } from './palettes'
import type { View } from './view'

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
  private dpr = 1

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
  }

  setPalette(palette: Palette): void {
    const luts = buildLuts(palette)
    this.aliveLut = luts.alive
    this.trailLut = luts.trail
    this.background = packColor(palette.background)
    this.backgroundCss = palette.background
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

  draw(world: World, view: View): void {
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
  }
}
