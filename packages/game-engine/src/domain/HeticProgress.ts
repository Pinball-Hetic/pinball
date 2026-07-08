export interface HeticProgress {
  display: number;
  completed: boolean;
}

export function resolveHeticProgress(count: number): HeticProgress {
  if (count < 5) return { display: count, completed: false };
  return { display: 5, completed: true };
}

export interface HeticContext {
  setMapState(patch: { hetic: number }): void;
  playCinematic(clipId: string, opts?: { value?: number; onEnd?: () => void }): void;
  forceMultiplier(value: number, durationMs: number): void;
  refreshScoreSnapshot(): void;
}

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

export function selectMilestoneClip(threshold: number): MilestoneClipId {
  if (threshold === 5000) return 'milestone_5k';
  if (threshold === 15000) return 'milestone_15k';
  if (threshold === 30000) return 'milestone_30k';
  return 'milestone_big';
}
