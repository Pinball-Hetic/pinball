export interface NewGame {
  player: string;
  mapId: string;
  score: number;
  maxCombo: number;
  maxMultiplier: number;
  counters: unknown;
  durationS: number;
}

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
  create(input: NewGame): Promise<{ id: string }>;
  setCode(id: string, code: string): Promise<void>;
  topByScore(mapId: string, take: number): Promise<ScoreRow[]>;
  allCounters(mapId: string): Promise<CounterRow[]>;
  topByCombo(mapId: string): Promise<ComboRow | null>;
  topTodayByScore(mapId: string, since: Date): Promise<TodayRow | null>;
}

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
