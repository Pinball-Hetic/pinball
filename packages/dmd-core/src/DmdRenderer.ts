import {
  INDEX_TO_COLOR,
  PALETTE_NORMAL,
  type Palette,
} from './palette'
import {
  CANVAS_W,
  CANVAS_H,
  GRID_W,
  GRID_H,
  PITCH,
  gridDrawPlan,
  spriteGradientStops,
} from './dmdGrid'

export { GRID_W, GRID_H, PITCH } from './dmdGrid'

export type SpriteFactory = (color: string) => HTMLCanvasElement | null

export const documentSpriteFactory: SpriteFactory = (color) => {
  const s = document.createElement('canvas')
  s.width = PITCH
  s.height = PITCH
  const c = s.getContext('2d')
  if (!c) return s
  const cx = PITCH / 2
  const cy = PITCH / 2
  const grad = c.createRadialGradient(cx, cy, 0, cx, cy, PITCH / 2)
  for (const { offset, color: stop } of spriteGradientStops(color)) {
    grad.addColorStop(offset, stop)
  }
  c.fillStyle = grad
  c.fillRect(0, 0, PITCH, PITCH)
  return s
}

export class DmdRenderer {
  readonly grid: Uint8Array
  private ctx: CanvasRenderingContext2D
  private sprites: (HTMLCanvasElement | null)[] = []
  private palette: Palette = PALETTE_NORMAL
  private spriteFactory: SpriteFactory

  constructor(
    canvas: HTMLCanvasElement,
    spriteFactory: SpriteFactory = documentSpriteFactory,
  ) {
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('DmdRenderer: 2D context unavailable')
    this.ctx = ctx
    this.spriteFactory = spriteFactory
    this.grid = new Uint8Array(GRID_W * GRID_H)
    this.buildSprites()
  }

  setPalette(palette: Palette): void {
    if (palette === this.palette) return
    this.palette = palette
    this.buildSprites()
  }

  clearGrid(): void {
    this.grid.fill(0)
  }

  // Semi-transparent fill (NOT clearRect) leaves a phosphor-decay trail.
  render(): void {
    this.ctx.fillStyle = 'rgba(0,0,0,0.28)'
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    for (const { colorIndex, px, py } of gridDrawPlan(this.grid)) {
      const sprite = this.sprites[colorIndex]
      if (sprite) this.ctx.drawImage(sprite, px, py)
    }
  }

  private buildSprites(): void {
    const palette = this.palette
    this.sprites = [null]
    for (const color of INDEX_TO_COLOR) {
      this.sprites.push(this.spriteFactory(palette[color]))
    }
  }
}
