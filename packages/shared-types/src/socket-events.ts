export interface ServerToClientEvents {
  'score:update': (data: ScoreUpdate) => void
  'game:start': (data: GameStart) => void
  'game:over': (data: GameOver) => void
  'leaderboard:refresh': (data: LeaderboardEntry[]) => void
  'input:button': (data: ButtonInput) => void
  'input:tilt': (data: TiltInput) => void
  'input:sensor': (data: SensorInput) => void
  // Routé par le server uniquement à la room `input-bridge` (mode
  // `simulate-esp32`). Pas un event broadcasté aux frontends.
  'dev:simulate-button': (data: ButtonInput) => void
  'dmd:display': (data: DmdDisplay) => void
  // Page /debug → injecte un GameEvent dans le playfield (chaîne complète).
  'dev:trigger-game-event': (data: DevGameEventTrigger) => void
}

export interface ClientToServerEvents {
  'score:update': (data: ScoreUpdate) => void
  'game:start': (data: GameStart) => void
  'game:over': (data: GameOver) => void
  'input:button': (data: ButtonInput) => void
  'input:tilt': (data: TiltInput) => void
  'input:sensor': (data: SensorInput) => void
  // Émis uniquement par les frontends en mode `simulate-esp32` (clavier
  // → réseau pour valider la chaîne sans hardware). Le server le
  // retransforme en `input:button` broadcast à TOUS (y compris émetteur).
  'dev:simulate-button': (data: ButtonInput) => void
  'dmd:display': (data: DmdDisplay) => void
  'dev:trigger-game-event': (data: DevGameEventTrigger) => void
}

// Sous-ensemble injectable de GameEvent (sérialisé simple) — émis par /debug.
export interface DevGameEventTrigger {
  type:
    | 'BUMPER_HIT'
    | 'SLINGSHOT_HIT'
    | 'RAMP_HIT'
    | 'DROP_TARGET_COMPLETE'
    | 'DEMOGORGON_REVEAL'
    | 'DEMOGORGON_TARGET_HIT'
    | 'PORTAL_ENTER'
    | 'DRAIN'
    | 'BOTTOM_OUT'
    | 'BALL_LAUNCHED'
    | 'ELEVEN_ASSIST'
    | 'DEBUG_ADD_SCORE' // injecte du score brut (franchir les paliers)
  hitCount?: number // pour DEMOGORGON_TARGET_HIT
  amount?: number // pour DEBUG_ADD_SCORE
}

// Sac d'état spécifique à la map (ST : hetic, fever — une autre map aura
// d'autres clés, ex. wanted). Le core ne connaît aucune clé : il transporte
// et theming/affichage sont fournis par le contenu de la map (phase 5).
export type MapState = Record<string, number | boolean>

// Lecture sûre : une clé absente ne casse jamais l'affichage.
export const mapStateNumber = (s: MapState, k: string): number => {
  const v = s[k]
  return typeof v === 'number' ? v : 0
}
export const mapStateFlag = (s: MapState, k: string): boolean => s[k] === true

export interface ScoreUpdate {
  player: string
  score: number
  combo: number
  multiplier: number
  lives: number
  mapState: MapState
}

// Identifiant de clip cinématique. Type ouvert (string) : une map définit
// ses propres clips sans éditer shared-types. Les noms ci-dessous (ST) ne
// sont plus une union fermée — ils vivent désormais dans les tables de
// timing, qui migreront dans le package map en phase 5.
export type ClipId = string

// Alias transitoire (limite le churn des imports existants). À retirer
// quand tous les consommateurs auront migré vers ClipId.
export type CinematicClip = ClipId

// Champs partagés par les variantes "snapshot" (SCORE/EVENT/COMBO/MULTI).
// alternateWorld (monde alternatif) ; mapState remplace les compteurs map.
interface SnapshotFields {
  player: string
  score: number
  combo: number
  multiplier: number
  lives: number
  mapState: MapState
  alternateWorld: boolean
}

export type DmdDisplay =
  | { mode: 'INTRO'; player: string; alternateWorld: boolean }
  | { mode: 'CINEMATIC'; clip: CinematicClip; player: string; score: number; value?: number; alternateWorld: boolean }
  | ({ mode: 'SCORE' } & SnapshotFields)
  | ({ mode: 'EVENT'; label: string; points: number } & SnapshotFields)
  | ({ mode: 'COMBO_FLASH' } & SnapshotFields)
  | ({ mode: 'MULTI_FLASH' } & SnapshotFields)
  | { mode: 'LIFE_LOST'; livesRemaining: number; score: number; player: string; alternateWorld: boolean }
  | { mode: 'GAME_OVER'; player: string; finalScore: number; alternateWorld: boolean }

export interface GameStart {
  player: string
}

export interface GameStats {
  maxCombo: number
  maxMultiplier: number
  // Compteurs spécifiques à la map (ST : demogorgons, portals, hetic). Une
  // autre map aura d'autres clés. Les libellés d'affichage viennent du contenu
  // de la map (phase 5).
  counters: Record<string, number>
  durationS: number // durée de la partie en secondes
}

export interface GameOver {
  player: string
  finalScore: number
  mapId: string
  stats: GameStats
  // Émis depuis /debug → relay seul, PAS de persistence (ne pollue pas le leaderboard).
  debug?: boolean
}

export interface LeaderboardEntry {
  rank: number
  name: string
  score: number
  date: string
}

export interface GlobalStats {
  totalGames: number
  // Totaux génériques par compteur (key = clé du counter, label fourni par la
  // map en phase 5, value = somme). Remplace totalDemogorgons/totalPortals.
  totals: { key: string; label: string; value: number }[]
  bestCombo: { value: number; player: string } | null
  bestToday: { score: number; player: string } | null
}

export type ButtonId = 'LEFT' | 'RIGHT' | 'PLUNGER' | 'START'
export type ButtonAction = 'DOWN' | 'UP'

export interface ButtonInput {
  id: ButtonId
  action: ButtonAction
}

export interface TiltInput {
  state: 'TRIGGERED'
}

export interface SensorInput {
  id: string
  value: number
}

// Durée du SHOW : combien de temps DMD/backglass jouent le clip (peut
// dépasser le gel → phase célébration pendant que le jeu a repris).
export const CLIP_SHOW_MS: Record<ClipId, number> = {
  demogorgon_rises: 10_000, // 6s gel + 4s célébration
  portal_swallow: 4_000,
  demogorgon_slain: 15_000, // 8s gel + 7s célébration
  last_chance: 2_000,
  hall_of_fame: 25_000,
  milestone_5k: 4_000,
  milestone_15k: 8_000,
  milestone_30k: 13_000,
  milestone_big: 15_000,
  hetic_letter: 5_000,
  hetic_complete: 40_000, // 10s cinématique + 30s fever
  skill_shot: 5_000,
}

// Durée d'occupation de la pile DMD (segment plein écran). Par défaut =
// CLIP_SHOW_MS ; surchargé quand le visuel est plus court que le SHOW (ex.
// hetic_complete : 10s de cinématique puis 30s d'état fever en mode SCORE).
export const CLIP_TAKEOVER_MS: Partial<Record<ClipId, number>> = {
  hetic_complete: 10_000,
}

// Durée du GEL physique playfield (0 = pas de pause du gameplay).
export const CLIP_FREEZE_MS: Record<ClipId, number> = {
  demogorgon_rises: 6_000,
  portal_swallow: 4_000,
  demogorgon_slain: 8_000,
  last_chance: 0,
  hall_of_fame: 0,
  milestone_5k: 0,
  milestone_15k: 3_000,
  milestone_30k: 5_000,
  milestone_big: 5_000,
  hetic_letter: 2_000,
  hetic_complete: 10_000,
  skill_shot: 2_000,
}

// Durée SHOW par défaut pour un clip absent des tables (clip inconnu ou
// défini par une map sans timing explicite). Le jeu ne crashe jamais : il
// rend un visuel générique pendant cette durée.
export const DEFAULT_CLIP_SHOW_MS = 4_000

// Lookups gardés — source de vérité unique. Un clip absent retombe sur des
// valeurs sûres (jamais undefined → jamais de NaN downstream).
export function clipShowMs(id: ClipId): number {
  return CLIP_SHOW_MS[id] ?? DEFAULT_CLIP_SHOW_MS
}

export function clipFreezeMs(id: ClipId): number {
  return CLIP_FREEZE_MS[id] ?? 0
}

export function clipTakeoverMs(id: ClipId): number | undefined {
  return CLIP_TAKEOVER_MS[id]
}
