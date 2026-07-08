export const COMBO_DECAY_MS = 2000;
export const MULTIPLIER_THRESHOLDS = [5, 10, 20, 40] as const;

export const MILESTONES = [5_000, 15_000, 30_000];
export const MILESTONE_REPEAT_EVERY = 25_000;

export function computeMultiplier(combo: number): number {
  if (combo < MULTIPLIER_THRESHOLDS[0]) return 1;
  if (combo < MULTIPLIER_THRESHOLDS[1]) return 2;
  if (combo < MULTIPLIER_THRESHOLDS[2]) return 3;
  if (combo < MULTIPLIER_THRESHOLDS[3]) return 4;
  return 5;
}

export function nextMilestone(prev: number, next: number, passed: Set<number>): number | null {
  let crossed: number | null = null;
  const mark = (m: number) => {
    if (m > prev && m <= next && !passed.has(m)) {
      passed.add(m);
      if (crossed === null || m > crossed) crossed = m;
    }
  };
  for (const m of MILESTONES) mark(m);
  for (let m = 50_000; m <= next; m += MILESTONE_REPEAT_EVERY) mark(m);
  return crossed;
}

export function generatePlayerName(): string {
  const n = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PLAYER${n}`;
}
