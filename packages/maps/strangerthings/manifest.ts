import { mapAssetUrl, type MapManifest } from '@pinball/shared-types'

// Map id + asset resolution helper (public URL /maps/<id>/…).
// ONLY source of the id literal in the package (assets synced from
// packages/maps/strangerthings/assets/).
export const MAP_ID = 'strangerthings'
export const mapAsset = (rel: string) => mapAssetUrl(MAP_ID, rel)

// Stranger Things map manifest. Values come from game-engine constants
// (ScoringConstants, BossRegistry, FlipperConstants) and useGameState.
// Later phases: the engine will read these from the manifest (injection)
// instead of hardcoded constants.
export const manifest: MapManifest = {
  id: MAP_ID,
  name: 'Stranger Things',
  version: 1,
  attractTagline: 'Hawkins National Laboratory',
  // CSS tokens consumed by the playfield overlay (outro). A map without
  // theme → overlay keeps its neutral defaults.
  theme: {
    '--glow': '#ff2d2d',
    '--glow-alt': '#b14dff', // upside down world
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
  // Cinematic families (generic overlay fallback). Not listed → 'other'.
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
  // Assets preloaded by the playfield page (public URL /maps/<id>/…).
  preload: [
    mapAsset('playfield/demogorgon.glb'),
    mapAsset('playfield/demogorgon.png'),
    mapAsset('playfield/fin_combat_vecna.png'),
    // Vecna GLB (~28 MB): fetch starts at page load (link rel=preload)
    // instead of waiting for module mount — otherwise it delays boss preload.
    mapAsset('playfield/vecna.glb'),
  ],
  // Map event sounds (played via ctx.playSound(id)).
  sounds: {
    upside_down_appear: { url: mapAsset('audio/apparitionUpsideDown.mp3'), volume: 280 },
  },
  // Counter labels (backglass recap).
  counterLabels: { demogorgons: 'DEMOGORGONS', portals: 'PORTAILS', hetic: 'HETIC' },
  // mapState keys editable by the debug tool (dev).
  debugMapState: { numbers: ['hetic'], flags: ['fever'] },
  // Clip timings: showMs / freezeMs / takeoverMs.
  clips: {
    demogorgon_rises: { showMs: 10_000, freezeMs: 6_000 }, // 6s freeze + 4s celebration
    portal_swallow: { showMs: 4_000, freezeMs: 4_000 },
    demogorgon_slain: { showMs: 15_000, freezeMs: 2_600 },
    last_chance: { showMs: 2_000, freezeMs: 0 },
    hall_of_fame: { showMs: 25_000, freezeMs: 0 },
    milestone_5k: { showMs: 4_000, freezeMs: 0 },
    // Milestones + letters: NO physics freeze. The playfield is the watched
    // screen — don't freeze the ball for a DMD/backglass clip. The clip still
    // plays (showMs), the ball keeps rolling; the playfield cue
    // (garland sweep + shake) stays non-blocking.
    milestone_15k: { showMs: 8_000, freezeMs: 0 },
    milestone_30k: { showMs: 13_000, freezeMs: 0 },
    milestone_big: { showMs: 15_000, freezeMs: 0 },
    hetic_letter: { showMs: 5_000, freezeMs: 0 },
    hetic_complete: { showMs: 40_000, freezeMs: 10_000, takeoverMs: 10_000 }, // 10s cinematic + 30s fever
    skill_shot: { showMs: 5_000, freezeMs: 2_000 },
  },
  glb: mapAsset('playfield/newStrangerthings.glb'),
  // Points per role (ScoringConstants.ts + boss values from BossRegistry).
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
  // Per-mesh material tuning (key = conventioned name). Default for
  // unlisted wall_ meshes: restitution 0.35, friction 0.15, double-sided,
  // Laplacian smoothing.
  //   physics:'analytic' → no trimesh (the smooth analytic floor handles it)
  //   singleSided:1      → single-sided trimesh (normals facing inward)
  //   doubleSided:0/1    → forces double-sided
  //   smooth:0/1         → Laplacian smoothing
  elements: {
    floor_main: { physics: 'analytic' }, // ex-Mesh_0: smooth analytic floor
    wall_main: { singleSided: 1, restitution: 0.35, friction: 0.12 }, // ex-Mesh_1
    wall_slingshot: { restitution: 0, friction: 0.1 }, // ex no-bounce (Cylinder.008)
    wall_bottom: { restitution: 0, friction: 0.1 }, // ex no-bounce (Plane.008)
    wall_top: { restitution: 0.3, friction: 0.1 }, // plastic (Circle.001)
    wall_under_top: { restitution: 0.35, friction: 0.12 }, // rail (Circle.034)
    wall_middle_left: { restitution: 0.3, friction: 0.1 }, // plastic (Circle.011)
    wall_middle_right: { restitution: 0.3, friction: 0.1 }, // plastic (Circle.018)
    wall_guide_lane: { restitution: 0.2, friction: 0.15, smooth: 0 }, // ex-Fix-Start
  },
  // ST terms tracked by the anti-leak grep guard.
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
  // ─── Three.js rendering — original ST lighting ──────────────────────────
  // hemi and fill at intensity 0: kept for UpsideDownAtmosphere which
  // revives them (it overwrites intensities via the light refs).
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
      // Opposed dual side suns (tuned by eye): no specular highlight along
      // the camera axis, floor lit from both sides.
      dir:     { color: 0xffffff, intensity: 2.54, x: 1.08,  y: 1.5,  z: 0.27 },
      dir2:    { color: 0xffffff, intensity: 5.05, x: -1.21, y: 1.5,  z: 0.55 },
      // Backlight: metal rim toward the camera (tuned by eye).
      rim:     { color: 0xffffff, intensity: 1.1,  x: 0,     y: 1.3,  z: -1.2 },
      fill:    { color: 0xffffff, intensity: 0,    x: 0,     y: 1,    z: -1   },
    },
  },
  meshAliases: {
    portal_upsidedown: 'vis_demogorgon_portal_demog_portal_ref_skeleton',
  },
}
