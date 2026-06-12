import type { GameOver, LeaderboardEntry } from '@pinball/shared-types'
import { renderMapTakeover } from '@pinball/map-strangerthings/backglass'
import VhsGlitch from '../VhsGlitch'
import HighScoreTakeover from './HighScoreTakeover'
import RecapTakeover from './RecapTakeover'

interface Props {
  clip: string
  payload?: GameOver & { rank: number }
  entries: LeaderboardEntry[]
}

export default function CinematicTakeover({ clip, payload }: Props) {
  // hall_of_fame : clip CORE — le backglass connaît le rang, fanfare seulement
  // si mérité.
  if (clip === 'hall_of_fame') {
    if (payload && payload.rank <= 10) return <HighScoreTakeover payload={payload} />
    if (payload) return <RecapTakeover payload={payload} />
    return (
      <VhsGlitch className="tk-attract">
        <div className="tk-center">
          <div className="tk-kicker">HALL OF FAME</div>
        </div>
      </VhsGlitch>
    )
  }

  // Takeover propre à la map (VhsGlitch injecté → pas de dépendance map→app).
  const mapNode = renderMapTakeover(clip, { payload, Vhs: VhsGlitch })
  if (mapNode) return <>{mapNode}</>

  // Clip sans takeover dédié : libellé neutre, jamais d'écran vide ni de crash.
  return (
    <VhsGlitch className="tk-attract">
      <div className="tk-center">
        <div className="tk-kicker">{clip.replace(/_/g, ' ').toUpperCase()}</div>
      </div>
    </VhsGlitch>
  )
}
