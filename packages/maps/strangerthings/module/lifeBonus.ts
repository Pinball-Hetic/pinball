import type { MapContext } from '@pinball/game-engine'

export function grantExtraLife(ctx: MapContext): void {
  ctx.addLife()
  ctx.pushDmdEvent('VIE SUP', 0)
}
