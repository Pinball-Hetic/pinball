import type { DotColor } from '@pinball/dmd-core'

// Zelda normal palette (Hyrule world) — emerald green + gold + blue.
// Replaces the default ST orange/red palette.
export const PALETTE_ZELDA: Record<DotColor, string> = {
  score:    '#22cc44', // emerald green — score digits
  lives:    '#FFD700', // gold — hearts / lives
  heticOn:  '#FFD700', // gold — lit HETIC letter
  heticOff: '#0a1a00', // very dark green — unlit HETIC letter
  combo:    '#FFD700', // gold — combo flash
  multi:    '#4a80ff', // sapphire blue — multiplier
  event:    '#FFD700', // gold — event label
  gameOver: '#ff453a', // ruby red — game over
  marquee:  '#22cc44', // green — marquee / titles
  rain:     '#1a7a30', // dark green — background rain
  rainGo:   '#FFD700', // gold — exit burst
}

// Sacred Realm palette (luminous green / vivid gold) — applied when
// display.alternateWorld is active.
export const PALETTE_SACRED_REALM: Record<DotColor, string> = {
  score:    '#B8F59A', // intense light green
  lives:    '#FFD700', // gold
  heticOn:  '#AAFF55', // bright yellow-green
  heticOff: '#0F2200',
  combo:    '#44FF88',
  multi:    '#88FFAA',
  event:    '#FFD700',
  gameOver: '#FF6600',
  marquee:  '#66FF99',
  rain:     '#33CC66',
  rainGo:   '#FFDD00',
}
