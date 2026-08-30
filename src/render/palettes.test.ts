import { describe, expect, it } from 'vitest'
import { buildLuts, paletteById, PALETTES } from './palettes'

const channels = (packed: number) => ({
  r: packed & 0xff,
  g: (packed >> 8) & 0xff,
  b: (packed >> 16) & 0xff,
  a: (packed >>> 24) & 0xff,
})

describe('PALETTES', () => {
  it('has a unique id for every palette', () => {
    const ids = PALETTES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(PALETTES)('$name has a usable ramp and background', (palette) => {
    expect(palette.stops.length).toBeGreaterThanOrEqual(2)
    expect(palette.background).toMatch(/^#[0-9a-f]{6}$/i)
    for (const stop of palette.stops) {
      expect(stop).toHaveLength(3)
      for (const channel of stop) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
  })

  it('falls back to the first palette for an unknown id', () => {
    expect(paletteById('does-not-exist')).toBe(PALETTES[0])
    expect(paletteById(PALETTES[1].id)).toBe(PALETTES[1])
  })
})

describe('buildLuts', () => {
  it.each(PALETTES)('$name produces 256 opaque entries', (palette) => {
    const { alive, trail } = buildLuts(palette)
    expect(alive).toHaveLength(256)
    expect(trail).toHaveLength(256)
    for (const index of [0, 1, 128, 254, 255]) {
      expect(channels(alive[index]).a).toBe(255)
      expect(channels(trail[index]).a).toBe(255)
    }
  })

  it('anchors the ends of the ramp on the first and last stops', () => {
    const palette = PALETTES[0]
    const { alive } = buildLuts(palette)
    const first = palette.stops[0]
    const last = palette.stops[palette.stops.length - 1]
    expect(channels(alive[0])).toMatchObject({ r: first[0], g: first[1], b: first[2] })
    expect(channels(alive[255])).toMatchObject({ r: last[0], g: last[1], b: last[2] })
  })

  it('increases in brightness with heat', () => {
    const { alive } = buildLuts(PALETTES[0])
    const luminance = (packed: number) => {
      const { r, g, b } = channels(packed)
      return r + g + b
    }
    for (let i = 1; i < 256; i++) {
      expect(luminance(alive[i])).toBeGreaterThanOrEqual(luminance(alive[i - 1]))
    }
  })

  // Trails must read as dimmer than live cells so a young cell is never
  // mistaken for a fading ghost.
  it('makes the trail ramp dimmer than the live ramp', () => {
    const { alive, trail } = buildLuts(PALETTES[0])
    for (const index of [1, 64, 128, 200, 255]) {
      const live = channels(alive[index])
      const ghost = channels(trail[index])
      expect(ghost.r + ghost.g + ghost.b).toBeLessThan(live.r + live.g + live.b)
    }
  })

  it('honours the dimming factor', () => {
    const { trail } = buildLuts(PALETTES[0], 0)
    expect(channels(trail[255])).toMatchObject({ r: 0, g: 0, b: 0 })
  })
})
