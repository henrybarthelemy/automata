import { describe, expect, it } from 'vitest'
import { CONWAY, formatRule, parseRule } from './lifelike'

const mask = (...counts: number[]) => counts.reduce((bits, n) => bits | (1 << n), 0)

describe('parseRule', () => {
  it('parses Conway', () => {
    expect(parseRule(CONWAY)).toEqual({ born: mask(3), survive: mask(2, 3), states: 2 })
  })

  it('parses rules with an empty half', () => {
    expect(parseRule('B2/S')).toEqual({ born: mask(2), survive: 0, states: 2 })
    expect(parseRule('B/S012345678')).toEqual({
      born: 0,
      survive: mask(0, 1, 2, 3, 4, 5, 6, 7, 8),
      states: 2,
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
  it.each(['', 'B3', 'S23', 'nonsense', 'B9/S23', 'B3/S23/4/5', 'B-1/S2'])(
    'rejects %o',
    (input) => {
      expect(parseRule(input)).toBeNull()
    },
  )

  it('treats a trailing slash as incomplete', () => {
    expect(parseRule('B3/')).toBeNull()
  })
})

// Generations: `Bx/Sy/n` gives cells n states. State 1 is alive, 0 is dead,
// and 2..n-1 are a countdown a cell walks through after failing to survive.
describe('parseRule with Generations', () => {
  it('defaults to two states when no count is given', () => {
    expect(parseRule('B3/S23')!.states).toBe(2)
  })

  it('reads the state count', () => {
    expect(parseRule('B3/S23/5')!.states).toBe(5)
    expect(parseRule("B2/S/3")!.states).toBe(3)
  })

  it('treats an explicit /2 as ordinary Life', () => {
    expect(parseRule('B3/S23/2')).toEqual(parseRule('B3/S23'))
  })

  it('accepts the largest count a byte can hold', () => {
    expect(parseRule('B3/S23/256')!.states).toBe(256)
  })

  // Fewer than two states is meaningless, and more than 256 will not fit the
  // Uint8Array the world stores cells in.
  it.each(['B3/S23/0', 'B3/S23/1', 'B3/S23/257', 'B3/S23/x', 'B3/S23/'])(
    'rejects %o',
    (input) => {
      expect(parseRule(input)).toBeNull()
    },
  )
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

  it('omits the state count for ordinary Life', () => {
    expect(formatRule(parseRule('B3/S23/2')!)).toBe('B3/S23')
  })

  it('includes the state count for Generations', () => {
    expect(formatRule(parseRule('B2/S/3')!)).toBe('B2/S/3')
    expect(formatRule(parseRule('B345/S4567/8')!)).toBe('B345/S4567/8')
  })
})
