import type { ClipId, ClipTimings } from './socket-events'

// SERIALIZABLE data contract for a map. No Three/React/game-engine dependency:
// shared-types stays neutral. Runtime interfaces (MapModule, MapContext,
// DMD/backglass content) live in game-engine and the apps.
export type CinematicFamily = 'boss' | 'collect' | 'milestone' | 'other'

// Default map id (no map selector: NEXT_PUBLIC_MAP_ID undefined → this map).
// ONLY place where the literal lives on the apps/server side; consumers import
// it instead of hardcoding.
export const DEFAULT_MAP_ID = 'strangerthings'

// Public URL of a map asset. Assets live in the map package
// (packages/maps/<id>/assets/) and are synced to apps/<app>/public/maps/<id>/
// at build time (scripts/sync-map-assets.sh). The prefix is derived from the
// map id — no literal path on the consumer side.
export function mapAssetUrl(mapId: string, relPath: string): string {
  return `/maps/${mapId}/${relPath.replace(/^\/+/, '')}`
}

// ─── Per-map rendering ───────────────────────────────────────────────────────
// All visual parameters that vary between maps. The engine (game-engine +
// PinballPlayfield) reads these instead of global constants. No Three.js
// dependency here: colors = hex numbers.

export interface MapLightConfig {
  /** Light color as hex (e.g. 0xffffff). */
  color: number;
  intensity: number;
}

export interface MapDirLightConfig extends MapLightConfig {
  /** Normalized position (magnitude irrelevant, only direction matters). */
  x: number;
  y: number;
  z: number;
}

export interface MapHemiLightConfig {
  sky: number;    // hex
  ground: number; // hex
  intensity: number;
}

export interface MapRenderingConfig {
  /** Enables the environment map (RoomEnvironment + PMREMGenerator).
   *  Required for vivid metallic materials (gold, gems).
   *  false = no scene.environment → materials without ambient reflections (original ST look). */
  useEnvironment: boolean;
  /** renderer.toneMappingExposure — global brightness after tone mapping. */
  toneMappingExposure: number;
  /** Darken factor applied to surface materials (table, walls, plastic).
   *  1.0 = no change, 0.9 = slight darkening. */
  colorDarken: number;
  /** RoomEnvironment blur.
   *  0 = razor-sharp reflections, 0.04 = soft reflections (Three.js default). */
  environmentBlur: number;
  /** envMapIntensity for highly metallic materials (metalness ≥ 0.5).
   *  1.0 = standard, 2–3 = vivid reflections, e.g. Zelda gold/gems. */
  envIntensityMetallic: number;
  /** envMapIntensity for semi-metallic materials (metalness 0.2–0.5). */
  envIntensitySemi: number;
  /** Base envMapIntensity for non-metallic materials (metalness < 0.2). */
  envIntensityBase: number;
  lights: {
    /** Omnidirectional ambient light — minimal dose for shadowed areas. */
    ambient: MapLightConfig;
    /** Sky/ground HemisphereLight — warm/cool tint from the volume. */
    hemi: MapHemiLightConfig;
    /** Main directional — source of contrast and cast shadows. */
    dir: MapDirLightConfig;
    /** Optional second directional, opposite side of the main one → dual
     *  lighting that lifts the `dir` shadow without the fill (reserved for
     *  UpsideDownAtmosphere). Absent → single sun. */
    dir2?: MapDirLightConfig;
    /** Optional backlight (table rear, toward the camera) → highlight edge on
     *  metal rims. Absent → no rim. */
    rim?: MapDirLightConfig;
    /** Light fill — lifts shadowed areas without flattening contrast. */
    fill: MapDirLightConfig;
  };
}

export interface MapManifest {
  id: string
  name: string
  version: number
  /** Attract-screen subtitle (map branding, e.g. fictional lab). */
  attractTagline?: string
  /** Mapping clipId → generic cinematic family (boss/collect/milestone/other). */
  clipFamilies?: Record<string, CinematicFamily>
  /** Theme CSS variables (e.g. flair colors) applied on the stage. */
  theme?: Record<string, string>
  /** Wording + assets for the game-over outro screen (neutral FR defaults if absent). */
  outro?: {
    title?: string // default "FIN DE PARTIE"
    scanLabel?: string // default "Scanne pour t'inscrire au classement"
    replayLabel?: string // default "START — Rejouer"
    qrLogo?: string // asset URL for the QR center logo (absent → no logo)
  }
  /** Assets to preload (paths relative to public/) — consumed by the page. */
  preload?: string[]
  /** Cinematic overlay videos/images by clipId (otherwise CSS fallback). */
  overlayFiles?: Record<string, string>
  /** Map event sounds by id (played via ctx.playSound(id)). */
  sounds?: Record<string, { url: string; volume?: number }>
  /** Looping ambient music (attract + in-game). Fallback: /audio/early-sound.mp3 */
  ambientMusic?: string
  /** Game-over sound. Fallback: /audio/sound-lost.mp3 */
  gameOverSound?: string
  /**
   * Looping music played in the alternate world (between PORTAL_TRANSITION_END
   * and the alternate boss's BOSS_REVEAL). Stops as soon as the combat music
   * takes over, or at WORLD_CYCLE_COMPLETE if no boss was revealed.
   */
  alternateWorldMusicUrl?: string
  alternateWorldMusicVolume?: number
  /** Counter labels (GameStats.counters) by id, for the backglass recap. */
  counterLabels?: Record<string, string>
  /** mapState keys drivable by the debug tool (dev). Lets debug edit a map's
   *  mapState without hardcoded keys. */
  debugMapState?: { numbers?: string[]; flags?: string[] }
  /** Ball radius (m). Absent = DEFAULT_BALL_RADIUS (ST: 0.01374). */
  ballRadius?: number
  glb: string // relative to the package's assets/ folder
  scoring: Record<string, number> // points per role (bumper, slingshot, target…)
  rules: {
    lives: number
    multiplierThresholds: number[]
    milestones: number[]
    milestoneRepeatEvery: number
    comboDecayMs: number
  }
  elements?: Record<string, Record<string, number | string>> // per-element-id tuning
  meshAliases?: Record<string, string> // legacy GLB name → conventional name
  clips?: Record<ClipId, ClipTimings> // clip timings for the map
  forbiddenInCore?: string[] // terms for the anti-leak grep guard
  /** Map-specific Three.js rendering configuration.
   *  Absent → the engine uses its own defaults. */
  rendering?: MapRenderingConfig
}

// Map package resolved by the composition root (packages/maps/index.ts).
// Runtime modules are loaded later; only capability flags are exposed here.
export interface MapPackage {
  manifest: MapManifest
  hasModule: boolean // custom playfield behavior
  hasDmd: boolean // DMD content provided — otherwise NO SIGNAL
  hasBackglass: boolean // same for backglass
}
