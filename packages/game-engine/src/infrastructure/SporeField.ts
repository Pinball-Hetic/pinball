export type SporeParticle = {
  anchorX: number;
  anchorZ: number;
  baseY: number;
  angle: number;
  radius: number;
  speed: number;
  drift: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function seedSpore(i: number, count: number): SporeParticle {
  return {
    anchorX: lerp(-0.22, 0.22, (i * 0.37) % 1),
    anchorZ: lerp(-0.48, 0.32, (i * 0.53 + 0.11) % 1),
    baseY: 1.035 + (i % 6) * 0.009,
    angle: (i / count) * Math.PI * 2,
    radius: 0.014 + (i % 5) * 0.006,
    speed: 0.32 + (i % 7) * 0.1,
    drift: 0.55 + (i % 4) * 0.18,
  };
}

export function seedSpores(count: number): SporeParticle[] {
  const spores: SporeParticle[] = [];
  for (let i = 0; i < count; i++) spores.push(seedSpore(i, count));
  return spores;
}

export function stepSpore(
  spore: SporeParticle,
  dt: number,
  pulseT: number,
): { x: number; y: number; z: number } {
  spore.angle += spore.speed * dt;
  const r = spore.radius * (0.9 + Math.sin(pulseT * 2.4 + spore.angle) * 0.1);
  const lift = Math.sin(pulseT * spore.drift + spore.angle) * 0.014;
  const wander = Math.sin(pulseT * 1.6 + spore.angle * 2.1) * 0.006;
  return {
    x: spore.anchorX + Math.cos(spore.angle) * r + wander,
    y: spore.baseY + lift + Math.sin(pulseT * 0.35 + spore.angle) * 0.018,
    z: spore.anchorZ + Math.sin(spore.angle) * r - wander * 0.6,
  };
}

export function stepSporeField(
  spores: SporeParticle[],
  dt: number,
  pulseT: number,
  out: Float32Array,
): void {
  for (let i = 0; i < spores.length; i++) {
    const p = stepSpore(spores[i], dt, pulseT);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
}
