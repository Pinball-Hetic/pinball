export interface EjectionImpulse {
  x: number;
  y: number;
  z: number;
}

/**
 * Radial ejection impulse: pushes the ball away from the bumper in the XZ
 * plane. The `|| 1` guard avoids division by zero when the ball sits exactly
 * at the center.
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
 * Deterministic sided impulse: bump_left pushes right (+X), bump_right pushes
 * left (-X). Horizontal direction is independent of the impact point.
 */
export function sidedEjectionImpulse(side: 'left' | 'right', magnitude: number): EjectionImpulse {
  const xDir = side === 'left' ? 1 : -1;
  return { x: xDir * magnitude, y: 0, z: 0 };
}
