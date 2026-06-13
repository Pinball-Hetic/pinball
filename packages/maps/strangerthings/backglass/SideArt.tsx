import { cx } from './artStyles'
import { useEffect, useRef } from 'react'
import type { Reactor } from './reactor'

interface SideArtProps {
  // API générique (normal / monde alternatif) : l'app ne connaît pas l'Upside
  // Down. Le rendu ST est interne à la map.
  mood: 'normal' | 'alternate'
  agitation: number // 0..1 — vitesse/amplitude des animations
  reactor?: Reactor
}

export default function SideArt({ mood, agitation, reactor }: SideArtProps) {
  const upside = mood === 'alternate'
  const beamRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reactor) return
    return reactor.on((r) => {
      if (r.kind === 'event' && r.label === 'RAMP' && beamRef.current) {
        const el = beamRef.current
        el.classList.remove(cx('ramp-beam-on'))
        void el.offsetWidth // reflow → relance l'animation
        el.classList.add(cx('ramp-beam-on'))
      }
    })
  }, [reactor])
  const swayDur = 6 - agitation * 4 // plus agité = plus rapide
  const glow = upside ? '#b14dff' : '#ff2d2d'
  const amp = 2 + agitation * 6

  return (
    <div
      className={cx('side-art')}
      style={
        {
          '--sway-dur': `${swayDur}s`,
          '--vine-amp': `${amp}deg`,
          '--art-glow': glow,
        } as React.CSSProperties
      }
    >
      <div ref={beamRef} className={cx('ramp-beam')} />
      <svg viewBox="0 0 320 660" preserveAspectRatio="xMidYMid slice" className={cx('side-art-svg')}>
        <defs>
          <radialGradient id="demoGrad" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor={upside ? '#1a0a2a' : '#1a0505'} />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
          <linearGradient id="vineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={glow} stopOpacity="0.0" />
            <stop offset="100%" stopColor={glow} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="320" height="660" fill="url(#demoGrad)" />

        {/* Silhouette demogorgon — corps + tête en pétales */}
        <g
          className={cx('demo-body')}
          fill="#050505"
          stroke={glow}
          strokeOpacity="0.5"
          strokeWidth="1.5"
        >
          <path d="M160 250 C120 300 120 470 150 600 L170 600 C200 470 200 300 160 250 Z" />
          <ellipse cx="160" cy="235" rx="42" ry="54" />
          {/* tête-fleur : pétales ouverts */}
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (Math.PI * (i - 2.5)) / 5
            const x = 160 + Math.cos(a - Math.PI / 2) * 60
            const y = 210 + Math.sin(a - Math.PI / 2) * 60
            return (
              <path
                key={i}
                className={cx('demo-petal')}
                style={{ animationDelay: `${i * 0.15}s` }}
                d={`M160 215 Q${(160 + x) / 2} ${(215 + y) / 2 - 30} ${x} ${y} Q${(160 + x) / 2} ${(215 + y) / 2 + 10} 160 215 Z`}
              />
            )
          })}
          {/* bras maigres */}
          <path d="M150 290 C100 320 70 400 80 470" fill="none" strokeWidth="6" />
          <path d="M170 290 C220 320 250 400 240 470" fill="none" strokeWidth="6" />
        </g>

        {/* Vignes animées (sway lent) */}
        {[40, 110, 200, 280].map((x, i) => (
          <path
            key={x}
            className={cx('vine')}
            style={{ animationDelay: `${i * 0.6}s` }}
            d={`M${x} 660 C${x + 30} 520 ${x - 30} 380 ${x + 15} 220 C${x + 25} 150 ${x - 10} 80 ${x} 0`}
            stroke="url(#vineGrad)"
            strokeWidth={3 + (i % 2)}
            fill="none"
          />
        ))}
      </svg>
    </div>
  )
}
