import {
  INDEX_TO_COLOR,
  paletteByName,
  type PaletteName,
} from './palette'

export const GRID_W = 128
export const GRID_H = 32
export const PITCH = 15

const CANVAS_W = GRID_W * PITCH // 1920
const CANVAS_H = GRID_H * PITCH // 480

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

// Renderer dot-matrix : grille logique 128×32 d'index palette, rendue en
// dots (cercle + halo) sur un canvas 1920×480. Pas de React.
export class DmdRenderer {
  readonly grid: Uint8Array
  private ctx: CanvasRenderingContext2D
  // sprites[colorIndex] = offscreen pré-rendu (null pour index 0 = éteint).
  private sprites: (HTMLCanvasElement | null)[] = []
  private paletteName: PaletteName = 'normal'

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('DmdRenderer: 2D context unavailable')
    this.ctx = ctx
    this.grid = new Uint8Array(GRID_W * GRID_H)
    this.buildSprites()
  }

  setPalette(name: PaletteName): void {
    if (name === this.paletteName) return
    this.paletteName = name
    this.buildSprites()
  }

  clearGrid(): void {
    this.grid.fill(0)
  }

  // Phosphor decay (pas de clearRect) + dépose des dots allumés.
  render(): void {
    this.ctx.fillStyle = 'rgba(0,0,0,0.28)'
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const ci = this.grid[y * GRID_W + x]
        if (ci === 0) continue
        const sprite = this.sprites[ci]
        if (sprite) this.ctx.drawImage(sprite, x * PITCH, y * PITCH)
      }
    }
  }

  // Pré-rend un dot par couleur de la palette active. Halo via radial
  // gradient (PAS shadowBlur — trop cher par dot).
  private buildSprites(): void {
    const palette = paletteByName(this.paletteName)
    this.sprites = [null]
    for (const color of INDEX_TO_COLOR) {
      this.sprites.push(this.makeSprite(palette[color]))
    }
  }

  private makeSprite(color: string): HTMLCanvasElement {
    const s = document.createElement('canvas')
    s.width = PITCH
    s.height = PITCH
    const c = s.getContext('2d')
    if (!c) return s
    const [r, g, b] = hexToRgb(color)
    const cx = PITCH / 2
    const cy = PITCH / 2
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, PITCH / 2)
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`)
    grad.addColorStop(0.5, `rgba(${r},${g},${b},1)`)
    grad.addColorStop(0.73, `rgba(${r},${g},${b},0.85)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
    c.fillStyle = grad
    c.fillRect(0, 0, PITCH, PITCH)
    return s
  }
}
