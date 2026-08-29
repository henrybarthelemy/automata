import { useCallback, useEffect, useRef, useState } from 'react'
import { World, type StepStats } from '../sim/world'
import { CONWAY, parseRule, type Rule } from '../sim/lifelike'
import { Canvas2DRenderer } from '../render/canvas2d'
import { paletteById } from '../render/palettes'

export interface SimParams {
  rule: string
  /** Generations per second, independent of frame rate. */
  speed: number
  ageRate: number
  decayRate: number
  paletteId: string
  cellSize: number
  density: number
  brush: number
}

export const DEFAULT_PARAMS: SimParams = {
  rule: CONWAY,
  speed: 20,
  ageRate: 28,
  decayRate: 18,
  paletteId: 'ember',
  cellSize: 5,
  density: 0.28,
  brush: 2,
}

const EMPTY_STATS: StepStats = { generation: 0, population: 0, births: 0, deaths: 0 }
/** Cap catch-up work so a slow frame can't spiral. */
const MAX_STEPS_PER_FRAME = 8

export function useSimulation(params: SimParams) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<World | null>(null)
  const rendererRef = useRef<Canvas2DRenderer | null>(null)
  const paramsRef = useRef(params)
  const ruleRef = useRef<Rule>(parseRule(CONWAY)!)
  const runningRef = useRef(false)
  const needsDrawRef = useRef(true)
  const statsRef = useRef<StepStats>(EMPTY_STATS)
  const seedRef = useRef(1)

  const [running, setRunningState] = useState(false)
  const [stats, setStats] = useState<StepStats>(EMPTY_STATS)
  const [ruleValid, setRuleValid] = useState(true)

  paramsRef.current = params

  const setRunning = useCallback((next: boolean) => {
    runningRef.current = next
    setRunningState(next)
  }, [])

  // Keep a parsed rule around; typing a half-finished rulestring shouldn't
  // break the running simulation, so invalid text just leaves the last one.
  useEffect(() => {
    const parsed = parseRule(params.rule)
    setRuleValid(parsed !== null)
    if (parsed) ruleRef.current = parsed
  }, [params.rule])

  /**
   * Paint immediately rather than waiting on the loop. Discrete actions
   * (stepping, clearing, drawing) should show up at once, and it means the
   * first frame is on screen before any animation frame has run.
   */
  const drawNow = useCallback(() => {
    const world = worldRef.current
    const renderer = rendererRef.current
    if (!world || !renderer) return
    renderer.draw(world)
    needsDrawRef.current = false
  }, [])

  useEffect(() => {
    rendererRef.current?.setPalette(paletteById(params.paletteId))
    drawNow()
  }, [params.paletteId, drawNow])

  // Size the grid to the container at the current cell size.
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    if (!rendererRef.current) {
      rendererRef.current = new Canvas2DRenderer(canvas, paletteById(paramsRef.current.paletteId))
    }

    const fit = () => {
      const { cellSize, density } = paramsRef.current
      const rect = container.getBoundingClientRect()
      const gridWidth = Math.max(8, Math.floor(rect.width / cellSize))
      const gridHeight = Math.max(8, Math.floor(rect.height / cellSize))

      if (!worldRef.current) {
        worldRef.current = new World(gridWidth, gridHeight)
        worldRef.current.randomize(seedRef.current, density)
      } else {
        worldRef.current.resize(gridWidth, gridHeight)
      }
      rendererRef.current!.resize(gridWidth, gridHeight, cellSize, window.devicePixelRatio || 1)
      drawNow()
      setStats({ ...statsRef.current, population: worldRef.current.population })
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [params.cellSize, drawNow])

  // The loop. Fixed timestep, decoupled from render; React state is never
  // touched per tick.
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let accumulator = 0
    let lastFlush = 0

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const world = worldRef.current
      const renderer = rendererRef.current
      if (!world || !renderer) return

      const dt = Math.min(now - last, 250)
      last = now

      if (runningRef.current) {
        const { speed, ageRate, decayRate } = paramsRef.current
        const interval = 1000 / speed
        accumulator += dt
        let steps = 0
        while (accumulator >= interval && steps < MAX_STEPS_PER_FRAME) {
          statsRef.current = world.step(ruleRef.current, { ageRate, decayRate })
          accumulator -= interval
          steps++
        }
        if (steps > 0) needsDrawRef.current = true
        if (steps === MAX_STEPS_PER_FRAME) accumulator = 0
      } else {
        accumulator = 0
      }

      if (needsDrawRef.current) {
        renderer.draw(world)
        needsDrawRef.current = false
      }

      if (now - lastFlush > 100) {
        lastFlush = now
        setStats({ ...statsRef.current, population: world.population })
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const stepOnce = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    const { ageRate, decayRate } = paramsRef.current
    statsRef.current = world.step(ruleRef.current, { ageRate, decayRate })
    setStats(statsRef.current)
    drawNow()
  }, [drawNow])

  const clear = useCallback(() => {
    worldRef.current?.clear()
    statsRef.current = EMPTY_STATS
    setStats(EMPTY_STATS)
    drawNow()
  }, [drawNow])

  const randomize = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    seedRef.current = (Math.random() * 0xffffffff) >>> 0
    world.randomize(seedRef.current, paramsRef.current.density)
    statsRef.current = { ...EMPTY_STATS, population: world.population }
    setStats(statsRef.current)
    drawNow()
  }, [drawNow])

  /** Paint from the previous pointer sample to this one, in grid coordinates. */
  const paint = useCallback(
    (x: number, y: number, from: { x: number; y: number } | null, erase: boolean) => {
      const world = worldRef.current
      if (!world) return
      const { brush } = paramsRef.current
      if (from) world.paintLine(from.x, from.y, x, y, brush, !erase)
      else world.paint(x, y, brush, !erase)
      drawNow()
    },
    [drawNow],
  )

  const cellSizeRef = useRef(params.cellSize)
  cellSizeRef.current = params.cellSize

  /** Map a client-space point to a grid cell. */
  const cellAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const size = cellSizeRef.current
    return {
      x: Math.floor((clientX - rect.left) / size),
      y: Math.floor((clientY - rect.top) / size),
    }
  }, [])

  return {
    containerRef,
    canvasRef,
    running,
    setRunning,
    stats,
    ruleValid,
    stepOnce,
    clear,
    randomize,
    paint,
    cellAt,
  }
}
