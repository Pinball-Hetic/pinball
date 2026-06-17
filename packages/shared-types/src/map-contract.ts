import type { ClipId, ClipTimings } from './socket-events'

// Contrat de données SÉRIALISABLE d'une map. Aucune dépendance Three/React/
// game-engine : shared-types reste neutre. Les interfaces runtime (MapModule,
// MapContext, contenus DMD/backglass) vivent dans game-engine et les apps
// (phases 2-5).
export type CinematicFamily = 'boss' | 'collect' | 'milestone' | 'other'

// Id de map par défaut (pas de sélecteur de map : NEXT_PUBLIC_MAP_ID non défini
// → cette map). SEUL endroit où le littéral vit côté apps/serveur ; les
// consommateurs l'importent au lieu de hardcoder. Whitelisté par le grep-guard.
export const DEFAULT_MAP_ID = 'strangerthings'

// URL publique d'un asset de map. Les assets vivent dans le package de map
// (packages/maps/<id>/assets/) et sont synchronisés vers
// apps/<app>/public/maps/<id>/ au build (scripts/sync-map-assets.sh). Le
// préfixe est dérivé de l'id de map — aucun chemin littéral côté consommateur.
export function mapAssetUrl(mapId: string, relPath: string): string {
  return `/maps/${mapId}/${relPath.replace(/^\/+/, '')}`
}

// ─── Rendering per-map ────────────────────────────────────────────────────────
// Tous les paramètres visuels qui varient d'une map à l'autre. Le moteur
// (game-engine + PinballPlayfield) lira ces valeurs au lieu de constantes
// globales. Aucune dépendance Three.js ici : couleurs = hex numbers.

export interface MapLightConfig {
  /** Couleur de la lumière en hex (ex. 0xffffff). */
  color: number;
  intensity: number;
}

export interface MapDirLightConfig extends MapLightConfig {
  /** Position normalisée (magnitude indifférente, direction compte). */
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
  /** Active l'environment map (RoomEnvironment + PMREMGenerator).
   *  Nécessaire pour les matériaux métalliques vifs (or, gemmes).
   *  false = pas de scene.environment → matériaux sans reflets ambiants (état original ST). */
  useEnvironment: boolean;
  /** renderer.toneMappingExposure — luminosité globale post tone-mapping. */
  toneMappingExposure: number;
  /** Facteur de darken appliqué aux matériaux de surface (table, murs, plastic).
   *  1.0 = aucun changement, 0.9 = légère assombrissement. */
  colorDarken: number;
  /** Flou de l'environment RoomEnvironment.
   *  0 = reflets ultra-nets, 0.04 = reflets doux (défaut Three.js). */
  environmentBlur: number;
  /** envMapIntensity pour matériaux très métalliques (metalness ≥ 0.5).
   *  1.0 = standard, 2–3 = reflets vifs type or/gemmes Zelda. */
  envIntensityMetallic: number;
  /** envMapIntensity pour matériaux semi-métalliques (metalness 0.2–0.5). */
  envIntensitySemi: number;
  /** envMapIntensity de base pour matériaux non-métalliques (metalness < 0.2). */
  envIntensityBase: number;
  lights: {
    /** Lumière ambiante omnidirectionnelle — dose minimale pour les zones d'ombre. */
    ambient: MapLightConfig;
    /** HemisphereLight ciel/sol — teinte chaude/froide depuis le volume. */
    hemi: MapHemiLightConfig;
    /** Directionnel principal — source du contraste et des ombres portées. */
    dir: MapDirLightConfig;
    /** Fill léger — débouche les zones d'ombre sans écraser le contraste. */
    fill: MapDirLightConfig;
  };
}

export interface MapManifest {
  id: string
  name: string
  version: number
  /** Sous-titre d'écran d'attract (branding de la map, ex. lab fictif). */
  attractTagline?: string
  /** Mapping clipId → famille de cinématique générique (boss/collect/milestone/other). */
  clipFamilies?: Record<string, CinematicFamily>
  /** Variables CSS de thème (ex. couleurs de flair) appliquées sur le stage. */
  theme?: Record<string, string>
  /** Wording + assets de l'écran outro game-over (défauts FR neutres si absent). */
  outro?: {
    title?: string // défaut "FIN DE PARTIE"
    scanLabel?: string // défaut "Scanne pour t'inscrire au classement"
    replayLabel?: string // défaut "START — Rejouer"
    qrLogo?: string // URL asset logo centre QR (absent → pas de logo)
  }
  /** Assets à précharger (chemins relatifs à public/) — consommé par la page. */
  preload?: string[]
  /** Vidéos/images d'overlay cinématique par clipId (sinon fallback CSS). */
  overlayFiles?: Record<string, string>
  /** Sons d'event de la map par id (joués via ctx.playSound(id)). */
  sounds?: Record<string, { url: string; volume?: number }>
  /** Musique ambiante en boucle (attract + in-game). Fallback : /audio/early-sound.mp3 */
  ambientMusic?: string
  /** Son game over. Fallback : /audio/sound-lost.mp3 */
  gameOverSound?: string
  /** Libellés des compteurs (GameStats.counters) par id, pour le recap backglass. */
  counterLabels?: Record<string, string>
  /** Clés de mapState pilotables par l'outil de debug (dev). Permet au debug
   *  d'éditer le mapState d'une map sans clés en dur. */
  debugMapState?: { numbers?: string[]; flags?: string[] }
  /** Rayon de la balle (m). Absent = DEFAULT_BALL_RADIUS (ST : 0.01374). */
  ballRadius?: number
  glb: string // relatif au dossier assets/ du package
  scoring: Record<string, number> // points par rôle (bumper, slingshot, target…)
  rules: {
    lives: number
    multiplierThresholds: number[]
    milestones: number[]
    milestoneRepeatEvery: number
    comboDecayMs: number
  }
  elements?: Record<string, Record<string, number | string>> // tuning par id d'élément
  meshAliases?: Record<string, string> // nom GLB legacy → nom conventionnel
  clips?: Record<ClipId, ClipTimings> // timings des clips de la map
  forbiddenInCore?: string[] // termes pour le grep-guard anti-fuite
  /** Configuration de rendu Three.js spécifique à la map.
   *  Absent → le moteur utilise ses propres valeurs par défaut. */
  rendering?: MapRenderingConfig
}

// Paquet de map résolu par la composition root (packages/maps/index.ts).
// Les modules runtime sont chargés plus tard (phases 4-5) ; ici on n'expose
// que des drapeaux de capacité.
export interface MapPackage {
  manifest: MapManifest
  hasModule: boolean // comportement playfield custom (chargé en phase 4)
  hasDmd: boolean // contenu DMD fourni (phase 5) — sinon NO SIGNAL
  hasBackglass: boolean // idem backglass
}
