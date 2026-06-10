import { useEffect, useState } from 'react'
import type { GlobalStats, LeaderboardEntry } from '@pinball/shared-types'
import QrSlot from './QrSlot'

interface StatsBannerProps {
  stats: GlobalStats
  entries: LeaderboardEntry[]
}

const ROTATE_MS = 5000

function fmt(n: number): string {
  return n.toLocaleString('fr-FR')
}

function buildSlides(stats: GlobalStats, entries: LeaderboardEntry[]): string[] {
  const slides: string[] = [
    `PARTIES JOUÉES : ${fmt(stats.totalGames)}`,
    `DEMOGORGONS VAINCUS : ${fmt(stats.totalDemogorgons)}`,
    `PORTAILS EMPRUNTÉS : ${fmt(stats.totalPortals)}`,
  ]
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

export default function StatsBanner({ stats, entries }: StatsBannerProps) {
  const slides = buildSlides(stats, entries)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % slides.length)
    }, ROTATE_MS)
    return () => window.clearInterval(t)
  }, [slides.length])

  const current = slides[idx % slides.length]

  return (
    <div className="stats-banner">
      <div className="stats-carousel">
        <span key={idx} className="stats-slide">
          {current}
        </span>
      </div>
      <QrSlot />
    </div>
  )
}
