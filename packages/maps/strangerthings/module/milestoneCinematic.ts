import { selectMilestoneClip } from '@pinball/game-engine'

// Subset of MapContext needed by the milestone cinematic. Allows testing
// playMilestoneCinematic with a fake ctx (spies) without a full MapContext.
export interface MilestoneContext {
  playCinematic(clipId: string, opts?: { value?: number }): void
  screenShake(amount: number): void
}

// Score milestone (MILESTONE) effect: plays the selected clip's cinematic
// (clip selection shared with Zelda via selectMilestoneClip), fires the ST
// playfield cue (optional, absent outside setup) then a screen shake. The
// playfield cue (garland rocket liftoff) is ST-specific and injected by the
// caller.
export function playMilestoneCinematic(
  ctx: MilestoneContext,
  threshold: number,
  playfieldCue?: () => void,
): void {
  ctx.playCinematic(selectMilestoneClip(threshold), { value: threshold })
  playfieldCue?.()
  ctx.screenShake(0.4)
}
