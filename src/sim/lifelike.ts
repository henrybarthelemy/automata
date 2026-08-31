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
 * A parse either yields a rule or a sentence saying why not. The rule field is
 * the easiest control in the app to mistype, and refusing without a reason
 * would leave the 51 Hensel classes effectively unguessable.
 */
type Parsed = { rule: Rule; error?: undefined } | { rule?: undefined; error: string }

const quoted = (text: string) => `“${text}”`

/**
 * Read one `<digit>[-][letters]` group into `into`. Returns the index just
 * past it, or a sentence explaining why the text there is not a group.
 */
function readGroup(text: string, at: number, into: Transitions, half: string): number | string {
  const count = text.charCodeAt(at) - 48
  if (count < 0 || count > 8) {
    return `${quoted(text[at])} in the ${half} section is not a neighbour count, which runs 0 to 8.`
  }

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

  // Anything that is neither a letter of this count nor the start of the next
  // group is a typo, and the likeliest typo is a letter borrowed from another
  // count - so say which letters this count actually has.
  const stopped = text[i]
  if (stopped !== undefined && (stopped < '0' || stopped > '8')) {
    return `${quoted(stopped)} is not a neighbourhood letter for ${count} neighbours, which has ${letters}.`
  }

  if (selected === 0) {
    if (exclude) return `${quoted(`${count}-`)} needs letters after the dash to exclude.`
    selected = ALL[count]
  } else if (exclude) {
    selected = ALL[count] & ~selected
  }

  into[count] |= selected
  return i
}

function parseTransitions(text: string, half: string): Transitions | string {
  const out = new Uint16Array(9)
  let i = 0
  while (i < text.length) {
    const next = readGroup(text, i, out, half)
    if (typeof next === 'string') return next
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

function parse(text: string): Parsed {
  const t = text.replace(/\s+/g, '').toLowerCase()
  if (t === '') return { error: 'Enter a rulestring, like B3/S23.' }
  if (t[0] !== 'b') return { error: 'A rulestring starts with B, like B3/S23.' }

  // No Hensel letter is `s`, so the first one is unambiguously the separator.
  const split = t.indexOf('s')
  if (split < 0) return { error: 'A rulestring needs an S section too, like B3/S23.' }

  let bornText = t.slice(1, split)
  if (bornText.endsWith('/')) bornText = bornText.slice(0, -1)

  const rest = t.slice(split + 1).split('/')
  if (rest.length > 2) {
    return { error: 'Only one number may follow the S section, giving the state count.' }
  }
  const states = rest.length === 1 ? 2 : Number(rest[1])
  if (!Number.isInteger(states) || states < 2 || states > MAX_STATES) {
    return { error: 'The number after the S section is the state count, from 2 to 256.' }
  }

  const born = parseTransitions(bornText, 'B')
  if (typeof born === 'string') return { error: born }
  const survive = parseTransitions(rest[0], 'S')
  if (typeof survive === 'string') return { error: survive }

  return { rule: { born, survive, states, table: buildTable(born, survive) } }
}

export function parseRule(text: string): Rule | null {
  return parse(text).rule ?? null
}

/** Why the rulestring was rejected, or null when it parses. */
export function ruleError(text: string): string | null {
  return parse(text).error ?? null
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
