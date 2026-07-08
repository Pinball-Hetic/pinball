import { test, expect, describe, mock } from 'bun:test';
import {
  handleBossLockedHit,
  handleBossArmed,
  isGameOverDrain,
  isBossTargetDefeated,
  type DmdEventContext,
} from '../../src/domain/MapEventHelpers';
import type { GameEvent } from '../../src/domain/GameEvents';

function fakeCtx(): { ctx: DmdEventContext; pushDmdEvent: ReturnType<typeof mock> } {
  const pushDmdEvent = mock((_label: string, _points: number) => {});
  return { ctx: { pushDmdEvent }, pushDmdEvent };
}

describe('handleBossLockedHit', () => {
  test('pushes ENCORE <remaining> PTS on BOSS_LOCKED_HIT', () => {
    const { ctx, pushDmdEvent } = fakeCtx();
    handleBossLockedHit(ctx, { type: 'BOSS_LOCKED_HIT', bossId: 'demogorgon', remaining: 300 });
    expect(pushDmdEvent).toHaveBeenCalledTimes(1);
    expect(pushDmdEvent).toHaveBeenCalledWith('ENCORE 300 PTS', 0);
  });

  test('ignores other events', () => {
    const { ctx, pushDmdEvent } = fakeCtx();
    handleBossLockedHit(ctx, { type: 'DRAIN' });
    expect(pushDmdEvent).not.toHaveBeenCalled();
  });
});

describe('handleBossArmed', () => {
  test('records armedAt and pushes DMD banner on BOSS_ARMED', () => {
    const { ctx, pushDmdEvent } = fakeCtx();
    const armedAt: Record<string, number> = {};
    handleBossArmed(ctx, { type: 'BOSS_ARMED', bossId: 'vecna' }, armedAt, 1234);
    expect(armedAt.vecna).toBe(1234);
    expect(pushDmdEvent).toHaveBeenCalledWith('LE NID S EVEILLE', 0);
  });

  test('ignores non-BOSS_ARMED events (no armedAt, no DMD)', () => {
    const { ctx, pushDmdEvent } = fakeCtx();
    const armedAt: Record<string, number> = {};
    handleBossArmed(ctx, { type: 'DRAIN' }, armedAt, 9);
    expect(Object.keys(armedAt)).toHaveLength(0);
    expect(pushDmdEvent).not.toHaveBeenCalled();
  });
});

describe('isGameOverDrain', () => {
  test('true for DRAIN/BOTTOM_OUT only when game_over', () => {
    expect(isGameOverDrain({ type: 'DRAIN' }, 'game_over')).toBe(true);
    expect(isGameOverDrain({ type: 'BOTTOM_OUT' }, 'game_over')).toBe(true);
  });

  test('false when not game_over', () => {
    expect(isGameOverDrain({ type: 'DRAIN' }, 'playing')).toBe(false);
    expect(isGameOverDrain({ type: 'BOTTOM_OUT' }, 'playing')).toBe(false);
  });

  test('false for unrelated events even in game_over', () => {
    expect(isGameOverDrain({ type: 'MILESTONE', threshold: 5000 }, 'game_over')).toBe(false);
  });
});

describe('isBossTargetDefeated', () => {
  test('true when hitCount meets or exceeds targetHits', () => {
    expect(isBossTargetDefeated(3, 3)).toBe(true);
    expect(isBossTargetDefeated(3, 4)).toBe(true);
  });

  test('false below threshold', () => {
    expect(isBossTargetDefeated(3, 2)).toBe(false);
  });

  test('false when boss is undefined', () => {
    expect(isBossTargetDefeated(undefined, 99)).toBe(false);
  });
});

// Guard: the GameEvent type must cover the events used here.
const _sample: GameEvent = { type: 'BOSS_LOCKED_HIT', bossId: 'x', remaining: 1 };
void _sample;
