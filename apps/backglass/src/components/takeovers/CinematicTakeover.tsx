import type { GameOver, LeaderboardEntry } from '@pinball/shared-types'
import { useMapContent } from '@/map/content'
import VhsGlitch from '../VhsGlitch'
import HighScoreTakeover from './HighScoreTakeover'
import RecapTakeover from './RecapTakeover'

interface Props {
  clip: string
  payload?: GameOver & { rank: number }
  entries: LeaderboardEntry[]
}

export default function CinematicTakeover({ clip, payload }: Props) {
  const { renderMapTakeover } = useMapContent()
  // hall_of_fame: CORE clip — the backglass knows the rank, fanfare only
  // if deserved.
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

  // Map-specific takeover (VhsGlitch injected → no map→app dependency).
  const mapNode = renderMapTakeover(clip, { payload, Vhs: VhsGlitch })
  if (mapNode) return <>{mapNode}</>

  // Clip without a dedicated takeover: neutral label, never a blank screen or a crash.
  return (
    <VhsGlitch className="tk-attract">
      <div className="tk-center">
        <div className="tk-kicker">{clip.replace(/_/g, ' ').toUpperCase()}</div>
      </div>
    </VhsGlitch>
  )
}
