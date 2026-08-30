/**
 * Run Length Encoded patterns — the format the Life community stores patterns
 * in, so anything from LifeWiki can be pasted straight in.
 *
 * A file is optional `#` metadata lines, a `x = m, y = n, rule = R` header,
 * then run tokens: `<count><tag>` where `b`/`.` is dead, any other letter is
 * alive, `$` ends a row and `!` ends the pattern.
 */
export interface Pattern {
  name?: string
  rule?: string
  width: number
  height: number
  /** Row-major, one byte per cell, 1 = alive. */
  cells: Uint8Array
}

const HEADER = /x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*(?:,\s*rule\s*=\s*([^,\n]+))?/i

export function parseRLE(text: string): Pattern | null {
  let name: string | undefined
  let rule: string | undefined
  let headerWidth = 0
  let headerHeight = 0
  const body: string[] = []
  let seenHeader = false

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) {
      // #N is the pattern name; other metadata lines are not needed here.
      if (/^#N\s+/i.test(trimmed)) name = trimmed.slice(2).trim()
      continue
    }
    if (!seenHeader) {
      const header = HEADER.exec(trimmed)
      if (header) {
        headerWidth = Number(header[1])
        headerHeight = Number(header[2])
        rule = header[3]?.trim()
        seenHeader = true
        continue
      }
    }
    body.push(trimmed)
  }

  const live: number[] = []
  let x = 0
  let y = 0
  let count = 0
  let maxX = 0
  let ended = false
  let invalid = false

  for (const char of body.join('')) {
    if (/\s/.test(char)) continue
    if (char >= '0' && char <= '9') {
      count = count * 10 + (char.charCodeAt(0) - 48)
      continue
    }
    const run = count || 1
    count = 0

    if (char === 'b' || char === '.') {
      x += run
    } else if (char === '$') {
      y += run
      x = 0
    } else if (char === '!') {
      ended = true
      break
    } else if (char === 'o' || char === 'O' || (char >= 'A' && char <= 'X')) {
      // 'o' is the live tag; A-X are the extra states of multistate rules,
      // which we import as simply alive.
      for (let i = 0; i < run; i++) live.push(x + i, y)
      x += run
      if (x > maxX) maxX = x
    } else {
      // Anything else means this isn't RLE. Bail rather than turn prose into
      // a board — pasting the wrong thing should fail visibly.
      invalid = true
      break
    }
  }

  if (invalid) return null
  // A bare body is accepted, but only if it actually terminated; otherwise
  // there is nothing distinguishing it from arbitrary text.
  if (!seenHeader && !ended) return null
  if (live.length === 0) return null

  // Trust the content over the header: some files in the wild under-declare.
  let maxY = 0
  for (let i = 1; i < live.length; i += 2) if (live[i] + 1 > maxY) maxY = live[i] + 1
  const width = Math.max(headerWidth, maxX)
  const height = Math.max(headerHeight, maxY)
  if (width <= 0 || height <= 0) return null

  const cells = new Uint8Array(width * height)
  for (let i = 0; i < live.length; i += 2) {
    const cx = live[i]
    const cy = live[i + 1]
    if (cx < width && cy < height) cells[cy * width + cx] = 1
  }
  return { name, rule, width, height, cells }
}

const token = (run: number, tag: string) => (run > 1 ? `${run}${tag}` : tag)

/** Encode one row, dropping trailing dead cells as the format expects. */
function encodeRow(cells: Uint8Array, offset: number, width: number): string[] {
  let end = width
  while (end > 0 && !cells[offset + end - 1]) end--

  const out: string[] = []
  let i = 0
  while (i < end) {
    const value = cells[offset + i]
    let j = i
    while (j < end && cells[offset + j] === value) j++
    out.push(token(j - i, value ? 'o' : 'b'))
    i = j
  }
  return out
}

export function serializeRLE(pattern: Pattern, meta: { name?: string; rule?: string } = {}): string {
  const { width, height, cells } = pattern
  const tokens: string[] = []
  let blankRows = 0
  let started = false

  for (let y = 0; y < height; y++) {
    const row = encodeRow(cells, y * width, width)
    if (row.length === 0) {
      blankRows++
      continue
    }
    if (started) tokens.push(token(blankRows + 1, '$'))
    blankRows = 0
    tokens.push(...row)
    started = true
  }
  tokens.push('!')

  // Convention is to keep lines at or under 70 characters.
  const lines: string[] = []
  let line = ''
  for (const part of tokens) {
    if (line.length + part.length > 70) {
      lines.push(line)
      line = ''
    }
    line += part
  }
  if (line) lines.push(line)

  const name = meta.name ?? pattern.name
  const rule = meta.rule ?? pattern.rule
  const head: string[] = []
  if (name) head.push(`#N ${name}`)
  head.push(`x = ${width}, y = ${height}${rule ? `, rule = ${rule}` : ''}`)
  return [...head, ...lines].join('\n')
}

/** Quarter turn clockwise. */
export function rotatePattern(pattern: Pattern): Pattern {
  const { width, height, cells } = pattern
  const out = new Uint8Array(cells.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y * width + x]) out[x * height + (height - 1 - y)] = 1
    }
  }
  return { ...pattern, width: height, height: width, cells: out }
}

/** Mirror left to right. */
export function flipPattern(pattern: Pattern): Pattern {
  const { width, height, cells } = pattern
  const out = new Uint8Array(cells.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y * width + x]) out[y * width + (width - 1 - x)] = 1
    }
  }
  return { ...pattern, cells: out }
}
