import type { GameOver } from '@pinball/shared-types'
import VhsGlitch from '../VhsGlitch'

interface Props {
  payload: GameOver & { rank: number }
}

export default function HighScoreTakeover({ payload }: Props) {
  return (
    <VhsGlitch className="tk-highscore">
      <div className="tk-confetti">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="confetti-dot"
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 10) * 0.12}s`,
              animationDuration: `${1.6 + (i % 5) * 0.3}s`,
            }}
          />
        ))}
      </div>
      <div className="tk-center">
        <div className="tk-kicker glitch-text" data-text="NEW HIGH SCORE">
          NEW HIGH SCORE
        </div>
        <div className="tk-rank">#{payload.rank}</div>
        <div className="tk-player">{payload.player}</div>
        <div className="tk-score tabular-nums">
          {payload.finalScore.toLocaleString('fr-FR')}
        </div>
      </div>
    </VhsGlitch>
  )
}
