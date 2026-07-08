import { test, expect, describe } from 'bun:test';
import { resolveNestState, dueLateHints, NEST_LATE_HINT_MS } from '../../src/domain/NestState';
import type { BossDefinition, BossGateContext } from '../../src/domain/BossRegistry';

function boss(over: Partial<BossDefinition> & Pick<BossDefinition, 'id'>): BossDefinition {
  return {
    colliderRole: `${over.id}_target`,
    target: { x: 0, y: 1, z: 0 },
    targetHits: 5,
    scoreTargetHit: 250,
    reveal: { scoreThreshold: 3000, scoreIncrement: 150, requiresAlternateWorld: false },
    hud: {
      label: '',
      victoryLabel: '',
      dmdLabel: '',
      requiresAlternateWorld: false,
      bottomClass: '',
      borderClass: '',
      subtitleClass: '',
      hitsClass: '',
      victoryClass: '',
      victoryClearMs: 1000,
    },
    unlocksPortal: false,
    unlocksReturnPortal: false,
    targetMeshTheme: {
      ring: { color: 0, emissive: 0, emissiveIntensity: 1 },
      core: { color: 0, emissive: 0, emissiveIntensity: 1 },
      light: { color: 0, intensity: 1 },
    },
    targetPulse: {
      hitFlashDuration: 0.18,
      pulseSpeed: 2.5,
      pulseAmp: 0.18,
      hitBoost: 1.4,
      ringEmissiveBase: 1.6,
      coreEmissiveBase: 1.2,
      lightIntensityBase: 0.45,
      wobbleSpeed: 3,
      wobbleAmp: 0.08,
      hitScaleBoost: 0.25,
    },
    ...over,
  } as BossDefinition;
}

function gate(over: Partial<BossGateContext> = {}): BossGateContext {
  return {
    totalScore: 0,
    alternateWorldActive: false,
    normalWorldScoreBaseline: 0,
    alternateWorldScoreBaseline: 0,
    ...over,
  };
}

describe('resolveNestState', () => {
  test('revealed when triggered, regardless of threshold', () => {
    const b = boss({ id: 'a' });
    expect(resolveNestState(b, gate({ totalScore: 0 }), true)).toBe('revealed');
    expect(resolveNestState(b, gate({ totalScore: 99999 }), true)).toBe('revealed');
  });

  test('locked when not triggered and threshold not met', () => {
    const b = boss({ id: 'a' });
    expect(resolveNestState(b, gate({ totalScore: 2999 }), false)).toBe('locked');
  });

  test('armed when not triggered and threshold met', () => {
    const b = boss({ id: 'a' });
    expect(resolveNestState(b, gate({ totalScore: 3000 }), false)).toBe('armed');
  });

  test('alternate-world boss locked while in normal world even above score', () => {
    const b = boss({
      id: 'a',
      reveal: { scoreThreshold: 3000, scoreIncrement: 150, requiresAlternateWorld: true },
    });
    expect(resolveNestState(b, gate({ totalScore: 5000, alternateWorldActive: false }), false)).toBe(
      'locked',
    );
  });

  test('alternate-world boss armed once alternate world active and effective score met', () => {
    const b = boss({
      id: 'a',
      reveal: { scoreThreshold: 3000, scoreIncrement: 150, requiresAlternateWorld: true },
    });
    expect(
      resolveNestState(
        b,
        gate({ totalScore: 4000, alternateWorldActive: true, alternateWorldScoreBaseline: 1000 }),
        false,
      ),
    ).toBe('armed');
  });
});

describe('dueLateHints', () => {
  test('returns ids armed for >= 45s and not yet fired', () => {
    const now = 100_000;
    const armedAt = { a: now - NEST_LATE_HINT_MS, b: now - 10_000 };
    expect(dueLateHints(['a', 'b'], armedAt, new Set(), now)).toEqual(['a']);
  });

  test('exact threshold boundary is due (>=)', () => {
    const now = 50_000;
    const armedAt = { a: now - NEST_LATE_HINT_MS };
    expect(dueLateHints(['a'], armedAt, new Set(), now)).toEqual(['a']);
  });

  test('one ms short of threshold is not due', () => {
    const now = 50_000;
    const armedAt = { a: now - NEST_LATE_HINT_MS + 1 };
    expect(dueLateHints(['a'], armedAt, new Set(), now)).toEqual([]);
  });

  test('skips ids with no armedAt entry', () => {
    expect(dueLateHints(['a'], {}, new Set(), 999_999)).toEqual([]);
  });

  test('skips ids already fired', () => {
    const now = 100_000;
    const armedAt = { a: 0 };
    expect(dueLateHints(['a'], armedAt, new Set(['a']), now)).toEqual([]);
  });

  test('only iterates the candidate ids passed in', () => {
    const now = 100_000;
    const armedAt = { a: 0, b: 0 };
    expect(dueLateHints(['a'], armedAt, new Set(), now)).toEqual(['a']);
  });

  test('preserves candidate order', () => {
    const now = 100_000;
    const armedAt = { a: 0, b: 0, c: 0 };
    expect(dueLateHints(['c', 'a', 'b'], armedAt, new Set(), now)).toEqual(['c', 'a', 'b']);
  });
});
