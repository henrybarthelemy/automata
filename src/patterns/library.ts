/**
 * A small built-in collection, stored as RLE so it goes through exactly the
 * same parser as anything pasted in from LifeWiki.
 */
export interface LibraryEntry {
  id: string
  name: string
  /** What it does, shown in the picker. */
  note: string
  rle: string
}

export const PATTERN_LIBRARY: LibraryEntry[] = [
  {
    id: 'glider',
    name: 'Glider',
    note: 'Travels diagonally, one cell every 4 generations',
    rle: 'x = 3, y = 3, rule = B3/S23\nbob$2bo$3o!',
  },
  {
    id: 'lwss',
    name: 'Lightweight spaceship',
    note: 'Travels horizontally, two cells every 4 generations',
    rle: 'x = 5, y = 4, rule = B3/S23\no2bo$4bo$o3bo$b4o!',
  },
  {
    id: 'gosper',
    name: 'Gosper glider gun',
    note: 'Emits a glider every 30 generations, forever',
    rle:
      'x = 36, y = 9, rule = B3/S23\n' +
      '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$' +
      '2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!',
  },
  {
    id: 'pulsar',
    name: 'Pulsar',
    note: 'Period 3 oscillator',
    rle:
      'x = 13, y = 13, rule = B3/S23\n' +
      '2b3o3b3o2b$12b$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b$12b$' +
      '2b3o3b3o2b$o4bobo4bo$o4bobo4bo$o4bobo4bo$12b$2b3o3b3o2b!',
  },
  {
    id: 'rpentomino',
    name: 'R-pentomino',
    note: 'Five cells that churn for 1103 generations',
    rle: 'x = 3, y = 3, rule = B3/S23\nb2o$2o$bo!',
  },
  {
    id: 'acorn',
    name: 'Acorn',
    note: 'Seven cells that run for 5206 generations',
    rle: 'x = 7, y = 3, rule = B3/S23\nbo$3bo$2o2b3o!',
  },
  {
    id: 'diehard',
    name: 'Diehard',
    note: 'Vanishes completely after 130 generations',
    rle: 'x = 8, y = 3, rule = B3/S23\n6bo$2o$bo3b3o!',
  },
  {
    id: 'toad',
    name: 'Toad',
    note: 'Period 2 oscillator',
    rle: 'x = 4, y = 2, rule = B3/S23\nb3o$3o!',
  },
  {
    id: 'beacon',
    name: 'Beacon',
    note: 'Period 2 oscillator',
    rle: 'x = 4, y = 4, rule = B3/S23\n2o$2o$2b2o$2b2o!',
  },
  {
    id: 'block',
    name: 'Block',
    note: 'The simplest still life',
    rle: 'x = 2, y = 2, rule = B3/S23\n2o$2o!',
  },
]
