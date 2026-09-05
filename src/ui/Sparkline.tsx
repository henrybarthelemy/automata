import { useEffect, useMemo, useRef, useState } from 'react'
import { drawSparkline, indexAtX } from '../render/sparkline'
import type { Sample } from '../state/history'

interface SparklineProps {
  samples: Sample[]
  color: string
  label: string
  /** Shown where the hover readout goes, while the pointer is away. */
  hint: string
}

// Fixed to the panel's known content width (268px column - 2x18px padding)
// rather than measured: the Stats section stays mounted but `hidden` while
// collapsed (see Section.tsx), and a hidden container's
// getBoundingClientRect() is 0x0 - measuring it would size the canvas's
// backing store to nothing the first time Stats is reopened.
const WIDTH = 232
const HEIGHT = 40

export function Sparkline({ samples, color, label, hint }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const populations = useMemo(() => samples.map((s) => s.population), [samples])

  // The window scrolls as the sim runs, so an index held from a previous
  // render can outlive the sample it pointed at.
  const hovered = hover !== null && hover < samples.length ? samples[hover] : null

  // Backing-store resolution only needs setting once.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Axis chrome tracks the panel's CSS variables rather than the palette:
    // it frames the trend line, it isn't part of the data.
    const styles = getComputedStyle(canvas)
    drawSparkline(ctx, populations, {
      width: WIDTH,
      height: HEIGHT,
      color,
      axisColor: styles.getPropertyValue('--line').trim() || '#24242c',
      labelColor: styles.getPropertyValue('--muted').trim() || '#8a8a99',
      highlight: hovered ? hover : null,
    })
  }, [populations, color, hover, hovered])

  return (
    <>
      <span className="control-label">
        <span>{label}</span>
        {hovered ? (
          <em>
            gen {hovered.generation.toLocaleString()} &middot;{' '}
            {hovered.population.toLocaleString()} alive
          </em>
        ) : (
          <em className="muted">{hint}</em>
        )}
      </span>
      <canvas
        ref={canvasRef}
        className="sparkline"
        role="img"
        aria-label={`${label}, ${hint}`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          if (rect.width === 0) return
          // The canvas is laid out at 100% width, so a pointer's client x has
          // to be scaled back into the fixed coordinate space it was drawn in.
          const localX = ((event.clientX - rect.left) / rect.width) * WIDTH
          const index = indexAtX(localX, populations.length, WIDTH)
          setHover(index < 0 ? null : index)
        }}
        onPointerLeave={() => setHover(null)}
      />
    </>
  )
}
