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
