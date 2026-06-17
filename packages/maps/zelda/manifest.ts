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
    darklink_rises:  'boss',
    darklink_slain:  'boss',
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
  preload: [mapAsset('playfield/ganondorf.glb'), mapAsset('playfield/darklink.glb')],
  // Musique ambiante Zelda — boucle en attract + pendant la partie jusqu'au boss.
  ambientMusic: mapAsset('audio/ambient.mp3'),
  // Son game over Zelda.
  gameOverSound: mapAsset('audio/game-over.mp3'),
  // Musique du monde alternatif (Sacred Realm) — boucle entre le portail et
  // l'apparition de Dark Link.
  alternateWorldMusicUrl: mapAsset('audio/sacred-realm.mp3'),
  // Sons d'event de la map.
  sounds: {
    // Fanfare one-shot à l'apparition de Ganondorf (puis l'ambient reprend).
    ganondorf_appear: { url: mapAsset('audio/spawnGanondorf.mp3'), volume: 100 },
    // SFX joué au moment où la balle passe le portail Sacred Realm.
    sacred_realm_appear: { url: mapAsset('audio/transition-portal.mp3'), volume: 280 },
  },
  // Libellés des compteurs (recap backglass).
  counterLabels: { ganondorfs: 'GANONDORFS', darklinks: 'DARK LINKS', portals: 'PORTAILS', hetic: 'HETIC' },
  // Clés de mapState éditables par l'outil de debug.
  debugMapState: { numbers: ['hetic'], flags: ['fever'] },
  // Timings des clips.
  clips: {
    ganondorf_rises: { showMs: 10_000, freezeMs: 6_000 },
    ganondorf_slain: { showMs: 15_000, freezeMs: 8_000 },
    darklink_rises:  { showMs: 10_000, freezeMs: 6_000 },
    darklink_slain:  { showMs: 15_000, freezeMs: 8_000 },
    sacred_realm: { showMs: 4_000, freezeMs: 4_000 },
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
  ballRadius: 0.012,
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
  // ─── Rendu Three.js — spécifique Zelda ────────────────────────────────────
  // Esthétique Hyrule : marbre noir profond, or et gemmes vifs.
  // envIntensityMetallic élevé → les matériaux métalliques (triforce, couronnes
  // bumpers, gemmes) reflètent fortement l'environment → aspect Vectary.
  // dirLight overhead (y fort) → éclaire les surfaces horizontales (logo, couronnes).
  // ambient faible → zones d'ombre très sombres = contraste dramatique.
  rendering: {
    useEnvironment: true,
    toneMappingExposure: 1.3,
    colorDarken: 0.9,
    environmentBlur: 0.01,       // reflets nets = highlights crisp sur l'or
    envIntensityMetallic: 2.8,   // or/gemmes/chrome très réfléchissants
    envIntensitySemi: 1.8,
    envIntensityBase: 1.1,
    lights: {
      ambient: { color: 0xffffff, intensity: 0.22 },   // zones sombres restent sombres
      hemi:    { sky: 0xfff8e8, ground: 0x111108, intensity: 0.15 },
      dir:     { color: 0xffffff, intensity: 2.8, x: 0, y: 1.0, z: 0.6 },  // overhead → logo Hyrule
      fill:    { color: 0xfff0dd, intensity: 0.5,  x: 0, y: 0.3, z: 1.0 }, // fill caméra
    },
  },
}
