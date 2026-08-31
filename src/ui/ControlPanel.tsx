import { WORLD_PRESETS, type SimParams } from '../state/useSimulation'
import type { StepStats } from '../sim/world'
import { PALETTES } from '../render/palettes'
import { MAX_ZOOM, MIN_ZOOM } from '../render/view'
import { PatternMenu } from './PatternMenu'
import { Section } from './Section'
import type { Pattern } from '../sim/rle'

// The useful zoom range spans two orders of magnitude, so the slider is
// geometric: every notch is the same proportional change.
const ZOOM_TICKS = 1000
const toZoomTick = (zoom: number) =>
  Math.round((Math.log(zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)) * ZOOM_TICKS)
const fromZoomTick = (tick: number) =>
  MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** (tick / ZOOM_TICKS)

interface ControlPanelProps {
  params: SimParams
  onChange: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void
  running: boolean
  setRunning: (running: boolean) => void
  ruleValid: boolean
  ruleProblem: string | null
  ruleStates: number
  stats: StepStats
  onStep: () => void
  onClear: () => void
  onRandomize: () => void
  zoom: number
  onZoom: (zoom: number) => void
  onFit: () => void
  stamp: Pattern | null
  selectStamp: (pattern: Pattern | null) => void
  rotateStamp: () => void
  flipStamp: () => void
  importRLE: (text: string) => boolean
  exportRLE: () => string | null
  openSections: Record<string, boolean>
  onToggleSection: (id: string) => void
  onStartTour: () => void
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
  ruleProblem,
  ruleStates,
  stats,
  onStep,
  onClear,
  onRandomize,
  zoom,
  onZoom,
  onFit,
  stamp,
  selectStamp,
  rotateStamp,
  flipStamp,
  importRLE,
  exportRLE,
  openSections,
  onToggleSection,
  onStartTour,
}: ControlPanelProps) {
  return (
    <aside className="panel">
      <header className="panel-header">
        <h1>Automata</h1>
        <p>Life-like cellular automata</p>
      </header>

      <button type="button" className="tour-start" onClick={onStartTour} data-tour="start">
        Take a tour
      </button>

      <div className="transport" data-tour="transport">
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

      <Section
        id="rule"
        title="Rule"
        open={openSections.rule}
        onToggle={onToggleSection}
        info={
          <>
            <p>
              <code>B3/S23</code> is Conway: a dead cell with 3 live neighbours is
              born, and a live cell with 2 or 3 survives. Try <code>B36/S23</code>{' '}
              (HighLife) or <code>B2/S</code> (Seeds).
            </p>
            <p>
              A third number makes it a <strong>Generations</strong> rule, where
              cells fade through that many states before dying &mdash;{' '}
              <code>B2/S/3</code> is Brian&rsquo;s Brain, <code>B2/S345/4</code> is
              Star Wars.
            </p>
            <p>
              Counts can also be narrowed to particular neighbour{' '}
              <em>arrangements</em> using Hensel letters, with <code>-</code> to
              exclude rather than list. <code>B3/S2-i34q</code> is tlife, where a
              blinker cannot oscillate because <code>2i</code> is the two opposite
              neighbours its centre cell sees. <code>B2-a/S12</code> is Just
              Friends.
            </p>
          </>
        }
      >
        <label className="control" data-tour="rule">
          <span className="control-label">
            Rulestring
            {!ruleValid && <em className="invalid">unparsed</em>}
          </span>
          <input
            className={ruleValid ? 'text' : 'text invalid'}
            value={params.rule}
            spellCheck={false}
            aria-invalid={!ruleValid}
            aria-describedby={ruleProblem ? 'rule-problem' : undefined}
            onChange={(event) => onChange('rule', event.target.value)}
          />
        </label>
        {ruleProblem && (
          <p className="hint problem" id="rule-problem" role="status">
            {ruleProblem}
          </p>
        )}
      </Section>

      <Section
        id="simulation"
        title="Simulation"
        open={openSections.simulation}
        onToggle={onToggleSection}
        info={
          <>
            <p>
              <strong>Speed</strong> is generations per second, held independent
              of the frame rate.
            </p>
            <p>
              <strong>Brush</strong> is how many cells wide your drag paints.{' '}
              <strong>Seed density</strong> is the fraction of cells{' '}
              <em>Randomize</em> fills.
            </p>
          </>
        }
      >
        <Slider
          label="Speed"
          value={params.speed}
          min={1}
          max={120}
          format={(v) => `${v}/s`}
          onChange={(v) => onChange('speed', v)}
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
      </Section>

      <PatternMenu
        open={openSections.patterns}
        onToggle={onToggleSection}
        stamp={stamp}
        selectStamp={selectStamp}
        rotateStamp={rotateStamp}
        flipStamp={flipStamp}
        importRLE={importRLE}
        exportRLE={exportRLE}
      />

      <Section
        id="view"
        title="View"
        open={openSections.view}
        onToggle={onToggleSection}
        info={
          <p>
            Scroll to zoom about the cursor, shift-drag or middle-drag to pan.
            Rendering cost tracks the visible area rather than the world size, so
            zooming in is free. The edges wrap in both directions.
          </p>
        }
      >
        <Slider
          label="Zoom"
          value={toZoomTick(zoom)}
          min={0}
          max={ZOOM_TICKS}
          format={() => (zoom < 1 ? `${zoom.toFixed(2)}x` : `${zoom.toFixed(zoom < 10 ? 1 : 0)}x`)}
          onChange={(tick) => onZoom(fromZoomTick(tick))}
        />
        <button onClick={onFit}>Fit world</button>
        <label className="control">
          <span className="control-label">World size</span>
          <select
            value={`${params.worldWidth}x${params.worldHeight}`}
            onChange={(event) => {
              const preset = WORLD_PRESETS.find(
                (p) => `${p.width}x${p.height}` === event.target.value,
              )
              if (!preset) return
              onChange('worldWidth', preset.width)
              onChange('worldHeight', preset.height)
            }}
          >
            {WORLD_PRESETS.map((preset) => (
              <option key={preset.id} value={`${preset.width}x${preset.height}`}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section
        id="look"
        title="Look"
        open={openSections.look}
        onToggle={onToggleSection}
        info={
          <>
            <p>
              Cells are coloured by how long they have been alive, so stable
              structures read differently from churn. <strong>Age ramp</strong> is
              how fast a cell climbs the palette.
            </p>
            <p>
              <strong>Trail decay</strong> is how fast dead cells fade back to the
              background. Low values leave comet tails behind gliders; at{' '}
              <em>off</em> the board is crisp black and white.
            </p>
          </>
        }
      >
        <div data-tour="look">
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
            format={(v) => (ruleStates > 2 ? 'by rule' : v >= 255 ? 'off' : String(v))}
            onChange={(v) => onChange('decayRate', v)}
          />
        </div>
        {ruleStates > 2 && (
          <p className="hint">
            This rule has {ruleStates} states, so its dying cells fade on a
            schedule the rule sets and the trail slider does not apply.
          </p>
        )}
      </Section>

      <Section
        id="stats"
        title="Stats"
        open={openSections.stats}
        onToggle={onToggleSection}
        info={
          <p>
            Counted inside the step loop, so they are free. Births and deaths
            settling to the same number means the pattern has reached
            equilibrium.
          </p>
        }
      >
        <dl className="stats" data-tour="stats">
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
      </Section>

      <footer className="hint">
        Drag to draw, alt-drag to erase. <kbd>Space</kbd> play/pause,{' '}
        <kbd>.</kbd> step, <kbd>N</kbd> randomize, <kbd>C</kbd> clear,{' '}
        <kbd>+</kbd>/<kbd>-</kbd> zoom, <kbd>0</kbd> fit.
      </footer>
    </aside>
  )
}
