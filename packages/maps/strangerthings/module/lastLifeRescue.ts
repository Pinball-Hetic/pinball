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
   * Appelé AVANT le décrément de vie (handleDrain) sur un DRAIN/BOTTOM_OUT, avec
   * le nombre de vies PRÉ-décrément. Si le sauvetage est armé et que le joueur a
   * marqué les points requis pendant sa dernière vie, accorde une vie ici — donc
   * avant que le décrément ne fasse tomber à 0 : le game over est évité.
   * Retourne true si une vie a été accordée (sauvetage réussi).
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

  // Avant le décrément : si armé et objectif atteint, on accorde la vie
  // maintenant (avant que handleDrain ne tombe à 0) → game over évité.
  const onPreDrain = (ctx: MapContext, livesBeforeDrain: number): boolean => {
    if (!active) return false
    if (livesBeforeDrain !== 1) return false
    if (earnedPoints(ctx) < LAST_LIFE_RESCUE_POINTS) return false
    disarm()
    grantExtraLife(ctx)
    return true
  }

  const onGameEvent = (ctx: MapContext, e: GameEvent) => {
    if (e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') {
      // ctx.lives() est ici POST-décrément (handleDrain a déjà tourné) : 1 vie
      // restante = le joueur entre dans sa dernière vie → on arme + compte.
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
  }

  return { reset: disarm, onGameEvent, onPreDrain, isArmed: () => active, status }
}
