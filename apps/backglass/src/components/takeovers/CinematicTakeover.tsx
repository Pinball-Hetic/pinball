import type { CinematicClip, GameOver, LeaderboardEntry } from '@pinball/shared-types'
import VhsGlitch from '../VhsGlitch'
import SideArt from '../SideArt'
import HighScoreTakeover from './HighScoreTakeover'
import RecapTakeover from './RecapTakeover'
import DemogorgonTakeover from './DemogorgonTakeover'

interface Props {
  clip: CinematicClip
  payload?: GameOver & { rank: number }
  entries: LeaderboardEntry[]
}

export default function CinematicTakeover({ clip, payload }: Props) {
  switch (clip) {
    case 'demogorgon_rises':
      return (
        <VhsGlitch className="tk-cine-rises">
          <div className="cine-blackout" />
          <div className="cine-giant-side">
            <SideArt mood="upsideDown" agitation={1} />
          </div>
          <div className="tk-center">
            <div className="glitch-text cine-run" data-text="RUN">
              RUN
            </div>
          </div>
        </VhsGlitch>
      )

    case 'portal_swallow':
      return (
        <VhsGlitch className="tk-cine-portal">
          <div className="cine-portal-wave" />
        </VhsGlitch>
      )

    case 'demogorgon_slain':
      return (
        <>
          <DemogorgonTakeover />
          <div className="cine-demo-count">+1 DEMOGORGON</div>
        </>
      )

    case 'last_chance':
      return (
        <VhsGlitch className="tk-cine-last">
          <div className="cine-last-vignette" />
          <div className="tk-center">
            <div className="tk-kicker cine-last-text">DERNIÈRE VIE</div>
          </div>
        </VhsGlitch>
      )

    case 'hall_of_fame':
      // Le backglass connaît le rang : fanfare seulement si mérité.
      if (payload && payload.rank <= 10) {
        return <HighScoreTakeover payload={payload} />
      }
      if (payload) {
        return <RecapTakeover payload={payload} />
      }
      return (
        <VhsGlitch className="tk-attract">
          <div className="tk-center">
            <div className="tk-kicker">HALL OF FAME</div>
          </div>
        </VhsGlitch>
      )

    default:
      return null
  }
}
