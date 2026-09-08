import { useCallback, useEffect, useRef, useState } from 'react'
import { World, type StepStats } from '../sim/world'
import { CONWAY, parseRule, ruleError, type Rule } from '../sim/lifelike'
import { Canvas2DRenderer } from '../render/canvas2d'
import { parseRLE, serializeRLE, rotatePattern, flipPattern, type Pattern } from '../sim/rle'
import { paletteById } from '../render/palettes'
import { clampView, clampZoom, fitView, zoomAbout, type View } from '../render/view'
import { SEAM_BAND } from '../render/seams'
import { Surface3DRenderer } from '../render/surface3d'
import { clampOrbit, orbitDolly, orbitDrag, type Orbit } from '../render/orbit'
import { createHistory, type Sample } from './history'
import type { TopologyId } from '../sim/topology'

export interface SimParams {
  rule: string
  /** Generations per second, independent of frame rate. */
  speed: number
  ageRate: number
  decayRate: number
  paletteId: string
  /** Which surface the grid's edges glue into. */
  topology: TopologyId
  /** Annotate the edges with arrows and a band of what lies across them. */
  showSeams: boolean
  /** Flat rectangle, or the shape the topology actually makes. */
  mode: '2d' | '3d'
  /** Which immersion to draw in 3D, when the topology offers a choice. */
  shape: string
  density: number
  brush: number
  worldWidth: number
  worldHeight: number
}

export const WORLD_PRESETS = [
  // Coarse enough that individual cells stay legible wrapped onto a shape,
  // where the whole grid has to fit in the width of the viewport at once.
  { id: 'tiny', name: 'Tiny (64 x 48)', width: 64, height: 48 },
  { id: 'small', name: 'Small (200 x 150)', width: 200, height: 150 },
  { id: 'medium', name: 'Medium (400 x 300)', width: 400, height: 300 },
  { id: 'large', name: 'Large (800 x 600)', width: 800, height: 600 },
  { id: 'huge', name: 'Huge (1600 x 1200)', width: 1600, height: 1200 },
  // Square, so the sphere topology has somewhere to live.
  { id: 'square', name: 'Square (400 x 400)', width: 400, height: 400 },
]

export const DEFAULT_PARAMS: SimParams = {
  rule: CONWAY,
  speed: 20,
  ageRate: 28,
  decayRate: 18,
  paletteId: 'ember',
  topology: 'torus',
  showSeams: false,
  mode: '2d',
  shape: 'classic',
  density: 0.28,
  brush: 2,
  worldWidth: 400,
  worldHeight: 300,
}

const EMPTY_STATS: StepStats = { generation: 0, population: 0, births: 0, deaths: 0 }
/** Cap catch-up work so a slow frame can't spiral. */
const MAX_STEPS_PER_FRAME = 8
/** "Last 200 generations" reads the same regardless of playback speed. */
const HISTORY_CAPACITY = 200

export function useSimulation(params: SimParams) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // A canvas can only ever have one kind of context, so 2D and 3D each get
  // their own and the inactive one is hidden rather than torn down.
  const canvas3dRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<World | null>(null)
  const rendererRef = useRef<Canvas2DRenderer | null>(null)
  const renderer3dRef = useRef<Surface3DRenderer | null>(null)
  const viewRef = useRef<View>({ zoom: 4, x: 0, y: 0 })
  const orbitRef = useRef<Orbit>({ azimuth: 0.9, elevation: 0.42, distance: 8 })
  const sizeRef = useRef({ width: 0, height: 0 })
  const paramsRef = useRef(params)
  const ruleRef = useRef<Rule>(parseRule(CONWAY)!)
  const runningRef = useRef(false)
  const needsDrawRef = useRef(true)
  const statsRef = useRef<StepStats>(EMPTY_STATS)
  const historyRef = useRef(createHistory(HISTORY_CAPACITY))
  const seedRef = useRef(1)
  const stampRef = useRef<Pattern | null>(null)
  const previewRef = useRef<{ x: number; y: number } | null>(null)

  const [running, setRunningState] = useState(false)
  const [stats, setStats] = useState<StepStats>(EMPTY_STATS)
  const [history, setHistory] = useState<Sample[]>([])
  const [ruleValid, setRuleValid] = useState(true)
  const [ruleProblem, setRuleProblem] = useState<string | null>(null)
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
    if (!world) return
    if (paramsRef.current.mode === '3d') {
      renderer3dRef.current?.draw(world, orbitRef.current)
      needsDrawRef.current = false
      return
    }
    const renderer = rendererRef.current
    if (!renderer) return
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
      viewRef.current = clampView(next, world.width, world.height, width, height, SEAM_BAND)
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
    setRuleProblem(ruleError(params.rule))
    if (parsed) {
      ruleRef.current = parsed
      setRuleStates(parsed.states)
    }
  }, [params.rule])

  useEffect(() => {
    rendererRef.current?.setPalette(paletteById(params.paletteId))
    renderer3dRef.current?.setPalette(paletteById(params.paletteId))
    drawNow()
  }, [params.paletteId, drawNow])

  useEffect(() => {
    rendererRef.current?.setShowSeams(params.showSeams)
    drawNow()
  }, [params.showSeams, drawNow])

  // Create the world at its chosen size and fit the view to it. The world no
  // longer tracks the window: resizing just shows more or less of it.
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    if (!rendererRef.current) {
      rendererRef.current = new Canvas2DRenderer(canvas, paletteById(paramsRef.current.paletteId))
      rendererRef.current.setShowSeams(paramsRef.current.showSeams)
    }

    const { worldWidth, worldHeight, density } = paramsRef.current
    if (!worldRef.current) {
      worldRef.current = new World(worldWidth, worldHeight, paramsRef.current.topology)
      worldRef.current.randomize(seedRef.current, density)
      historyRef.current.reset()
      historyRef.current.push({
        generation: worldRef.current.generation,
        population: worldRef.current.population,
      })
    } else {
      worldRef.current.resize(worldWidth, worldHeight)
      // Resizing preserves generation/population rather than restarting
      // them (see World.resize), so history keeps flowing through it - a
      // population jump from clipping is a real data point, not noise.
      historyRef.current.push({
        generation: worldRef.current.generation,
        population: worldRef.current.population,
      })
    }

    const measure = () => {
      const rect = container.getBoundingClientRect()
      sizeRef.current = { width: rect.width, height: rect.height }
      const dpr = window.devicePixelRatio || 1
      rendererRef.current!.resize(rect.width, rect.height, dpr)
      renderer3dRef.current?.resize(rect.width, rect.height, dpr)
    }

    measure()
    commitView(
      fitView(worldWidth, worldHeight, sizeRef.current.width, sizeRef.current.height, SEAM_BAND),
    )
    setStats({ ...statsRef.current, population: worldRef.current.population })
    setHistory(historyRef.current.values())

    const observer = new ResizeObserver(() => {
      measure()
      commitView(viewRef.current)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [params.worldWidth, params.worldHeight, commitView])

  /**
   * Frame the shape and redraw. The mesh has to exist before the camera can be
   * placed against it, which is what `prepare` is for.
   */
  const frame3d = useCallback(() => {
    const renderer = renderer3dRef.current
    const world = worldRef.current
    if (!renderer || !world) return
    renderer.prepare(world)
    const { radius } = renderer.getFraming()
    orbitRef.current = clampOrbit({ ...orbitRef.current, distance: renderer.fitDistance() }, radius)
    needsDrawRef.current = true
    drawNow()
  }, [drawNow])

  // Three.js arrives through a dynamic import, so the 3D renderer only exists
  // once the view has been asked for, and nothing of it reaches the bundle
  // until then.
  useEffect(() => {
    if (params.mode !== '3d') return
    const canvas = canvas3dRef.current
    if (!canvas) return
    let cancelled = false

    Surface3DRenderer.create(canvas, paletteById(paramsRef.current.paletteId)).then(
      (renderer) => {
        if (cancelled) {
          renderer.dispose()
          return
        }
        renderer3dRef.current = renderer
        renderer.setShape(paramsRef.current.shape)
        const { width, height } = sizeRef.current
        renderer.resize(width, height, window.devicePixelRatio || 1)
        frame3d()
      },
      (error) => console.error('3D view unavailable', error),
    )

    return () => {
      cancelled = true
      renderer3dRef.current?.dispose()
      renderer3dRef.current = null
    }
  }, [params.mode, frame3d])

  useEffect(() => {
    if (!renderer3dRef.current) return
    renderer3dRef.current.setShape(params.shape)
    frame3d()
  }, [params.shape, params.topology, frame3d])

  const orbitBy = useCallback(
    (dxCss: number, dyCss: number) => {
      const renderer = renderer3dRef.current
      if (!renderer) return
      orbitRef.current = clampOrbit(
        orbitDrag(orbitRef.current, dxCss, dyCss),
        renderer.getFraming().radius,
      )
      needsDrawRef.current = true
      drawNow()
    },
    [drawNow],
  )

  const dollyBy = useCallback(
    (factor: number) => {
      const renderer = renderer3dRef.current
      if (!renderer) return
      orbitRef.current = orbitDolly(orbitRef.current, factor, renderer.getFraming().radius)
      needsDrawRef.current = true
      drawNow()
    },
    [drawNow],
  )

  // Depends on the world size too: `World.resize` drops a sphere back to a
  // torus when the world stops being square, so the choice has to be reapplied
  // once a resize makes it legal again. The size effect above is declared
  // first, so it has already run by the time this does.
  useEffect(() => {
    worldRef.current?.setTopology(params.topology)
  }, [params.topology, params.worldWidth, params.worldHeight])

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
          // Sampled once per generation rather than once per flush below, so
          // a catch-up frame (several steps at once) doesn't under-sample.
          historyRef.current.push({
            generation: statsRef.current.generation,
            population: statsRef.current.population,
          })
          accumulator -= interval
          steps++
        }
        if (steps > 0) needsDrawRef.current = true
        if (steps === MAX_STEPS_PER_FRAME) accumulator = 0
      } else {
        accumulator = 0
      }

      if (needsDrawRef.current) {
        if (paramsRef.current.mode === '3d') {
          renderer3dRef.current?.draw(world, orbitRef.current)
        } else {
          const pattern = stampRef.current
          const at = previewRef.current
          renderer.draw(world, viewRef.current, pattern && at ? { pattern, x: at.x, y: at.y } : null)
        }
        needsDrawRef.current = false
      }

      if (now - lastFlush > 100) {
        lastFlush = now
        setStats({ ...statsRef.current, population: world.population })
        setHistory(historyRef.current.values())
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
    historyRef.current.push({
      generation: statsRef.current.generation,
      population: statsRef.current.population,
    })
    setStats(statsRef.current)
    setHistory(historyRef.current.values())
    drawNow()
  }, [drawNow])

  const clear = useCallback(() => {
    worldRef.current?.clear()
    statsRef.current = EMPTY_STATS
    historyRef.current.reset()
    setStats(EMPTY_STATS)
    setHistory([])
    drawNow()
  }, [drawNow])

  const randomize = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    seedRef.current = (Math.random() * 0xffffffff) >>> 0
    world.randomize(seedRef.current, paramsRef.current.density)
    statsRef.current = { ...EMPTY_STATS, population: world.population }
    historyRef.current.reset()
    historyRef.current.push({ generation: world.generation, population: world.population })
    setStats(statsRef.current)
    setHistory(historyRef.current.values())
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
    historyRef.current.push({ generation: world.generation, population: world.population })
    setStats(statsRef.current)
    setHistory(historyRef.current.values())
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
    commitView(fitView(world.width, world.height, width, height, SEAM_BAND))
  }, [commitView])

  return {
    containerRef,
    canvasRef,
    canvas3dRef,
    orbitBy,
    dollyBy,
    running,
    setRunning,
    stats,
    history,
    ruleValid,
    ruleProblem,
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
