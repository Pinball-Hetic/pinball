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
}

export interface ScoreUpdate {
  player: string
  score: number
  combo: number
  multiplier: number
  lives: number
  hetic: number
}

export type DmdDisplay =
  | { mode: 'INTRO'; player: string; upsideDown: boolean }
  | { mode: 'SCORE'; player: string; score: number; combo: number; multiplier: number; lives: number; hetic: number; upsideDown: boolean }
  | { mode: 'EVENT'; label: string; points: number; score: number; combo: number; multiplier: number; lives: number; player: string; hetic: number; upsideDown: boolean }
  | { mode: 'COMBO_FLASH'; combo: number; multiplier: number; score: number; lives: number; player: string; hetic: number; upsideDown: boolean }
  | { mode: 'MULTI_FLASH'; multiplier: number; combo: number; score: number; lives: number; player: string; hetic: number; upsideDown: boolean }
  | { mode: 'LIFE_LOST'; livesRemaining: number; score: number; player: string; upsideDown: boolean }
  | { mode: 'GAME_OVER'; player: string; finalScore: number; upsideDown: boolean }

export interface GameStart {
  player: string
}

export interface GameOver {
  player: string
  finalScore: number
}

export interface LeaderboardEntry {
  rank: number
  name: string
  score: number
  date: string
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
