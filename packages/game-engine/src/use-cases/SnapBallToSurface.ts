import {
  SHOOTER_LANE_LEFT_WALL_TOP_Z,
  SHOOTER_LANE_LOCK_X,
  SURFACE_SNAP_THRESHOLD,
  WALL_BOTTOM_Z,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
} from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';

type Vec3 = { x: number; y: number; z: number };

export interface SurfaceSnapResult {
  /** Position où reposer la balle (toujours présente quand le snap déclenche). */
  translation: Vec3;
  /** Vélocité corrigée — présente uniquement si on a annulé un Y montant. */
  linvel?: Vec3;
}

/**
 * Décide si la balle doit être recollée à la surface inclinée du tapis.
 * Pure : aucune dépendance Rapier — l'appelant lit pos/vel du corps et applique
 * le résultat. Renvoie null quand aucun snap n'est nécessaire.
 *
 * Règles :
 * - actif uniquement dans le plateau, hors couloir de lancement droit ;
 * - déclenche si la balle décolle de plus de SURFACE_SNAP_THRESHOLD ;
 * - n'annule que la vélocité Y POSITIVE (décollage) — un Y négatif est la
 *   gravité qui ramène la balle, on ne l'empêche pas. XZ jamais touché →
 *   vitesse de jeu conservée.
 */
export function computeSurfaceSnap(pos: Vec3, vel: Vec3): SurfaceSnapResult | null {
  const inLaneStraight = pos.z > SHOOTER_LANE_LEFT_WALL_TOP_Z && pos.x > SHOOTER_LANE_LOCK_X;
  if (inLaneStraight) return null;

  const inPlayfield =
    pos.x > WALL_LEFT_X && pos.x < WALL_RIGHT_X &&
    pos.z > WALL_TOP_Z && pos.z < WALL_BOTTOM_Z;
  if (!inPlayfield) return null;

  const surfaceY = ballCenterOnSurface(pos.z);
  if (pos.y <= surfaceY + SURFACE_SNAP_THRESHOLD) return null;

  const result: SurfaceSnapResult = { translation: { x: pos.x, y: surfaceY, z: pos.z } };
  if (vel.y > 0) result.linvel = { x: vel.x, y: 0, z: vel.z };
  return result;
}
