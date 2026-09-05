import { describe, expect, it } from 'vitest'
import { createHistory, type Sample } from './history'

const at = (generation: number, population: number): Sample => ({ generation, population })

describe('createHistory', () => {
  it('starts empty', () => {
    expect(createHistory(3).values()).toEqual([])
  })

  it('appends pushed samples in order', () => {
    const h = createHistory(5)
    h.push(at(1, 10))
    h.push(at(2, 20))
    h.push(at(3, 30))
    expect(h.values()).toEqual([at(1, 10), at(2, 20), at(3, 30)])
  })

  // Painting samples the population without advancing the generation, which
  // is why a sample carries its own generation instead of deriving one from
  // its index.
  it('keeps repeated generations distinct', () => {
    const h = createHistory(5)
    h.push(at(7, 100))
    h.push(at(7, 143))
    expect(h.values()).toEqual([at(7, 100), at(7, 143)])
  })

  it('drops the oldest sample once past capacity', () => {
    const h = createHistory(3)
    h.push(at(1, 10))
    h.push(at(2, 20))
    h.push(at(3, 30))
    h.push(at(4, 40))
    expect(h.values()).toEqual([at(2, 20), at(3, 30), at(4, 40)])
  })

  it('empties on reset', () => {
    const h = createHistory(3)
    h.push(at(1, 10))
    h.push(at(2, 20))
    h.reset()
    expect(h.values()).toEqual([])
    h.push(at(9, 90))
    expect(h.values()).toEqual([at(9, 90)])
  })

  it('returns a snapshot, not a live view backed by the same array', () => {
    const h = createHistory(3)
    h.push(at(1, 10))
    const snapshot = h.values()
    h.push(at(2, 20))
    expect(snapshot).toEqual([at(1, 10)])
    expect(h.values()).toEqual([at(1, 10), at(2, 20)])
  })
})
