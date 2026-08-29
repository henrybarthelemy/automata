import { mulberry32 } from './rng'
import type { Rule } from './lifelike'

export interface StepStats {
  generation: number
  population: number
  births: number
  deaths: number
}

/** Floor brightness for a living cell, so newborns never read as background. */
export const BIRTH_HEAT = 72

export interface HeatParams {
  /** How fast a living cell ramps toward full brightness. */
  ageRate: number
  /** How fast a dead cell's trail fades. 255 = no trail. */
  decayRate: number
}

/**
 * A toroidal grid of binary cells.
 *
 * The cell arrays carry a one-cell halo border: index (x, y) lives at
 * (y + 1) * stride + (x + 1). Before each step the halo is filled from the
 * opposite edges, which lets the inner loop count neighbours with constant
 * flat-index offsets — no modulo and no bounds checks in the hot path.
 */
export class World {
  width: number
  height: number
  stride: number
  cells: Uint8Array
  private next: Uint8Array
  /** Per-cell brightness: ramps up while alive, decays after death. */
  heat: Uint8Array
  generation = 0
  population = 0

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.stride = width + 2
    const size = this.stride * (height + 2)
    this.cells = new Uint8Array(size)
    this.next = new Uint8Array(size)
    this.heat = new Uint8Array(size)
  }

  index(x: number, y: number): number {
    return (y + 1) * this.stride + (x + 1)
  }

  get(x: number, y: number): number {
    return this.cells[this.index(x, y)]
  }

  set(x: number, y: number, alive: boolean): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = this.index(x, y)
    if (this.cells[i] === (alive ? 1 : 0)) return
    this.cells[i] = alive ? 1 : 0
    this.population += alive ? 1 : -1
    if (alive) this.heat[i] = Math.max(this.heat[i], BIRTH_HEAT)
  }

  /** Paint a filled circle of cells, used by the brush. */
  paint(x: number, y: number, radius: number, alive: boolean): void {
    if (radius <= 1) {
      this.set(x, y, alive)
      return
    }
    const r = radius - 1
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) this.set(x + dx, y + dy, alive)
      }
    }
  }

  /** Bresenham between successive pointer samples, so fast drags leave no gaps. */
  paintLine(x0: number, y0: number, x1: number, y1: number, radius: number, alive: boolean): void {
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    let x = x0
    let y = y0
    for (;;) {
      this.paint(x, y, radius, alive)
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x += sx
      }
      if (e2 <= dx) {
        err += dx
        y += sy
      }
    }
  }

  clear(): void {
    this.cells.fill(0)
    this.heat.fill(0)
    this.population = 0
    this.generation = 0
  }

  randomize(seed: number, density: number): void {
    const rand = mulberry32(seed)
    this.clear()
    let population = 0
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (rand() < density) {
          const i = this.index(x, y)
          this.cells[i] = 1
          this.heat[i] = BIRTH_HEAT
          population++
        }
      }
    }
    this.population = population
  }

  /** Grow or shrink, keeping whatever overlaps the new bounds. */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return
    const old = { cells: this.cells, heat: this.heat, stride: this.stride, width: this.width, height: this.height }
    const generation = this.generation
    const stride = width + 2
    const size = stride * (height + 2)
    this.cells = new Uint8Array(size)
    this.next = new Uint8Array(size)
    this.heat = new Uint8Array(size)
    this.width = width
    this.height = height
    this.stride = stride

    const copyW = Math.min(old.width, width)
    const copyH = Math.min(old.height, height)
    let population = 0
    for (let y = 0; y < copyH; y++) {
      const from = (y + 1) * old.stride + 1
      const to = (y + 1) * stride + 1
      for (let x = 0; x < copyW; x++) {
        const cell = old.cells[from + x]
        this.cells[to + x] = cell
        this.heat[to + x] = old.heat[from + x]
        population += cell
      }
    }
    this.population = population
    this.generation = generation
  }

  /** Mirror the outer edges into the halo so neighbour reads wrap. */
  private wrapEdges(): void {
    const { cells, stride, width: w, height: h } = this
    cells.copyWithin(1, h * stride + 1, h * stride + 1 + w)
    cells.copyWithin((h + 1) * stride + 1, stride + 1, stride + 1 + w)
    for (let y = 0; y <= h + 1; y++) {
      const row = y * stride
      cells[row] = cells[row + w]
      cells[row + w + 1] = cells[row + 1]
    }
  }

  step(rule: Rule, heatParams: HeatParams): StepStats {
    this.wrapEdges()
    const { cells, next, heat, stride, width: w, height: h } = this
    const { born, survive } = rule
    const { ageRate, decayRate } = heatParams

    let population = 0
    let births = 0
    let deaths = 0

    for (let y = 1; y <= h; y++) {
      const row = y * stride
      for (let x = 1; x <= w; x++) {
        const i = row + x
        const up = i - stride
        const down = i + stride
        const n =
          cells[up - 1] + cells[up] + cells[up + 1] +
          cells[i - 1] + cells[i + 1] +
          cells[down - 1] + cells[down] + cells[down + 1]

        const alive = cells[i]
        const nextAlive = (alive ? survive : born) >> n & 1
        next[i] = nextAlive

        if (nextAlive) {
          population++
          if (!alive) births++
          const warmed = heat[i] + ageRate
          heat[i] = warmed > 255 ? 255 : warmed < BIRTH_HEAT ? BIRTH_HEAT : warmed
        } else {
          if (alive) deaths++
          const cooled = heat[i] - decayRate
          heat[i] = cooled < 0 ? 0 : cooled
        }
      }
    }

    this.cells = next
    this.next = cells
    this.population = population
    this.generation++

    return { generation: this.generation, population, births, deaths }
  }
}
