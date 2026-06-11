import { useEffect, useRef } from 'react'
import type { LeaderboardEntry } from '@pinball/shared-types'
import type { Reactor } from '@/hooks/useIngameReactor'

interface HallOfFameProps {
  entries: LeaderboardEntry[]
  highlightRank?: number
  inverted?: boolean // Upside Down : flip 3D
  reactor?: Reactor
}

const ROW_H = 54
const SLOTS = 10

const MEDAL = ['gold', 'silver', 'bronze'] as const

function shortDate(iso: string): string {
  try {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}`
  } catch {
    return '--/--'
  }
}

export default function HallOfFame({
  entries,
  highlightRank,
  inverted,
  reactor,
}: HallOfFameProps) {
  const slots = Array.from({ length: SLOTS }, (_, i) => i + 1)
  const byRank = new Map(entries.map((e) => [e.rank, e]))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reactor) return
    return reactor.on((r) => {
      if (r.kind === 'event' && r.label.startsWith('DROP') && rootRef.current) {
        const el = rootRef.current
        el.classList.remove('hof-shake')
        void el.offsetWidth // reflow → relance la secousse
        el.classList.add('hof-shake')
      }
    })
  }, [reactor])

  return (
    <div ref={rootRef} className={`hof ${inverted ? 'hof-inverted' : ''}`}>
      <div className="hof-inner">
        <h2 className="hof-title">
          <span className="hof-title-text">HALL OF FAME</span>
        </h2>

        <div className="hof-list" style={{ height: SLOTS * ROW_H }}>
          {/* lignes fantômes pour les slots vides */}
          {slots.map((rank) =>
            byRank.has(rank) ? null : (
              <div
                key={`ghost-${rank}`}
                className="hof-row hof-ghost"
                style={{ top: (rank - 1) * ROW_H }}
              >
                <span className="hof-rank">{rank}</span>
                <span className="hof-name">— — —</span>
                <span className="hof-score">—</span>
                <span className="hof-date" />
              </div>
            ),
          )}

          {/* entrées réelles, positionnées par rang (slide au réordonnancement) */}
          {entries.map((e) => {
            const medal = e.rank <= 3 ? MEDAL[e.rank - 1] : null
            const hot = highlightRank === e.rank
            return (
              <div
                key={e.name}
                className={`hof-row ${medal ? `hof-${medal}` : ''} ${hot ? 'hof-hot' : ''}`}
                style={{ top: (e.rank - 1) * ROW_H }}
              >
                <span className="hof-rank">{e.rank}</span>
                <span className="hof-name">{e.name}</span>
                <span className="hof-score tabular-nums">
                  {e.score.toLocaleString('fr-FR')}
                </span>
                <span className="hof-date">{shortDate(e.date)}</span>
              </div>
            )
          })}

          <div className="hof-shimmer" />
        </div>
      </div>
    </div>
  )
}
