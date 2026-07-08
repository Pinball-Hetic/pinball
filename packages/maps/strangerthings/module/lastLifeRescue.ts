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
  // Must run BEFORE the life decrement, with the pre-decrement count.
  onPreDrain(ctx: MapContext, livesBeforeDrain: number): boolean
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

  const earnedPoints = (ctx: MapContext) => ctx.totalScore() - scoreBaseline

  const status = (ctx: MapContext): RescueStatus => ({
    armed: active,
    pointsRemaining: active
      ? Math.max(0, LAST_LIFE_RESCUE_POINTS - earnedPoints(ctx))
      : LAST_LIFE_RESCUE_POINTS,
  })

  // Grants the life before handleDrain decrements to 0, so game over is avoided.
  const tryRescue = (ctx: MapContext, livesBeforeDrain: number): boolean => {
    if (!active) return false
    if (livesBeforeDrain !== 1) return false
    if (earnedPoints(ctx) < LAST_LIFE_RESCUE_POINTS) return false
    disarm()
    grantExtraLife(ctx)
    return true
  }

  // Arming decides on the explicit post-drain count, never ctx.lives(), to
  // avoid any dependence on handleDrain's decrement ordering.
  const onPreDrain = (ctx: MapContext, livesBeforeDrain: number): boolean => {
    const rescued = tryRescue(ctx, livesBeforeDrain)
    const livesAfterDrain = livesBeforeDrain + (rescued ? 1 : 0) - 1
    if (livesAfterDrain === 1) {
      if (!active) arm(ctx)
    } else {
      disarm()
    }
    return rescued
  }

  const onGameEvent = (ctx: MapContext, e: GameEvent) => {
    // DRAIN/BOTTOM_OUT arming is owned by onPreDrain; skip them here.
    if (e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') return

    if (ctx.lives() !== 1) {
      if (active) disarm()
      return
    }

    if (!isScoringEvent(e)) return

    if (!active) arm(ctx)
  }

  return { reset: disarm, onGameEvent, onPreDrain, isArmed: () => active, status }
}
