import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface ViewportProps {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  canvas3dRef: RefObject<HTMLCanvasElement | null>
  /** In 3D the pointer orbits the shape; drawing stays in the flat view. */
  mode: '2d' | '3d'
  orbitBy: (dxCss: number, dyCss: number) => void
  dollyBy: (factor: number) => void
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
  canvas3dRef,
  mode,
  orbitBy,
  dollyBy,
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
    const canvas = mode === '3d' ? canvas3dRef.current : canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      // The same factor either way: above one means closer.
      const factor = Math.exp(-delta * 0.0015)
      if (mode === '3d') dollyBy(factor)
      else zoomAt(factor, event.clientX, event.clientY)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef, canvas3dRef, mode, zoomAt, dollyBy])

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // Capture keeps a drag alive outside the canvas, but it can reject a
    // pointer that has already been released. Losing it is survivable;
    // letting it throw would abandon the whole interaction.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* not capturable */
    }

    // In 3D every drag orbits: there is nothing to paint on a shape yet.
    if (mode === '3d') {
      panRef.current = { x: event.clientX, y: event.clientY }
      setPanning(true)
      return
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
      const dx = event.clientX - panRef.current.x
      const dy = event.clientY - panRef.current.y
      if (mode === '3d') orbitBy(dx, dy)
      else panBy(dx, dy)
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
    <div className="viewport" data-tour="canvas" ref={containerRef} style={{ background }}>
      <canvas
        ref={canvasRef}
        hidden={mode === '3d'}
        className={panning ? 'panning' : stamping ? 'stamping' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={hideStamp}
        onContextMenu={(event) => event.preventDefault()}
      />
      <canvas
        ref={canvas3dRef}
        hidden={mode === '2d'}
        className={panning ? 'panning' : 'orbiting'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  )
}
