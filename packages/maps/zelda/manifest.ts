import { mapAssetUrl, type MapManifest } from '@pinball/shared-types'

// Map id + asset resolution helper (public URL /maps/<id>/…).
// ONLY source of the id literal in the package (assets synced from
// packages/maps/zelda/assets/).
export const MAP_ID = 'zelda'
export const mapAsset = (rel: string) => mapAssetUrl(MAP_ID, rel)

export const manifest: MapManifest = {
  id: MAP_ID,
  name: 'The Legend of Zelda',
  version: 1,
  attractTagline: 'Hyrule Kingdom',
  // Cinematic families. Not listed → 'other'.
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
  // Assets preloaded by the playfield page.
  preload: [mapAsset('playfield/ganondorf.glb'), mapAsset('playfield/darklink.glb')],
  // Zelda ambient music — loops in attract + during play until the boss.
  ambientMusic: mapAsset('audio/ambient.mp3'),
  // Zelda game over sound.
  gameOverSound: mapAsset('audio/game-over.mp3'),
  // Alternate world (Sacred Realm) music — loops between the portal and
  // Dark Link's appearance.
  alternateWorldMusicUrl: mapAsset('audio/sacred-realm.mp3'),
  // Map event sounds.
  sounds: {
    // One-shot fanfare on Ganondorf's appearance (then ambient resumes).
    ganondorf_appear: { url: mapAsset('audio/spawnGanondorf.mp3'), volume: 100 },
    // SFX played when the ball passes the Sacred Realm portal.
    sacred_realm_appear: { url: mapAsset('audio/transition-portal.mp3'), volume: 280 },
  },
  // Counter labels (backglass recap).
  counterLabels: { ganondorfs: 'GANONDORFS', darklinks: 'DARK LINKS', portals: 'PORTAILS', hetic: 'HETIC' },
  // mapState keys editable by the debug tool.
  debugMapState: { numbers: ['hetic'], flags: ['fever'] },
  // Clip timings.
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
  // TODO: replace with the real Zelda GLB when available.
  ballRadius: 0.012,
  glb: mapAsset('playfield/zelda.glb'),
  // Points per role.
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
  // Per-mesh physics materials (same table as ST — adjust to the Zelda GLB).
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
  // Zelda terms tracked by the anti-leak grep guard.
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
  // Game-over screen wording (claim QR code). Zelda-themed texts.
  // qrLogo absent: no PNG available in the assets (add later).
  outro: {
    title: 'LA LÉGENDE EST TERMINÉE',
    scanLabel: 'Scanne pour graver ton nom au Temple du Temps',
    replayLabel: 'START — Rejouer',
  },
  // ─── Three.js rendering — Zelda-specific ──────────────────────────────────
  // Hyrule aesthetic: deep black marble, vivid gold and gems.
  // High envIntensityMetallic → metallic materials (triforce, bumper crowns,
  // gems) strongly reflect the environment → Vectary-like look.
  // Overhead dirLight (strong y) → lights horizontal surfaces (logo, crowns).
  // Low ambient → very dark shadow zones = dramatic contrast.
  rendering: {
    useEnvironment: true,
    toneMappingExposure: 1.3,
    colorDarken: 0.9,
    environmentBlur: 0.01,       // sharp reflections = crisp highlights on gold
    envIntensityMetallic: 2.8,   // highly reflective gold/gems/chrome
    envIntensitySemi: 1.8,
    envIntensityBase: 1.1,
    lights: {
      ambient: { color: 0xffffff, intensity: 0.22 },   // dark zones stay dark
      hemi:    { sky: 0xfff8e8, ground: 0x111108, intensity: 0.15 },
      dir:     { color: 0xffffff, intensity: 2.8, x: 0, y: 1.0, z: 0.6 },  // overhead → Hyrule logo
      fill:    { color: 0xfff0dd, intensity: 0.5,  x: 0, y: 0.3, z: 1.0 }, // camera fill
    },
  },
}
