import { easeInOut, PORTAL_MAGNET_RADIUS, PORTAL_MAGNET_STRENGTH } from '@pinball/game-engine';
import {
  UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED,
  UPSIDE_DOWN_PORTAL_PULSE_SPEED,
} from './UpsideDownConstants';

/**
 * Impulse vector (world space) the portal magnet applies to a ball at
 * horizontal distance `horiz` from the anchor. `null` = out of radius or too
 * close (no impulse). Pure math — the caller reads `body.translation()` and
 * calls `body.applyImpulse()`.
 */
export function portalMagnetImpulse(
  dx: number,
  dz: number,
  horiz: number,
  suckBoost: number,
): { x: number; y: number; z: number } | null {
  if (horiz > PORTAL_MAGNET_RADIUS || horiz < 0.0005) return null;

  const t = 1 - horiz / PORTAL_MAGNET_RADIUS;
  const pull = PORTAL_MAGNET_STRENGTH * t * t * (1 + suckBoost);
  return {
    x: (dx / horiz) * pull,
    y: -pull * (0.42 + t * 0.35),
    z: (dz / horiz) * pull,
  };
}

/**
 * Opening progress `p` ∈ [0,1] reached by the "polish" phase (`revealing`)
 * at normalized time `t` ∈ [0,1]: cubic ease-out over [0.35, 1].
 */
export function portalRevealingProgress(t: number): number {
  const ease = 1 - Math.pow(1 - t, 3);
  return 0.35 + ease * 0.65;
}

/** Visual scalar levels derived from the opening progress `p`. */
export type PortalOpenLevels = {
  portalOn: number;
  glbOff: number;
  fx: number;
  scale: number;
  visible: boolean;
  coreOpacity: number;
  vortexOpacity: number;
  outerRingOpacity: number;
  innerRingOpacity: number;
  rimGlowIntensity: number;
  rimGlowScale: number;
  accentGlowIntensity: number;
  accentGlowScale: number;
  coreLightIntensity: number;
  vineEmissiveIntensity: number;
  particlesVisible: boolean;
  particleScale: number;
};

/**
 * Maps the opening progress `p` ∈ [0,1] to all portal scalar levels
 * (opacities, intensities, scales). Consumed by the renderer to drive
 * materials/lights/sprites.
 */
export function portalOpenLevels(p: number): PortalOpenLevels {
  const portalOn = easeInOut(p);
  const glbOff = easeInOut(Math.min(1, p / 0.42));
  const fx = Math.min(1, 0.22 + portalOn * 0.78);
  return {
    portalOn,
    glbOff,
    fx,
    scale: 0.14 + portalOn * 0.86,
    visible: fx > 0.01,
    coreOpacity: 0.7 * fx,
    vortexOpacity: 0.35 * fx,
    outerRingOpacity: 0.95 * fx,
    innerRingOpacity: 0.88 * fx,
    rimGlowIntensity: 0.55 * fx,
    rimGlowScale: 0.9 * fx,
    accentGlowIntensity: 0.48 * fx,
    accentGlowScale: fx,
    coreLightIntensity: 0.85 * fx,
    vineEmissiveIntensity: 0.35 * fx,
    particlesVisible: p > 0.08,
    particleScale: 0.55 * fx,
  };
}

/** Scalar levels of the open portal's "idle" (pulse) animation. */
export type PortalPulseLevels = {
  pulse: number;
  fast: number;
  outerRingEmissive: number;
  innerRingEmissive: number;
  coreOpacity: number;
  vortexOpacity: number;
  rimGlowIntensity: number;
  rimGlowScale: number;
  coreLightIntensity: number;
  accentGlowIntensity: number;
  vineEmissiveIntensity: number;
};

/**
 * Open-portal animation levels at time `pulseT` with suction boost
 * `suckBoost`. Vine/particle positions stay in the renderer (they depend on
 * per-mesh state).
 */
export function portalPulseLevels(pulseT: number, suckBoost: number): PortalPulseLevels {
  const pulse = 0.65 + Math.sin(pulseT * UPSIDE_DOWN_PORTAL_PULSE_SPEED) * 0.35;
  const accentPulse = 0.55 + Math.sin(pulseT * UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED) * 0.45;
  return {
    pulse,
    fast: pulseT * 4.2,
    outerRingEmissive: 1.8 * pulse * (1 + suckBoost),
    innerRingEmissive: 2.4 * pulse * (1 + suckBoost * 0.6),
    coreOpacity: 0.55 + pulse * 0.35,
    vortexOpacity: 0.25 + pulse * 0.2,
    rimGlowIntensity: Math.min(1, 0.55 * pulse * (1 + suckBoost)),
    rimGlowScale: 0.9 + pulse * 0.4,
    coreLightIntensity: 0.85 * pulse * (1 + suckBoost * 1.2),
    accentGlowIntensity: Math.min(1, 0.48 * accentPulse * (1 + suckBoost * 0.55)),
    vineEmissiveIntensity: 0.22 + pulse * 0.28 * (1 + suckBoost * 0.4),
  };
}
