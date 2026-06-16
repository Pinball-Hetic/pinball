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
