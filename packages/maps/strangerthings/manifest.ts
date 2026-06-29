import { mapAssetUrl, type MapManifest } from '@pinball/shared-types'

// Id de la map + helper de résolution d'asset (URL publique /maps/<id>/…).
// SEULE source du littéral d'id dans le package (assets synchronisés depuis
// packages/maps/strangerthings/assets/).
export const MAP_ID = 'strangerthings'
export const mapAsset = (rel: string) => mapAssetUrl(MAP_ID, rel)

// Manifest de la map Stranger Things. Les valeurs sont issues des
// constantes game-engine (ScoringConstants, BossRegistry, FlipperConstants)
// et de useGameState. Phases ultérieures : le moteur lira ces valeurs depuis
// le manifest (injection) au lieu des constantes hardcodées.
export const manifest: MapManifest = {
  id: MAP_ID,
  name: 'Stranger Things',
  version: 1,
  attractTagline: 'Hawkins National Laboratory',
  // Tokens CSS consommés par l'overlay playfield (outro). Une map sans theme
  // → overlay garde ses défauts neutres.
  theme: {
    '--glow': '#ff2d2d',
    '--glow-alt': '#b14dff', // monde inversé
    '--st-font': "'Times New Roman', Georgia, serif",
    '--vignette': '#2a0606',
    '--foreground': '#ede4d3',
  },
  outro: {
    title: 'FIN DE PARTIE',
    scanLabel: 'Scanne pour graver ton nom au classement',
    replayLabel: 'START — Rejouer',
    qrLogo: mapAsset('playfield/demogorgon.png'),
  },
  // Familles de cinématique (overlay fallback générique). Non listé → 'other'.
  clipFamilies: {
    demogorgon_rises: 'boss',
    demogorgon_slain: 'boss',
    portal_swallow: 'other',
    last_chance: 'other',
    hetic_letter: 'collect',
    hetic_complete: 'collect',
    milestone_5k: 'milestone',
    milestone_15k: 'milestone',
    milestone_30k: 'milestone',
    milestone_big: 'milestone',
  },
  // Assets préchargés par la page playfield (URL publique /maps/<id>/…).
  preload: [
    mapAsset('playfield/demogorgon.glb'),
    mapAsset('playfield/demogorgon.png'),
    mapAsset('playfield/fin_combat_vecna.png'),
  ],
  // Sons d'event de la map (joués via ctx.playSound(id)).
  sounds: {
    upside_down_appear: { url: mapAsset('audio/apparitionUpsideDown.mp3'), volume: 280 },
  },
  // Libellés des compteurs (recap backglass).
  counterLabels: { demogorgons: 'DEMOGORGONS', portals: 'PORTAILS', hetic: 'HETIC' },
  // Clés de mapState éditables par l'outil de debug (dev).
  debugMapState: { numbers: ['hetic'], flags: ['fever'] },
  // Timings des clips (ex-tables CLIP_*_MS) : showMs / freezeMs / takeoverMs.
  clips: {
    demogorgon_rises: { showMs: 10_000, freezeMs: 6_000 }, // 6s gel + 4s célébration
    portal_swallow: { showMs: 4_000, freezeMs: 4_000 },
    demogorgon_slain: { showMs: 15_000, freezeMs: 2_600 },
    last_chance: { showMs: 2_000, freezeMs: 0 },
    hall_of_fame: { showMs: 25_000, freezeMs: 0 },
    milestone_5k: { showMs: 4_000, freezeMs: 0 },
    milestone_15k: { showMs: 8_000, freezeMs: 3_000 },
    milestone_30k: { showMs: 13_000, freezeMs: 5_000 },
    milestone_big: { showMs: 15_000, freezeMs: 5_000 },
    hetic_letter: { showMs: 5_000, freezeMs: 2_000 },
    hetic_complete: { showMs: 40_000, freezeMs: 10_000, takeoverMs: 10_000 }, // 10s ciné + 30s fever
    skill_shot: { showMs: 5_000, freezeMs: 2_000 },
  },
  glb: mapAsset('playfield/newStrangerthings.glb'),
  // Points par rôle (ScoringConstants.ts + valeurs boss du BossRegistry).
  scoring: {
    bumper: 1000, // SCORE_BUMPER
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
  // Nuances matière par mesh (clé = nom conventionné). Reprend la classif
  // historique de PlayfieldTrimeshBuilder. Défaut wall_ non listé :
  // restitution 0.35, friction 0.15, double-sided, lissage Laplacien.
  //   physics:'analytic' → pas de trimesh (le sol lisse analytique gère)
  //   singleSided:1      → trimesh single-sided (normales vers l'intérieur)
  //   doubleSided:0/1    → force le double-sided
  //   smooth:0/1         → lissage Laplacien
  elements: {
    floor_main: { physics: 'analytic' }, // ex-Mesh_0 : sol analytique lisse
    wall_main: { singleSided: 1, restitution: 0.35, friction: 0.12 }, // ex-Mesh_1
    wall_slingshot: { restitution: 0, friction: 0.1 }, // ex no-bounce (Cylinder.008)
    wall_bottom: { restitution: 0, friction: 0.1 }, // ex no-bounce (Plane.008)
    wall_top: { restitution: 0.3, friction: 0.1 }, // plastique (Circle.001)
    wall_under_top: { restitution: 0.35, friction: 0.12 }, // rail (Circle.034)
    wall_middle_left: { restitution: 0.3, friction: 0.1 }, // plastique (Circle.011)
    wall_middle_right: { restitution: 0.3, friction: 0.1 }, // plastique (Circle.018)
    wall_guide_lane: { restitution: 0.2, friction: 0.15, smooth: 0 }, // ex-Fix-Start
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
  // ─── Rendu Three.js — éclairage original ST (état avant toute modification) ─
  // Valeurs extraites du git avant les itérations de tuning Zelda.
  // hemi et fill à intensity 0 : conservées pour UpsideDownAtmosphere qui les
  // réanime (elle écrase les intensités via les refs lumières).
  rendering: {
    useEnvironment: false,
    toneMappingExposure: 1.12,
    colorDarken: 0.9,
    environmentBlur: 0.04,
    envIntensityMetallic: 1.0,
    envIntensitySemi: 1.0,
    envIntensityBase: 1.0,
    lights: {
      ambient: { color: 0xffffff, intensity: 0.25 },
      hemi:    { sky: 0xffffff, ground: 0x111111, intensity: 0 },
      // Double soleil latéral opposé (réglé à l'œil) : pas de highlight
      // spéculaire dans l'axe caméra, sol débouché des deux côtés.
      dir:     { color: 0xffffff, intensity: 2.54, x: 1.08,  y: 1.5,  z: 0.27 },
      dir2:    { color: 0xffffff, intensity: 5.05, x: -1.21, y: 1.5,  z: 0.55 },
      // Contre-jour : liseré métal vers la caméra (réglé à l'œil).
      rim:     { color: 0xffffff, intensity: 1.1,  x: 0,     y: 1.3,  z: -1.2 },
      fill:    { color: 0xffffff, intensity: 0,    x: 0,     y: 1,    z: -1   },
    },
  },
  meshAliases: {
    portal_upsidedown: 'vis_demogorgon_portal_demog_portal_ref_skeleton',
  },
}
