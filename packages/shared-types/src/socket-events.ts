export interface ServerToClientEvents {
  'score:update': (data: ScoreUpdate) => void
  'game:start': (data: GameStart) => void
  'game:over': (data: GameOver) => void
  'leaderboard:refresh': (data: LeaderboardEntry[]) => void
}

export interface ClientToServerEvents {
  'score:update': (data: ScoreUpdate) => void
  'game:start': (data: GameStart) => void
  'game:over': (data: GameOver) => void
}

export interface ScoreUpdate {
  player: string
  score: number
  combo: number
  multiplier: number
}

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
