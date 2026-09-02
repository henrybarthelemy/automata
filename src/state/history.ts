/**
 * Fixed-capacity FIFO of numbers, backing the population sparkline. Plain
 * array push/shift is plenty here — at most a handful of pushes per
 * animation frame, and shifting a couple hundred entries is nowhere near a
 * hot path — so there's no need for a circular-index structure.
 */
export interface History {
  push(value: number): void
  /** A snapshot, not a live view — callers (React state) need a fresh
   * reference each time or a mutate-in-place update would look like a no-op. */
  values(): number[]
  reset(): void
}

export function createHistory(capacity: number): History {
  let buffer: number[] = []
  return {
    push(value: number) {
      buffer.push(value)
      if (buffer.length > capacity) buffer.shift()
    },
    values() {
      return [...buffer]
    },
    reset() {
      buffer = []
    },
  }
}
