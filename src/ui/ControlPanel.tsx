import type { SimParams } from '../state/useSimulation'
import type { StepStats } from '../sim/world'
import { PALETTES } from '../render/palettes'

interface ControlPanelProps {
  params: SimParams
  onChange: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void
  running: boolean
  setRunning: (running: boolean) => void
  ruleValid: boolean
  stats: StepStats
  onStep: () => void
  onClear: () => void
  onRandomize: () => void
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (value: number) => string
  onChange: (value: number) => void
}

function Slider({ label, value, min, max, step = 1, format, onChange }: SliderProps) {
  return (
    <label className="control">
      <span className="control-label">
        {label}
        <em>{format ? format(value) : value}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function ControlPanel({
  params,
  onChange,
  running,
  setRunning,
  ruleValid,
  stats,
  onStep,
  onClear,
  onRandomize,
}: ControlPanelProps) {
  return (
    <aside className="panel">
      <header className="panel-header">
        <h1>Automata</h1>
        <p>Conway&rsquo;s Life</p>
      </header>

      <div className="transport">
        <button className="primary" onClick={() => setRunning(!running)}>
          {running ? 'Pause' : 'Play'}
        </button>
        <button onClick={onStep} disabled={running}>
          Step
        </button>
      </div>
      <div className="transport">
        <button onClick={onRandomize}>Randomize</button>
        <button onClick={onClear}>Clear</button>
      </div>

      <section>
        <h2>Rule</h2>
        <label className="control">
          <span className="control-label">
            B/S notation
            {!ruleValid && <em className="invalid">unparsed</em>}
          </span>
          <input
            className={ruleValid ? 'text' : 'text invalid'}
            value={params.rule}
            spellCheck={false}
            onChange={(event) => onChange('rule', event.target.value)}
          />
        </label>
        <p className="hint">
          B3/S23 is Conway. Try B36/S23 (HighLife) or B2/S (Seeds).
        </p>
      </section>

      <section>
        <h2>Simulation</h2>
        <Slider
          label="Speed"
          value={params.speed}
          min={1}
          max={120}
          format={(v) => `${v}/s`}
          onChange={(v) => onChange('speed', v)}
        />
        <Slider
          label="Cell size"
          value={params.cellSize}
          min={2}
          max={16}
          format={(v) => `${v}px`}
          onChange={(v) => onChange('cellSize', v)}
        />
        <Slider
          label="Brush"
          value={params.brush}
          min={1}
          max={8}
          onChange={(v) => onChange('brush', v)}
        />
        <Slider
          label="Seed density"
          value={params.density}
          min={0.02}
          max={0.7}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onChange('density', v)}
        />
      </section>

      <section>
        <h2>Look</h2>
        <label className="control">
          <span className="control-label">Palette</span>
          <select value={params.paletteId} onChange={(e) => onChange('paletteId', e.target.value)}>
            {PALETTES.map((palette) => (
              <option key={palette.id} value={palette.id}>
                {palette.name}
              </option>
            ))}
          </select>
        </label>
        <Slider
          label="Age ramp"
          value={params.ageRate}
          min={1}
          max={255}
          onChange={(v) => onChange('ageRate', v)}
        />
        <Slider
          label="Trail decay"
          value={params.decayRate}
          min={1}
          max={255}
          format={(v) => (v >= 255 ? 'off' : String(v))}
          onChange={(v) => onChange('decayRate', v)}
        />
      </section>

      <section className="stats">
        <h2>Stats</h2>
        <dl>
          <div>
            <dt>Generation</dt>
            <dd>{stats.generation.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Population</dt>
            <dd>{stats.population.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Births</dt>
            <dd>{stats.births.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Deaths</dt>
            <dd>{stats.deaths.toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <footer className="hint">
        Drag to draw, alt-drag to erase. <kbd>Space</kbd> play/pause,{' '}
        <kbd>.</kbd> step, <kbd>N</kbd> randomize, <kbd>C</kbd> clear.
      </footer>
    </aside>
  )
}
