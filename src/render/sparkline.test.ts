import { describe, expect, it } from 'vitest'
import { normalize } from './sparkline'

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
