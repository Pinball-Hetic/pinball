import type { DotColor } from '@pinball/dmd-core'

// Palette normale Zelda (monde Hyrule) — vert émeraude + or + bleu.
// Remplace la palette orange/rouge de ST par défaut.
export const PALETTE_ZELDA: Record<DotColor, string> = {
  score:    '#22cc44', // vert émeraude — chiffres du score
  lives:    '#FFD700', // or — cœurs / vies
  heticOn:  '#FFD700', // or — lettre HETIC allumée
  heticOff: '#0a1a00', // vert très sombre — lettre HETIC éteinte
  combo:    '#FFD700', // or — combo flash
  multi:    '#4a80ff', // bleu saphir — multiplicateur
  event:    '#FFD700', // or — libellé d'event
  gameOver: '#ff453a', // rouge rubis — game over
  marquee:  '#22cc44', // vert — marquee / titres
  rain:     '#1a7a30', // vert foncé — pluie de fond
  rainGo:   '#FFD700', // or — burst de sortie
}

// Palette du Sacred Realm (vert lumineux / or vif) — appliquée quand
// display.alternateWorld est actif (monde altéré).
export const PALETTE_SACRED_REALM: Record<DotColor, string> = {
  score:    '#B8F59A', // vert clair intense
  lives:    '#FFD700', // or
  heticOn:  '#AAFF55', // vert-jaune vif
  heticOff: '#0F2200',
  combo:    '#44FF88',
  multi:    '#88FFAA',
  event:    '#FFD700',
  gameOver: '#FF6600',
  marquee:  '#66FF99',
  rain:     '#33CC66',
  rainGo:   '#FFDD00',
}
