import type { GameOver } from '@pinball/shared-types'
import VhsGlitch from '../VhsGlitch'

interface Props {
  payload: GameOver & { rank: number }
}

const HETIC = 'HETIC'.split('')

export default function RecapTakeover({ payload }: Props) {
  const s = payload.stats
  const qualifying = payload.rank <= 10

  const cells: { label: string; value: React.ReactNode }[] = [
    { label: 'COMBO MAX', value: `x${s.maxCombo}` },
    { label: 'MULTIPLIER MAX', value: `x${s.maxMultiplier}` },
    { label: 'DEMOGORGONS', value: s.demogorgons },
    { label: 'PORTAILS', value: s.portals },
    {
      label: 'HETIC',
      value: (
        <span className="hetic-slots">
          {HETIC.map((c, i) => (
            <span key={i} className={i < s.hetic ? 'hetic-on' : 'hetic-off'}>
              {c}
            </span>
          ))}
        </span>
      ),
    },
    { label: 'DURÉE', value: `${s.durationS}s` },
  ]

  return (
    <VhsGlitch className="tk-recap">
      <div className="tk-center">
        <div className="tk-kicker">VOTRE PARTIE</div>
        <div className="tk-recap-score tabular-nums">
          {payload.finalScore.toLocaleString('fr-FR')}
        </div>
        <div className="recap-grid">
          {cells.map((c) => (
            <div key={c.label} className="recap-cell">
              <div className="recap-value">{c.value}</div>
              <div className="recap-label">{c.label}</div>
            </div>
          ))}
        </div>
        {!qualifying && (
          <div className="tk-invite">REJOUEZ POUR ENTRER AU HALL OF FAME</div>
        )}
      </div>
    </VhsGlitch>
  )
}
