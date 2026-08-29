/**
 * Life-like rules in B/S notation. Conway is B3/S23; the same engine covers
 * HighLife, Seeds, Day & Night, etc.
 */
export interface Rule {
  /** Bit n set = a dead cell with n live neighbours is born. */
  born: number
  /** Bit n set = a live cell with n live neighbours survives. */
  survive: number
}

export const CONWAY = 'B3/S23'

export function parseRule(text: string): Rule | null {
  const m = /^\s*b([0-8]*)\/?s([0-8]*)\s*$/i.exec(text.replace(/\s+/g, ''))
  if (!m) return null
  const mask = (digits: string) => {
    let bits = 0
    for (const d of digits) bits |= 1 << Number(d)
    return bits
  }
  return { born: mask(m[1]), survive: mask(m[2]) }
}

export function formatRule(rule: Rule): string {
  const digits = (bits: number) =>
    [...Array(9).keys()].filter((n) => bits & (1 << n)).join('')
  return `B${digits(rule.born)}/S${digits(rule.survive)}`
}
