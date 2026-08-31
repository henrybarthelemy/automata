import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { placeCoachMark, type Placement, type Rect, type Side } from './coachmark'

export interface TourStep {
  id: string
  /** What to highlight, found with `querySelector`. */
  target: string
  title: string
  body: ReactNode
  side: Side
  /** Panel section that must be open before the target can be measured. */
  section?: string
}

interface TourProps {
  steps: TourStep[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}

/**
 * A coach-mark walkthrough: a spotlight over one element at a time with a card
 * beside it. Deliberately started from a button rather than on first load -
 * an unrequested tour in front of a black canvas is worse than no tour.
 *
 * Measurement runs in a layout effect rather than on `requestAnimationFrame`,
 * because the headless browser used for verification never fires rAF.
 */
export function Tour({ steps, index, onIndex, onClose }: TourProps) {
  const step = steps[index]
  const [target, setTarget] = useState<Rect | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  // The card claims to be a modal dialog, so focus has to move into it and
  // back out again, or a keyboard reader is left pointing at the dimmed page.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null
    return () => returnTo?.focus?.()
  }, [])

  // Not on mount: the card spends its first pass hidden while it is measured,
  // and a `visibility: hidden` element cannot take focus.
  const claimedFocus = useRef(false)
  useEffect(() => {
    if (!placement || claimedFocus.current) return
    claimedFocus.current = true
    nextRef.current?.focus()
  }, [placement])

  useLayoutEffect(() => {
    const measure = () => {
      const element = document.querySelector(step.target)
      const card = cardRef.current
      if (!element || !card) return
      const rect = element.getBoundingClientRect()
      // A collapsed or offscreen target measures as nothing; leave the previous
      // reading in place rather than parking the card in the corner.
      if (rect.width === 0 && rect.height === 0) return
      setTarget({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
      const card_ = card.getBoundingClientRect()
      setPlacement(
        placeCoachMark(
          rect,
          { width: card_.width, height: card_.height },
          { width: window.innerWidth, height: window.innerHeight },
          step.side,
        ),
      )
    }

    document.querySelector(step.target)?.scrollIntoView({ block: 'nearest' })
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The tour owns the keyboard while it is up, so the app's single-letter
      // shortcuts do not fire underneath it.
      event.stopPropagation()
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        if (index === steps.length - 1) onClose()
        else onIndex(index + 1)
      } else if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [index, steps.length, onIndex, onClose])

  const last = index === steps.length - 1

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="tour-scrim" onClick={onClose} />
      {target && (
        <div
          className="tour-spotlight"
          style={{
            left: target.x - 4,
            top: target.y - 4,
            width: target.width + 8,
            height: target.height + 8,
          }}
        />
      )}
      <div
        ref={cardRef}
        className="tour-card"
        style={
          placement
            ? { left: placement.x, top: placement.y }
            : { left: 0, top: 0, visibility: 'hidden' }
        }
      >
        <p className="tour-count">
          {index + 1} of {steps.length}
        </p>
        <h3>{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={onClose}>
            {last ? 'Done' : 'Skip'}
          </button>
          <button type="button" onClick={() => onIndex(index - 1)} disabled={index === 0}>
            Back
          </button>
          <button
            ref={nextRef}
            type="button"
            className="primary"
            onClick={() => (last ? onClose() : onIndex(index + 1))}
          >
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
