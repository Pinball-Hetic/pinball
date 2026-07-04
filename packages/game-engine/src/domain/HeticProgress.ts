// Pure decisions shared by map modules (ST, Zelda): HETIC counter progression
// and milestone clip selection per score threshold.

export interface HeticProgress {
  display: number;
  completed: boolean;
}

// Display state of the HETIC counter after an increment.
// count >= 5 → full word (display 5, completed). The caller handles the reset.
export function resolveHeticProgress(count: number): HeticProgress {
  if (count < 5) return { display: count, completed: false };
  return { display: 5, completed: true };
}

// MapContext subset needed by the HETIC rollover, so advanceHetic can be
// tested with a fake ctx (spies).
export interface HeticContext {
  setMapState(patch: { hetic: number }): void;
  playCinematic(clipId: string, opts?: { value?: number; onEnd?: () => void }): void;
  forceMultiplier(value: number, durationMs: number): void;
  refreshScoreSnapshot(): void;
}

// Shared HETIC rollover effect (DROP_TARGET_COMPLETE): increments the counter,
// plays the letter or full-word cinematic (with 30s Fever), and returns the
// next counter value (reset to 0 after completion). The caller stores it.
export function advanceHetic(ctx: HeticContext, currentCount: number): number {
  const next = currentCount + 1;
  const progress = resolveHeticProgress(next);
  if (!progress.completed) {
    ctx.setMapState({ hetic: progress.display });
    ctx.playCinematic('hetic_letter', { value: progress.display });
    return next;
  }
  ctx.setMapState({ hetic: progress.display });
  ctx.playCinematic('hetic_complete', {
    onEnd: () => {
      // 30s Fever: forced multiplier + immediate SCORE refresh.
      ctx.forceMultiplier(5, 30_000);
      ctx.refreshScoreSnapshot();
    },
  });
  ctx.setMapState({ hetic: 0 });
  return 0;
}

export type MilestoneClipId =
  | 'milestone_5k'
  | 'milestone_15k'
  | 'milestone_30k'
  | 'milestone_big';

// Milestone clip for a given score threshold.
export function selectMilestoneClip(threshold: number): MilestoneClipId {
  if (threshold === 5000) return 'milestone_5k';
  if (threshold === 15000) return 'milestone_15k';
  if (threshold === 30000) return 'milestone_30k';
  return 'milestone_big';
}
