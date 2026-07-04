import { useEffect, useRef, useState } from 'react'
import type { GlobalStats, LeaderboardEntry } from '@pinball/shared-types'
import type { Reactor } from '@/hooks/useIngameReactor'
import QrSlot from './QrSlot'

interface StatsBannerProps {
  stats: GlobalStats
  entries: LeaderboardEntry[]
  reactor?: Reactor
}

const ROTATE_MS = 5000

// Defense in depth: a kiosk banner NEVER crashes on a missing stat
// (undefined/null → 0).
function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('fr-FR')
}

function buildSlides(stats: GlobalStats, entries: LeaderboardEntry[]): string[] {
  const slides: string[] = [`PARTIES JOUÉES : ${fmt(stats.totalGames)}`]
  // Totals per counter (label will come from the map; key for now).
  for (const t of stats.totals) {
    slides.push(`${t.label.toUpperCase()} : ${fmt(t.value)}`)
  }
  if (stats.bestCombo) {
    slides.push(`BEST COMBO : x${stats.bestCombo.value} — ${stats.bestCombo.player}`)
  }
  if (stats.bestToday) {
    slides.push(
      `MEILLEUR SCORE AUJOURD'HUI : ${fmt(stats.bestToday.score)} — ${stats.bestToday.player}`,
    )
  }
  const tenth = entries.find((e) => e.rank === 10)
  slides.push(
    tenth ? `SCORE À BATTRE : ${fmt(tenth.score)}` : 'TENTEZ LE HALL OF FAME !',
  )
  return slides
}

export default function StatsBanner({ stats, entries, reactor }: StatsBannerProps) {
  const slides = buildSlides(stats, entries)
  const [idx, setIdx] = useState(0)
  const bannerRef = useRef<HTMLDivElement>(null)
  // "SCORE À BATTRE" / invitation = always the last slide
  const toBeatIdx = slides.length - 1

  useEffect(() => {
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % slides.length)
    }, ROTATE_MS)
    return () => window.clearInterval(t)
  }, [slides.length])

  useEffect(() => {
    if (!reactor) return
    return reactor.on((r) => {
      if (r.kind === 'multi') {
        setIdx(toBeatIdx) // jump to SCORE À BATTRE (pressure!)
        const el = bannerRef.current
        if (el) {
          el.classList.remove('banner-gold')
          void el.offsetWidth
          el.classList.add('banner-gold')
        }
      }
    })
  }, [reactor, toBeatIdx])

  const current = slides[idx % slides.length]

  return (
    <div ref={bannerRef} className="stats-banner">
      <div className="stats-carousel">
        <span key={idx} className="stats-slide">
          {current}
        </span>
      </div>
      <QrSlot />
    </div>
  )
}
