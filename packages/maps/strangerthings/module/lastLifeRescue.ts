import type { GameEvent, MapContext } from '@pinball/game-engine'
import { grantExtraLife } from './lifeBonus'

export const LAST_LIFE_RESCUE_POINTS = 3000

export function createLastLifeRescue() {
  let active = false
  let scoreBaseline = 0

  const disarm = () => {
    active = false
    scoreBaseline = 0
  }

  const arm = (ctx: MapContext) => {
    active = true
    scoreBaseline = ctx.totalScore()
    ctx.pushDmdEvent('3000 PTS = VIE', 0)
  }

  const onGameEvent = (ctx: MapContext, e: GameEvent) => {
    if (e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') {
      if (ctx.lives() === 1) {
        if (!active) arm(ctx)
      } else {
        disarm()
      }
      return
    }

    if (ctx.lives() !== 1) {
      if (active) disarm()
      return
    }

    if (!('scoreIncrement' in e) || !e.scoreIncrement) return

    if (!active) arm(ctx)

    if (ctx.totalScore() - scoreBaseline >= LAST_LIFE_RESCUE_POINTS) {
      disarm()
      grantExtraLife(ctx)
    }
  }

  return { reset: disarm, onGameEvent }
}
