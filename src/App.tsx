import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_PARAMS, useSimulation, type SimParams } from './state/useSimulation'
import { paletteById } from './render/palettes'
import { ControlPanel } from './ui/ControlPanel'
import { Viewport } from './ui/Viewport'
import { Tour } from './ui/Tour'
import { TOUR_STEPS } from './ui/tourSteps'

/** Rule and Simulation are what you reach for first; the rest start folded. */
const DEFAULT_SECTIONS: Record<string, boolean> = {
  rule: true,
  simulation: true,
  patterns: false,
  view: false,
  look: false,
  stats: true,
}

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS)
  const [openSections, setOpenSections] = useState(DEFAULT_SECTIONS)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const sim = useSimulation(params)

  const update = useCallback(<K extends keyof SimParams>(key: K, value: SimParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const { running, setRunning, stepOnce, clear, randomize, setZoom, fitToWorld } = sim
  const { stamp, selectStamp, rotateStamp, flipStamp } = sim

  // A step that points into the panel needs its section open, or the target
  // is `hidden` and cannot be measured.
  useEffect(() => {
    if (tourStep === null) return
    const section = TOUR_STEPS[tourStep].section
    if (!section) return
    setOpenSections((prev) => (prev[section] ? prev : { ...prev, [section]: true }))
  }, [tourStep])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The tour owns the keyboard while it is up. It also stops propagation,
      // but that relies on capture running before this listener, and clearing
      // the board out from under a tour step is not a subtlety worth risking.
      if (tourStep !== null) return
      const target = event.target as HTMLElement | null
      // Shortcuts are single letters, so they must not fire while typing.
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      switch (event.key) {
        case ' ':
          event.preventDefault()
          setRunning(!running)
          break
        case '.':
          stepOnce()
          break
        case 'n':
          randomize()
          break
        case 'c':
          clear()
          break
        case '+':
        case '=':
          sim.zoomBy(1.4)
          break
        case '-':
        case '_':
          sim.zoomBy(1 / 1.4)
          break
        case '0':
          fitToWorld()
          break
        case 'r':
          if (stamp) rotateStamp()
          break
        case 'f':
          if (stamp) flipStamp()
          break
        case 'Escape':
          selectStamp(null)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [running, setRunning, stepOnce, clear, randomize, sim.zoomBy, fitToWorld,
      stamp, rotateStamp, flipStamp, selectStamp, tourStep])

  return (
    <div className="app">
      <ControlPanel
        params={params}
        onChange={update}
        running={running}
        setRunning={setRunning}
        ruleValid={sim.ruleValid}
        ruleProblem={sim.ruleProblem}
        ruleStates={sim.ruleStates}
        stats={sim.stats}
        history={sim.history}
        onStep={stepOnce}
        onClear={clear}
        onRandomize={randomize}
        zoom={sim.zoom}
        onZoom={setZoom}
        onFit={fitToWorld}
        stamp={stamp}
        selectStamp={selectStamp}
        rotateStamp={rotateStamp}
        flipStamp={flipStamp}
        importRLE={sim.importRLE}
        exportRLE={sim.exportRLE}
        openSections={openSections}
        onToggleSection={toggleSection}
        onStartTour={() => setTourStep(0)}
      />
      <Viewport
        containerRef={sim.containerRef}
        canvasRef={sim.canvasRef}
        canvas3dRef={sim.canvas3dRef}
        mode={params.mode}
        orbitBy={sim.orbitBy}
        dollyBy={sim.dollyBy}
        paint={sim.paint}
        cellAt={sim.cellAt}
        zoomAt={sim.zoomAt}
        panBy={sim.panBy}
        stamping={stamp !== null}
        moveStamp={sim.moveStamp}
        hideStamp={sim.hideStamp}
        placeStamp={sim.placeStamp}
        background={paletteById(params.paletteId).background}
      />
      {tourStep !== null && (
        <Tour
          steps={TOUR_STEPS}
          index={tourStep}
          onIndex={setTourStep}
          onClose={() => setTourStep(null)}
        />
      )}
    </div>
  )
}
