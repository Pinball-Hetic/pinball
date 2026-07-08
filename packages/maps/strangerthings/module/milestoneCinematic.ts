import { selectMilestoneClip } from '@pinball/game-engine'

export interface MilestoneContext {
  playCinematic(clipId: string, opts?: { value?: number }): void
  screenShake(amount: number): void
}

export function playMilestoneCinematic(
  ctx: MilestoneContext,
  threshold: number,
  playfieldCue?: () => void,
): void {
  ctx.playCinematic(selectMilestoneClip(threshold), { value: threshold })
  playfieldCue?.()
  ctx.screenShake(0.4)
}
