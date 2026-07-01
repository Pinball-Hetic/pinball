// Pas de temps de la frame (secondes), borné à 50 ms pour éviter les grands
// sauts physiques après un stall/onglet en arrière-plan. Première frame (pas de
// temps précédent) → 16 ms (~60 FPS). Pur, extrait du hot loop.
export const MAX_FRAME_DT = 0.05;
export const FIRST_FRAME_DT = 0.016;

export function computeFrameDt(prevFrameTime: number, time: number): number {
  if (prevFrameTime <= 0) return FIRST_FRAME_DT;
  return Math.min((time - prevFrameTime) / 1000, MAX_FRAME_DT);
}

// Intensité de la traînée de feu [0,1] : 0 hors jeu, 1 en fever, sinon rampe
// linéaire sur le combo (0 à combo≤3 → 1 à combo≥10). Pur.
export function computeTrailIntensity(
  playing: boolean,
  fever: boolean,
  combo: number,
): number {
  if (!playing) return 0;
  if (fever) return 1;
  return Math.max(0, Math.min(1, (combo - 3) / 7));
}
