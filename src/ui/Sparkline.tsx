import { useEffect, useRef } from 'react'
import { drawSparkline } from '../render/sparkline'

interface SparklineProps {
  values: number[]
  color: string
}

// Fixed to the panel's known content width (268px column - 2x18px padding)
// rather than measured: the Stats section stays mounted but `hidden` while
// collapsed (see Section.tsx), and a hidden container's
// getBoundingClientRect() is 0x0 - measuring it would size the canvas's
// backing store to nothing the first time Stats is reopened.
const WIDTH = 232
const HEIGHT = 40

export function Sparkline({ values, color }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawSparkline(ctx, values, { width: WIDTH, height: HEIGHT, color })
  }, [values, color])

  return <canvas ref={canvasRef} className="sparkline" />
}
