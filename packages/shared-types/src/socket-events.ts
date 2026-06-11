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

export interface ScoreUpdate {
  player: string
  score: number
  combo: number
  multiplier: number
  lives: number
  hetic: number
  fever: boolean
}

export type CinematicClip =
  | 'demogorgon_rises' // 1er reveal boss
  | 'portal_swallow' // entrée Upside Down (transition existante 4s)
  | 'demogorgon_slain' // victoire boss
  | 'last_chance' // dernière vie engagée
  | 'hall_of_fame' // game over qualifiant
  | 'milestone_5k'
  | 'milestone_15k'
  | 'milestone_30k'
  | 'milestone_big'
  | 'hetic_letter'
  | 'hetic_complete'
  | 'skill_shot' // réservé (implémentation plus tard)

export type DmdDisplay =
  | { mode: 'INTRO'; player: string; upsideDown: boolean }
  | { mode: 'CINEMATIC'; clip: CinematicClip; player: string; score: number; value?: number; upsideDown: boolean }
  | { mode: 'SCORE'; player: string; score: number; combo: number; multiplier: number; lives: number; hetic: number; fever: boolean; upsideDown: boolean }
  | { mode: 'EVENT'; label: string; points: number; score: number; combo: number; multiplier: number; lives: number; player: string; hetic: number; fever: boolean; upsideDown: boolean }
  | { mode: 'COMBO_FLASH'; combo: number; multiplier: number; score: number; lives: number; player: string; hetic: number; fever: boolean; upsideDown: boolean }
  | { mode: 'MULTI_FLASH'; multiplier: number; combo: number; score: number; lives: number; player: string; hetic: number; fever: boolean; upsideDown: boolean }
  | { mode: 'LIFE_LOST'; livesRemaining: number; score: number; player: string; upsideDown: boolean }
  | { mode: 'GAME_OVER'; player: string; finalScore: number; upsideDown: boolean }

export interface GameStart {
  player: string
}

export interface GameStats {
  maxCombo: number
  maxMultiplier: number
  demogorgons: number // boss vaincus dans la partie
  portals: number // entrées Upside Down
  hetic: number // lettres allumées 0..5
  durationS: number // durée de la partie en secondes
}

export interface GameOver {
  player: string
  finalScore: number
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
  totalDemogorgons: number
  totalPortals: number
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
export const CLIP_SHOW_MS: Record<CinematicClip, number> = {
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

// Durée du GEL physique playfield (0 = pas de pause du gameplay).
export const CLIP_FREEZE_MS: Record<CinematicClip, number> = {
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
