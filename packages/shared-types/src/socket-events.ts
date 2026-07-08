export interface ServerToClientEvents {
  'score:update': (data: ScoreUpdate) => void
  'game:start': (data: GameStart) => void
  'game:over': (data: GameOver) => void
  'leaderboard:refresh': (data: LeaderboardEntry[]) => void
  'input:button': (data: ButtonInput) => void
  'input:tilt': (data: TiltInput) => void
  'input:sensor': (data: SensorInput) => void
  // Routed only to the `input-bridge` room (simulate-esp32 mode), NOT broadcast.
  'dev:simulate-button': (data: ButtonInput) => void
  'dmd:display': (data: DmdDisplay) => void
  'dev:trigger-game-event': (data: DevGameEventTrigger) => void
  // Sent only to the socket that emitted game:over, not a broadcast.
  'game:registered': (data: GameRegistered) => void
  // Broadcast on map change; also unicast to each new connection.
  'map:selected': (data: { mapId: string }) => void
}

export interface ClientToServerEvents {
  'score:update': (data: ScoreUpdate) => void
  'game:start': (data: GameStart) => void
  'game:over': (data: GameOver) => void
  'input:button': (data: ButtonInput) => void
  'input:tilt': (data: TiltInput) => void
  'input:sensor': (data: SensorInput) => void
  // Server turns this back into an `input:button` broadcast to ALL clients.
  'dev:simulate-button': (data: ButtonInput) => void
  'dmd:display': (data: DmdDisplay) => void
  'dev:trigger-game-event': (data: DevGameEventTrigger) => void
  // Server updates its state and broadcasts `map:selected` to everyone.
  'map:select': (data: { mapId: string }) => void
}

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
    | 'DEBUG_ADD_SCORE'
  bossId?: string // for BOSS_REVEAL / BOSS_TARGET_HIT
  hitCount?: number // for BOSS_TARGET_HIT
  amount?: number // for DEBUG_ADD_SCORE
}

export type MapState = Record<string, number | boolean>

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

export type ClipId = string

// TODO: remove once all consumers have migrated to ClipId.
export type CinematicClip = ClipId

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
  counters: Record<string, number>
  durationS: number
}

export interface GameOver {
  player: string
  finalScore: number
  mapId: string
  stats: GameStats
  // When set, the server relays but does NOT persist (keeps the leaderboard clean).
  debug?: boolean
}

export interface GameRegistered {
  code: string
  claimUrl: string
}

export const PSEUDO_MAX_DISPLAY = 12

export interface LeaderboardEntry {
  rank: number
  name: string
  score: number
  date: string
}

export interface GlobalStats {
  totalGames: number
  totals: { key: string; label: string; value: number }[]
  bestCombo: { value: number; player: string } | null
  bestToday: { score: number; player: string } | null
}

export type ButtonId =
  | 'BLACK_LEFT'
  | 'WHITE_LEFT'
  | 'FRONT_LEFT_GREEN'
  | 'FRONT_LEFT_YELLOW'
  | 'FRONT_LEFT_RED'
  | 'BLACK_RIGHT'
  | 'WHITE_RIGHT'
  | 'FRONT_WHITE'
  | 'PLUNGER'
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

export interface ClipTimings {
  showMs: number
  freezeMs: number // playfield physics freeze; 0 = no gameplay pause
  takeoverMs?: number // DMD full-screen takeover; default showMs
}

export const DEFAULT_CLIP_SHOW_MS = 4_000

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
