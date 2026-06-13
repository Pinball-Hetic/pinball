import type { BossDefinition, BossId } from '@pinball/game-engine'

// Définitions de boss Zelda.
// Ganondorf : monde normal, cible centrale.
// Dark Link : monde alternatif (Sacred Realm), cible plus haute.
export const bossDefinitions: BossDefinition[] = [
  {
    id: 'ganondorf',
    colliderRole: 'ganondorf_target',
    target: { x: 0, y: 1.012, z: -0.02 },
    targetHits: 5,
    scoreTargetHit: 250,
    reveal: {
      scoreThreshold: 3000,
      scoreIncrement: 150,
      requiresAlternateWorld: false,
    },
    hud: {
      label: 'Cible Ganondorf',
      victoryLabel: 'Ganondorf vaincu !',
      dmdLabel: 'GANONDORF',
      requiresAlternateWorld: false,
      bottomClass: 'bottom-8',
      borderClass: 'border-orange-500/40',
      subtitleClass: 'text-orange-300/90',
      hitsClass: 'text-orange-400 drop-shadow-[0_0_10px_rgba(255,140,0,0.7)]',
      victoryClass: 'text-yellow-300 drop-shadow-[0_0_20px_rgba(255,215,0,0.9)]',
      assistLabel: 'Link +100',
      victoryClearMs: 1400,
      nestHintLabel: 'GANONDORF SOMMEILLE PRES DES BUMPERS',
    },
    unlocksPortal: true,
    unlocksReturnPortal: false,
    targetMeshTheme: {
      ring: {
        color: 0xff6600,
        emissive: 0xff4400,
        emissiveIntensity: 1.6,
        radius: 0.032,
        metalness: 0.4,
        roughness: 0.35,
      },
      core: {
        color: 0xffddaa,
        emissive: 0xff6600,
        emissiveIntensity: 1.2,
        radius: 0.014,
        metalness: 0.2,
        roughness: 0.4,
      },
      light: { color: 0xff6600, intensity: 0.45 },
      victoryBurst: { color: 0xffd700 },
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
  {
    id: 'darklink',
    colliderRole: 'darklink_target',
    target: { x: 0, y: 1.012, z: -0.067 },
    targetHits: 10,
    scoreTargetHit: 300,
    reveal: {
      scoreThreshold: 3000,
      scoreIncrement: 200,
      requiresAlternateWorld: true,
    },
    hud: {
      label: 'Cible Dark Link',
      victoryLabel: 'Dark Link vaincu !',
      dmdLabel: 'DARK LINK',
      requiresAlternateWorld: true,
      bottomClass: 'bottom-24',
      borderClass: 'border-emerald-500/45',
      subtitleClass: 'text-emerald-300/90',
      hitsClass: 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.7)]',
      victoryClass: 'text-emerald-200 drop-shadow-[0_0_20px_rgba(52,211,153,0.9)]',
      victoryClearMs: 1600,
    },
    unlocksPortal: false,
    unlocksReturnPortal: true,
    targetMeshTheme: {
      ring: {
        color: 0x004422,
        emissive: 0x00aa55,
        emissiveIntensity: 1.5,
        radius: 0.034,
      },
      core: {
        color: 0xaaffdd,
        emissive: 0x00dd88,
        emissiveIntensity: 1.1,
        radius: 0.015,
      },
      light: { color: 0x00aa55, intensity: 0.42 },
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
]

const byId: Record<string, BossDefinition> = Object.fromEntries(
  bossDefinitions.map((b) => [b.id, b]),
)

export const BOSS_IDS: readonly BossId[] = bossDefinitions.map((b) => b.id)

export function getBossDefinition(id: BossId): BossDefinition {
  return byId[id]
}

export const GANONDORF_TARGET = byId.ganondorf.target
export const GANONDORF_TARGET_HITS = byId.ganondorf.targetHits
export const DARK_LINK_TARGET = byId.darklink.target
export const DARK_LINK_TARGET_HITS = byId.darklink.targetHits
