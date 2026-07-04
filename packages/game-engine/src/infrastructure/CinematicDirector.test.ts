import { describe, expect, test } from 'bun:test';
import { CinematicDirector, type CinematicSpec } from './CinematicDirector';

const spec = (overrides: Partial<CinematicSpec> = {}): CinematicSpec => ({
  id: 'clip',
  durationMs: 1000,
  freezePhysics: true,
  ...overrides,
});

describe('resetGame', () => {
  test('calls onEnd of an active cinematic before clearing it', () => {
    const d = new CinematicDirector();
    let onEndCalls = 0;
    let frozenAtOnEnd: boolean | null = null;

    const s = spec({
      onEnd: () => {
        onEndCalls += 1;
        // onEnd runs while active is still readable as ending, but the
        // freeze must be lifted for the new game.
        frozenAtOnEnd = d.shouldFreeze();
      },
    });

    d.play(s);
    expect(d.isActive()).toBe(true);
    expect(d.shouldFreeze()).toBe(true);

    d.resetGame();

    expect(onEndCalls).toBe(1);
    expect(frozenAtOnEnd).toBe(false);
    expect(d.isActive()).toBe(false);
    expect(d.shouldFreeze()).toBe(false);
  });

  test('is a no-op (no onEnd) when no cinematic is active', () => {
    const d = new CinematicDirector();
    expect(() => d.resetGame()).not.toThrow();
    expect(d.isActive()).toBe(false);
  });

  test('does not call onEnd twice if a clip already ended via update', () => {
    const d = new CinematicDirector();
    let onEndCalls = 0;
    d.play(spec({ durationMs: 0, onEnd: () => (onEndCalls += 1) }));

    d.update(performance.now() + 1);
    expect(onEndCalls).toBe(1);
    expect(d.isActive()).toBe(false);

    d.resetGame();
    expect(onEndCalls).toBe(1);
  });
});

describe('injected clock', () => {
  test('startedAt uses the injected now, making elapsed deterministic', () => {
    const clock = 100;
    const d = new CinematicDirector(() => clock);
    let onEndCalls = 0;

    d.play(spec({ durationMs: 1000, onEnd: () => (onEndCalls += 1) }));
    expect(d.isActive()).toBe(true);

    // one frame short of duration → still active
    d.update(clock + 999);
    expect(onEndCalls).toBe(0);
    expect(d.isActive()).toBe(true);

    // exactly at duration → ends
    d.update(clock + 1000);
    expect(onEndCalls).toBe(1);
    expect(d.isActive()).toBe(false);
  });

  test('startedAt tracks the injected clock at play time, not construction', () => {
    let clock = 0;
    const d = new CinematicDirector(() => clock);

    clock = 5000;
    d.play(spec({ durationMs: 200 }));

    // elapsed measured from clock at play() (5000), not 0
    d.update(5199);
    expect(d.isActive()).toBe(true);
    d.update(5200);
    expect(d.isActive()).toBe(false);
  });

  test('defaults to performance.now when no clock injected', () => {
    const d = new CinematicDirector();
    d.play(spec({ durationMs: 0 }));
    d.update(performance.now() + 1);
    expect(d.isActive()).toBe(false);
  });
});
