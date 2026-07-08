import { test, expect, describe } from 'bun:test';
import { AtmosphereBlend } from '../../src/domain/AtmosphereBlend';

describe('AtmosphereBlend.ease', () => {
  test('smoothstep boundaries 0 -> 0, 1 -> 1', () => {
    expect(AtmosphereBlend.ease(0)).toBe(0);
    expect(AtmosphereBlend.ease(1)).toBe(1);
  });

  test('smoothstep exact midpoint', () => {
    expect(AtmosphereBlend.ease(0.5)).toBeCloseTo(0.5, 10);
    expect(AtmosphereBlend.ease(0.25)).toBeCloseTo(0.15625, 10);
  });
});

describe('AtmosphereBlend integration', () => {
  test('starts idle at rest', () => {
    const b = new AtmosphereBlend(2.0);
    expect(b.isIdle()).toBe(true);
    expect(b.mix).toBe(0);
    expect(b.targetMix).toBe(0);
  });

  test('not idle once a target/visit is set', () => {
    const b = new AtmosphereBlend(2.0);
    b.visited = true;
    b.targetMix = 1;
    expect(b.isIdle()).toBe(false);
  });

  test('step ramps mix toward target by dt/blendDuration, clamped', () => {
    const b = new AtmosphereBlend(2.0);
    b.targetMix = 1;
    const t1 = b.step(0.5); // 0.5/2 = 0.25
    expect(t1.mix).toBeCloseTo(0.25, 10);
    const t2 = b.step(0.5);
    expect(t2.mix).toBeCloseTo(0.5, 10);
  });

  test('step never overshoots the target (clamp up)', () => {
    const b = new AtmosphereBlend(1.0);
    b.targetMix = 1;
    const t = b.step(5); // would be 5 unclamped
    expect(t.mix).toBe(1);
  });

  test('step never undershoots when decreasing (clamp down)', () => {
    const b = new AtmosphereBlend(1.0);
    b.mix = 1;
    b.targetMix = 0;
    const t = b.step(5);
    expect(t.mix).toBe(0);
  });

  test('ease reflects post-step mix via smoothstep', () => {
    const b = new AtmosphereBlend(1.0);
    b.targetMix = 1;
    const t = b.step(0.5);
    expect(t.ease).toBeCloseTo(AtmosphereBlend.ease(0.5), 10);
  });

  test('pulseT accumulates dt on every step', () => {
    const b = new AtmosphereBlend(2.0);
    b.targetMix = 1;
    b.step(0.3);
    b.step(0.2);
    expect(b.pulseT).toBeCloseTo(0.5, 10);
  });
});

describe('AtmosphereBlend.fullyActive', () => {
  test('fullyActivePre uses pre-step mix, fullyActive uses post-step mix', () => {
    const b = new AtmosphereBlend(1.0);
    b.mix = 0.5;
    b.targetMix = 1;
    const t = b.step(0.5); // mix 0.5 -> 1.0
    expect(t.fullyActivePre).toBe(false); // pre-step mix was 0.5
    expect(t.fullyActive).toBe(true); // post-step mix is 1.0
  });

  test('both true once settled at full', () => {
    const b = new AtmosphereBlend(1.0);
    b.mix = 1;
    b.targetMix = 1;
    const t = b.step(0.5);
    expect(t.fullyActivePre).toBe(true);
    expect(t.fullyActive).toBe(true);
  });

  test('fullyActive requires targetMix >= 1', () => {
    const b = new AtmosphereBlend(1.0);
    b.mix = 1;
    b.targetMix = 0.9;
    const t = b.step(0.01);
    expect(t.fullyActive).toBe(false);
  });
});

describe('AtmosphereBlend.sporeIntensity', () => {
  test('zero when mix is 0', () => {
    const b = new AtmosphereBlend(1.0);
    b.targetMix = 1;
    const t = b.step(0); // mix stays 0
    expect(t.sporeIntensity).toBe(0);
  });

  test('full (1) when settled active', () => {
    const b = new AtmosphereBlend(1.0);
    b.mix = 1;
    b.targetMix = 1;
    const t = b.step(0);
    expect(t.sporeIntensity).toBe(1);
  });

  test('0.85->1 window ramp when heading active and mix in window', () => {
    const b = new AtmosphereBlend(1.0);
    b.mix = 0.925;
    b.targetMix = 1;
    const t = b.step(0); // mix stays 0.925: (0.925-0.85)/0.15 = 0.5
    expect(t.sporeIntensity).toBeCloseTo(0.5, 10);
  });

  test('clamped to 0 below the 0.85 window while heading active', () => {
    const b = new AtmosphereBlend(1.0);
    b.mix = 0.5;
    b.targetMix = 1;
    const t = b.step(0);
    expect(t.sporeIntensity).toBe(0);
  });

  test('equals mix when heading back toward rest (targetMix < 1)', () => {
    const b = new AtmosphereBlend(1.0);
    b.mix = 0.6;
    b.targetMix = 0;
    const t = b.step(0); // step(0) keeps mix at 0.6
    expect(t.sporeIntensity).toBeCloseTo(0.6, 10);
  });
});

describe('AtmosphereBlend.shouldApply', () => {
  test('applies on first mix, then early-outs for near-identical mix', () => {
    const b = new AtmosphereBlend(1.0);
    expect(b.shouldApply(0.5)).toBe(true);
    expect(b.shouldApply(0.5)).toBe(false);
    expect(b.shouldApply(0.5005)).toBe(false); // < 0.001 delta
    expect(b.shouldApply(0.52)).toBe(true);
  });

  test('reset clears the lastAppliedMix latch', () => {
    const b = new AtmosphereBlend(1.0);
    b.shouldApply(0.5);
    b.reset();
    expect(b.shouldApply(0.5)).toBe(true);
  });
});

describe('AtmosphereBlend.releaseVisitedIfAtRest', () => {
  test('clears visited only when fully back at rest', () => {
    const b = new AtmosphereBlend(1.0);
    b.visited = true;
    b.mix = 0.3;
    b.targetMix = 0;
    b.releaseVisitedIfAtRest();
    expect(b.visited).toBe(true);

    b.mix = 0;
    b.releaseVisitedIfAtRest();
    expect(b.visited).toBe(false);
  });

  test('does not clear visited while still heading active', () => {
    const b = new AtmosphereBlend(1.0);
    b.visited = true;
    b.mix = 0;
    b.targetMix = 1;
    b.releaseVisitedIfAtRest();
    expect(b.visited).toBe(true);
  });
});

describe('AtmosphereBlend.reset', () => {
  test('returns to a clean idle state', () => {
    const b = new AtmosphereBlend(2.0);
    b.mix = 0.7;
    b.targetMix = 1;
    b.visited = true;
    b.step(0.5);
    b.reset();
    expect(b.mix).toBe(0);
    expect(b.targetMix).toBe(0);
    expect(b.visited).toBe(false);
    expect(b.pulseT).toBe(0);
    expect(b.isIdle()).toBe(true);
  });
});
