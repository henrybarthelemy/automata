/**
 * Where to put a tour card relative to the thing it is describing.
 *
 * Kept free of the DOM so it can be tested in Node like the rest of the core:
 * the caller measures with `getBoundingClientRect()` and passes plain numbers.
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface Placement {
  x: number
  y: number
  side: Side
}

/** Distance between the highlighted element and the card. */
const GAP = 12
/** Distance the card keeps from the edge of the window. */
const MARGIN = 12

const OPPOSITE: Record<Side, Side> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/** How much room a side has, ignoring whether the card actually fits. */
function room(target: Rect, viewport: Size, side: Side): number {
  switch (side) {
    case 'top':
      return target.y - MARGIN
    case 'bottom':
      return viewport.height - MARGIN - (target.y + target.height)
    case 'left':
      return target.x - MARGIN
    case 'right':
      return viewport.width - MARGIN - (target.x + target.width)
  }
}

const clamp = (value: number, low: number, high: number) =>
  high < low ? low : value < low ? low : value > high ? high : value

export function placeCoachMark(
  target: Rect,
  card: Size,
  viewport: Size,
  preferred: Side,
): Placement {
  // Preferred first, then its opposite - flipping across the same axis keeps
  // the card near where the reader was already looking.
  const order: Side[] = [preferred, OPPOSITE[preferred], 'bottom', 'top', 'right', 'left']
  const needed = (side: Side) =>
    side === 'top' || side === 'bottom' ? card.height + GAP : card.width + GAP

  const side =
    order.find((candidate) => room(target, viewport, candidate) >= needed(candidate)) ??
    // Nothing fits, so take the roomiest side and let the clamping below keep
    // the card on screen. This is the whole-viewport target case.
    (['bottom', 'top', 'right', 'left'] as Side[]).reduce((best, candidate) =>
      room(target, viewport, candidate) > room(target, viewport, best) ? candidate : best,
    )

  const centreX = target.x + target.width / 2 - card.width / 2
  const centreY = target.y + target.height / 2 - card.height / 2
  const maxX = viewport.width - MARGIN - card.width
  const maxY = viewport.height - MARGIN - card.height

  switch (side) {
    case 'top':
      return { side, x: clamp(centreX, MARGIN, maxX), y: clamp(target.y - GAP - card.height, MARGIN, maxY) }
    case 'bottom':
      return { side, x: clamp(centreX, MARGIN, maxX), y: clamp(target.y + target.height + GAP, MARGIN, maxY) }
    case 'left':
      return { side, x: clamp(target.x - GAP - card.width, MARGIN, maxX), y: clamp(centreY, MARGIN, maxY) }
    case 'right':
      return { side, x: clamp(target.x + target.width + GAP, MARGIN, maxX), y: clamp(centreY, MARGIN, maxY) }
  }
}
