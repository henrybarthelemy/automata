import { describe, expect, it } from 'vitest'
import { CONWAY, formatRule, parseRule } from './lifelike'

const mask = (...counts: number[]) => counts.reduce((bits, n) => bits | (1 << n), 0)

describe('parseRule', () => {
  it('parses Conway', () => {
    expect(parseRule(CONWAY)).toEqual({ born: mask(3), survive: mask(2, 3) })
  })

  it('parses rules with an empty half', () => {
    expect(parseRule('B2/S')).toEqual({ born: mask(2), survive: 0 })
    expect(parseRule('B/S012345678')).toEqual({
      born: 0,
      survive: mask(0, 1, 2, 3, 4, 5, 6, 7, 8),
    })
  })

  it('is case insensitive and tolerates whitespace', () => {
    const conway = parseRule(CONWAY)
    expect(parseRule('b3/s23')).toEqual(conway)
    expect(parseRule('  B3 / S23  ')).toEqual(conway)
  })

  it('accepts the slash being omitted', () => {
    expect(parseRule('B3S23')).toEqual(parseRule(CONWAY))
  })

  it('ignores the order and repetition of digits', () => {
    expect(parseRule('B3/S32')).toEqual(parseRule(CONWAY))
    expect(parseRule('B33/S233')).toEqual(parseRule(CONWAY))
  })

  // A half-typed rulestring must not be mistaken for a valid one; the UI keeps
  // the last good rule and flags the input instead.
  it.each(['', 'B3', 'S23', 'nonsense', 'B9/S23', 'B3/S23/4', 'B-1/S2'])(
    'rejects %o',
    (input) => {
      expect(parseRule(input)).toBeNull()
    },
  )

  it('treats a trailing slash as incomplete', () => {
    expect(parseRule('B3/')).toBeNull()
  })
})

describe('formatRule', () => {
  it('round-trips through parseRule', () => {
    for (const text of ['B3/S23', 'B36/S23', 'B2/S', 'B/S012345678']) {
      expect(formatRule(parseRule(text)!)).toBe(text)
    }
  })

  it('normalises digit order', () => {
    expect(formatRule(parseRule('B63/S32')!)).toBe('B36/S23')
  })
})
