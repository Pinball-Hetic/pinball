import { easeInOut, PORTAL_MAGNET_RADIUS, PORTAL_MAGNET_STRENGTH } from '@pinball/game-engine';
import {
  UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED,
  UPSIDE_DOWN_PORTAL_PULSE_SPEED,
} from './UpsideDownConstants';

/**
 * Vecteur d'impulsion (repère monde) que l'aimant du portail applique à une
 * balle à distance horizontale `horiz` de l'ancre. `null` = hors rayon ou trop
 * proche (aucune impulsion). Math pure — l'appelant lit `body.translation()` et
 * appelle `body.applyImpulse()`. Courbe/constantes verbatim.
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
 * Progression d'ouverture `p` ∈ [0,1] atteinte par la phase de « polish »
 * (`revealing`) au temps normalisé `t` ∈ [0,1] : cubic ease-out sur [0.35, 1].
 */
export function portalRevealingProgress(t: number): number {
  const ease = 1 - Math.pow(1 - t, 3);
  return 0.35 + ease * 0.65;
}

/** Niveaux scalaires visuels dérivés de la progression d'ouverture `p`. */
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
 * Mappe la progression d'ouverture `p` ∈ [0,1] vers l'ensemble des niveaux
 * scalaires du portail (opacités, intensités, échelles). Courbe/constantes
 * verbatim — consommé par le renderer pour piloter matériaux/lumières/sprites.
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

/** Niveaux scalaires de l'animation « idle » (pulse) du portail ouvert. */
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
 * Niveaux d'animation du portail ouvert au temps `pulseT` avec renfort
 * d'aspiration `suckBoost`. Courbe/constantes verbatim. Les positions de
 * vignes/particules restent dans le renderer (dépendent d'un état par-mesh).
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
