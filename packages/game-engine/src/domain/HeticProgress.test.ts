import { test, expect, describe } from 'bun:test';
import { resolveHeticProgress, selectMilestoneClip } from './HeticProgress';

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
