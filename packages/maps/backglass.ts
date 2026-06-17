import * as strangerthings from '@pinball/map-strangerthings/backglass'
import * as zelda from '@pinball/map-zelda/backglass'

// Surface backglass du registry. Entrypoint séparé de l'index core : seul le
// backglass tire ce module (React + art de la map), jamais le playfield.
// BackglassContent = forme de référence ST (les deux maps exposent la même
// interface). TODO: extraire une interface commune explicite.
export type BackglassContent = typeof strangerthings

const BY_ID: Record<string, BackglassContent> = {
  strangerthings,
  zelda: zelda as unknown as BackglassContent,
}

// Résout le contenu backglass d'une map par id (null = pas de backglass dédié,
// l'app affiche alors le moteur générique / NO SIGNAL).
export function getBackglassContent(id: string): BackglassContent | null {
  return BY_ID[id] ?? null
}
