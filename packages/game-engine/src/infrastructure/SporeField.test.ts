import { describe, it, expect } from 'bun:test';
import {
  seedSpore,
  seedSpores,
  stepSpore,
  stepSporeField,
  type SporeParticle,
} from './SporeField';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

describe('seedSpore', () => {
  it('derives anchor/base/angle/radius/speed/drift verbatim from index', () => {
    const s = seedSpore(7, 50);
    expect(s.anchorX).toBe(lerp(-0.22, 0.22, (7 * 0.37) % 1));
    expect(s.anchorZ).toBe(lerp(-0.48, 0.32, (7 * 0.53 + 0.11) % 1));
    expect(s.baseY).toBe(1.035 + (7 % 6) * 0.009);
    expect(s.angle).toBe((7 / 50) * Math.PI * 2);
    expect(s.radius).toBe(0.014 + (7 % 5) * 0.006);
    expect(s.speed).toBe(0.32 + (7 % 7) * 0.1);
    expect(s.drift).toBe(0.55 + (7 % 4) * 0.18);
  });

  it('is deterministic for the same index/count', () => {
    expect(seedSpore(3, 20)).toEqual(seedSpore(3, 20));
  });

  it('starts angle at 0 for index 0', () => {
    expect(seedSpore(0, 10).angle).toBe(0);
  });
});

describe('seedSpores', () => {
  it('produces `count` particles', () => {
    expect(seedSpores(12)).toHaveLength(12);
  });

  it('matches seedSpore per index', () => {
    const all = seedSpores(5);
    for (let i = 0; i < 5; i++) {
      expect(all[i]).toEqual(seedSpore(i, 5));
    }
  });
});

describe('stepSpore', () => {
  it('advances angle by speed * dt', () => {
    const s: SporeParticle = {
      anchorX: 0,
      anchorZ: 0,
      baseY: 1,
      angle: 1,
      radius: 0.02,
      speed: 0.5,
      drift: 0.6,
    };
    stepSpore(s, 2, 0);
    expect(s.angle).toBe(1 + 0.5 * 2);
  });

  it('computes x/y/z verbatim against the original formula', () => {
    const s: SporeParticle = {
      anchorX: 0.1,
      anchorZ: -0.2,
      baseY: 1.04,
      angle: 0.3,
      radius: 0.02,
      speed: 0.4,
      drift: 0.7,
    };
    const dt = 0.016;
    const pulseT = 3.21;

    const angle = s.angle + s.speed * dt;
    const r = s.radius * (0.9 + Math.sin(pulseT * 2.4 + angle) * 0.1);
    const lift = Math.sin(pulseT * s.drift + angle) * 0.014;
    const wander = Math.sin(pulseT * 1.6 + angle * 2.1) * 0.006;
    const expected = {
      x: s.anchorX + Math.cos(angle) * r + wander,
      y: s.baseY + lift + Math.sin(pulseT * 0.35 + angle) * 0.018,
      z: s.anchorZ + Math.sin(angle) * r - wander * 0.6,
    };

    const out = stepSpore(s, dt, pulseT);
    expect(out.x).toBe(expected.x);
    expect(out.y).toBe(expected.y);
    expect(out.z).toBe(expected.z);
  });

  it('is deterministic for the same inputs', () => {
    const make = (): SporeParticle => seedSpore(4, 30);
    const a = make();
    const b = make();
    expect(stepSpore(a, 0.5, 2)).toEqual(stepSpore(b, 0.5, 2));
  });
});

describe('stepSporeField', () => {
  it('writes x/y/z into the flat buffer at i*3 offsets', () => {
    const spores = seedSpores(3);
    const out = new Float32Array(3 * 3);
    const dt = 0.02;
    const pulseT = 1.5;

    const expected = spores.map((s) => stepSpore({ ...s }, dt, pulseT));
    stepSporeField(spores, dt, pulseT, out);

    for (let i = 0; i < spores.length; i++) {
      expect(out[i * 3]).toBeCloseTo(expected[i].x, 6);
      expect(out[i * 3 + 1]).toBeCloseTo(expected[i].y, 6);
      expect(out[i * 3 + 2]).toBeCloseTo(expected[i].z, 6);
    }
  });

  it('mutates each particle angle once per call', () => {
    const spores = seedSpores(4);
    const before = spores.map((s) => s.angle);
    stepSporeField(spores, 1, 0, new Float32Array(12));
    spores.forEach((s, i) => {
      expect(s.angle).toBe(before[i] + s.speed * 1);
    });
  });
});
