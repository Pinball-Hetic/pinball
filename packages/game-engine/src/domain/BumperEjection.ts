export interface EjectionImpulse {
  x: number;
  y: number;
  z: number;
}

export function radialEjectionImpulse(
  ballPos: { x: number; z: number },
  bumperPos: { x: number; z: number },
  magnitude: number,
): EjectionImpulse {
  const dx = ballPos.x - bumperPos.x;
  const dz = ballPos.z - bumperPos.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1; // || 1: avoid /0 when ball is at center
  return { x: (dx / len) * magnitude, y: 0, z: (dz / len) * magnitude };
}

export function sidedEjectionImpulse(side: 'left' | 'right', magnitude: number): EjectionImpulse {
  const xDir = side === 'left' ? 1 : -1;
  return { x: xDir * magnitude, y: 0, z: 0 };
}
