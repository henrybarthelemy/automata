import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_PARAMS, useSimulation, type SimParams } from './state/useSimulation'
import { paletteById } from './render/palettes'
import { ControlPanel } from './ui/ControlPanel'
import { Viewport } from './ui/Viewport'

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS)
  const sim = useSimulation(params)

  const update = useCallback(<K extends keyof SimParams>(key: K, value: SimParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }, [])

  const { running, setRunning, stepOnce, clear, randomize, setZoom, fitToWorld } = sim
  const { stamp, selectStamp, rotateStamp, flipStamp } = sim

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
          setZoom(sim.zoom * 1.4)
          break
        case '-':
        case '_':
          setZoom(sim.zoom / 1.4)
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
  }, [running, setRunning, stepOnce, clear, randomize, setZoom, fitToWorld, sim.zoom,
      stamp, rotateStamp, flipStamp, selectStamp])

  return (
    <div className="app">
      <ControlPanel
        params={params}
        onChange={update}
        running={running}
        setRunning={setRunning}
        ruleValid={sim.ruleValid}
        stats={sim.stats}
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
      />
      <Viewport
        containerRef={sim.containerRef}
        canvasRef={sim.canvasRef}
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
    </div>
  )
}
