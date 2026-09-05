import { describe, expect, it } from 'vitest'
import {
  AXIS_GUTTER,
  extent,
  formatCompact,
  indexAtX,
  normalize,
  plotX,
  plotY,
} from './sparkline'

describe('normalize', () => {
  it('is empty for no values', () => {
    expect(normalize([])).toEqual([])
  })

  it('maps a single value to the midline', () => {
    expect(normalize([42])).toEqual([0.5])
  })

  it('maps flat data to the midline rather than collapsing to 0', () => {
    expect(normalize([7, 7, 7])).toEqual([0.5, 0.5, 0.5])
  })

  it('maps the extremes to 0 and 1', () => {
    expect(normalize([0, 5, 10])).toEqual([0, 0.5, 1])
  })

  it('tracks relative spread, not absolute magnitude', () => {
    expect(normalize([100, 150, 200])).toEqual([0, 0.5, 1])
  })

  it('handles a falling then rising trend', () => {
    expect(normalize([10, 0, 10])).toEqual([1, 0, 1])
  })
})

describe('extent', () => {
  it('is a zero range for no values', () => {
    expect(extent([])).toEqual({ min: 0, max: 0 })
  })

  it('reports the plotted bounds', () => {
    expect(extent([4, 1, 9, 3])).toEqual({ min: 1, max: 9 })
  })

  it('collapses to a single value for flat data', () => {
    expect(extent([7, 7])).toEqual({ min: 7, max: 7 })
  })
})

describe('formatCompact', () => {
  it('leaves values under a thousand alone', () => {
    expect(formatCompact(0)).toBe('0')
    expect(formatCompact(999)).toBe('999')
  })

  it('abbreviates thousands', () => {
    expect(formatCompact(1000)).toBe('1k')
    expect(formatCompact(1240)).toBe('1.2k')
    expect(formatCompact(45300)).toBe('45.3k')
  })

  it('drops the decimal once it would not fit', () => {
    expect(formatCompact(123456)).toBe('123k')
  })

  it('abbreviates millions, so the huge preset still fits the gutter', () => {
    expect(formatCompact(1918404)).toBe('1.9M')
  })

  it('never exceeds five characters, whatever the world size', () => {
    for (const n of [0, 999, 1000, 45300, 123456, 999999, 1918404, 16000000]) {
      expect(formatCompact(n).length).toBeLessThanOrEqual(5)
    }
  })
})

describe('plotting geometry', () => {
  it('spans the plot area from the axis to the right edge', () => {
    expect(plotX(0, 5, 232)).toBe(AXIS_GUTTER)
    expect(plotX(4, 5, 232)).toBe(232)
  })

  it('puts a lone sample on the axis rather than dividing by zero', () => {
    expect(plotX(0, 1, 232)).toBe(AXIS_GUTTER)
  })

  it('maps the maximum to the top, since canvas y grows downward', () => {
    expect(plotY(1, 40)).toBeLessThan(plotY(0, 40))
  })

  it('insets both extremes so a 1.5px stroke is not half clipped', () => {
    expect(plotY(1, 40)).toBeGreaterThan(0)
    expect(plotY(0, 40)).toBeLessThan(40)
  })
})

describe('indexAtX', () => {
  it('has nothing to hit when there is no data', () => {
    expect(indexAtX(100, 0, 232)).toBe(-1)
  })

  it('always hits the only sample there is', () => {
    expect(indexAtX(200, 1, 232)).toBe(0)
  })

  it('inverts plotX, so the crosshair lands on the sample under the pointer', () => {
    for (let i = 0; i < 200; i++) {
      expect(indexAtX(plotX(i, 200, 232), 200, 232)).toBe(i)
    }
  })

  it('snaps to the nearest sample between two points', () => {
    const midpoint = (plotX(3, 200, 232) + plotX(4, 200, 232)) / 2
    expect(indexAtX(midpoint - 0.1, 200, 232)).toBe(3)
    expect(indexAtX(midpoint + 0.1, 200, 232)).toBe(4)
  })

  it('clamps past either end rather than reading off the array', () => {
    expect(indexAtX(-500, 200, 232)).toBe(0)
    expect(indexAtX(5000, 200, 232)).toBe(199)
  })
})
