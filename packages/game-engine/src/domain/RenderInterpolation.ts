// Interpolation de rendu : la physique tourne à 60 steps/s réels mais l'écran
// peut rafraîchir à 120/144 Hz. Le rendu lerpe la position de la bille entre
// les deux derniers états physiques — purement visuel, zéro impact simulation.

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Distance max plausible parcourue par la bille en UN step physique :
 * BALL_MAX_SPEED (7 m/s) × SIM_TIMESTEP (1/98 s) ≈ 0.071 m. Au-delà, c'est
 * forcément un téléport externe (setTranslation direct : scoop de map, hold
 * d'intro boss, drag debug, locks stepBallSync) → le rendu doit snapper au
 * lieu de lerper, sinon la bille "streake" à travers le terrain une frame.
 */
export const BALL_INTERPOLATION_TELEPORT_DIST = 0.08;

/**
 * Lerp composante par composante, alpha clampé [0,1] (jamais d'extrapolation).
 * Écrit dans `out` fourni par l'appelant — zéro allocation dans le hot path.
 */
export function lerpVec3(prev: Vec3Like, curr: Vec3Like, alpha: number, out: Vec3Like): Vec3Like {
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  out.x = prev.x + (curr.x - prev.x) * t;
  out.y = prev.y + (curr.y - prev.y) * t;
  out.z = prev.z + (curr.z - prev.z) * t;
  return out;
}
