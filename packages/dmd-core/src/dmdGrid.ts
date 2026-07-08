export const GRID_W = 96
export const GRID_H = 32
export const PITCH = 20

export const CANVAS_W = GRID_W * PITCH
export const CANVAS_H = GRID_H * PITCH

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

export type GradientStop = { offset: number; color: string }

export function spriteGradientStops(color: string): GradientStop[] {
  const [r, g, b] = hexToRgb(color)
  return [
    { offset: 0, color: `rgba(${r},${g},${b},1)` },
    { offset: 0.55, color: `rgba(${r},${g},${b},1)` },
    { offset: 0.75, color: `rgba(${r},${g},${b},0.85)` },
    { offset: 1, color: `rgba(${r},${g},${b},0)` },
  ]
}

export type DotDraw = { colorIndex: number; px: number; py: number }

export function gridDrawPlan(grid: Uint8Array): DotDraw[] {
  const plan: DotDraw[] = []
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const ci = grid[y * GRID_W + x]
      if (ci === 0) continue
      plan.push({ colorIndex: ci, px: x * PITCH, py: y * PITCH })
    }
  }
  return plan
}
