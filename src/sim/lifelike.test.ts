import { describe, expect, it } from 'vitest'
import { CONWAY, formatRule, isTotalistic, parseRule, ruleError } from './lifelike'
import { ALL, LETTERS } from './hensel'

/**
 * Build a transition set. `'*'` selects every class of that count - what a
 * bare digit in a rulestring means - and a letter string selects those classes.
 */
const sel = (spec: Record<number, string>) => {
  const t = new Uint16Array(9)
  for (const [key, letters] of Object.entries(spec)) {
    const count = Number(key)
    t[count] =
      letters === '*'
        ? ALL[count]
        : [...letters].reduce((bits, l) => bits | (1 << LETTERS[count].indexOf(l)), 0)
  }
  return t
}

describe('parseRule', () => {
  it('parses Conway', () => {
    expect(parseRule(CONWAY)).toMatchObject({
      born: sel({ 3: '*' }),
      survive: sel({ 2: '*', 3: '*' }),
      states: 2,
    })
  })

  it('parses rules with an empty half', () => {
    expect(parseRule('B2/S')).toMatchObject({ born: sel({ 2: '*' }), survive: sel({}), states: 2 })
    expect(parseRule('B/S012345678')).toMatchObject({
      born: sel({}),
      survive: sel({ 0: '*', 1: '*', 2: '*', 3: '*', 4: '*', 5: '*', 6: '*', 7: '*', 8: '*' }),
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

// Isotropic non-totalistic rules qualify a neighbour count with the letters of
// the arrangements it applies to: `2i` is two opposite orthogonal neighbours,
// and `2-i` is every two-neighbour arrangement except that one.
describe('parseRule with Hensel notation', () => {
  it('selects the listed classes', () => {
    expect(parseRule('B2i/S')).toMatchObject({ born: sel({ 2: 'i' }), survive: sel({}) })
    expect(parseRule('B3aij/S')).toMatchObject({ born: sel({ 3: 'aij' }) })
  })

  it('excludes the listed classes after a dash', () => {
    expect(parseRule('B2-a/S12')).toMatchObject({
      born: sel({ 2: 'cekin' }),
      survive: sel({ 1: '*', 2: '*' }),
    })
  })

  it('reads tlife', () => {
    expect(parseRule('B3/S2-i34q')).toMatchObject({
      born: sel({ 3: '*' }),
      survive: sel({ 2: 'cekan', 3: '*', 4: 'q' }),
    })
  })

  it('mixes qualified and bare counts in either order', () => {
    expect(parseRule('B2ci3/S1e2')).toMatchObject({
      born: sel({ 2: 'ci', 3: '*' }),
      survive: sel({ 1: 'e', 2: '*' }),
    })
  })

  it('unions repeated counts', () => {
    expect(parseRule('B2c2i/S')).toEqual(parseRule('B2ci/S'))
  })

  it('composes with Generations', () => {
    expect(parseRule('B2-a/S12/4')!.states).toBe(4)
  })

  // A count qualified with every letter is the totalistic count, and a count
  // qualified with none of them is no count at all.
  it('collapses a full letter list to the bare count', () => {
    expect(parseRule('B3cekainyqjr/S23')).toEqual(parseRule(CONWAY))
    expect(parseRule('B3-/S23')).toBeNull()
  })

  it('drops a count whose classes are all excluded', () => {
    expect(parseRule('B2-cekain3/S23')).toEqual(parseRule('B3/S23'))
  })

  // Letters are only meaningful for a specific count: `t` exists at 4 but not
  // at 2, so `B2t` is a typo rather than a rule.
  it.each(['B2t/S3', 'B2z/S3', 'B1k/S3', 'B3/S2-x', 'B0e/S3'])('rejects %o', (input) => {
    expect(parseRule(input)).toBeNull()
  })

  it('reports whether a rule is plain B/S', () => {
    expect(isTotalistic(parseRule(CONWAY)!)).toBe(true)
    expect(isTotalistic(parseRule('B2/S/3')!)).toBe(true)
    expect(isTotalistic(parseRule('B2-a/S12')!)).toBe(false)
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
    expect(parseRule('B2/S/3')!.states).toBe(3)
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

  it('round-trips isotropic rules', () => {
    for (const text of ['B2-a/S12', 'B3/S2-i34q', 'B2ci3/S1e2', 'B2n3/S23-a4iyt']) {
      expect(formatRule(parseRule(text)!)).toBe(text)
    }
  })

  it('writes whichever of the listed and excluded forms is shorter', () => {
    // Five of the six two-neighbour classes: `2-a` beats `2cekin`.
    expect(formatRule(parseRule('B2cekin/S')!)).toBe('B2-a/S')
    // A tie stays with the plain listed form.
    expect(formatRule(parseRule('B2cek/S')!)).toBe('B2cek/S')
  })

  it('writes a fully selected count as a bare digit', () => {
    expect(formatRule(parseRule('B2cekain/S')!)).toBe('B2/S')
  })

  it('orders letters canonically', () => {
    expect(formatRule(parseRule('B3ria/S')!)).toBe('B3air/S')
  })
})

// The rule field is the most powerful control in the app and the easiest to
// mistype, so a rejected rulestring says what is wrong with it rather than
// just refusing. `ruleError` is null exactly when `parseRule` succeeds.
describe('ruleError', () => {
  it.each(['B3/S23', 'B2-a/S12', 'B3/S2-i34q', 'B2/S/3', 'b36s23'])(
    'says nothing about the valid rule %o',
    (input) => {
      expect(ruleError(input)).toBeNull()
    },
  )

  it('agrees with parseRule on every input it is given', () => {
    const inputs = [
      '', 'B3', 'S23', 'B3/S23', 'B9/S2', 'B2t/S3', 'B3-/S2', 'B3/S23/1',
      'B3/S23/x', 'B3/S23/4/5', 'nonsense', 'B2-a/S12', 'B/S', 'B3/S23/256',
    ]
    for (const input of inputs) {
      expect(ruleError(input) === null).toBe(parseRule(input) !== null)
    }
  })

  it('asks for a rule when the field is empty', () => {
    expect(ruleError('')).toMatch(/B3\/S23/)
  })

  it('names the missing half', () => {
    expect(ruleError('B3')).toMatch(/S/)
    expect(ruleError('S23')).toMatch(/^A rulestring starts with B/)
  })

  it('names the offending neighbour count', () => {
    expect(ruleError('B9/S2')).toMatch(/9/)
    expect(ruleError('B9/S2')).toMatch(/0 to 8/)
  })

  it('names the offending letter and what is allowed there', () => {
    const message = ruleError('B2t/S3')!
    expect(message).toContain('t')
    expect(message).toContain('2')
    expect(message).toContain('cekain')
  })

  it('explains a dash with nothing after it', () => {
    expect(ruleError('B3-/S2')).toMatch(/-/)
  })

  it('explains a bad state count', () => {
    expect(ruleError('B3/S23/1')).toMatch(/2 (to|and) 256/)
    expect(ruleError('B3/S23/x')).toMatch(/2 (to|and) 256/)
  })

  it('is a single sentence', () => {
    for (const input of ['', 'B3', 'B9/S2', 'B2t/S3', 'B3-/S2', 'B3/S23/1']) {
      const message = ruleError(input)!
      expect(message).toMatch(/\.$/)
      expect(message.split('. ').length).toBeLessThanOrEqual(2)
    }
  })
})
