export type BossId = 'demogorgon' | 'vecna';

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
  requiresUpsideDown: boolean;
  bottomClass: string;
  borderClass: string;
  subtitleClass: string;
  hitsClass: string;
  victoryClass: string;
  assistLabel?: string;
  victoryClearMs: number;
};

export type BossRevealConfig = {
  scoreThreshold: number;
  scoreIncrement: number;
  requiresUpsideDown: boolean;
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

export const BOSS_IDS: readonly BossId[] = ['demogorgon', 'vecna'];

export const BOSS_REGISTRY: Record<BossId, BossDefinition> = {
  demogorgon: {
    id: 'demogorgon',
    colliderRole: 'demogorgon_target',
    target: { x: 0, y: 1.012, z: -0.02 },
    targetHits: 5,
    scoreTargetHit: 250,
    reveal: {
      scoreThreshold: 3000,
      scoreIncrement: 150,
      requiresUpsideDown: false,
    },
    hud: {
      label: 'Cible Demogorgon',
      victoryLabel: 'Demogorgon vaincu !',
      dmdLabel: 'DEMOGORGON',
      requiresUpsideDown: false,
      bottomClass: 'bottom-8',
      borderClass: 'border-red-500/40',
      subtitleClass: 'text-red-300/90',
      hitsClass: 'text-red-400 drop-shadow-[0_0_10px_rgba(255,60,60,0.7)]',
      victoryClass: 'text-amber-300 drop-shadow-[0_0_20px_rgba(255,200,80,0.9)]',
      assistLabel: 'Eleven +100',
      victoryClearMs: 1400,
    },
    unlocksPortal: true,
    unlocksReturnPortal: false,
    targetMeshTheme: {
      ring: {
        color: 0xff2244,
        emissive: 0xff1133,
        emissiveIntensity: 1.6,
        radius: 0.032,
        metalness: 0.4,
        roughness: 0.35,
      },
      core: {
        color: 0xffeedd,
        emissive: 0xff4422,
        emissiveIntensity: 1.2,
        radius: 0.014,
        metalness: 0.2,
        roughness: 0.4,
      },
      light: { color: 0xff2244, intensity: 0.45 },
      victoryBurst: { color: 0xffee55 },
    },
    targetPulse: {
      hitFlashDuration: 0.18,
      pulseSpeed: 2.5,
      pulseAmp: 0.18,
      hitBoost: 1.4,
      ringEmissiveBase: 1.6,
      coreEmissiveBase: 1.2,
      lightIntensityBase: 0.45,
      wobbleSpeed: 3,
      wobbleAmp: 0.08,
      hitScaleBoost: 0.25,
    },
  },
  vecna: {
    id: 'vecna',
    colliderRole: 'vecna_target',
    target: { x: 0, y: 1.012, z: -0.067 },
    targetHits: 10,
    scoreTargetHit: 300,
    reveal: {
      scoreThreshold: 3000,
      scoreIncrement: 200,
      requiresUpsideDown: true,
    },
    hud: {
      label: 'Cible Vecna',
      victoryLabel: 'Vecna vaincu !',
      dmdLabel: 'VECNA',
      requiresUpsideDown: true,
      bottomClass: 'bottom-24',
      borderClass: 'border-violet-500/45',
      subtitleClass: 'text-violet-300/90',
      hitsClass: 'text-violet-400 drop-shadow-[0_0_10px_rgba(160,80,255,0.7)]',
      victoryClass: 'text-violet-200 drop-shadow-[0_0_20px_rgba(160,80,255,0.9)]',
      victoryClearMs: 1600,
    },
    unlocksPortal: false,
    unlocksReturnPortal: true,
    targetMeshTheme: {
      ring: {
        color: 0x6622aa,
        emissive: 0x9933ff,
        emissiveIntensity: 1.5,
        radius: 0.034,
      },
      core: {
        color: 0xeeddff,
        emissive: 0xaa55ff,
        emissiveIntensity: 1.1,
        radius: 0.015,
      },
      light: { color: 0x9933ff, intensity: 0.42 },
    },
    targetPulse: {
      hitFlashDuration: 0.18,
      pulseSpeed: 2.2,
      pulseAmp: 0.16,
      hitBoost: 1.35,
      ringEmissiveBase: 1.5,
      coreEmissiveBase: 1.1,
      lightIntensityBase: 0.42,
      wobbleSpeed: 2.8,
      wobbleAmp: 0.06,
      hitScaleBoost: 0.22,
    },
  },
};

export function getBossDefinition(id: BossId): BossDefinition {
  return BOSS_REGISTRY[id];
}

export function getBossByColliderRole(role: string): BossDefinition | undefined {
  return BOSS_IDS.map((id) => BOSS_REGISTRY[id]).find((boss) => boss.colliderRole === role);
}

export const DEMOGORGON_TARGET = BOSS_REGISTRY.demogorgon.target;
export const DEMOGORGON_TARGET_HITS = BOSS_REGISTRY.demogorgon.targetHits;
export const VECNA_TARGET = BOSS_REGISTRY.vecna.target;
export const VECNA_TARGET_HITS = BOSS_REGISTRY.vecna.targetHits;

export const DEMOGORGON_REVEAL_SCORE = BOSS_REGISTRY.demogorgon.reveal.scoreThreshold;
export const SCORE_DEMOGORGON_REVEAL = BOSS_REGISTRY.demogorgon.reveal.scoreIncrement;
export const SCORE_DEMOGORGON_TARGET = BOSS_REGISTRY.demogorgon.scoreTargetHit;
export const VECNA_REVEAL_SCORE = BOSS_REGISTRY.vecna.reveal.scoreThreshold;
export const SCORE_VECNA_REVEAL = BOSS_REGISTRY.vecna.reveal.scoreIncrement;
export const SCORE_VECNA_TARGET = BOSS_REGISTRY.vecna.scoreTargetHit;
