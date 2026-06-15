import type { BossDefinition, BossId } from '@pinball/game-engine'
import {
  DEMOGORGON_CAMERA_CINEMATIC,
  DEMOGORGON_VICTORY_CAMERA_CINEMATIC,
  VECNA_CAMERA_CINEMATIC,
  VECNA_VICTORY_CAMERA_CINEMATIC,
} from './cameraCinematics'
import { mapAsset } from './manifest'

// Définitions de boss Stranger Things (déplacées de game-engine/BossRegistry).
// Le moteur ne contient plus de contenu boss : il reçoit ces définitions
// injectées (layout.bosses) et opère dessus via des helpers génériques.
export const bossDefinitions: BossDefinition[] = [
  {
    id: 'demogorgon',
    colliderRole: 'demogorgon_target',
    target: { x: 0, y: 1.012, z: -0.02 },
    targetHits: 5,
    scoreTargetHit: 250,
    reveal: {
      scoreThreshold: 3000,
      scoreIncrement: 150,
      requiresAlternateWorld: false,
    },
    hud: {
      label: 'Cible Demogorgon',
      victoryLabel: 'Demogorgon vaincu !',
      dmdLabel: 'DEMOGORGON',
      requiresAlternateWorld: false,
      bottomClass: 'bottom-8',
      borderClass: 'border-red-500/40',
      subtitleClass: 'text-red-300/90',
      hitsClass: 'text-red-400 drop-shadow-[0_0_10px_rgba(255,60,60,0.7)]',
      victoryClass: 'text-amber-300 drop-shadow-[0_0_20px_rgba(255,200,80,0.9)]',
      assistLabel: 'Eleven +100',
      victoryClearMs: 1400,
      nestHintLabel: 'LE DEMOGORGON SOMMEILLE PRES DES BUMPERS',
    },
    unlocksPortal: true,
    unlocksReturnPortal: false,
    cameraCinematic: DEMOGORGON_CAMERA_CINEMATIC,
    victoryCameraCinematic: DEMOGORGON_VICTORY_CAMERA_CINEMATIC,
    revealSoundUrl: mapAsset('audio/spawnDG.mp3'),
    revealSoundVolume: 100,
    // Eleven aide pendant le fight (cf. DemogorgonReveal émet ASSIST id 'eleven').
    assist: { id: 'eleven' },
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
  {
    id: 'vecna',
    colliderRole: 'vecna_target',
    target: { x: 0, y: 1.012, z: -0.067 },
    targetHits: 10,
    scoreTargetHit: 300,
    reveal: {
      scoreThreshold: 3000,
      scoreIncrement: 200,
      requiresAlternateWorld: true,
    },
    hud: {
      label: 'Cible Vecna',
      victoryLabel: 'Vecna vaincu !',
      dmdLabel: 'VECNA',
      requiresAlternateWorld: true,
      bottomClass: 'bottom-24',
      borderClass: 'border-violet-500/45',
      subtitleClass: 'text-violet-300/90',
      hitsClass: 'text-violet-400 drop-shadow-[0_0_10px_rgba(160,80,255,0.7)]',
      victoryClass: 'text-violet-200 drop-shadow-[0_0_20px_rgba(160,80,255,0.9)]',
      victoryClearMs: 1600,
    },
    unlocksPortal: false,
    unlocksReturnPortal: true,
    cameraCinematic: VECNA_CAMERA_CINEMATIC,
    victoryCameraCinematic: VECNA_VICTORY_CAMERA_CINEMATIC,
    revealSoundUrl: mapAsset('audio/vecnaTheme.mp3'),
    revealSoundVolume: 100,
    latePhaseSoundUrl: mapAsset('audio/win-music.mp3'),
    latePhaseSoundVolume: 100,
    latePhaseHitThreshold: 7,
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
]

// Registry map-side (mêmes accesseurs que l'ancien BossRegistry game-engine,
// mais sur les définitions de CETTE map).
const byId: Record<string, BossDefinition> = Object.fromEntries(
  bossDefinitions.map((b) => [b.id, b]),
)

export const BOSS_IDS: readonly BossId[] = bossDefinitions.map((b) => b.id)

export function getBossDefinition(id: BossId): BossDefinition {
  return byId[id]
}

export const DEMOGORGON_TARGET = byId.demogorgon.target
export const DEMOGORGON_TARGET_HITS = byId.demogorgon.targetHits
export const VECNA_TARGET = byId.vecna.target
export const VECNA_TARGET_HITS = byId.vecna.targetHits
