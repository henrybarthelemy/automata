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

  const { running, setRunning, stepOnce, clear, randomize } = sim

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return
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
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [running, setRunning, stepOnce, clear, randomize])

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
      />
      <Viewport
        containerRef={sim.containerRef}
        canvasRef={sim.canvasRef}
        paint={sim.paint}
        cellAt={sim.cellAt}
        background={paletteById(params.paletteId).background}
      />
    </div>
  )
}
