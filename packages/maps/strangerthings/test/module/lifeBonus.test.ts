import { describe, expect, test } from 'bun:test'
import type { MapContext } from '@pinball/game-engine'
import { grantExtraLife } from '../../module/lifeBonus'

describe('grantExtraLife', () => {
  test('adds life and pushes DMD event', () => {
    let lives = 0
    const events: string[] = []
    const ctx = {
      addLife: () => {
        lives += 1
      },
      pushDmdEvent: (label: string) => {
        events.push(label)
      },
    } as Pick<MapContext, 'addLife' | 'pushDmdEvent'> as MapContext

    grantExtraLife(ctx)

    expect(lives).toBe(1)
    expect(events).toEqual(['VIE SUP'])
  })
})
