// Identifiant de boss générique (les ids concrets sont fournis par les
// définitions de boss de la map, pas codés dans le moteur).
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
  /** Bandeau DMD du hint tardif (nid armé > 45 s sans reveal). Absent → pas de hint. */
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
  targetMeshTheme: BossTargetMeshTheme;
  targetPulse: BossTargetPulseConfig;
};

/** Contexte minimal pour évaluer le gate de reveal d'un boss (score + monde alternatif). */
export type BossGateContext = {
  totalScore: number;
  alternateWorldActive: boolean;
  normalWorldScoreBaseline: number;
  alternateWorldScoreBaseline: number;
};

/** Score effectif d'un boss depuis l'entrée dans son monde. */
export function bossEffectiveScore(def: BossDefinition, ctx: BossGateContext): number {
  const baseline = def.reveal.requiresAlternateWorld
    ? ctx.alternateWorldScoreBaseline
    : ctx.normalWorldScoreBaseline;
  return ctx.totalScore - baseline;
}

/** True si le palier de score du boss est franchi ET son gate monde alternatif satisfait. */
export function bossThresholdMet(def: BossDefinition, ctx: BossGateContext): boolean {
  if (def.reveal.requiresAlternateWorld && !ctx.alternateWorldActive) return false;
  if (!def.reveal.requiresAlternateWorld && ctx.alternateWorldActive) return false;
  return bossEffectiveScore(def, ctx) >= def.reveal.scoreThreshold;
}

/** Points restants avant le palier, arrondis à la centaine supérieure (≥ 0). */
export function bossPointsRemaining(def: BossDefinition, ctx: BossGateContext): number {
  const gap = def.reveal.scoreThreshold - bossEffectiveScore(def, ctx);
  return Math.max(0, Math.ceil(gap / 100) * 100);
}

// Helper générique de lookup par rôle de collider, sur un jeu de définitions
// injecté (le moteur ne possède plus de registry boss).
export function findBossByColliderRole(
  bosses: BossDefinition[],
  role: string,
): BossDefinition | undefined {
  return bosses.find((boss) => boss.colliderRole === role);
}
