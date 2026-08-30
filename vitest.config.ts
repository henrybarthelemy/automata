import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The simulation, RLE, and view modules import nothing from the DOM, so
    // they run in plain Node. Anything needing a canvas is verified in the
    // browser instead.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
