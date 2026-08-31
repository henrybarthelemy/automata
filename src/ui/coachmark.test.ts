import { describe, expect, it } from 'vitest'
import { placeCoachMark, type Rect } from './coachmark'

const VIEWPORT = { width: 1000, height: 700 }
const CARD = { width: 260, height: 120 }
const GAP = 12
const MARGIN = 12

/** A target in the middle of the screen, with room on every side. */
const centre: Rect = { x: 400, y: 300, width: 100, height: 40 }

const within = (p: { x: number; y: number }) =>
  p.x >= MARGIN &&
  p.y >= MARGIN &&
  p.x + CARD.width <= VIEWPORT.width - MARGIN &&
  p.y + CARD.height <= VIEWPORT.height - MARGIN

describe('placeCoachMark', () => {
  it('uses the preferred side when it fits', () => {
    expect(placeCoachMark(centre, CARD, VIEWPORT, 'right').side).toBe('right')
    expect(placeCoachMark(centre, CARD, VIEWPORT, 'top').side).toBe('top')
    expect(placeCoachMark(centre, CARD, VIEWPORT, 'bottom').side).toBe('bottom')
    expect(placeCoachMark(centre, CARD, VIEWPORT, 'left').side).toBe('left')
  })

  it('sits one gap away along the preferred axis', () => {
    expect(placeCoachMark(centre, CARD, VIEWPORT, 'right').x).toBe(centre.x + centre.width + GAP)
    expect(placeCoachMark(centre, CARD, VIEWPORT, 'left').x).toBe(centre.x - GAP - CARD.width)
    expect(placeCoachMark(centre, CARD, VIEWPORT, 'bottom').y).toBe(centre.y + centre.height + GAP)
    expect(placeCoachMark(centre, CARD, VIEWPORT, 'top').y).toBe(centre.y - GAP - CARD.height)
  })

  it('centres the card on the target across the other axis', () => {
    const right = placeCoachMark(centre, CARD, VIEWPORT, 'right')
    expect(right.y + CARD.height / 2).toBe(centre.y + centre.height / 2)
    const below = placeCoachMark(centre, CARD, VIEWPORT, 'bottom')
    expect(below.x + CARD.width / 2).toBe(centre.x + centre.width / 2)
  })

  // The panel is on the left, so its controls ask for `right` and get it; a
  // target near the right edge has to flip instead of hanging off-screen.
  it('flips to the opposite side when the preferred one would overflow', () => {
    const nearRight: Rect = { x: 900, y: 300, width: 80, height: 40 }
    expect(placeCoachMark(nearRight, CARD, VIEWPORT, 'right').side).toBe('left')

    const nearTop: Rect = { x: 400, y: 8, width: 100, height: 40 }
    expect(placeCoachMark(nearTop, CARD, VIEWPORT, 'top').side).toBe('bottom')
  })

  it('keeps the card on screen when the target is in a corner', () => {
    const corners: Rect[] = [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 960, y: 0, width: 40, height: 40 },
      { x: 0, y: 660, width: 40, height: 40 },
      { x: 960, y: 660, width: 40, height: 40 },
    ]
    for (const target of corners) {
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect(within(placeCoachMark(target, CARD, VIEWPORT, side))).toBe(true)
      }
    }
  })

  // A target can be larger than the space around it - the canvas step points
  // at the whole viewport. There is no good side then, only a least-bad one.
  it('falls back to the roomiest side when none fits', () => {
    const huge: Rect = { x: 20, y: 20, width: 960, height: 660 }
    const placement = placeCoachMark(huge, CARD, VIEWPORT, 'right')
    expect(within(placement)).toBe(true)
  })

  it('never leaves the viewport for any target that fits inside it', () => {
    for (let x = 0; x <= 900; x += 150) {
      for (let y = 0; y <= 600; y += 100) {
        const placement = placeCoachMark({ x, y, width: 90, height: 40 }, CARD, VIEWPORT, 'right')
        expect(within(placement)).toBe(true)
      }
    }
  })

  it('handles a card taller than the viewport by pinning it to the top margin', () => {
    const tall = { width: 260, height: 900 }
    const placement = placeCoachMark(centre, tall, VIEWPORT, 'right')
    expect(placement.y).toBe(MARGIN)
  })
})
