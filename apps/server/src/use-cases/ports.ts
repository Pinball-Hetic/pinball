// Ports (DIP): the use-case layer depends on these interfaces, never on prisma
// or fetch directly. Infrastructure provides adapters; tests provide fakes.

export interface NewGame {
  player: string;
  mapId: string;
  score: number;
  maxCombo: number;
  maxMultiplier: number;
  counters: unknown;
  durationS: number;
}

// Domain row views the use-cases consume (not prisma model types).
export interface ScoreRow {
  player: string;
  score: number;
  createdAt: Date;
}
export interface CounterRow {
  counters: unknown;
}
export interface ComboRow {
  maxCombo: number;
  player: string;
}
export interface TodayRow {
  score: number;
  player: string;
}

export interface GameRepository {
  /** Persists a new local game record, returns its id. */
  create(input: NewGame): Promise<{ id: string }>;
  /** Links the global claim code to an existing local record. */
  setCode(id: string, code: string): Promise<void>;
  /** Top `take` games for a map, highest score first. */
  topByScore(mapId: string, take: number): Promise<ScoreRow[]>;
  /** Counters of every game for a map (for aggregation). */
  allCounters(mapId: string): Promise<CounterRow[]>;
  /** Game with the highest combo for a map, or null. */
  topByCombo(mapId: string): Promise<ComboRow | null>;
  /** Highest-scoring game for a map since `since`, or null. */
  topTodayByScore(mapId: string, since: Date): Promise<TodayRow | null>;
}

// Score submission to the global API (idempotent on gameId).
export interface ScorePayload {
  gameId: string;
  mapId: string;
  score: number;
  maxCombo?: number;
  maxMultiplier?: number;
  counters?: Record<string, number>;
  durationS?: number;
  playedAt: string; // ISO-8601 with offset
}
export interface ScoreRegistered {
  scoreId: string;
  code: string;
  claimUrl: string;
}

export interface ScoreGateway {
  postScore(p: ScorePayload): Promise<ScoreRegistered>;
}
export interface LeaderboardGateway {
  getWorldLeaderboard(mapId: string, limit?: number): Promise<unknown>;
}
