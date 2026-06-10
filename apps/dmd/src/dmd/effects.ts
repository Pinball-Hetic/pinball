import { DOT } from './palette'

// Effets appliqués sur le buffer APRÈS layout, avant render.

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

// Décale horizontalement une bande de rows de `dx` dots.
function shiftBand(grid: Uint8Array, gridW: number, y0: number, rows: number, dx: number): void {
  for (let y = y0; y < y0 + rows; y++) {
    const base = y * gridW
    const tmp = grid.slice(base, base + gridW)
    for (let x = 0; x < gridW; x++) {
      const src = x - dx
      grid[base + x] = src >= 0 && src < gridW ? tmp[src] : 0
    }
  }
}

// Inverse une bande (dots allumés ↔ éteints, l'allumage prend la couleur event).
function invertBand(grid: Uint8Array, gridW: number, gridH: number): void {
  const rows = 3 + Math.floor(Math.random() * 4)
  const y0 = Math.floor(Math.random() * (gridH - rows))
  for (let y = y0; y < y0 + rows; y++) {
    const base = y * gridW
    for (let x = 0; x < gridW; x++) {
      grid[base + x] = grid[base + x] === 0 ? DOT.event : 0
    }
  }
}

// t01 : 1 = début (intense) → 0 = fin.
export function applyGlitch(grid: Uint8Array, gridW: number, gridH: number, t01: number): void {
  const intensity = clamp01(t01)

  const bandCount = 2 + Math.floor(Math.random() * 3) // 2..4
  for (let b = 0; b < bandCount; b++) {
    const rows = 3 + Math.floor(Math.random() * 4) // 3..6
    const y0 = Math.floor(Math.random() * (gridH - rows))
    const dx = (1 + Math.floor(Math.random() * 3)) * (Math.random() < 0.5 ? -1 : 1) // ±1..3
    shiftBand(grid, gridW, y0, rows, dx)
  }

  const noise = 6 + Math.floor(Math.random() * 7 * intensity) // 6..12, décroît avec t01
  for (let i = 0; i < noise; i++) {
    const x = Math.floor(Math.random() * gridW)
    const y = Math.floor(Math.random() * gridH)
    grid[y * gridW + x] = DOT.event
  }

  if (Math.random() < 0.25) invertBand(grid, gridW, gridH)
}

interface RainColumn {
  x: number
  headY: number
  speed: number
  trailLen: number
}

// Pluie de dots façon Matrix. Le decay phosphor du renderer crée le dégradé
// naturel de la traînée.
export class MatrixRain {
  private cols: RainColumn[] = []

  constructor(
    private gridW: number,
    private gridH: number,
  ) {
    for (let x = 0; x < gridW; x += 6) {
      this.cols.push(this.spawn(x, Math.random() * gridH))
    }
  }

  private spawn(x: number, headY: number): RainColumn {
    return {
      x,
      headY,
      speed: 0.3 + Math.random() * 0.5,
      trailLen: 6 + Math.floor(Math.random() * 9), // 6..14
    }
  }

  private step(): void {
    for (const c of this.cols) {
      c.headY += c.speed
      if (c.headY - c.trailLen > this.gridH) {
        Object.assign(c, this.spawn(c.x, -Math.random() * this.gridH * 0.5))
      }
    }
  }

  // Pluie violette de fond : N'ÉCRASE PAS les dots déjà posés par le layout.
  drawBackground(grid: Uint8Array): void {
    this.step()
    for (const c of this.cols) {
      const head = Math.floor(c.headY)
      for (let t = 0; t < c.trailLen; t++) {
        const y = head - t
        if (y < 0 || y >= this.gridH) continue
        const i = y * this.gridW + c.x
        if (grid[i] === 0) grid[i] = DOT.rain
      }
    }
  }

  // Burst vert qui recouvre tout, densité max au début (t01=1) → s'éclaircit.
  drawBurst(grid: Uint8Array, t01: number): void {
    this.step()
    const density = clamp01(t01)
    for (const c of this.cols) {
      const head = Math.floor(c.headY)
      for (let t = 0; t < c.trailLen; t++) {
        const y = head - t
        if (y < 0 || y >= this.gridH) continue
        grid[y * this.gridW + c.x] = DOT.rainGo
      }
    }
    const scatter = Math.floor(this.gridW * this.gridH * 0.15 * density)
    for (let i = 0; i < scatter; i++) {
      const x = Math.floor(Math.random() * this.gridW)
      const y = Math.floor(Math.random() * this.gridH)
      grid[y * this.gridW + x] = DOT.rainGo
    }
  }
}
