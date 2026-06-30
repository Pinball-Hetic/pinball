import type { GameEvent, MapContext } from '@pinball/game-engine'
import { grantExtraLife } from './lifeBonus'

export const LAST_LIFE_RESCUE_POINTS = 3000

export type RescueStatus = {
  armed: boolean
  pointsRemaining: number
}

export type LastLifeRescue = {
  reset(): void
  onGameEvent(ctx: MapContext, e: GameEvent): void
  isArmed(): boolean
  status(ctx: MapContext): RescueStatus
}

function isScoringEvent(e: GameEvent): e is GameEvent & { scoreIncrement: number } {
  return 'scoreIncrement' in e && !!e.scoreIncrement
}

export function createLastLifeRescue(): LastLifeRescue {
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

  const status = (ctx: MapContext): RescueStatus => ({
    armed: active,
    pointsRemaining: active
      ? Math.max(0, LAST_LIFE_RESCUE_POINTS - (ctx.totalScore() - scoreBaseline))
      : LAST_LIFE_RESCUE_POINTS,
  })

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

    if (!isScoringEvent(e)) return

    if (!active) arm(ctx)

    if (ctx.totalScore() - scoreBaseline >= LAST_LIFE_RESCUE_POINTS) {
      disarm()
      grantExtraLife(ctx)
    }
  }

  return { reset: disarm, onGameEvent, isArmed: () => active, status }
}
