import { test, expect, describe } from 'bun:test';
import {
  mapStateNumber,
  mapStateFlag,
  PSEUDO_MAX_DISPLAY,
  DEFAULT_CLIP_SHOW_MS,
  clipShowMs,
  clipFreezeMs,
  clipTakeoverMs,
} from '../src/socket-events';
import type { MapState, ClipTimings } from '../src/socket-events';

describe('mapStateNumber', () => {
  test('returns the number stored under the key', () => {
    const s: MapState = { hetic: 42 };
    expect(mapStateNumber(s, 'hetic')).toBe(42);
  });

  test('returns 0 for an absent key (jamais NaN/undefined)', () => {
    expect(mapStateNumber({}, 'missing')).toBe(0);
  });

  test('returns 0 when the value is a boolean (mauvais type)', () => {
    const s: MapState = { fever: true };
    expect(mapStateNumber(s, 'fever')).toBe(0);
  });

  test('preserves 0 and negative numbers', () => {
    const s: MapState = { zero: 0, neg: -5 };
    expect(mapStateNumber(s, 'zero')).toBe(0);
    expect(mapStateNumber(s, 'neg')).toBe(-5);
  });
});

describe('mapStateFlag', () => {
  test('returns true only for strict true', () => {
    const s: MapState = { on: true };
    expect(mapStateFlag(s, 'on')).toBe(true);
  });

  test('returns false for false', () => {
    const s: MapState = { off: false };
    expect(mapStateFlag(s, 'off')).toBe(false);
  });

  test('returns false for an absent key', () => {
    expect(mapStateFlag({}, 'missing')).toBe(false);
  });

  test('returns false for a numeric value (pas de coercition truthy)', () => {
    const s: MapState = { count: 1 };
    expect(mapStateFlag(s, 'count')).toBe(false);
  });
});

describe('constants', () => {
  test('PSEUDO_MAX_DISPLAY is 12', () => {
    expect(PSEUDO_MAX_DISPLAY).toBe(12);
  });

  test('DEFAULT_CLIP_SHOW_MS is 4000', () => {
    expect(DEFAULT_CLIP_SHOW_MS).toBe(4_000);
  });
});

const CLIPS: Record<string, ClipTimings> = {
  intro: { showMs: 2000, freezeMs: 500, takeoverMs: 1500 },
  noTakeover: { showMs: 3000, freezeMs: 0 },
};

describe('clipShowMs', () => {
  test('returns the clip showMs when present', () => {
    expect(clipShowMs(CLIPS, 'intro')).toBe(2000);
  });

  test('falls back to DEFAULT_CLIP_SHOW_MS for an unknown clip', () => {
    expect(clipShowMs(CLIPS, 'unknown')).toBe(DEFAULT_CLIP_SHOW_MS);
  });

  test('falls back to default when the clips table is undefined', () => {
    expect(clipShowMs(undefined, 'intro')).toBe(DEFAULT_CLIP_SHOW_MS);
  });
});

describe('clipFreezeMs', () => {
  test('returns the clip freezeMs when present', () => {
    expect(clipFreezeMs(CLIPS, 'intro')).toBe(500);
  });

  test('returns 0 for an explicit zero freeze', () => {
    expect(clipFreezeMs(CLIPS, 'noTakeover')).toBe(0);
  });

  test('falls back to 0 for an unknown clip', () => {
    expect(clipFreezeMs(CLIPS, 'unknown')).toBe(0);
  });

  test('falls back to 0 when the clips table is undefined', () => {
    expect(clipFreezeMs(undefined, 'intro')).toBe(0);
  });
});

describe('clipTakeoverMs', () => {
  test('returns the clip takeoverMs when present', () => {
    expect(clipTakeoverMs(CLIPS, 'intro')).toBe(1500);
  });

  test('returns undefined when the clip omits takeoverMs', () => {
    expect(clipTakeoverMs(CLIPS, 'noTakeover')).toBeUndefined();
  });

  test('returns undefined for an unknown clip', () => {
    expect(clipTakeoverMs(CLIPS, 'unknown')).toBeUndefined();
  });

  test('returns undefined when the clips table is undefined', () => {
    expect(clipTakeoverMs(undefined, 'intro')).toBeUndefined();
  });
});
