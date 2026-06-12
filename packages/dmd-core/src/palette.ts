// Palettes du DMD. Le buffer grid stocke un INDEX (1..N) par dot ; la
// couleur est résolue au rendu via INDEX_TO_COLOR + la palette active.

export type DotColor =
  | 'score'
  | 'lives'
  | 'heticOn'
  | 'heticOff'
  | 'combo'
  | 'multi'
  | 'event'
  | 'gameOver'
  | 'marquee'
  | 'rain'
  | 'rainGo'

export const PALETTE_NORMAL: Record<DotColor, string> = {
  score: '#FFA028',
  lives: '#FF3344',
  heticOn: '#E71D23',
  heticOff: '#402020',
  combo: '#FF7700',
  multi: '#00C8FF',
  event: '#FFE000',
  gameOver: '#FF2222',
  marquee: '#FFA028',
  rain: '#9944DD',
  rainGo: '#22CC44',
}

// Mapping index → DotColor (1='score', 2='lives', …). L'index 0 = dot éteint.
export const INDEX_TO_COLOR: DotColor[] = [
  'score',
  'lives',
  'heticOn',
  'heticOff',
  'combo',
  'multi',
  'event',
  'gameOver',
  'marquee',
  'rain',
  'rainGo',
]

export const DOT: Record<DotColor, number> = {
  score: 1,
  lives: 2,
  heticOn: 3,
  heticOff: 4,
  combo: 5,
  multi: 6,
  event: 7,
  gameOver: 8,
  marquee: 9,
  rain: 10,
  rainGo: 11,
}

export type Palette = Record<DotColor, string>;
