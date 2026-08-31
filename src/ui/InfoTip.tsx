import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { placeCoachMark, type Placement } from './coachmark'

interface InfoTipProps {
  /** Named for the screen reader, since the trigger itself is just a glyph. */
  label: string
  children: ReactNode
}

/**
 * A small "i" that opens a popover. The panel used to carry its explanations as
 * always-on paragraphs, which crowded out the controls they described; this
 * keeps the prose one click away instead of permanently on screen.
 *
 * Positioned with the same maths as the tour cards, so a tip near the bottom of
 * a scrolled panel flips upward rather than hanging off the window.
 */
export function InfoTip({ label, children }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const trigger = buttonRef.current?.getBoundingClientRect()
      const popover = popoverRef.current?.getBoundingClientRect()
      if (!trigger || !popover) return
      setPlacement(
        placeCoachMark(
          trigger,
          { width: popover.width, height: popover.height },
          { width: window.innerWidth, height: window.innerHeight },
          'right',
        ),
      )
    }
    measure()
    window.addEventListener('resize', measure)
    // The panel scrolls under the tip, so a scroll anywhere can move the anchor.
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={open ? 'infotip open' : 'infotip'}
        aria-label={`About ${label}`}
        aria-expanded={open}
        onClick={() => {
          setPlacement(null)
          setOpen((was) => !was)
        }}
      >
        i
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="infotip-popover"
          role="dialog"
          aria-label={label}
          // Rendered off-screen for one pass so it can be measured before it is
          // placed; without this it flashes at the top-left corner first.
          style={
            placement
              ? { left: placement.x, top: placement.y }
              : { left: 0, top: 0, visibility: 'hidden' }
          }
        >
          {children}
        </div>
      )}
    </>
  )
}
