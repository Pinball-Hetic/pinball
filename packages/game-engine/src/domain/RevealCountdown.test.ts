import { test, expect, describe } from 'bun:test';
import { RevealCountdown } from './RevealCountdown';

describe('RevealCountdown', () => {
  test('expire exactement une fois après le délai cumulé', () => {
    const c = new RevealCountdown();
    c.start(0.3);
    expect(c.tick(0.1)).toBe(false);
    expect(c.tick(0.1)).toBe(false);
    expect(c.tick(0.15)).toBe(true);
    expect(c.tick(0.1)).toBe(false);
    expect(c.isRunning()).toBe(false);
  });

  test('start est idempotent tant que le countdown court', () => {
    const c = new RevealCountdown();
    c.start(0.2);
    c.tick(0.15);
    c.start(5); // must not overwrite the remaining 0.05 s
    expect(c.tick(0.1)).toBe(true);
  });

  test('cancel stoppe le countdown sans expiration', () => {
    const c = new RevealCountdown();
    c.start(1);
    c.cancel();
    expect(c.isRunning()).toBe(false);
    expect(c.tick(2)).toBe(false);
  });
});
