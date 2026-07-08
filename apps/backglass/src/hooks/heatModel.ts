export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n))

export const HEAT_DECAY = 0.5 // per second
export const HIT_GAIN = 0.3

export const hitIntensity = (delta: number) => clamp(delta / 500, 0.1, 1)

export const heatAfterHit = (heat: number, intensity: number) =>
  Math.min(1, heat + intensity * HIT_GAIN)

export const nextHeat = (
  heat: number,
  dtSeconds: number | null,
  heatLock: boolean,
) => {
  if (heatLock) return 1
  if (dtSeconds === null) return heat
  return Math.max(0, heat - HEAT_DECAY * dtSeconds)
}

export const roundedHeat = (heat: number) => Math.round(heat * 100) / 100
