/**
 * Life-like rules. Conway is B3/S23; the same engine covers HighLife, Seeds,
 * Day & Night, Generations rules like Brian's Brain, and isotropic
 * non-totalistic rules written in Hensel notation.
 *
 * All of them compile to one thing: a 512-entry table indexed by the cell's
 * own state and the arrangement of its eight neighbours. A totalistic rule is
 * just the case where every arrangement of a given count agrees.
 */
import { ALL, LETTERS, NEIGHBOURHOODS, type Transitions } from './hensel'

export interface Rule {
  /** Which neighbourhoods, by count and class, give birth to a dead cell. */
  born: Transitions
  /** Which neighbourhoods let a live cell survive. */
  survive: Transitions
  /**
   * Number of cell states. 2 is ordinary Life. Above that the rule is a
   * Generations rule: a cell that fails to survive walks down states
   * 2..states-1 before emptying, and is neither alive nor birthable meanwhile.
   */
  states: number
  /**
   * `table[(alive << 8) | neighbourhood]` is 1 when the cell is alive next
   * tick. Built once per rule so the step loop is a single array read.
   */
  table: Uint8Array
}

export const CONWAY = 'B3/S23'

/** Cells are stored in a Uint8Array, so the countdown has to fit in a byte. */
const MAX_STATES = 256

const POPCOUNT = new Uint8Array(256)
for (let m = 1; m < 256; m++) POPCOUNT[m] = POPCOUNT[m >> 1] + (m & 1)

/**
 * Read one `<digit>[-][letters]` group. Returns the index just past it, or -1
 * if the text there is not a valid group.
 */
function readGroup(text: string, at: number, into: Transitions): number {
  const count = text.charCodeAt(at) - 48
  if (count < 0 || count > 8) return -1

  let i = at + 1
  const exclude = text[i] === '-'
  if (exclude) i++

  const letters = LETTERS[count]
  let selected = 0
  for (; i < text.length; i++) {
    const j = letters.indexOf(text[i])
    if (j < 0) break
    selected |= 1 << j
  }

  // A bare digit means every class of that count. A dash has to be followed by
  // something to remove, or the rulestring is half-typed.
  if (selected === 0) {
    if (exclude) return -1
    selected = ALL[count]
  } else if (exclude) {
    selected = ALL[count] & ~selected
  }

  into[count] |= selected
  return i
}

function parseTransitions(text: string): Transitions | null {
  const out = new Uint16Array(9)
  let i = 0
  while (i < text.length) {
    const next = readGroup(text, i, out)
    if (next < 0) return null
    i = next
  }
  return out
}

/**
 * Expand a rule into its 512-entry lookup table. Index is
 * `(alive << 8) | neighbourhood`; the value is the cell's next live state.
 */
function buildTable(born: Transitions, survive: Transitions): Uint8Array {
  const table = new Uint8Array(512)
  NEIGHBOURHOODS.forEach((classes, count) => {
    classes.forEach((masks, i) => {
      const bit = 1 << i
      const isBorn = born[count] & bit ? 1 : 0
      const survives = survive[count] & bit ? 1 : 0
      for (const mask of masks) {
        table[mask] = isBorn
        table[256 | mask] = survives
      }
    })
  })
  return table
}

export function parseRule(text: string): Rule | null {
  const t = text.replace(/\s+/g, '').toLowerCase()
  if (t[0] !== 'b') return null

  // No Hensel letter is `s`, so the first one is unambiguously the separator.
  const split = t.indexOf('s')
  if (split < 0) return null

  let bornText = t.slice(1, split)
  if (bornText.endsWith('/')) bornText = bornText.slice(0, -1)

  const rest = t.slice(split + 1).split('/')
  if (rest.length > 2) return null
  const states = rest.length === 1 ? 2 : Number(rest[1])
  if (!Number.isInteger(states) || states < 2 || states > MAX_STATES) return null

  const born = parseTransitions(bornText)
  const survive = parseTransitions(rest[0])
  if (!born || !survive) return null

  return { born, survive, states, table: buildTable(born, survive) }
}

/** True when the rule ignores arrangement, so it can be written as plain B/S. */
export function isTotalistic(rule: Rule): boolean {
  for (let n = 0; n <= 8; n++) {
    if (rule.born[n] !== 0 && rule.born[n] !== ALL[n]) return false
    if (rule.survive[n] !== 0 && rule.survive[n] !== ALL[n]) return false
  }
  return true
}

/**
 * Write the shortest form of each count: a bare digit when every class is
 * selected, otherwise whichever of the listed and excluded letter lists is
 * shorter. Ties keep the listed form, which reads more directly.
 */
function formatTransitions(t: Transitions): string {
  let out = ''
  for (let n = 0; n <= 8; n++) {
    const selected = t[n]
    if (selected === 0) continue
    if (selected === ALL[n]) {
      out += n
      continue
    }
    const letters = LETTERS[n]
    const listed = [...letters].filter((_, i) => selected & (1 << i)).join('')
    const excluded = [...letters].filter((_, i) => !(selected & (1 << i))).join('')
    out += excluded.length < listed.length ? `${n}-${excluded}` : `${n}${listed}`
  }
  return out
}

export function formatRule(rule: Rule): string {
  const base = `B${formatTransitions(rule.born)}/S${formatTransitions(rule.survive)}`
  return rule.states === 2 ? base : `${base}/${rule.states}`
}

/** Live neighbours in a neighbourhood mask, for callers that want the count. */
export function neighbourCount(mask: number): number {
  return POPCOUNT[mask]
}
