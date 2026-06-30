export interface EjectionImpulse {
  x: number;
  y: number;
  z: number;
}

/**
 * Impulsion radiale d'éjection : pousse la balle loin du bumper dans le plan XZ.
 * Le garde `|| 1` évite la division par zéro quand la balle est pile au centre.
 */
export function radialEjectionImpulse(
  ballPos: { x: number; z: number },
  bumperPos: { x: number; z: number },
  magnitude: number,
): EjectionImpulse {
  const dx = ballPos.x - bumperPos.x;
  const dz = ballPos.z - bumperPos.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  return { x: (dx / len) * magnitude, y: 0, z: (dz / len) * magnitude };
}

/**
 * Impulsion latérale déterministe : bump_left pousse à droite (+X), bump_right
 * pousse à gauche (-X). Direction horizontale indépendante du point d'impact.
 */
export function sidedEjectionImpulse(side: 'left' | 'right', magnitude: number): EjectionImpulse {
  const xDir = side === 'left' ? 1 : -1;
  return { x: xDir * magnitude, y: 0, z: 0 };
}
