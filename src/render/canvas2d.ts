import type { World } from '../sim/world'
import { buildLuts, type Palette } from './palettes'

function packColor(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (255 << 24) | (((n & 0xff) << 16) | (((n >> 8) & 0xff) << 8) | ((n >> 16) & 0xff))
}

/**
 * Draws one pixel per cell into an ImageData the size of the grid, then blits
 * that scaled up with smoothing off. Zoom cost is therefore independent of how
 * many cells there are.
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
  private gridWidth = 0
  private gridHeight = 0

  constructor(private canvas: HTMLCanvasElement, palette: Palette) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    this.ctx.imageSmoothingEnabled = false

    this.buffer = document.createElement('canvas')
    const bufferCtx = this.buffer.getContext('2d', { alpha: false })
    if (!bufferCtx) throw new Error('2D canvas context unavailable')
    this.bufferCtx = bufferCtx

    const luts = buildLuts(palette)
    this.aliveLut = luts.alive
    this.trailLut = luts.trail
    this.background = packColor(palette.background)
  }

  setPalette(palette: Palette): void {
    const luts = buildLuts(palette)
    this.aliveLut = luts.alive
    this.trailLut = luts.trail
    this.background = packColor(palette.background)
  }

  /** Size the backing store for a grid drawn at `cellSize` CSS pixels per cell. */
  resize(gridWidth: number, gridHeight: number, cellSize: number, dpr: number): void {
    this.canvas.style.width = `${gridWidth * cellSize}px`
    this.canvas.style.height = `${gridHeight * cellSize}px`
    this.canvas.width = Math.round(gridWidth * cellSize * dpr)
    this.canvas.height = Math.round(gridHeight * cellSize * dpr)
    this.ctx.imageSmoothingEnabled = false

    if (gridWidth !== this.gridWidth || gridHeight !== this.gridHeight) {
      this.buffer.width = gridWidth
      this.buffer.height = gridHeight
      this.image = this.bufferCtx.createImageData(gridWidth, gridHeight)
      this.pixels = new Uint32Array(this.image.data.buffer)
      this.gridWidth = gridWidth
      this.gridHeight = gridHeight
    }
  }

  draw(world: World): void {
    const { image, pixels } = this
    if (!image || !pixels) return
    const { cells, heat, stride, width: w, height: h } = world
    const { aliveLut, trailLut, background } = this

    for (let y = 0; y < h; y++) {
      const src = (y + 1) * stride + 1
      const dst = y * w
      for (let x = 0; x < w; x++) {
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
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height)
  }
}
