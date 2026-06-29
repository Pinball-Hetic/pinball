import { cx } from './artStyles'
import { useEffect, useRef } from 'react'
import type { Reactor } from './reactor'

interface SideArtProps {
  mood: 'normal' | 'alternate'
  agitation: number // 0..1
  reactor?: Reactor
}

export default function SideArt({ mood, agitation, reactor }: SideArtProps) {
  const sacred = mood === 'alternate'
  const beamRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reactor) return
    return reactor.on((r) => {
      if (r.kind === 'event' && r.label === 'RAMP' && beamRef.current) {
        const el = beamRef.current
        el.classList.remove(cx('ramp-beam-on'))
        void el.offsetWidth
        el.classList.add(cx('ramp-beam-on'))
      }
    })
  }, [reactor])

  // Couleur de glow : émeraude en monde normal, or en Sacred Realm
  const glow = sacred ? '#FFD700' : '#22cc44'
  const glowDim = sacred ? '#a87c00' : '#145c20'
  const pulseDur = 3 - agitation * 1.5
  const rayOpacity = 0.04 + agitation * 0.08

  // Coordonnées de la Triforce (3 triangles équilatéraux, côté 80px)
  // Centrée autour de (160, 280) dans un viewBox 320×660
  const S = 80
  const H = S * Math.sqrt(3) / 2  // ≈ 69.3
  const cx0 = 160, cy0 = 235
  const tri = {
    top: `${cx0},${cy0} ${cx0 - S / 2},${cy0 + H} ${cx0 + S / 2},${cy0 + H}`,
    bl:  `${cx0 - S / 2},${cy0 + H} ${cx0 - S},${cy0 + 2 * H} ${cx0},${cy0 + 2 * H}`,
    br:  `${cx0 + S / 2},${cy0 + H} ${cx0},${cy0 + 2 * H} ${cx0 + S},${cy0 + 2 * H}`,
  }

  return (
    <div
      className={cx('side-art')}
      style={{ '--pulse-dur': `${pulseDur}s`, '--art-glow': glow } as React.CSSProperties}
    >
      <div ref={beamRef} className={cx('ramp-beam')} />
      <svg viewBox="0 0 320 660" preserveAspectRatio="xMidYMid slice" className={cx('side-art-svg')}>
        <defs>
          <radialGradient id="zeldaBg" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor={sacred ? '#1c1400' : '#071408'} />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
          <radialGradient id="triGlow" cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor={glow} stopOpacity="0.22" />
            <stop offset="100%" stopColor={glow} stopOpacity="0" />
          </radialGradient>
          <filter id="zGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="zGlowSoft" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Fond */}
        <rect x="0" y="0" width="320" height="660" fill="url(#zeldaBg)" />

        {/* Halo diffus autour de la Triforce */}
        <ellipse cx="160" cy={cy0 + H} rx="120" ry="80" fill="url(#triGlow)" />

        {/* Rayons lumineux (Sacred Realm) */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * Math.PI * 2) / 12
          const x2 = 160 + Math.cos(angle) * 240
          const y2 = (cy0 + H) + Math.sin(angle) * 200
          return (
            <line
              key={i}
              x1="160" y1={cy0 + H}
              x2={x2} y2={y2}
              stroke={glow}
              strokeOpacity={rayOpacity}
              strokeWidth="1.5"
            />
          )
        })}

        {/* Triforce — 3 triangles */}
        <g className={cx('triforce')} filter="url(#zGlow)">
          <polygon points={tri.top} fill={glowDim} fillOpacity="0.15" stroke={glow} strokeWidth="2" strokeOpacity="0.9" />
          <polygon points={tri.bl}  fill={glowDim} fillOpacity="0.15" stroke={glow} strokeWidth="2" strokeOpacity="0.9" />
          <polygon points={tri.br}  fill={glowDim} fillOpacity="0.15" stroke={glow} strokeWidth="2" strokeOpacity="0.9" />
        </g>

        {/* Anneau animé */}
        <circle
          cx="160" cy={cy0 + H}
          r="105"
          fill="none"
          stroke={glow}
          strokeOpacity="0.1"
          strokeWidth="1"
          className={cx('ring-pulse')}
        />
        <circle
          cx="160" cy={cy0 + H}
          r="140"
          fill="none"
          stroke={glow}
          strokeOpacity="0.05"
          strokeWidth="1"
          className={cx('ring-pulse')}
          style={{ animationDelay: '1s' }}
        />

        {/* Piliers du temple (bas) */}
        {[50, 90, 130, 170, 210, 250, 290].map((x, i) => (
          <rect
            key={i}
            x={x - 5} y={500}
            width={10} height={200}
            fill={glow}
            fillOpacity={0.03 + (i % 2) * 0.015}
          />
        ))}

        {/* Ligne du sol du temple */}
        <line x1="20" y1="500" x2="300" y2="500" stroke={glow} strokeOpacity="0.12" strokeWidth="1" />
      </svg>
    </div>
  )
}
