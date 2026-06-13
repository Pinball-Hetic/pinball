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
  // Émis au seul socket émetteur du game:over (pas un broadcast).
  'game:registered': (data: GameRegistered) => void
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
    | 'BOSS_REVEAL'
    | 'BOSS_TARGET_HIT'
    | 'PORTAL_ENTER'
    | 'DRAIN'
    | 'BOTTOM_OUT'
    | 'BALL_LAUNCHED'
    | 'ASSIST'
    | 'DEBUG_ADD_SCORE' // injecte du score brut (franchir les paliers)
  bossId?: string // pour BOSS_REVEAL / BOSS_TARGET_HIT (id de boss de la map)
  hitCount?: number // pour BOSS_TARGET_HIT
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

export interface GameRegistered {
  code: string // token de claim
  claimUrl: string // URL encodée dans le QR
  qrDataUrl: string // PNG data-url du QR (généré backend)
}

// Limite d'affichage du pseudo (tronqué par les écrans). Le max réel de
// saisie sera défini côté API globale.
export const PSEUDO_MAX_DISPLAY = 12

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

// Timings d'un clip cinématique, fournis par la map (manifest.clips) :
//   showMs   — durée du SHOW : combien de temps DMD/backglass jouent le clip
//              (peut dépasser le gel → célébration pendant que le jeu a repris).
//   freezeMs — durée du GEL physique playfield (0 = pas de pause du gameplay).
//   takeoverMs — durée d'occupation plein écran de la pile DMD (défaut showMs ;
//              surchargé quand le visuel est plus court, ex. hetic_complete :
//              10s de cinématique puis fever en mode SCORE).
export interface ClipTimings {
  showMs: number
  freezeMs: number
  takeoverMs?: number
}

// Durée SHOW par défaut pour un clip absent de manifest.clips (clip inconnu
// ou map sans timing explicite). Le jeu ne crashe jamais : visuel générique
// pendant cette durée.
export const DEFAULT_CLIP_SHOW_MS = 4_000

// Lookups génériques sur la table de clips d'une map (manifest.clips). Un clip
// absent retombe sur des valeurs sûres (jamais undefined → jamais de NaN).
export function clipShowMs(clips: Record<string, ClipTimings> | undefined, id: ClipId): number {
  return clips?.[id]?.showMs ?? DEFAULT_CLIP_SHOW_MS
}

export function clipFreezeMs(clips: Record<string, ClipTimings> | undefined, id: ClipId): number {
  return clips?.[id]?.freezeMs ?? 0
}

export function clipTakeoverMs(
  clips: Record<string, ClipTimings> | undefined,
  id: ClipId,
): number | undefined {
  return clips?.[id]?.takeoverMs
}
