import type { BossCameraCinematicConfig } from './CameraCinematicConstants';

export type BossId = string;

export type BossTargetPosition = {
  x: number;
  y: number;
  z: number;
};

export type BossTargetPulseConfig = {
  hitFlashDuration: number;
  pulseSpeed: number;
  pulseAmp: number;
  hitBoost: number;
  ringEmissiveBase: number;
  coreEmissiveBase: number;
  lightIntensityBase: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  hitScaleBoost: number;
};

export type BossTargetMeshTheme = {
  ring: {
    color: number;
    emissive: number;
    emissiveIntensity: number;
    radius?: number;
    tube?: number;
    metalness?: number;
    roughness?: number;
  };
  core: {
    color: number;
    emissive: number;
    emissiveIntensity: number;
    radius?: number;
    metalness?: number;
    roughness?: number;
  };
  light: {
    color: number;
    intensity: number;
    distance?: number;
    decay?: number;
  };
  victoryBurst?: { color: number };
};

export type BossHudConfig = {
  label: string;
  victoryLabel: string;
  dmdLabel: string;
  requiresAlternateWorld: boolean;
  bottomClass: string;
  borderClass: string;
  subtitleClass: string;
  hitsClass: string;
  victoryClass: string;
  assistLabel?: string;
  victoryClearMs: number;
  nestHintLabel?: string;
};

export type BossRevealConfig = {
  scoreThreshold: number;
  scoreIncrement: number;
  requiresAlternateWorld: boolean;
};

export type BossDefinition = {
  id: BossId;
  colliderRole: string;
  target: BossTargetPosition;
  targetHits: number;
  scoreTargetHit: number;
  reveal: BossRevealConfig;
  hud: BossHudConfig;
  unlocksPortal: boolean;
  unlocksReturnPortal: boolean;
  cameraCinematic: BossCameraCinematicConfig;
  victoryCameraCinematic: BossCameraCinematicConfig;
  targetMeshTheme: BossTargetMeshTheme;
  targetPulse: BossTargetPulseConfig;
  revealSoundUrl?: string;
  revealSoundVolume?: number;
  /** Musique de phase tardive (ex. win-music quand hitCount >= seuil). */
  latePhaseSoundUrl?: string;
  latePhaseSoundVolume?: number;
  latePhaseHitThreshold?: number;
  /** Après BOSS_FIGHT_END, conserve revealSoundUrl jusqu'au BOSS_REVEAL de ce boss. */
  keepMusicUntilBossReveal?: BossId;
  assist?: { id: string };
};

export type BossGateContext = {
  totalScore: number;
  alternateWorldActive: boolean;
  normalWorldScoreBaseline: number;
  alternateWorldScoreBaseline: number;
};

export function bossEffectiveScore(def: BossDefinition, ctx: BossGateContext): number {
  const baseline = def.reveal.requiresAlternateWorld
    ? ctx.alternateWorldScoreBaseline
    : ctx.normalWorldScoreBaseline;
  return ctx.totalScore - baseline;
}

export function bossThresholdMet(def: BossDefinition, ctx: BossGateContext): boolean {
  if (def.reveal.requiresAlternateWorld && !ctx.alternateWorldActive) return false;
  if (!def.reveal.requiresAlternateWorld && ctx.alternateWorldActive) return false;
  return bossEffectiveScore(def, ctx) >= def.reveal.scoreThreshold;
}

export function bossPointsRemaining(def: BossDefinition, ctx: BossGateContext): number {
  const gap = def.reveal.scoreThreshold - bossEffectiveScore(def, ctx);
  return Math.max(0, Math.ceil(gap / 100) * 100);
}

export function findBossByColliderRole(
  bosses: BossDefinition[],
  role: string,
): BossDefinition | undefined {
  return bosses.find((boss) => boss.colliderRole === role);
}

export function getBossById(bosses: BossDefinition[], id: BossId): BossDefinition | undefined {
  return bosses.find((boss) => boss.id === id);
}
