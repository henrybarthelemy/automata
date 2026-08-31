/**
 * Life-like rules in B/S notation. Conway is B3/S23; the same engine covers
 * HighLife, Seeds, Day & Night, etc.
 */
export interface Rule {
  /** Bit n set = a dead cell with n live neighbours is born. */
  born: number
  /** Bit n set = a live cell with n live neighbours survives. */
  survive: number
  /**
   * Number of cell states. 2 is ordinary Life. Above that the rule is a
   * Generations rule: a cell that fails to survive walks down states
   * 2..states-1 before emptying, and is neither alive nor birthable meanwhile.
   */
  states: number
}

export const CONWAY = 'B3/S23'

/** Cells are stored in a Uint8Array, so the countdown has to fit in a byte. */
const MAX_STATES = 256

export function parseRule(text: string): Rule | null {
  const m = /^b([0-8]*)\/?s([0-8]*)(?:\/(\d+))?$/i.exec(text.replace(/\s+/g, ''))
  if (!m) return null

  const states = m[3] === undefined ? 2 : Number(m[3])
  if (states < 2 || states > MAX_STATES) return null

  const mask = (digits: string) => {
    let bits = 0
    for (const d of digits) bits |= 1 << Number(d)
    return bits
  }
  return { born: mask(m[1]), survive: mask(m[2]), states }
}

export function formatRule(rule: Rule): string {
  const digits = (bits: number) =>
    [...Array(9).keys()].filter((n) => bits & (1 << n)).join('')
  const base = `B${digits(rule.born)}/S${digits(rule.survive)}`
  return rule.states === 2 ? base : `${base}/${rule.states}`
}
