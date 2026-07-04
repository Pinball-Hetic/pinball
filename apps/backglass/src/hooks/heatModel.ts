// ── Backglass reactor "heat" model ─────────────────────────────────────────
// Heat math only (continuous decay, clamp, hit gain, FEVER lock, rounding) —
// no React, no DOM. The `useIngameReactor` rAF loop just APPLIES the computed
// value to the target element (writes `--heat`).

export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n))

export const HEAT_DECAY = 0.5 // per second
export const HIT_GAIN = 0.3

// Hit intensity derived from the score delta, clamped to [0.1, 1].
export const hitIntensity = (delta: number) => clamp(delta / 500, 0.1, 1)

// Heat after a hit of the given intensity (capped at 1).
export const heatAfterHit = (heat: number, intensity: number) =>
  Math.min(1, heat + intensity * HIT_GAIN)

// Next heat value for one rAF loop frame.
//  - heatLock (FEVER): locked at 1, no decay;
//  - dtSeconds null (1st frame): no decay, heat unchanged;
//  - otherwise: linear decay HEAT_DECAY/s, floored at 0.
export const nextHeat = (
  heat: number,
  dtSeconds: number | null,
  heatLock: boolean,
) => {
  if (heatLock) return 1
  if (dtSeconds === null) return heat
  return Math.max(0, heat - HEAT_DECAY * dtSeconds)
}

// Value written to `--heat`: rounded to 2 decimals.
export const roundedHeat = (heat: number) => Math.round(heat * 100) / 100
