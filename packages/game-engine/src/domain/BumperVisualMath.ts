import { easeOutBack } from '../infrastructure/CinematicEasing';

export interface BumperPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Index of the layout bumper closest to a world position (squared distance,
 * no sqrt). Returns 0 when the list is empty.
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
 * Bumper "punch" scale factor: 1 → 1+peak → 1 over the duration, easeOutBack
 * on the way up then linear back down. `remaining` is the time left (s),
 * `duration` the total duration (s). remaining <= 0 → factor 1.
 */
export function bumperPunchScale(remaining: number, duration: number, peak: number): number {
  if (remaining <= 0) return 1;
  const prog = 1 - remaining / duration; // 0 → 1
  const env = prog < 0.5 ? easeOutBack(prog * 2) : 1 - (prog - 0.5) * 2;
  return 1 + peak * Math.max(0, env);
}

/**
 * Decrements every timer in `timers` by `dt` in place, deleting entries that
 * reach 0 or below. Only mutates the injected Map; no THREE dependency.
 */
export function tickPunchTimers(timers: Map<number, number>, dt: number): void {
  for (const [idx, t] of timers) {
    const next = t - dt;
    if (next <= 0) timers.delete(idx);
    else timers.set(idx, next);
  }
}

/** Minimal scale-punch target: a mesh with a bumper index. */
export interface BumperScaleTarget {
  bumperIndex: number;
  baseScale: { x: number; y: number; z: number };
  mesh: { scale: { copy(v: { x: number; y: number; z: number }): { multiplyScalar(s: number): unknown } } };
}

/**
 * Applies the "punch" scale to each part: `baseScale × bumperPunchScale(...)`
 * from the remaining time in `timers` (missing → 0 → factor 1, i.e. back to
 * baseScale).
 */
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

/**
 * Classification of a GLB node by the bumper matcher:
 * - `skip`: not a bumper (ignored).
 * - `hide`: must be hidden (legacy mesh replaced), no part.
 * - `part`: a visual bumper of category `kind`.
 *
 * `kind` is map-defined (free string) — the core does not know the specific
 * categories (gltf/base/ring on the ST side, etc.).
 */
export type BumperMatch<K extends string> =
  | { action: 'skip' }
  | { action: 'hide' }
  | { action: 'part'; kind: K };

/**
 * Bumper matching rule: if `pattern` matches the normalized name, the node
 * gets `result`. Rules are evaluated in order, first match wins.
 */
export interface BumperMatchRule<K extends string> {
  pattern: RegExp;
  result: BumperMatch<K>;
}

/**
 * Classifies a normalized mesh name through an ordered rule list (first
 * matching pattern wins). No matching rule → `skip`.
 */
export function classifyBumperName<K extends string>(
  normalizedName: string,
  rules: readonly BumperMatchRule<K>[],
): BumperMatch<K> {
  for (const rule of rules) {
    if (rule.pattern.test(normalizedName)) return rule.result;
  }
  return { action: 'skip' };
}
