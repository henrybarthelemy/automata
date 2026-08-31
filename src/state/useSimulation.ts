import { useCallback, useEffect, useRef, useState } from 'react'
import { World, type StepStats } from '../sim/world'
import { CONWAY, parseRule, type Rule } from '../sim/lifelike'
import { Canvas2DRenderer } from '../render/canvas2d'
import { parseRLE, serializeRLE, rotatePattern, flipPattern, type Pattern } from '../sim/rle'
import { paletteById } from '../render/palettes'
import { clampView, clampZoom, fitView, zoomAbout, type View } from '../render/view'

export interface SimParams {
  rule: string
  /** Generations per second, independent of frame rate. */
  speed: number
  ageRate: number
  decayRate: number
  paletteId: string
  density: number
  brush: number
  worldWidth: number
  worldHeight: number
}

export const WORLD_PRESETS = [
  { id: 'small', name: 'Small (200 x 150)', width: 200, height: 150 },
  { id: 'medium', name: 'Medium (400 x 300)', width: 400, height: 300 },
  { id: 'large', name: 'Large (800 x 600)', width: 800, height: 600 },
  { id: 'huge', name: 'Huge (1600 x 1200)', width: 1600, height: 1200 },
]

export const DEFAULT_PARAMS: SimParams = {
  rule: CONWAY,
  speed: 20,
  ageRate: 28,
  decayRate: 18,
  paletteId: 'ember',
  density: 0.28,
  brush: 2,
  worldWidth: 400,
  worldHeight: 300,
}

const EMPTY_STATS: StepStats = { generation: 0, population: 0, births: 0, deaths: 0 }
/** Cap catch-up work so a slow frame can't spiral. */
const MAX_STEPS_PER_FRAME = 8

export function useSimulation(params: SimParams) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<World | null>(null)
  const rendererRef = useRef<Canvas2DRenderer | null>(null)
  const viewRef = useRef<View>({ zoom: 4, x: 0, y: 0 })
  const sizeRef = useRef({ width: 0, height: 0 })
  const paramsRef = useRef(params)
  const ruleRef = useRef<Rule>(parseRule(CONWAY)!)
  const runningRef = useRef(false)
  const needsDrawRef = useRef(true)
  const statsRef = useRef<StepStats>(EMPTY_STATS)
  const seedRef = useRef(1)
  const stampRef = useRef<Pattern | null>(null)
  const previewRef = useRef<{ x: number; y: number } | null>(null)

  const [running, setRunningState] = useState(false)
  const [stats, setStats] = useState<StepStats>(EMPTY_STATS)
  const [ruleValid, setRuleValid] = useState(true)
  const [ruleStates, setRuleStates] = useState(2)
  const [zoom, setZoomState] = useState(viewRef.current.zoom)
  const [stamp, setStampState] = useState<Pattern | null>(null)

  paramsRef.current = params

  const setRunning = useCallback((next: boolean) => {
    runningRef.current = next
    setRunningState(next)
  }, [])

  /**
   * Paint immediately rather than waiting on the loop. Discrete actions
   * (stepping, clearing, drawing, navigating) should show up at once, and it
   * means the first frame is on screen before any animation frame has run.
   */
  const drawNow = useCallback(() => {
    const world = worldRef.current
    const renderer = rendererRef.current
    if (!world || !renderer) return
    const pattern = stampRef.current
    const at = previewRef.current
    renderer.draw(world, viewRef.current, pattern && at ? { pattern, x: at.x, y: at.y } : null)
    needsDrawRef.current = false
  }, [])

  /** Apply a view change, keeping the world in frame and the slider in sync. */
  const commitView = useCallback(
    (next: View) => {
      const world = worldRef.current
      if (!world) return
      const { width, height } = sizeRef.current
      viewRef.current = clampView(next, world.width, world.height, width, height)
      setZoomState(viewRef.current.zoom)
      drawNow()
    },
    [drawNow],
  )

  // Keep a parsed rule around; typing a half-finished rulestring shouldn't
  // break the running simulation, so invalid text just leaves the last one.
  useEffect(() => {
    const parsed = parseRule(params.rule)
    setRuleValid(parsed !== null)
    if (parsed) {
      ruleRef.current = parsed
      setRuleStates(parsed.states)
    }
  }, [params.rule])

  useEffect(() => {
    rendererRef.current?.setPalette(paletteById(params.paletteId))
    drawNow()
  }, [params.paletteId, drawNow])

  // Create the world at its chosen size and fit the view to it. The world no
  // longer tracks the window: resizing just shows more or less of it.
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    if (!rendererRef.current) {
      rendererRef.current = new Canvas2DRenderer(canvas, paletteById(paramsRef.current.paletteId))
    }

    const { worldWidth, worldHeight, density } = paramsRef.current
    if (!worldRef.current) {
      worldRef.current = new World(worldWidth, worldHeight)
      worldRef.current.randomize(seedRef.current, density)
    } else {
      worldRef.current.resize(worldWidth, worldHeight)
    }

    const measure = () => {
      const rect = container.getBoundingClientRect()
      sizeRef.current = { width: rect.width, height: rect.height }
      rendererRef.current!.resize(rect.width, rect.height, window.devicePixelRatio || 1)
    }

    measure()
    commitView(fitView(worldWidth, worldHeight, sizeRef.current.width, sizeRef.current.height))
    setStats({ ...statsRef.current, population: worldRef.current.population })

    const observer = new ResizeObserver(() => {
      measure()
      commitView(viewRef.current)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [params.worldWidth, params.worldHeight, commitView])

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
        const pattern = stampRef.current
        const at = previewRef.current
        renderer.draw(world, viewRef.current, pattern && at ? { pattern, x: at.x, y: at.y } : null)
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

  /** Map a client-space point to a grid cell under the current view. */
  const cellAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const view = viewRef.current
    return {
      x: Math.floor(view.x + (clientX - rect.left) / view.zoom),
      y: Math.floor(view.y + (clientY - rect.top) / view.zoom),
    }
  }, [])

  /** Zoom by a multiplier about a point in client space (the wheel path). */
  const zoomAt = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const view = viewRef.current
      commitView(zoomAbout(view, view.zoom * factor, clientX - rect.left, clientY - rect.top))
    },
    [commitView],
  )

  /** Zoom about the middle of the viewport (the slider and keyboard path). */
  const setZoom = useCallback(
    (next: number) => {
      const { width, height } = sizeRef.current
      commitView(zoomAbout(viewRef.current, clampZoom(next), width / 2, height / 2))
    },
    [commitView],
  )

  const panBy = useCallback(
    (dxCss: number, dyCss: number) => {
      const view = viewRef.current
      commitView({ ...view, x: view.x - dxCss / view.zoom, y: view.y - dyCss / view.zoom })
    },
    [commitView],
  )

  const publishStats = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    statsRef.current = { ...statsRef.current, population: world.population }
    setStats(statsRef.current)
  }, [])

  /** Enter or leave stamp mode. Passing null returns to the brush. */
  const selectStamp = useCallback(
    (pattern: Pattern | null) => {
      stampRef.current = pattern
      setStampState(pattern)
      if (!pattern) previewRef.current = null
      drawNow()
    },
    [drawNow],
  )

  /** Track the ghost under the cursor, centred on the pointer. */
  const moveStamp = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      const pattern = stampRef.current
      if (!canvas || !pattern) return
      const rect = canvas.getBoundingClientRect()
      const view = viewRef.current
      previewRef.current = {
        x: Math.floor(view.x + (clientX - rect.left) / view.zoom) - (pattern.width >> 1),
        y: Math.floor(view.y + (clientY - rect.top) / view.zoom) - (pattern.height >> 1),
      }
      drawNow()
    },
    [drawNow],
  )

  const hideStamp = useCallback(() => {
    if (!previewRef.current) return
    previewRef.current = null
    drawNow()
  }, [drawNow])

  const placeStamp = useCallback(() => {
    const world = worldRef.current
    const pattern = stampRef.current
    const at = previewRef.current
    if (!world || !pattern || !at) return
    world.stamp(pattern, at.x, at.y)
    publishStats()
    drawNow()
  }, [drawNow, publishStats])

  const rotateStamp = useCallback(() => {
    if (!stampRef.current) return
    selectStamp(rotatePattern(stampRef.current))
  }, [selectStamp])

  const flipStamp = useCallback(() => {
    if (!stampRef.current) return
    selectStamp(flipPattern(stampRef.current))
  }, [selectStamp])

  /** Load pasted RLE into stamp mode so the user chooses where it lands. */
  const importRLE = useCallback(
    (text: string): boolean => {
      const pattern = parseRLE(text)
      if (!pattern) return false
      selectStamp(pattern)
      return true
    },
    [selectStamp],
  )

  /** The live cells' bounding box as RLE, or null when the board is empty. */
  const exportRLE = useCallback((): string | null => {
    const world = worldRef.current
    if (!world) return null
    const pattern = world.toPattern()
    if (!pattern) return null
    return serializeRLE(pattern, { rule: paramsRef.current.rule })
  }, [])

  const fitToWorld = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    const { width, height } = sizeRef.current
    commitView(fitView(world.width, world.height, width, height))
  }, [commitView])

  return {
    containerRef,
    canvasRef,
    running,
    setRunning,
    stats,
    ruleValid,
    ruleStates,
    zoom,
    stepOnce,
    clear,
    randomize,
    paint,
    cellAt,
    zoomAt,
    setZoom,
    panBy,
    fitToWorld,
    stamp,
    selectStamp,
    moveStamp,
    hideStamp,
    placeStamp,
    rotateStamp,
    flipStamp,
    importRLE,
    exportRLE,
  }
}
