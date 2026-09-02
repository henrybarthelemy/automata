import { describe, expect, it } from 'vitest'
import { createHistory } from './history'

describe('createHistory', () => {
  it('starts empty', () => {
    expect(createHistory(3).values()).toEqual([])
  })

  it('appends pushed values in order', () => {
    const h = createHistory(5)
    h.push(1)
    h.push(2)
    h.push(3)
    expect(h.values()).toEqual([1, 2, 3])
  })

  it('drops the oldest value once past capacity', () => {
    const h = createHistory(3)
    h.push(1)
    h.push(2)
    h.push(3)
    h.push(4)
    expect(h.values()).toEqual([2, 3, 4])
  })

  it('empties on reset', () => {
    const h = createHistory(3)
    h.push(1)
    h.push(2)
    h.reset()
    expect(h.values()).toEqual([])
    h.push(9)
    expect(h.values()).toEqual([9])
  })

  it('returns a snapshot, not a live view backed by the same array', () => {
    const h = createHistory(3)
    h.push(1)
    const snapshot = h.values()
    h.push(2)
    expect(snapshot).toEqual([1])
    expect(h.values()).toEqual([1, 2])
  })
})
