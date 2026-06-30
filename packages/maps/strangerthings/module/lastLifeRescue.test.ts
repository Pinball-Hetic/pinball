import { describe, expect, test } from 'bun:test'
import type { MapContext } from '@pinball/game-engine'
import { createLastLifeRescue, LAST_LIFE_RESCUE_POINTS } from './lastLifeRescue'

function mockCtx(initial: { lives: number; score: number }) {
  let lives = initial.lives
  let score = initial.score
  const events: string[] = []
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

  return {
    ctx,
    events,
    setScore: (next: number) => {
      score = next
    },
    getLives: () => lives,
  }
}

describe('createLastLifeRescue', () => {
  test('arms on drain to last life and grants life after rescue points', () => {
    const rescue = createLastLifeRescue()
    const sim = mockCtx({ lives: 1, score: 5000 })

    rescue.onGameEvent(sim.ctx, { type: 'DRAIN' })
    expect(sim.events).toEqual(['3000 PTS = VIE'])

    sim.setScore(5000 + LAST_LIFE_RESCUE_POINTS - 1)
    rescue.onGameEvent(sim.ctx, { type: 'BUMPER_HIT', bumperIndex: 0, scoreIncrement: 100 })
    expect(sim.getLives()).toBe(1)

    sim.setScore(5000 + LAST_LIFE_RESCUE_POINTS)
    rescue.onGameEvent(sim.ctx, { type: 'BUMPER_HIT', bumperIndex: 0, scoreIncrement: 100 })
    expect(sim.getLives()).toBe(2)
    expect(sim.events).toEqual(['3000 PTS = VIE', 'VIE SUP'])
  })

  test('disarms when no longer on last life', () => {
    const rescue = createLastLifeRescue()
    const sim = mockCtx({ lives: 1, score: 1000 })

    rescue.onGameEvent(sim.ctx, { type: 'DRAIN' })
    sim.ctx.addLife()
    rescue.onGameEvent(sim.ctx, { type: 'BUMPER_HIT', bumperIndex: 0, scoreIncrement: 100 })
    expect(sim.getLives()).toBe(2)
  })
})
