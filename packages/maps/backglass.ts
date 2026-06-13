import * as strangerthings from '@pinball/map-strangerthings/backglass'

// Surface backglass du registry. Entrypoint séparé de l'index core : seul le
// backglass tire ce module (React + art de la map), jamais le playfield.
// Quand une 2e map arrive, extraire une interface commune ; pour l'instant la
// forme de référence est celle de la map ST.
export type BackglassContent = typeof strangerthings

const BY_ID: Record<string, BackglassContent> = {
  strangerthings,
}

// Résout le contenu backglass d'une map par id (null = pas de backglass dédié,
// l'app affiche alors le moteur générique / NO SIGNAL).
export function getBackglassContent(id: string): BackglassContent | null {
  return BY_ID[id] ?? null
}
