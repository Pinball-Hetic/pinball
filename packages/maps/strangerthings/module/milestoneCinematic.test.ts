import { describe, expect, test } from 'bun:test'
import { playMilestoneCinematic } from './milestoneCinematic'

function mockCtx() {
  const cinematics: Array<{ clipId: string; value?: number }> = []
  const shakes: number[] = []
  return {
    ctx: {
      playCinematic: (clipId: string, opts?: { value?: number }) => {
        cinematics.push({ clipId, value: opts?.value })
      },
      screenShake: (amount: number) => {
        shakes.push(amount)
      },
    },
    cinematics,
    shakes,
  }
}

describe('playMilestoneCinematic (ST MILESTONE handler)', () => {
  test('plays the per-threshold clip, runs the playfield cue, then shakes', () => {
    const order: string[] = []
    const sim = mockCtx()
    playMilestoneCinematic(sim.ctx, 15_000, () => order.push('cue'))

    expect(sim.cinematics).toEqual([{ clipId: 'milestone_15k', value: 15_000 }])
    expect(order).toEqual(['cue'])
    expect(sim.shakes).toEqual([0.4])
  })

  test('selects the clip for each ST milestone threshold (parity Zelda)', () => {
    const cases: Array<[number, string]> = [
      [5_000, 'milestone_5k'],
      [15_000, 'milestone_15k'],
      [30_000, 'milestone_30k'],
      [55_000, 'milestone_big'],
    ]
    for (const [threshold, clip] of cases) {
      const sim = mockCtx()
      playMilestoneCinematic(sim.ctx, threshold)
      expect(sim.cinematics).toEqual([{ clipId: clip, value: threshold }])
      expect(sim.shakes).toEqual([0.4])
    }
  })

  test('playfield cue is optional (garlands absent before setup)', () => {
    const sim = mockCtx()
    expect(() => playMilestoneCinematic(sim.ctx, 5_000)).not.toThrow()
    expect(sim.cinematics).toEqual([{ clipId: 'milestone_5k', value: 5_000 }])
  })
})
