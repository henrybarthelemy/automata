import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface ViewportProps {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  paint: (x: number, y: number, from: { x: number; y: number } | null, erase: boolean) => void
  cellAt: (clientX: number, clientY: number) => { x: number; y: number } | null
  zoomAt: (factor: number, clientX: number, clientY: number) => void
  panBy: (dxCss: number, dyCss: number) => void
  background: string
  /** True while a pattern is armed; the brush is suspended until it is placed. */
  stamping: boolean
  moveStamp: (clientX: number, clientY: number) => void
  hideStamp: () => void
  placeStamp: () => void
}

export function Viewport({
  containerRef,
  canvasRef,
  paint,
  cellAt,
  zoomAt,
  panBy,
  background,
  stamping,
  moveStamp,
  hideStamp,
  placeStamp,
}: ViewportProps) {
  const strokeRef = useRef<{ x: number; y: number } | null>(null)
  const eraseRef = useRef(false)
  const panRef = useRef<{ x: number; y: number } | null>(null)
  const [panning, setPanning] = useState(false)

  // Wheel must be non-passive to stop the page scrolling underneath us, which
  // React's onWheel can't guarantee.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      zoomAt(Math.exp(-delta * 0.0015), event.clientX, event.clientY)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef, zoomAt])

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // Capture keeps a drag alive outside the canvas, but it can reject a
    // pointer that has already been released. Losing it is survivable;
    // letting it throw would abandon the whole interaction.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* not capturable */
    }

    // Middle-drag or shift-drag pans. Space is taken by play/pause.
    if (event.button === 1 || event.shiftKey) {
      panRef.current = { x: event.clientX, y: event.clientY }
      setPanning(true)
      return
    }

    // A pattern is armed: click places it rather than painting.
    if (stamping) {
      moveStamp(event.clientX, event.clientY)
      placeStamp()
      return
    }

    const cell = cellAt(event.clientX, event.clientY)
    if (!cell) return
    eraseRef.current = event.button === 2 || event.altKey
    strokeRef.current = cell
    paint(cell.x, cell.y, null, eraseRef.current)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) {
      panBy(event.clientX - panRef.current.x, event.clientY - panRef.current.y)
      panRef.current = { x: event.clientX, y: event.clientY }
      return
    }
    if (stamping) {
      moveStamp(event.clientX, event.clientY)
      return
    }
    if (!strokeRef.current) return
    const cell = cellAt(event.clientX, event.clientY)
    if (!cell) return
    paint(cell.x, cell.y, strokeRef.current, eraseRef.current)
    strokeRef.current = cell
  }

  const endStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    strokeRef.current = null
    panRef.current = null
    setPanning(false)
  }

  return (
    <div className="viewport" ref={containerRef} style={{ background }}>
      <canvas
        ref={canvasRef}
        className={panning ? 'panning' : stamping ? 'stamping' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={hideStamp}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  )
}
