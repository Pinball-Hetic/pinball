// PURE core of the DMD renderer (no canvas/DOM dependency). Lets the grid,
// color resolution and draw plan be tested without a 2D context.

export const GRID_W = 96
export const GRID_H = 32
export const PITCH = 20

export const CANVAS_W = GRID_W * PITCH // 1920
export const CANVAS_H = GRID_H * PITCH // 640

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

// Dot color stops (halo via radial gradient).
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

// One lit dot to draw: color index + pixel position.
export type DotDraw = { colorIndex: number; px: number; py: number }

// Grid scan → list of lit dots (index 0 skipped). Row-major order (y then x).
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
