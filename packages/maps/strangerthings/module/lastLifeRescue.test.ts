import { describe, expect, test } from 'bun:test'
import type { GameEvent, MapContext } from '@pinball/game-engine'
import { createLastLifeRescue, LAST_LIFE_RESCUE_POINTS } from './lastLifeRescue'

/**
 * Fake ctx + harness reproducing the REAL playfield ordering:
 *   emit(DRAIN) => mapModule.onPreDrain(livesBeforeDrain)  // rescue may grant
 *               => handleDrain (decrement, game over if <= 0)
 *               => mapModule.onGameEvent(DRAIN)             // rescue arms/counts
 * ctx.lives() reads the CURRENT (post-decrement during onGameEvent) value.
 */
function harness(startLives: number) {
  let lives = startLives
  let score = 0
  let gameOver = false
  const events: string[] = []
  const rescue = createLastLifeRescue()

  const ctx = {
    lives: () => lives,
    totalScore: () => score,
    addLife: () => {
      lives += 1
    },
    pushDmdEvent: (label: string) => {
      events.push(label)
    },
  } as Pick<MapContext, 'lives' | 'totalScore' | 'addLife' | 'pushDmdEvent'> as MapContext

  const emit = (e: GameEvent) => {
    if (e.type === 'DRAIN' || e.type === 'BOTTOM_OUT') {
      rescue.onPreDrain(ctx, lives) // pre-decrement lives
      lives -= 1 // handleDrain
      if (lives <= 0) gameOver = true
    }
    if ('scoreIncrement' in e && e.scoreIncrement) score += e.scoreIncrement
    rescue.onGameEvent(ctx, e)
  }

  return {
    rescue,
    ctx,
    emit,
    events,
    setScore: (n: number) => {
      score += n
    },
    state: () => ({ lives, score, gameOver, armed: rescue.isArmed() }),
  }
}

describe('createLastLifeRescue', () => {
  test('arms on entering last life, then earning 3000 grants a life before the fatal drain (no game over)', () => {
    const h = harness(2)

    // Drain 2 -> 1 : player enters their last life → rescue arms.
    h.emit({ type: 'DRAIN' })
    expect(h.rescue.isArmed()).toBe(true)
    expect(h.events).toEqual(['3000 PTS = VIE'])
    expect(h.state().gameOver).toBe(false)

    // Earn the rescue points during the last ball.
    h.emit({ type: 'BUMPER_HIT', bumperIndex: 0, scoreIncrement: LAST_LIFE_RESCUE_POINTS })

    // Last ball drains: rescue grants a life BEFORE the decrement → survives.
    // handleDrain then decrements the granted life back to 1, so the player is
    // on their last life again → the rescue re-arms with a fresh baseline.
    h.emit({ type: 'DRAIN' })
    expect(h.state().gameOver).toBe(false)
    expect(h.state().lives).toBe(1)
    expect(h.events).toEqual(['3000 PTS = VIE', 'VIE SUP', '3000 PTS = VIE'])
    expect(h.rescue.isArmed()).toBe(true)
  })

  test('armed but under 3000 at the fatal drain → normal game over (rescue does not fire)', () => {
    const h = harness(2)

    h.emit({ type: 'DRAIN' }) // 2 -> 1, arm
    expect(h.rescue.isArmed()).toBe(true)

    h.emit({ type: 'BUMPER_HIT', bumperIndex: 0, scoreIncrement: LAST_LIFE_RESCUE_POINTS - 1 })

    h.emit({ type: 'DRAIN' }) // fatal drain, not enough earned
    expect(h.state().gameOver).toBe(true)
    expect(h.state().lives).toBe(0)
    expect(h.events).toEqual(['3000 PTS = VIE'])
  })

  test('normal game over when never on the last life long enough to arm', () => {
    // Player on last life from the start and drains immediately: onPreDrain sees
    // lives 1 but rescue not armed yet → no grant → normal game over.
    const h = harness(1)
    h.emit({ type: 'DRAIN' })
    expect(h.state().gameOver).toBe(true)
    expect(h.rescue.isArmed()).toBe(false)
  })

  test('status reports remaining points shrinking as the player scores while armed', () => {
    const h = harness(2)
    h.emit({ type: 'DRAIN' }) // 2 -> 1, arm (baseline = 0)
    expect(h.rescue.status(h.ctx).armed).toBe(true)
    expect(h.rescue.status(h.ctx).pointsRemaining).toBe(LAST_LIFE_RESCUE_POINTS)

    h.emit({ type: 'BUMPER_HIT', bumperIndex: 0, scoreIncrement: 1000 })
    expect(h.rescue.status(h.ctx).pointsRemaining).toBe(LAST_LIFE_RESCUE_POINTS - 1000)
  })

  test('disarms when the player regains a life (no longer on the last life)', () => {
    const h = harness(2)
    h.emit({ type: 'DRAIN' }) // 2 -> 1, arm
    expect(h.rescue.isArmed()).toBe(true)
    // A boss grants an extra life → back to 2. A subsequent scoring event, now
    // with lives !== 1, disarms the rescue.
    h.ctx.addLife() // lives 1 -> 2
    h.emit({ type: 'BUMPER_HIT', bumperIndex: 0, scoreIncrement: 100 })
    expect(h.rescue.isArmed()).toBe(false)
  })
})
