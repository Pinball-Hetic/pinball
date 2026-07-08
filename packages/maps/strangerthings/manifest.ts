import { mapAssetUrl, type MapManifest } from '@pinball/shared-types'

export const MAP_ID = 'strangerthings'
export const mapAsset = (rel: string) => mapAssetUrl(MAP_ID, rel)

export const manifest: MapManifest = {
  id: MAP_ID,
  name: 'Stranger Things',
  version: 1,
  attractTagline: 'Hawkins National Laboratory',
  theme: {
    '--glow': '#ff2d2d',
    '--glow-alt': '#b14dff',
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
  preload: [
    mapAsset('playfield/demogorgon.glb'),
    mapAsset('playfield/demogorgon.png'),
    mapAsset('playfield/fin_combat_vecna.png'),
    // Vecna GLB (~28 MB): preload early (rel=preload), else it delays boss preload.
    mapAsset('playfield/vecna.glb'),
  ],
  sounds: {
    upside_down_appear: { url: mapAsset('audio/apparitionUpsideDown.mp3'), volume: 280 },
  },
  counterLabels: { demogorgons: 'DEMOGORGONS', portals: 'PORTAILS', hetic: 'HETIC' },
  debugMapState: { numbers: ['hetic'], flags: ['fever'] },
  clips: {
    demogorgon_rises: { showMs: 10_000, freezeMs: 6_000 },
    portal_swallow: { showMs: 4_000, freezeMs: 4_000 },
    demogorgon_slain: { showMs: 15_000, freezeMs: 2_600 },
    last_chance: { showMs: 2_000, freezeMs: 0 },
    hall_of_fame: { showMs: 25_000, freezeMs: 0 },
    // Milestones + letters keep freezeMs: 0 on purpose — the playfield is the
    // watched screen, so a DMD/backglass clip must not freeze the ball.
    milestone_5k: { showMs: 4_000, freezeMs: 0 },
    milestone_15k: { showMs: 8_000, freezeMs: 0 },
    milestone_30k: { showMs: 13_000, freezeMs: 0 },
    milestone_big: { showMs: 15_000, freezeMs: 0 },
    hetic_letter: { showMs: 5_000, freezeMs: 0 },
    hetic_complete: { showMs: 40_000, freezeMs: 10_000, takeoverMs: 10_000 },
    skill_shot: { showMs: 5_000, freezeMs: 2_000 },
  },
  glb: mapAsset('playfield/newStrangerthings.glb'),
  scoring: {
    bumper: 1000,
    bump: 30,
    slingshot: 10,
    popZone: 50,
    ramp: 200,
    dropTarget: 75,
    dropComplete: 500,
    demogorgonReveal: 150,
    demogorgonTarget: 250,
    vecnaReveal: 200,
    vecnaTarget: 300,
  },
  rules: {
    lives: 3,
    multiplierThresholds: [5, 10, 20, 40],
    milestones: [5_000, 15_000, 30_000],
    milestoneRepeatEvery: 25_000,
    comboDecayMs: 2_000,
  },
  // Unlisted wall_ meshes default to restitution 0.35, friction 0.15,
  // double-sided, Laplacian smoothing.
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
  // hemi and fill are intentionally at intensity 0: UpsideDownAtmosphere
  // revives them by overwriting the intensities via the light refs.
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
      dir:     { color: 0xffffff, intensity: 2.54, x: 1.08,  y: 1.5,  z: 0.27 },
      dir2:    { color: 0xffffff, intensity: 5.05, x: -1.21, y: 1.5,  z: 0.55 },
      rim:     { color: 0xffffff, intensity: 1.1,  x: 0,     y: 1.3,  z: -1.2 },
      fill:    { color: 0xffffff, intensity: 0,    x: 0,     y: 1,    z: -1   },
    },
  },
  meshAliases: {
    portal_upsidedown: 'vis_demogorgon_portal_demog_portal_ref_skeleton',
  },
}
