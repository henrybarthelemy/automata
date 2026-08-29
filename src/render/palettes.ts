export interface Palette {
  id: string
  name: string
  background: string
  /** Colour stops from coldest (just-born / nearly-faded) to hottest (long-lived). */
  stops: [number, number, number][]
}

export const PALETTES: Palette[] = [
  {
    id: 'ember',
    name: 'Ember',
    background: '#0b0705',
    stops: [
      [40, 12, 6],
      [140, 34, 10],
      [235, 96, 20],
      [255, 176, 62],
      [255, 240, 200],
    ],
  },
  {
    id: 'ice',
    name: 'Ice',
    background: '#04080f',
    stops: [
      [8, 22, 48],
      [22, 74, 132],
      [58, 150, 210],
      [140, 214, 240],
      [236, 252, 255],
    ],
  },
  {
    id: 'neon',
    name: 'Neon',
    background: '#07040f',
    stops: [
      [34, 8, 60],
      [104, 20, 158],
      [196, 40, 176],
      [255, 92, 150],
      [255, 220, 240],
    ],
  },
  {
    id: 'acid',
    name: 'Acid',
    background: '#040a06',
    stops: [
      [8, 34, 18],
      [24, 110, 52],
      [86, 196, 62],
      [178, 240, 88],
      [244, 255, 210],
    ],
  },
  {
    id: 'mono',
    name: 'Mono',
    background: '#000000',
    stops: [
      [30, 30, 30],
      [110, 110, 110],
      [190, 190, 190],
      [255, 255, 255],
    ],
  },
]

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

/**
 * Expand stops into a 256-entry lookup of packed little-endian RGBA, so the
 * render loop is a single store per cell.
 *
 * Returns two ramps: living cells, and the dimmer trail left behind by dead
 * ones, so a young live cell never reads as a fading ghost.
 */
export function buildLuts(palette: Palette, trailDim = 0.5) {
  const alive = new Uint32Array(256)
  const trail = new Uint32Array(256)
  const stops = palette.stops
  const segments = stops.length - 1

  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * segments
    const seg = Math.min(Math.floor(t), segments - 1)
    const f = t - seg
    const a = stops[seg]
    const b = stops[seg + 1]
    const r = Math.round(a[0] + (b[0] - a[0]) * f)
    const g = Math.round(a[1] + (b[1] - a[1]) * f)
    const bl = Math.round(a[2] + (b[2] - a[2]) * f)
    alive[i] = (255 << 24) | (bl << 16) | (g << 8) | r
    trail[i] =
      (255 << 24) |
      (Math.round(bl * trailDim) << 16) |
      (Math.round(g * trailDim) << 8) |
      Math.round(r * trailDim)
  }
  return { alive, trail }
}
