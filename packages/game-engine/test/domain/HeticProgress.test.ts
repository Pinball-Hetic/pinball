import { test, expect, describe, mock } from 'bun:test';
import {
  resolveHeticProgress,
  selectMilestoneClip,
  advanceHetic,
  type HeticContext,
} from '../../src/domain/HeticProgress';

function fakeCtx(): {
  ctx: HeticContext;
  setMapState: ReturnType<typeof mock>;
  playCinematic: ReturnType<typeof mock>;
  forceMultiplier: ReturnType<typeof mock>;
  refreshScoreSnapshot: ReturnType<typeof mock>;
} {
  const setMapState = mock((_patch: { hetic: number }) => {});
  const playCinematic = mock(
    (_clipId: string, _opts?: { value?: number; onEnd?: () => void }) => {},
  );
  const forceMultiplier = mock((_value: number, _durationMs: number) => {});
  const refreshScoreSnapshot = mock(() => {});
  return {
    ctx: { setMapState, playCinematic, forceMultiplier, refreshScoreSnapshot },
    setMapState,
    playCinematic,
    forceMultiplier,
    refreshScoreSnapshot,
  };
}

describe('resolveHeticProgress', () => {
  test('letters 1..4 display the running count, not completed', () => {
    expect(resolveHeticProgress(1)).toEqual({ display: 1, completed: false });
    expect(resolveHeticProgress(2)).toEqual({ display: 2, completed: false });
    expect(resolveHeticProgress(3)).toEqual({ display: 3, completed: false });
    expect(resolveHeticProgress(4)).toEqual({ display: 4, completed: false });
  });

  test('count of 5 completes the word, clamped display 5', () => {
    expect(resolveHeticProgress(5)).toEqual({ display: 5, completed: true });
  });

  test('counts above 5 stay clamped + completed', () => {
    expect(resolveHeticProgress(6)).toEqual({ display: 5, completed: true });
    expect(resolveHeticProgress(99)).toEqual({ display: 5, completed: true });
  });
});

describe('advanceHetic', () => {
  test('letter step: increments, sets mapState, plays hetic_letter, returns next count', () => {
    const f = fakeCtx();
    const next = advanceHetic(f.ctx, 0);
    expect(next).toBe(1);
    expect(f.setMapState).toHaveBeenCalledTimes(1);
    expect(f.setMapState).toHaveBeenCalledWith({ hetic: 1 });
    expect(f.playCinematic).toHaveBeenCalledTimes(1);
    expect(f.playCinematic).toHaveBeenCalledWith('hetic_letter', { value: 1 });
    expect(f.forceMultiplier).not.toHaveBeenCalled();
    expect(f.refreshScoreSnapshot).not.toHaveBeenCalled();
  });

  test('mid letter step (3 -> 4) stays in letter branch', () => {
    const f = fakeCtx();
    const next = advanceHetic(f.ctx, 3);
    expect(next).toBe(4);
    expect(f.playCinematic).toHaveBeenCalledWith('hetic_letter', { value: 4 });
  });

  test('completion (4 -> 5): plays hetic_complete, resets to 0, no Fever until onEnd', () => {
    const f = fakeCtx();
    const next = advanceHetic(f.ctx, 4);
    expect(next).toBe(0);
    // setMapState called twice: display 5 then reset to 0.
    expect(f.setMapState).toHaveBeenNthCalledWith(1, { hetic: 5 });
    expect(f.setMapState).toHaveBeenNthCalledWith(2, { hetic: 0 });
    expect(f.playCinematic).toHaveBeenCalledTimes(1);
    const [clipId, opts] = f.playCinematic.mock.calls[0] as [
      string,
      { onEnd?: () => void },
    ];
    expect(clipId).toBe('hetic_complete');
    // Fever effect deferred to onEnd, not run synchronously.
    expect(f.forceMultiplier).not.toHaveBeenCalled();
    expect(f.refreshScoreSnapshot).not.toHaveBeenCalled();
    opts.onEnd?.();
    expect(f.forceMultiplier).toHaveBeenCalledWith(5, 30_000);
    expect(f.refreshScoreSnapshot).toHaveBeenCalledTimes(1);
  });

  test('a full cycle of 5 hits returns to 0', () => {
    const f = fakeCtx();
    let count = 0;
    for (let i = 0; i < 5; i++) count = advanceHetic(f.ctx, count);
    expect(count).toBe(0);
  });
});

describe('selectMilestoneClip', () => {
  test('exact thresholds map to their clip', () => {
    expect(selectMilestoneClip(5000)).toBe('milestone_5k');
    expect(selectMilestoneClip(15000)).toBe('milestone_15k');
    expect(selectMilestoneClip(30000)).toBe('milestone_30k');
  });

  test('any other threshold falls back to milestone_big', () => {
    expect(selectMilestoneClip(0)).toBe('milestone_big');
    expect(selectMilestoneClip(10000)).toBe('milestone_big');
    expect(selectMilestoneClip(55000)).toBe('milestone_big');
  });
});
