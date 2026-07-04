import type { GameOver } from '@pinball/shared-types'
import { useMapContent } from '@/map/content'
import VhsGlitch from '../VhsGlitch'

interface Props {
  payload: GameOver & { rank: number }
}

export default function RecapTakeover({ payload }: Props) {
  const { counterLabels } = useMapContent()
  const s = payload.stats
  const qualifying = payload.rank <= 10

  // Generic counters: labels come from the map (counterLabels), values from
  // GameStats.counters. The core has no hardcoded ST keys.
  const counterCells = Object.entries(s.counters).map(([id, value]) => ({
    label: counterLabels[id] ?? id.toUpperCase(),
    value,
  }))

  const cells: { label: string; value: React.ReactNode }[] = [
    { label: 'COMBO MAX', value: `x${s.maxCombo}` },
    { label: 'MULTIPLIER MAX', value: `x${s.maxMultiplier}` },
    ...counterCells,
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
