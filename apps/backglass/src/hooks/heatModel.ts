// ───────────────────────────────────────────────────────────────────────────
// Modèle PUR du « heat » du réacteur backglass.
//
// POURQUOI CE FICHIER EXISTE
// La boucle rAF de `useIngameReactor` mélangeait le CALCUL du heat (decay
// continu, clamp, gain au hit, verrou FEVER, arrondi) avec l'EFFET de bord DOM
// (écriture de `--heat` sur l'élément cible). Ce mélange rendait la math du heat
// difficile à tester et couplait le hook au DOM → violation SRP.
//
// On isole ici la SEULE responsabilité « calculer la prochaine valeur de heat »
// (fonctions pures, sans React ni DOM). Le hook ne fait plus qu'APPLIQUER la
// valeur calculée à l'élément.
// ───────────────────────────────────────────────────────────────────────────

export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n))

export const HEAT_DECAY = 0.5 // par seconde
export const HIT_GAIN = 0.3

// Intensité d'un hit dérivée du delta de score, clampée dans [0.1, 1].
export const hitIntensity = (delta: number) => clamp(delta / 500, 0.1, 1)

// Heat après un hit d'intensité donnée (borné à 1).
export const heatAfterHit = (heat: number, intensity: number) =>
  Math.min(1, heat + intensity * HIT_GAIN)

// Prochaine valeur de heat pour un frame de la boucle rAF.
//  - heatLock (FEVER) : verrouillé à 1, aucun decay ;
//  - dtSeconds null (1er frame) : pas de decay, heat inchangé ;
//  - sinon : decay linéaire HEAT_DECAY/s, borné à 0.
export const nextHeat = (
  heat: number,
  dtSeconds: number | null,
  heatLock: boolean,
) => {
  if (heatLock) return 1
  if (dtSeconds === null) return heat
  return Math.max(0, heat - HEAT_DECAY * dtSeconds)
}

// Valeur écrite dans `--heat` : arrondie au centième (2 décimales).
export const roundedHeat = (heat: number) => Math.round(heat * 100) / 100
