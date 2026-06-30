import { easeOutBack } from '../infrastructure/CinematicEasing';

export interface BumperPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Index du bumper de layout le plus proche d'une position monde (distance au
 * carré, pas de racine). Retourne 0 si la liste est vide.
 */
export function nearestBumperIndex(pos: BumperPoint, bumpers: readonly BumperPoint[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < bumpers.length; i++) {
    const p = bumpers[i]!;
    const dx = pos.x - p.x;
    const dy = pos.y - p.y;
    const dz = pos.z - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Facteur d'échelle du "punch" bumper : 1 → 1+peak → 1 sur la durée, via
 * easeOutBack sur la montée puis retour linéaire. `remaining` est le temps
 * restant (s), `duration` la durée totale (s). remaining <= 0 → facteur 1.
 */
export function bumperPunchScale(remaining: number, duration: number, peak: number): number {
  if (remaining <= 0) return 1;
  const prog = 1 - remaining / duration; // 0 → 1
  const env = prog < 0.5 ? easeOutBack(prog * 2) : 1 - (prog - 0.5) * 2;
  return 1 + peak * Math.max(0, env);
}
