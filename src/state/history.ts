/**
 * Fixed-capacity FIFO of population samples, backing the population
 * sparkline. Plain array push/shift is plenty here — at most a handful of
 * pushes per animation frame, and shifting a couple hundred entries is
 * nowhere near a hot path — so there's no need for a circular-index
 * structure.
 */

/**
 * One plotted point. The generation is stored rather than derived from the
 * sample's index because samples and generations aren't one-to-one: painting
 * pushes a fresh sample at the *same* generation (see `publishStats` in
 * useSimulation), so counting back from the newest index would mislabel every
 * point before an edit.
 */
export interface Sample {
  generation: number
  population: number
}

export interface History {
  push(sample: Sample): void
  /** A snapshot, not a live view — callers (React state) need a fresh
   * reference each time or a mutate-in-place update would look like a no-op. */
  values(): Sample[]
  reset(): void
}

export function createHistory(capacity: number): History {
  let buffer: Sample[] = []
  return {
    push(sample: Sample) {
      buffer.push(sample)
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
