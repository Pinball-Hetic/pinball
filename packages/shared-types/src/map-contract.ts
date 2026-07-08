import type { ClipId, ClipTimings } from './socket-events'

export type CinematicFamily = 'boss' | 'collect' | 'milestone' | 'other'

export const DEFAULT_MAP_ID = 'strangerthings'

export function mapAssetUrl(mapId: string, relPath: string): string {
  return `/maps/${mapId}/${relPath.replace(/^\/+/, '')}`
}

export interface MapLightConfig {
  color: number; // hex
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
  useEnvironment: boolean;
  toneMappingExposure: number;
  colorDarken: number;
  environmentBlur: number;
  /** envMapIntensity for highly metallic materials (metalness ≥ 0.5). */
  envIntensityMetallic: number;
  /** envMapIntensity for semi-metallic materials (metalness 0.2–0.5). */
  envIntensitySemi: number;
  /** envMapIntensity for non-metallic materials (metalness < 0.2). */
  envIntensityBase: number;
  lights: {
    ambient: MapLightConfig;
    hemi: MapHemiLightConfig;
    dir: MapDirLightConfig;
    dir2?: MapDirLightConfig;
    rim?: MapDirLightConfig;
    fill: MapDirLightConfig;
  };
}

export interface MapManifest {
  id: string
  name: string
  version: number
  attractTagline?: string
  clipFamilies?: Record<string, CinematicFamily>
  theme?: Record<string, string>
  outro?: {
    title?: string // default "FIN DE PARTIE"
    scanLabel?: string // default "Scanne pour t'inscrire au classement"
    replayLabel?: string // default "START — Rejouer"
    qrLogo?: string // absent → no logo
  }
  preload?: string[] // paths relative to public/
  overlayFiles?: Record<string, string>
  sounds?: Record<string, { url: string; volume?: number }>
  ambientMusic?: string // fallback: /audio/early-sound.mp3
  gameOverSound?: string // fallback: /audio/sound-lost.mp3
  alternateWorldMusicUrl?: string
  alternateWorldMusicVolume?: number
  counterLabels?: Record<string, string>
  debugMapState?: { numbers?: string[]; flags?: string[] }
  ballRadius?: number // m; absent = DEFAULT_BALL_RADIUS
  glb: string // relative to the package's assets/ folder
  scoring: Record<string, number>
  rules: {
    lives: number
    multiplierThresholds: number[]
    milestones: number[]
    milestoneRepeatEvery: number
    comboDecayMs: number
  }
  elements?: Record<string, Record<string, number | string>>
  meshAliases?: Record<string, string> // legacy GLB name → conventional name
  clips?: Record<ClipId, ClipTimings>
  forbiddenInCore?: string[]
  rendering?: MapRenderingConfig
}

export interface MapPackage {
  manifest: MapManifest
  hasModule: boolean
  hasDmd: boolean
  hasBackglass: boolean
}
