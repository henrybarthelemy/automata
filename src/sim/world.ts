import { mulberry32 } from './rng'
import type { Rule } from './lifelike'
import type { Pattern } from './rle'

export interface StepStats {
  generation: number
  population: number
  births: number
  deaths: number
}

/** Floor brightness for a living cell, so newborns never read as background. */
export const BIRTH_HEAT = 72

/**
 * Under a Generations rule the dying states own the lower part of the ramp, so
 * living cells are floored well above them. Without this the two read as the
 * same colour in rules like Brian's Brain, where nothing survives long enough
 * for the age ramp to separate them.
 */
export const GENERATIONS_LIVE_FLOOR = 160

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
  /**
   * Generations countdown, 0 where the cell is not dying. Kept separate from
   * `cells` so that stays strictly 0/1 and the neighbour count can remain a
   * raw sum with no comparisons in the hot loop.
   */
  dying: Uint8Array
  private nextDying: Uint8Array
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
    this.dying = new Uint8Array(size)
    this.nextDying = new Uint8Array(size)
    this.heat = new Uint8Array(size)
  }

  index(x: number, y: number): number {
    return (y + 1) * this.stride + (x + 1)
  }

  get(x: number, y: number): number {
    return this.cells[this.index(x, y)]
  }

  /** 0 empty, 1 alive, 2..states-1 counting down under a Generations rule. */
  state(x: number, y: number): number {
    const i = this.index(x, y)
    return this.cells[i] ? 1 : this.dying[i]
  }

  set(x: number, y: number, alive: boolean): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = this.index(x, y)
    const target = alive ? 1 : 0
    if (this.cells[i] !== target) {
      this.cells[i] = target
      this.population += alive ? 1 : -1
    }
    // Drawing overrides a countdown either way, so this runs even when the
    // live/dead flag was already correct.
    this.dying[i] = 0
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

  /**
   * Place a pattern with its top-left at (x, y). Cells outside the world are
   * dropped rather than wrapped, so a stamp near an edge is clipped.
   */
  stamp(pattern: Pattern, x: number, y: number): void {
    for (let py = 0; py < pattern.height; py++) {
      for (let px = 0; px < pattern.width; px++) {
        if (pattern.cells[py * pattern.width + px]) this.set(x + px, y + py, true)
      }
    }
  }

  /** Extract the bounding box of live cells, for export. Null if empty. */
  toPattern(): Pattern | null {
    let minX = this.width
    let minY = this.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < this.height; y++) {
      const row = (y + 1) * this.stride + 1
      for (let x = 0; x < this.width; x++) {
        if (!this.cells[row + x]) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (maxX < 0) return null

    const width = maxX - minX + 1
    const height = maxY - minY + 1
    const cells = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      const row = (minY + y + 1) * this.stride + 1 + minX
      for (let x = 0; x < width; x++) cells[y * width + x] = this.cells[row + x]
    }
    return { width, height, cells }
  }

  clear(): void {
    this.cells.fill(0)
    this.dying.fill(0)
    this.nextDying.fill(0)
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
    const old = {
      cells: this.cells,
      dying: this.dying,
      heat: this.heat,
      stride: this.stride,
      width: this.width,
      height: this.height,
    }
    const generation = this.generation
    const stride = width + 2
    const size = stride * (height + 2)
    this.cells = new Uint8Array(size)
    this.next = new Uint8Array(size)
    this.dying = new Uint8Array(size)
    this.nextDying = new Uint8Array(size)
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
        this.dying[to + x] = old.dying[from + x]
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
    // Two separate loops rather than one with a branch inside it. Sharing the
    // loop costs the binary path about 14%, and ordinary Life is the common
    // case, so the duplication buys back the hot path.
    const counts =
      rule.states > 2
        ? this.stepGenerations(rule, heatParams)
        : this.stepBinary(rule, heatParams)

    this.population = counts.population
    this.generation++
    return { generation: this.generation, ...counts }
  }

  /** Ordinary two-state Life. Kept free of Generations bookkeeping. */
  private stepBinary(rule: Rule, heatParams: HeatParams) {
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
    return { population, births, deaths }
  }

  /**
   * Generations: a cell that fails to survive walks down states 2..states-1
   * before emptying. Dying cells are not alive, so they are absent from the
   * neighbour count and cannot be born into.
   */
  private stepGenerations(rule: Rule, heatParams: HeatParams) {
    const { cells, next, dying, nextDying, heat, stride, width: w, height: h } = this
    const { born, survive, states } = rule
    const { ageRate } = heatParams
    const lastState = states - 1

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
        const countdown = dying[i]
        let nextAlive = 0
        let nextCountdown = 0

        if (alive) {
          nextAlive = survive >> n & 1
          if (!nextAlive) nextCountdown = 2
        } else if (countdown) {
          // Deaf to its neighbours; it only counts down.
          const advanced = countdown + 1
          nextCountdown = advanced > lastState ? 0 : advanced
        } else {
          nextAlive = born >> n & 1
        }

        next[i] = nextAlive
        nextDying[i] = nextCountdown

        if (nextAlive) {
          population++
          if (!alive) births++
          const warmed = heat[i] + ageRate
          heat[i] =
            warmed > 255
              ? 255
              : warmed < GENERATIONS_LIVE_FLOOR
                ? GENERATIONS_LIVE_FLOOR
                : warmed
        } else if (nextCountdown) {
          if (alive) deaths++
          // Render the countdown on the existing ramp, brightest when freshly
          // dying, so Generations needs no renderer change at all.
          heat[i] = Math.round((255 * (states - nextCountdown)) / lastState)
        } else {
          if (alive) deaths++
          heat[i] = 0
        }
      }
    }

    this.cells = next
    this.next = cells
    this.dying = nextDying
    this.nextDying = dying
    return { population, births, deaths }
  }
}
