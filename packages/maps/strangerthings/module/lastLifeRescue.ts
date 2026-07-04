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
  /**
   * Called BEFORE the life decrement (handleDrain) on a DRAIN/BOTTOM_OUT,
   * with the PRE-decrement life count (explicit, without reading
   * `ctx.lives()`). Does TWO things on that explicit count:
   *   1. Rescue: if armed and the goal is reached on the last life
   *      (`livesBeforeDrain === 1`), grants a life here — before the
   *      decrement hits 0, so game over is avoided.
   *   2. Arming: based on lives remaining AFTER this drain
   *      (`livesBeforeDrain + (life granted ? 1 : 0) - 1`), arms the rescue
   *      if the player enters their last life (1 left), else disarms it.
   * Returns true if a life was granted (successful rescue).
   */
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

  // Rescue attempt: if armed and the goal is reached on the last life,
  // grant the life now (before handleDrain hits 0) → game over avoided.
  // Returns true if a life was granted.
  const tryRescue = (ctx: MapContext, livesBeforeDrain: number): boolean => {
    if (!active) return false
    if (livesBeforeDrain !== 1) return false
    if (earnedPoints(ctx) < LAST_LIFE_RESCUE_POINTS) return false
    disarm()
    grantExtraLife(ctx)
    return true
  }

  // Before the decrement: rescue attempt first, then arming decided on the
  // EXPLICIT post-drain life count — without reading ctx.lives()
  // (so no dependence on handleDrain's decrement ordering).
  const onPreDrain = (ctx: MapContext, livesBeforeDrain: number): boolean => {
    const rescued = tryRescue(ctx, livesBeforeDrain)
    // Lives left after this drain (handleDrain will remove 1; the rescue may
    // have added 1 just before). 1 left = player enters their last life
    // → arm + count; otherwise disarm.
    const livesAfterDrain = livesBeforeDrain + (rescued ? 1 : 0) - 1
    if (livesAfterDrain === 1) {
      if (!active) arm(ctx)
    } else {
      disarm()
    }
    return rescued
  }

  const onGameEvent = (ctx: MapContext, e: GameEvent) => {
    // Arming/disarming on DRAIN/BOTTOM_OUT is handled in onPreDrain
    // (explicit life count). Ignore those events here.
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
