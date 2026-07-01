import { BALL_MAX_SPEED } from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';

type Vec3 = { x: number; y: number; z: number };

export interface BallBodyState {
  translation: Vec3;
  linvel: Vec3;
  angvel: Vec3;
}

/**
 * Verrou de la balle au spawn tant qu'on est idle (y compris pendant la charge
 * du plongeur) : sinon la gravité/inclinaison la fait glisser contre le mur
 * droit (frottement → ralentissement au lancement). Pure : l'appelant lit
 * spawn depuis le layout et applique translation/linvel/angvel sur le corps.
 */
export function computeIdleSpawnLock(spawn: { x: number; y: number; z: number }): BallBodyState {
  const z = spawn.z;
  return {
    translation: { x: spawn.x, y: ballCenterOnSurface(z), z },
    linvel: { x: 0, y: 0, z: 0 },
    angvel: { x: 0, y: 0, z: 0 },
  };
}

/**
 * Verrouillage latéral du couloir : pendant la montée (partie droite du
 * couloir, avant l'ouverture de sortie), on fige X sur la ligne de spawn et on
 * annule la vitesse latérale → lancement parfaitement droit, sans dépendre de
 * la géométrie GLB. La balle est libérée dès qu'elle atteint la zone de sortie
 * (Z <= lane.leftWallTopZ) pour partir naturellement dans le terrain.
 *
 * Pure : renvoie l'état à appliquer quand la balle est dans la partie droite,
 * le signal 'close' quand elle a dépassé exitX (l'appelant ferme la gate), ou
 * null quand rien à faire.
 */
export function computeLaneStraightLock(
  pos: Vec3,
  linvel: Vec3,
  angvel: Vec3,
  lane: { leftWallTopZ: number; lockX: number; exitX: number },
  spawnX: number,
): BallBodyState | 'close' | null {
  const inLaneStraight = pos.z > lane.leftWallTopZ && pos.x > lane.lockX;
  if (inLaneStraight) {
    return {
      translation: { x: spawnX, y: pos.y, z: pos.z },
      linvel: { x: 0, y: linvel.y, z: linvel.z },
      angvel: { x: angvel.x, y: 0, z: 0 },
    };
  }
  if (pos.x < lane.exitX) return 'close';
  return null;
}

/**
 * Clamp de vitesse. Reproduit VERBATIM les deux setLinvel séquentiels du game
 * loop, appliqués sur la MÊME vélocité initiale (le second lit l'original, pas
 * le résultat du premier) :
 *   1. si la vitesse totale dépasse BALL_MAX_SPEED → scale x/y/z.
 *   2. si le Y INITIAL > 1.25 → écrase par { x, y: 0.35, z } avec x/z INITIAUX,
 *      ce qui remplace intégralement le résultat de l'étape 1.
 * Pure : renvoie la linvel finale à appliquer, ou null si aucune correction.
 */
export function computeSpeedClamp(vel: Vec3): Vec3 | null {
  let out: Vec3 | null = null;
  const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
  if (speed > BALL_MAX_SPEED) {
    const scale = BALL_MAX_SPEED / speed;
    out = { x: vel.x * scale, y: vel.y * scale, z: vel.z * scale };
  }
  if (vel.y > 1.25) {
    out = { x: vel.x, y: 0.35, z: vel.z };
  }
  return out;
}
