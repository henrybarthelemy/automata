import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface ViewportProps {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  paint: (x: number, y: number, from: { x: number; y: number } | null, erase: boolean) => void
  cellAt: (clientX: number, clientY: number) => { x: number; y: number } | null
  background: string
}

export function Viewport({ containerRef, canvasRef, paint, cellAt, background }: ViewportProps) {
  const strokeRef = useRef<{ x: number; y: number } | null>(null)
  const eraseRef = useRef(false)

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const cell = cellAt(event.clientX, event.clientY)
    if (!cell) return
    event.currentTarget.setPointerCapture(event.pointerId)
    eraseRef.current = event.button === 2 || event.altKey
    strokeRef.current = cell
    paint(cell.x, cell.y, null, eraseRef.current)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
  }

  return (
    <div className="viewport" ref={containerRef} style={{ background }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  )
}
