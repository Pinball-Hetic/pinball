export interface ServerToClientEvents {
  'score:update': (data: ScoreUpdate) => void
  'game:start': (data: GameStart) => void
  'game:over': (data: GameOver) => void
  'leaderboard:refresh': (data: LeaderboardEntry[]) => void
  'input:button': (data: ButtonInput) => void
  'input:tilt': (data: TiltInput) => void
  'input:sensor': (data: SensorInput) => void
  // Routed by the server only to the `input-bridge` room (`simulate-esp32`
  // mode). Not broadcast to frontends.
  'dev:simulate-button': (data: ButtonInput) => void
  'dmd:display': (data: DmdDisplay) => void
  // /debug page → injects a GameEvent into the playfield (full chain).
  'dev:trigger-game-event': (data: DevGameEventTrigger) => void
  // Emitted only to the socket that sent game:over (not a broadcast).
  'game:registered': (data: GameRegistered) => void
  // Broadcast to all clients when the active map changes (map selector →
  // DMD + backglass switch dynamically). Also sent as unicast to each new
  // connection to communicate the current map.
  'map:selected': (data: { mapId: string }) => void
}

export interface ClientToServerEvents {
  'score:update': (data: ScoreUpdate) => void
  'game:start': (data: GameStart) => void
  'game:over': (data: GameOver) => void
  'input:button': (data: ButtonInput) => void
  'input:tilt': (data: TiltInput) => void
  'input:sensor': (data: SensorInput) => void
  // Emitted only by frontends in `simulate-esp32` mode (keyboard → network to
  // validate the chain without hardware). The server turns it back into an
  // `input:button` broadcast to ALL clients (sender included).
  'dev:simulate-button': (data: ButtonInput) => void
  'dmd:display': (data: DmdDisplay) => void
  'dev:trigger-game-event': (data: DevGameEventTrigger) => void
  // Emitted by the playfield when the user confirms a map in the selector.
  // The server updates its state and broadcasts `map:selected` to everyone.
  'map:select': (data: { mapId: string }) => void
}

// Injectable subset of GameEvent (plain serialized) — emitted by /debug.
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
    | 'DEBUG_ADD_SCORE' // injects raw score (to cross thresholds)
  bossId?: string // for BOSS_REVEAL / BOSS_TARGET_HIT (map boss id)
  hitCount?: number // for BOSS_TARGET_HIT
  amount?: number // for DEBUG_ADD_SCORE
}

// Map-specific state bag (ST: hetic, fever — another map will have other keys,
// e.g. wanted). The core knows no keys: it only transports them; theming and
// display are provided by the map content.
export type MapState = Record<string, number | boolean>

// Safe reads: an absent key never breaks the display.
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

// Cinematic clip identifier. Open type (string): a map defines its own clips
// without editing shared-types.
export type ClipId = string

// Transitional alias (limits churn on existing imports). Remove once all
// consumers have migrated to ClipId.
export type CinematicClip = ClipId

// Fields shared by the "snapshot" variants (SCORE/EVENT/COMBO/MULTI).
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
  // Map-specific counters (ST: demogorgons, portals, hetic). Another map will
  // have other keys. Display labels come from the map content.
  counters: Record<string, number>
  durationS: number // game duration in seconds
}

export interface GameOver {
  player: string
  finalScore: number
  mapId: string
  stats: GameStats
  // Emitted from /debug → relay only, NO persistence (keeps the leaderboard clean).
  debug?: boolean
}

export interface GameRegistered {
  code: string // claim token
  claimUrl: string // URL encoded in the QR (rendered client-side)
}

// Pseudo display limit (truncated by the screens). The actual input max is
// defined by the global API.
export const PSEUDO_MAX_DISPLAY = 12

export interface LeaderboardEntry {
  rank: number
  name: string
  score: number
  date: string
}

export interface GlobalStats {
  totalGames: number
  // Generic per-counter totals (key = counter key, label provided by the map,
  // value = sum).
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

// Cinematic clip timings, provided by the map (manifest.clips):
//   showMs   — SHOW duration: how long DMD/backglass play the clip
//              (may exceed the freeze → celebration while gameplay has resumed).
//   freezeMs — playfield physics FREEZE duration (0 = no gameplay pause).
//   takeoverMs — full-screen takeover duration of the DMD stack (default showMs;
//              overridden when the visual is shorter, e.g. hetic_complete:
//              10s of cinematic then fever in SCORE mode).
export interface ClipTimings {
  showMs: number
  freezeMs: number
  takeoverMs?: number
}

// Default SHOW duration for a clip missing from manifest.clips (unknown clip
// or map without explicit timing). The game never crashes: generic visual for
// this duration.
export const DEFAULT_CLIP_SHOW_MS = 4_000

// Generic lookups on a map's clip table (manifest.clips). A missing clip falls
// back to safe values (never undefined → never NaN).
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
