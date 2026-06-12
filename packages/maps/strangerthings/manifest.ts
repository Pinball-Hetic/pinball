import type { MapManifest } from '@pinball/shared-types'

// Manifest de la map Stranger Things. Les valeurs sont issues des
// constantes game-engine (ScoringConstants, BossRegistry, FlipperConstants)
// et de useGameState. Phases ultérieures : le moteur lira ces valeurs depuis
// le manifest (injection) au lieu des constantes hardcodées.
export const manifest: MapManifest = {
  id: 'strangerthings',
  name: 'Stranger Things',
  version: 1,
  glb: 'playfield/Strangerthings.glb',
  // Points par rôle (ScoringConstants.ts + valeurs boss du BossRegistry).
  scoring: {
    bumper: 100, // SCORE_BUMPER
    bump: 30, // SCORE_BUMP
    slingshot: 10, // SCORE_SLINGSHOT
    popZone: 50, // SCORE_POP_ZONE
    ramp: 200, // SCORE_RAMP
    dropTarget: 75, // SCORE_DROP_TARGET
    dropComplete: 500, // SCORE_DROP_COMPLETE
    demogorgonReveal: 150, // BOSS_REGISTRY.demogorgon.reveal.scoreIncrement
    demogorgonTarget: 250, // BOSS_REGISTRY.demogorgon.scoreTargetHit
    vecnaReveal: 200, // BOSS_REGISTRY.vecna.reveal.scoreIncrement
    vecnaTarget: 300, // BOSS_REGISTRY.vecna.scoreTargetHit
  },
  rules: {
    lives: 3, // INITIAL_LIVES
    multiplierThresholds: [5, 10, 20, 40], // MULTIPLIER_THRESHOLDS
    milestones: [5_000, 15_000, 30_000], // MILESTONES
    milestoneRepeatEvery: 25_000, // MILESTONE_REPEAT_EVERY
    comboDecayMs: 2_000, // COMBO_DECAY_MS
  },
  // Termes ST traqués par le grep-guard anti-fuite (phase 2.6).
  forbiddenInCore: [
    'demogorgon',
    'vecna',
    'hetic',
    'strangerthings',
    'upside',
    'guirlande',
    'eleven',
    'hawkins',
  ],
}
