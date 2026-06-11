import { useEffect, useState } from 'react'
import type { LeaderboardEntry } from '@pinball/shared-types'
import VhsGlitch from '../VhsGlitch'

interface Props {
  entries: LeaderboardEntry[]
}

const PANEL_MS = 8_000

function fmt(n: number): string {
  return n.toLocaleString('fr-FR')
}

export default function AttractScene({ entries }: Props) {
  const [panel, setPanel] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => setPanel((p) => (p + 1) % 2), PANEL_MS)
    return () => window.clearInterval(t)
  }, [])

  const tenth = entries.find((e) => e.rank === 10)
  const toBeat = tenth ? fmt(tenth.score) : null

  return (
    <VhsGlitch className="tk-attract">
      <div key={panel} className="attract-panel">
        {panel === 0 && (
          <div className="tk-center">
            <div className="tk-kicker">HALL OF FAME</div>
            <div className="attract-hof">
              {entries.slice(0, 5).map((e) => (
                <div key={e.name} className="attract-hof-row">
                  <span>{e.rank}</span>
                  <span>{e.name}</span>
                  <span className="tabular-nums">{fmt(e.score)}</span>
                </div>
              ))}
              {entries.length === 0 && <div className="attract-empty">— — —</div>}
            </div>
          </div>
        )}
        {panel === 1 && (
          <div className="tk-center">
            {toBeat ? (
              <>
                <div className="tk-kicker">SCORE À BATTRE</div>
                <div className="attract-giant tabular-nums">{toBeat}</div>
              </>
            ) : (
              <div className="attract-giant">TENTEZ LE HALL OF FAME !</div>
            )}
            <div className="tk-invite">UNE PIÈCE, UNE LÉGENDE</div>
          </div>
        )}
      </div>
    </VhsGlitch>
  )
}
