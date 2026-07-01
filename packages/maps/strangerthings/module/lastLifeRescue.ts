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
   * le nombre de vies PRÉ-décrément (explicite, sans lire `ctx.lives()`). Fait
   * DEUX choses, sur ce compte explicite :
   *   1. Sauvetage : si armé et l'objectif atteint sur la dernière vie
   *      (`livesBeforeDrain === 1`), accorde une vie ici — avant que le décrément
   *      ne tombe à 0, donc le game over est évité.
   *   2. Armement : selon le nombre de vies restant APRÈS ce drain
   *      (`livesBeforeDrain + (vie accordée ? 1 : 0) - 1`), arme le sauvetage si
   *      le joueur entre dans sa dernière vie (1 restante), sinon le désarme.
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

  // Tentative de sauvetage : si armé et objectif atteint sur la dernière vie,
  // on accorde la vie maintenant (avant que handleDrain ne tombe à 0) → game
  // over évité. Renvoie true si une vie a été accordée.
  const tryRescue = (ctx: MapContext, livesBeforeDrain: number): boolean => {
    if (!active) return false
    if (livesBeforeDrain !== 1) return false
    if (earnedPoints(ctx) < LAST_LIFE_RESCUE_POINTS) return false
    disarm()
    grantExtraLife(ctx)
    return true
  }

  // Avant le décrément : d'abord la tentative de sauvetage, puis l'armement
  // décidé sur le compte de vies EXPLICITE post-drain — sans lire ctx.lives()
  // (donc sans dépendre de l'ordre du décrément handleDrain).
  const onPreDrain = (ctx: MapContext, livesBeforeDrain: number): boolean => {
    const rescued = tryRescue(ctx, livesBeforeDrain)
    // Vies restant après ce drain (handleDrain retirera 1 ; le sauvetage a pu
    // en ajouter 1 juste avant). 1 restante = le joueur entre dans sa dernière
    // vie → on arme + compte ; sinon on désarme.
    const livesAfterDrain = livesBeforeDrain + (rescued ? 1 : 0) - 1
    if (livesAfterDrain === 1) {
      if (!active) arm(ctx)
    } else {
      disarm()
    }
    return rescued
  }

  const onGameEvent = (ctx: MapContext, e: GameEvent) => {
    // L'armement/désarmement sur DRAIN/BOTTOM_OUT est traité dans onPreDrain
    // (compte de vies explicite). Ici on ignore ces events.
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
