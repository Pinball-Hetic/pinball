import {
  WALL_BOTTOM_Z,
  WALL_TOP_Z,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  DEFAULT_BALL_RADIUS,
  getBallRadius,
} from './Ball';
import { FLIPPER_Z_MAX } from './FlipperConstants';
import type { SurfaceCoefficients } from './MapLayout';

// Courbe de surface du tapis incliné, paramétrée par la map (cf.
// layout.geometry.coefficients). Défaut = valeurs Stranger Things → comportement
// identique tant qu'aucune map n'appelle configureSurfaceCoefficients().
const DEFAULT_SURFACE_COEFFICIENTS: SurfaceCoefficients = {
  base: 1.068,
  zOffset: 0.552,
  zSpan: 0.970,
  yDrop: 0.110,
};

let surfaceCoefficients: SurfaceCoefficients = DEFAULT_SURFACE_COEFFICIENTS;

/**
 * Configure la courbe de surface depuis le layout de la map. À appeler une fois
 * au chargement, AVANT tout setup physique/caméra (les spawns, colliders et le
 * cadrage caméra dérivent tous de surfaceYAtZ).
 */
export function configureSurfaceCoefficients(coefficients: SurfaceCoefficients): void {
  surfaceCoefficients = coefficients;
}

/** Réinitialise la courbe au défaut (Stranger Things). Surtout pour les tests. */
export function resetSurfaceCoefficients(): void {
  surfaceCoefficients = DEFAULT_SURFACE_COEFFICIENTS;
}

export function surfaceYAtZ(z: number): number {
  const { base, zOffset, zSpan, yDrop } = surfaceCoefficients;
  return base - ((z + zOffset) / zSpan) * yDrop;
}

/** Centre de la sphère posé sur le tapis incliné à l'abscisse Z donnée. */
export function ballCenterOnSurface(z: number, margin = 0.002): number {
  return surfaceYAtZ(z) + getBallRadius() + margin;
}

export const DRAIN_Z_THRESHOLD = WALL_BOTTOM_Z + DEFAULT_BALL_RADIUS * 2;

export const BOTTOM_OUT_Z = FLIPPER_Z_MAX + 0.025;

// Séparateur X de la zone bottom-out : dérivé du spawn (paramétré, plus de
// constante map dans le domain). laneSepX = spawnX - 2·rayon balle.
export function bottomOutLaneSepX(spawnX: number): number {
  return spawnX - getBallRadius() * 2;
}

export function isInBottomOutZone(x: number, z: number, laneSepX: number = WALL_RIGHT_X): boolean {
  return z >= BOTTOM_OUT_Z && x <= laneSepX;
}

// ── Diagnostic : détection d'une balle perdue (hors monde) ───────────────────
// Surface du tapis ∈ [0.958, 1.068] ; sous 0.90 la balle est tombée dans le vide.
export const BALL_LOST_Y_THRESHOLD = 0.90;
// Marge au-delà des murs avant de considérer la balle hors-terrain.
export const BALL_OOB_MARGIN = 0.08;

export function isBallOutOfBounds(x: number, z: number): boolean {
  return (
    x < WALL_LEFT_X - BALL_OOB_MARGIN ||
    x > WALL_RIGHT_X + BALL_OOB_MARGIN ||
    z < WALL_TOP_Z - BALL_OOB_MARGIN ||
    z > WALL_BOTTOM_Z + BALL_OOB_MARGIN
  );
}

export const PLAYFIELD_SHADE_W = 0.58;
export const PLAYFIELD_SHADE_D = 1.02;
export const PLAYFIELD_TILT = Math.atan2(0.110, 0.970);
export const PLAYFIELD_SHADE_Y = 1.062;
export const PLAYFIELD_SHADE_Z = -0.067;
export const PLAYFIELD_SHADE_MAX_OPACITY = 0.96;
