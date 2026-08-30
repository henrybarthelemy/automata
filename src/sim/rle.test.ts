import { describe, expect, it } from 'vitest'
import { flipPattern, parseRLE, rotatePattern, serializeRLE, type Pattern } from './rle'
import { PATTERN_LIBRARY } from '../patterns/library'

const GLIDER = 'x = 3, y = 3, rule = B3/S23\nbob$2bo$3o!'

function render(pattern: Pattern): string[] {
  const out: string[] = []
  for (let y = 0; y < pattern.height; y++) {
    let row = ''
    for (let x = 0; x < pattern.width; x++) row += pattern.cells[y * pattern.width + x] ? 'O' : '.'
    out.push(row)
  }
  return out
}

const population = (pattern: Pattern) => pattern.cells.reduce((a, b) => a + b, 0)

describe('parseRLE', () => {
  it('parses a glider', () => {
    expect(render(parseRLE(GLIDER)!)).toEqual(['.O.', '..O', 'OOO'])
  })

  it('reads the name and rule from the header', () => {
    const pattern = parseRLE('#N Thing\n#C a comment\nx = 3, y = 3, rule = B36/S23\nbob$2bo$3o!')!
    expect(pattern.name).toBe('Thing')
    expect(pattern.rule).toBe('B36/S23')
  })

  it('handles a body split across lines', () => {
    expect(render(parseRLE('x = 3, y = 3\nbob$\n2bo$\n3o!')!)).toEqual(['.O.', '..O', 'OOO'])
  })

  it('accepts "." as an alternative dead tag', () => {
    expect(render(parseRLE('x = 3, y = 3\n.o.$2.o$3o!')!)).toEqual(['.O.', '..O', 'OOO'])
  })

  it('tolerates a missing terminator when a header is present', () => {
    expect(render(parseRLE('x = 3, y = 3\nbob$2bo$3o')!)).toEqual(['.O.', '..O', 'OOO'])
  })

  it('accepts a bare body that terminates', () => {
    expect(render(parseRLE('bob$2bo$3o!')!)).toEqual(['.O.', '..O', 'OOO'])
  })

  it('expands run counts on blank rows', () => {
    const pattern = parseRLE('x = 1, y = 5\no$3$o!')!
    expect(pattern.height).toBe(5)
    expect(pattern.cells[0]).toBe(1)
    expect(pattern.cells[4]).toBe(1)
  })

  it('trusts the content over a header that under-declares', () => {
    expect(parseRLE('x = 1, y = 1\n3o!')!.width).toBe(3)
  })

  it('imports the extra states of multistate rules as simply alive', () => {
    expect(population(parseRLE('x = 2, y = 1\nAB!')!)).toBe(2)
  })

  // Pasting the wrong thing must fail visibly rather than producing a board of
  // nonsense, so anything outside the token set aborts the parse.
  it.each([
    ['prose', 'not a pattern at all'],
    ['empty', ''],
    ['whitespace', '   \n  \n'],
    ['header with no body', 'x = 3, y = 3'],
    ['json', '{"width": 3, "cells": [1, 0, 1]}'],
    ['comments only', '#N Nothing\n#C here'],
    ['an html fragment', '<div>hello</div>'],
  ])('rejects %s', (_label, input) => {
    expect(parseRLE(input)).toBeNull()
  })
})

describe('serializeRLE', () => {
  it('round-trips every library pattern unchanged', () => {
    for (const entry of PATTERN_LIBRARY) {
      const original = parseRLE(entry.rle)!
      const again = parseRLE(serializeRLE(original, { rule: 'B3/S23' }))!
      expect(render(again), entry.id).toEqual(render(original))
    }
  })

  it('emits a parseable header', () => {
    const text = serializeRLE(parseRLE(GLIDER)!, { name: 'Glider', rule: 'B3/S23' })
    expect(text).toContain('#N Glider')
    expect(text).toContain('x = 3, y = 3, rule = B3/S23')
    expect(text.trimEnd().endsWith('!')).toBe(true)
  })

  it('compresses runs', () => {
    const solid: Pattern = { width: 6, height: 1, cells: new Uint8Array([1, 1, 1, 1, 1, 1]) }
    expect(serializeRLE(solid)).toContain('6o')
  })

  it('collapses consecutive blank rows into a run', () => {
    const gapped: Pattern = {
      width: 1,
      height: 5,
      cells: new Uint8Array([1, 0, 0, 0, 1]),
    }
    expect(serializeRLE(gapped)).toContain('4$')
  })

  it('keeps lines within the conventional 70 characters', () => {
    const wide: Pattern = { width: 400, height: 4, cells: new Uint8Array(1600) }
    for (let i = 0; i < 1600; i += 2) wide.cells[i] = 1
    for (const line of serializeRLE(wide).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(70)
    }
  })

  it('survives a round-trip after wrapping', () => {
    const wide: Pattern = { width: 400, height: 4, cells: new Uint8Array(1600) }
    for (let i = 0; i < 1600; i += 2) wide.cells[i] = 1
    expect(render(parseRLE(serializeRLE(wide))!)).toEqual(render(wide))
  })
})

describe('transforms', () => {
  const glider = () => parseRLE(GLIDER)!

  it('returns to the original after four quarter turns', () => {
    let p = glider()
    for (let i = 0; i < 4; i++) p = rotatePattern(p)
    expect(render(p)).toEqual(render(glider()))
  })

  it('rotates a quarter turn clockwise', () => {
    const bar: Pattern = { width: 3, height: 1, cells: new Uint8Array([1, 1, 1]) }
    const turned = rotatePattern(bar)
    expect([turned.width, turned.height]).toEqual([1, 3])
    expect(render(turned)).toEqual(['O', 'O', 'O'])
  })

  it('swaps the dimensions of a non-square pattern', () => {
    const acorn = parseRLE(PATTERN_LIBRARY.find((p) => p.id === 'acorn')!.rle)!
    const turned = rotatePattern(acorn)
    expect([turned.width, turned.height]).toEqual([acorn.height, acorn.width])
  })

  it('preserves population under rotation and flipping', () => {
    const g = glider()
    expect(population(rotatePattern(g))).toBe(population(g))
    expect(population(flipPattern(g))).toBe(population(g))
  })

  it('returns to the original after flipping twice', () => {
    expect(render(flipPattern(flipPattern(glider())))).toEqual(render(glider()))
  })

  it('mirrors left to right', () => {
    const corner: Pattern = { width: 2, height: 1, cells: new Uint8Array([1, 0]) }
    expect(render(flipPattern(corner))).toEqual(['.O'])
  })
})

describe('the built-in library', () => {
  const EXPECTED_POPULATION: Record<string, number> = {
    glider: 5,
    lwss: 9,
    gosper: 36,
    pulsar: 48,
    rpentomino: 5,
    acorn: 7,
    diehard: 7,
    toad: 6,
    beacon: 8,
    block: 4,
  }

  it.each(PATTERN_LIBRARY)('$name parses to its known cell count', (entry) => {
    const pattern = parseRLE(entry.rle)
    expect(pattern).not.toBeNull()
    expect(population(pattern!)).toBe(EXPECTED_POPULATION[entry.id])
  })

  it('has a unique id for every entry', () => {
    const ids = PATTERN_LIBRARY.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
