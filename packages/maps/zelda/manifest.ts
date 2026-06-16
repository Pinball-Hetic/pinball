import { mapAssetUrl, type MapManifest } from '@pinball/shared-types'

// Id de la map + helper de résolution d'asset (URL publique /maps/<id>/…).
// SEULE source du littéral d'id dans le package (assets synchronisés depuis
// packages/maps/zelda/assets/).
export const MAP_ID = 'zelda'
export const mapAsset = (rel: string) => mapAssetUrl(MAP_ID, rel)

export const manifest: MapManifest = {
  id: MAP_ID,
  name: 'The Legend of Zelda',
  version: 1,
  attractTagline: 'Hyrule Kingdom',
  // Familles de cinématique. Non listé → 'other'.
  clipFamilies: {
    ganondorf_rises: 'boss',
    ganondorf_slain: 'boss',
    sacred_realm: 'other',
    last_chance: 'other',
    hetic_letter: 'collect',
    hetic_complete: 'collect',
    milestone_5k: 'milestone',
    milestone_15k: 'milestone',
    milestone_30k: 'milestone',
    milestone_big: 'milestone',
  },
  // Assets préchargés par la page playfield.
  preload: [mapAsset('playfield/ganondorf.glb')],
  // Musique ambiante Zelda — remplace /audio/early-sound.mp3 (ST) pour cette map.
  // Fichier à déposer dans assets/audio/ambient.mp3 puis sync-map-assets.sh
  ambientMusic: mapAsset('audio/ambient.mp3'),
  // Sons d'event de la map.
  sounds: {
    sacred_realm_appear: { url: mapAsset('audio/sacredRealm.mp3'), volume: 280 },
  },
  // Libellés des compteurs (recap backglass).
  counterLabels: { ganondorfs: 'GANONDORFS', portals: 'PORTAILS', hetic: 'HETIC' },
  // Clés de mapState éditables par l'outil de debug.
  debugMapState: { numbers: ['hetic'], flags: ['fever'] },
  // Timings des clips.
  clips: {
    ganondorf_rises: { showMs: 10_000, freezeMs: 6_000 },
    sacred_realm: { showMs: 4_000, freezeMs: 4_000 },
    ganondorf_slain: { showMs: 15_000, freezeMs: 8_000 },
    last_chance: { showMs: 2_000, freezeMs: 0 },
    hall_of_fame: { showMs: 25_000, freezeMs: 0 },
    milestone_5k: { showMs: 4_000, freezeMs: 0 },
    milestone_15k: { showMs: 8_000, freezeMs: 3_000 },
    milestone_30k: { showMs: 13_000, freezeMs: 5_000 },
    milestone_big: { showMs: 15_000, freezeMs: 5_000 },
    hetic_letter: { showMs: 5_000, freezeMs: 2_000 },
    hetic_complete: { showMs: 40_000, freezeMs: 10_000, takeoverMs: 10_000 },
    skill_shot: { showMs: 5_000, freezeMs: 2_000 },
  },
  // TODO: remplacer par le vrai GLB Zelda quand disponible.
  glb: mapAsset('playfield/zelda.glb'),
  // Points par rôle.
  scoring: {
    bumper: 100,
    bump: 30,
    slingshot: 10,
    popZone: 50,
    ramp: 200,
    dropTarget: 75,
    dropComplete: 500,
    ganondorfReveal: 150,
    ganondorfTarget: 250,
    darkLinkReveal: 200,
    darkLinkTarget: 300,
  },
  rules: {
    lives: 3,
    multiplierThresholds: [5, 10, 20, 40],
    milestones: [5_000, 15_000, 30_000],
    milestoneRepeatEvery: 25_000,
    comboDecayMs: 2_000,
  },
  // Matériaux physiques par mesh (même table que ST — ajuster au GLB Zelda).
  elements: {
    floor_main: { physics: 'analytic' },
    wall_main: { singleSided: 1, restitution: 0.35, friction: 0.12 },
    wall_slingshot: { restitution: 0, friction: 0.1 },
    wall_bottom: { restitution: 0, friction: 0.1 },
    wall_top: { restitution: 0.3, friction: 0.1 },
    wall_under_top: { restitution: 0.35, friction: 0.12 },
    wall_middle_left: { restitution: 0.3, friction: 0.1 },
    wall_middle_right: { restitution: 0.3, friction: 0.1 },
    wall_guide_lane: { restitution: 0.2, friction: 0.15, smooth: 0 },
  },
  // Termes Zelda traqués par le grep-guard anti-fuite.
  forbiddenInCore: [
    'ganondorf',
    'darklink',
    'zelda',
    'hyrule',
    'triforce',
    'link',
    'ocarina',
    'sheikah',
  ],
}
