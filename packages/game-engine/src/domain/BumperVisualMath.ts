import { easeOutBack } from '../infrastructure/CinematicEasing';

export interface BumperPoint {
  x: number;
  y: number;
  z: number;
}

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

export function bumperPunchScale(remaining: number, duration: number, peak: number): number {
  if (remaining <= 0) return 1;
  const prog = 1 - remaining / duration;
  const env = prog < 0.5 ? easeOutBack(prog * 2) : 1 - (prog - 0.5) * 2;
  return 1 + peak * Math.max(0, env);
}

export function tickPunchTimers(timers: Map<number, number>, dt: number): void {
  for (const [idx, t] of timers) {
    const next = t - dt;
    if (next <= 0) timers.delete(idx);
    else timers.set(idx, next);
  }
}

export interface BumperScaleTarget {
  bumperIndex: number;
  baseScale: { x: number; y: number; z: number };
  mesh: { scale: { copy(v: { x: number; y: number; z: number }): { multiplyScalar(s: number): unknown } } };
}

export function applyPunchScale(
  parts: readonly BumperScaleTarget[],
  timers: Map<number, number>,
  duration: number,
  peak: number,
): void {
  for (const part of parts) {
    const pt = timers.get(part.bumperIndex) ?? 0;
    const factor = bumperPunchScale(pt, duration, peak);
    part.mesh.scale.copy(part.baseScale).multiplyScalar(factor);
  }
}

export type BumperMatch<K extends string> =
  | { action: 'skip' }
  | { action: 'hide' }
  | { action: 'part'; kind: K };

export interface BumperMatchRule<K extends string> {
  pattern: RegExp;
  result: BumperMatch<K>;
}

export function classifyBumperName<K extends string>(
  normalizedName: string,
  rules: readonly BumperMatchRule<K>[],
): BumperMatch<K> {
  for (const rule of rules) {
    if (rule.pattern.test(normalizedName)) return rule.result;
  }
  return { action: 'skip' };
}
