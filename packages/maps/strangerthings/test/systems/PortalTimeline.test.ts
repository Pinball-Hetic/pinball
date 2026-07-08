import { describe, expect, test } from 'bun:test';
import {
  easeInOut,
  PORTAL_MAGNET_RADIUS,
  PORTAL_MAGNET_STRENGTH,
} from '@pinball/game-engine';
import {
  portalMagnetImpulse,
  portalOpenLevels,
  portalPulseLevels,
  portalRevealingProgress,
} from '../../systems/PortalTimeline';
import {
  UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED,
  UPSIDE_DOWN_PORTAL_PULSE_SPEED,
} from '../../systems/UpsideDownConstants';

describe('portalMagnetImpulse', () => {
  test('returns null beyond the magnet radius', () => {
    expect(portalMagnetImpulse(PORTAL_MAGNET_RADIUS + 0.01, 0, PORTAL_MAGNET_RADIUS + 0.01, 0)).toBeNull();
  });

  test('returns null when too close to the anchor', () => {
    expect(portalMagnetImpulse(0.0004, 0, 0.0004, 0)).toBeNull();
  });

  test('pulls toward the anchor with a downward component (verbatim curve)', () => {
    const horiz = PORTAL_MAGNET_RADIUS / 2;
    const dx = horiz;
    const dz = 0;
    const suckBoost = 0;
    const t = 1 - horiz / PORTAL_MAGNET_RADIUS;
    const pull = PORTAL_MAGNET_STRENGTH * t * t * (1 + suckBoost);
    const impulse = portalMagnetImpulse(dx, dz, horiz, suckBoost);
    expect(impulse).not.toBeNull();
    expect(impulse!.x).toBeCloseTo((dx / horiz) * pull, 12);
    expect(impulse!.y).toBeCloseTo(-pull * (0.42 + t * 0.35), 12);
    expect(impulse!.z).toBeCloseTo((dz / horiz) * pull, 12);
  });

  test('suckBoost scales the pull linearly', () => {
    const horiz = PORTAL_MAGNET_RADIUS / 2;
    const base = portalMagnetImpulse(horiz, 0, horiz, 0)!;
    const boosted = portalMagnetImpulse(horiz, 0, horiz, 1)!;
    expect(boosted.x).toBeCloseTo(base.x * 2, 12);
  });
});

describe('portalRevealingProgress', () => {
  test('starts at 0.35 and ends at 1', () => {
    expect(portalRevealingProgress(0)).toBeCloseTo(0.35, 12);
    expect(portalRevealingProgress(1)).toBeCloseTo(1, 12);
  });

  test('is cubic ease-out over [0.35, 1] (verbatim)', () => {
    const t = 0.4;
    const ease = 1 - Math.pow(1 - t, 3);
    expect(portalRevealingProgress(t)).toBeCloseTo(0.35 + ease * 0.65, 12);
  });
});

describe('portalOpenLevels', () => {
  test('p=0: portal hidden, glb fully visible', () => {
    const l = portalOpenLevels(0);
    expect(l.portalOn).toBe(0);
    expect(l.glbOff).toBe(0);
    expect(l.fx).toBeCloseTo(0.22, 12);
    expect(l.scale).toBeCloseTo(0.14, 12);
    expect(l.particlesVisible).toBe(false);
  });

  test('p=1: fully open, glb faded out', () => {
    const l = portalOpenLevels(1);
    expect(l.portalOn).toBe(1);
    expect(l.glbOff).toBe(1);
    expect(l.fx).toBe(1);
    expect(l.scale).toBeCloseTo(1, 12);
    expect(l.visible).toBe(true);
    expect(l.particlesVisible).toBe(true);
  });

  test('derived levels match verbatim formulas', () => {
    const p = 0.5;
    const portalOn = easeInOut(p);
    const fx = Math.min(1, 0.22 + portalOn * 0.78);
    const l = portalOpenLevels(p);
    expect(l.glbOff).toBeCloseTo(easeInOut(Math.min(1, p / 0.42)), 12);
    expect(l.coreOpacity).toBeCloseTo(0.7 * fx, 12);
    expect(l.vortexOpacity).toBeCloseTo(0.35 * fx, 12);
    expect(l.outerRingOpacity).toBeCloseTo(0.95 * fx, 12);
    expect(l.innerRingOpacity).toBeCloseTo(0.88 * fx, 12);
    expect(l.rimGlowIntensity).toBeCloseTo(0.55 * fx, 12);
    expect(l.rimGlowScale).toBeCloseTo(0.9 * fx, 12);
    expect(l.accentGlowIntensity).toBeCloseTo(0.48 * fx, 12);
    expect(l.accentGlowScale).toBeCloseTo(fx, 12);
    expect(l.coreLightIntensity).toBeCloseTo(0.85 * fx, 12);
    expect(l.vineEmissiveIntensity).toBeCloseTo(0.35 * fx, 12);
    expect(l.particleScale).toBeCloseTo(0.55 * fx, 12);
  });

  test('particles appear only past p=0.08', () => {
    expect(portalOpenLevels(0.08).particlesVisible).toBe(false);
    expect(portalOpenLevels(0.0801).particlesVisible).toBe(true);
  });
});

describe('portalPulseLevels', () => {
  test('matches verbatim pulse formulas', () => {
    const pulseT = 1.23;
    const suckBoost = 0.4;
    const pulse = 0.65 + Math.sin(pulseT * UPSIDE_DOWN_PORTAL_PULSE_SPEED) * 0.35;
    const accentPulse = 0.55 + Math.sin(pulseT * UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED) * 0.45;
    const l = portalPulseLevels(pulseT, suckBoost);
    expect(l.pulse).toBeCloseTo(pulse, 12);
    expect(l.fast).toBeCloseTo(pulseT * 4.2, 12);
    expect(l.outerRingEmissive).toBeCloseTo(1.8 * pulse * (1 + suckBoost), 12);
    expect(l.innerRingEmissive).toBeCloseTo(2.4 * pulse * (1 + suckBoost * 0.6), 12);
    expect(l.coreOpacity).toBeCloseTo(0.55 + pulse * 0.35, 12);
    expect(l.vortexOpacity).toBeCloseTo(0.25 + pulse * 0.2, 12);
    expect(l.rimGlowIntensity).toBeCloseTo(Math.min(1, 0.55 * pulse * (1 + suckBoost)), 12);
    expect(l.rimGlowScale).toBeCloseTo(0.9 + pulse * 0.4, 12);
    expect(l.coreLightIntensity).toBeCloseTo(0.85 * pulse * (1 + suckBoost * 1.2), 12);
    expect(l.accentGlowIntensity).toBeCloseTo(Math.min(1, 0.48 * accentPulse * (1 + suckBoost * 0.55)), 12);
    expect(l.vineEmissiveIntensity).toBeCloseTo(0.22 + pulse * 0.28 * (1 + suckBoost * 0.4), 12);
  });

  test('glow intensities are clamped to 1', () => {
    // suckBoost large → uncamped rim/accent would exceed 1.
    const l = portalPulseLevels(0.5, 10);
    expect(l.rimGlowIntensity).toBeLessThanOrEqual(1);
    expect(l.accentGlowIntensity).toBeLessThanOrEqual(1);
  });
});
